import { join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import initSqlJs, { type Database } from 'sql.js-fts5'
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js'
import * as schema from './schema'
import { setupFts } from './fts'
import { getDataDir } from '../storageConfig'

const SAVE_DEBOUNCE_MS = 1500

let sqliteDb: Database
let drizzleDb: SQLJsDatabase<typeof schema>
let saveTimer: ReturnType<typeof setTimeout> | null = null

function dbFilePath(): string {
  // Resolved from storageConfig, not a hardcoded userData path — the user
  // picks this folder on first launch (or moves it later from Settings), to
  // support the planned USB/shared-folder sync. Read fresh each call rather
  // than cached, since changeStorageLocation() can update it mid-session.
  return join(getDataDir(), 'notebook.sqlite')
}

export async function initDb(): Promise<SQLJsDatabase<typeof schema>> {
  const SQL = await initSqlJs({
    // sql.js-fts5 is externalized (not bundled) by electron-vite, so its wasm file
    // is resolved straight from node_modules — works unpacked in dev and, since
    // the dist folder is asarUnpack'd (see package.json build config), in the
    // packaged app too. (Plain "sql.js" ships FTS5 disabled — see db/fts.ts.)
    locateFile: (file) => require.resolve(`sql.js-fts5/dist/${file}`)
  })

  const filePath = dbFilePath()
  const fileBuffer = existsSync(filePath) ? readFileSync(filePath) : undefined
  sqliteDb = new SQL.Database(fileBuffer)
  sqliteDb.run('PRAGMA foreign_keys = ON;')

  drizzleDb = drizzle(sqliteDb, { schema })

  runMigrations(sqliteDb)
  setupFts(sqliteDb)

  return drizzleDb
}

function runMigrations(db: Database): void {
  // Hand-rolled bootstrap for v1 instead of drizzle-kit's generated SQL migrator,
  // since sql.js has no filesystem migration runner of its own. Uses IF NOT EXISTS
  // so it is safe to run on every launch.
  db.run(`
    CREATE TABLE IF NOT EXISTS notebooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );

    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notebook_id INTEGER NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );

    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'Untitled page',
      content_json TEXT NOT NULL DEFAULT '{}',
      content_text TEXT NOT NULL DEFAULT '',
      properties TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (current_timestamp),
      updated_at TEXT NOT NULL DEFAULT (current_timestamp)
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT
    );

    CREATE TABLE IF NOT EXISTS page_tags (
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
    );

    -- Belt-and-suspenders against double-attaching the same tag (the
    -- IPC handler already uses INSERT OR IGNORE, but this makes it
    -- impossible at the data layer too).
    CREATE UNIQUE INDEX IF NOT EXISTS idx_page_tags_unique ON page_tags(page_id, tag_id);

    CREATE TABLE IF NOT EXISTS page_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      target_page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE
    );

    -- PAGE_SAVE_CONTENT deletes-then-reinserts every row for a source page on
    -- each debounced save, so this lookup needs to be indexed.
    CREATE INDEX IF NOT EXISTS idx_page_links_source ON page_links(source_page_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('image', 'audio')),
      relative_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (current_timestamp)
    );
  `)

  // CREATE TABLE IF NOT EXISTS only helps on a fresh install — an existing
  // database from before this column existed needs it added explicitly.
  ensureColumn(db, 'pages', 'properties', "TEXT NOT NULL DEFAULT '{}'")
  ensureColumn(db, 'pages', 'icon', 'TEXT')
}

/** Idempotent ALTER TABLE ... ADD COLUMN — checks pragma_table_info first
 * instead of relying on "ADD COLUMN IF NOT EXISTS" (SQLite 3.35+, and the
 * sql.js-fts5 binary here is older — see the RETURNING comment above). */
function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const stmt = db.prepare(`SELECT 1 FROM pragma_table_info(?) WHERE name = ?`)
  stmt.bind([table, column])
  const exists = stmt.step()
  stmt.free()
  if (!exists) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

// Every write to notebook.sqlite funnels through this chain — scheduleSave's
// disk write is async (fs.writeFile's actual I/O runs on libuv's thread pool,
// independent of the main thread), so without serializing them, a
// flushSaveNow() landing while a scheduled write is still in flight (e.g. the
// app quitting right after a debounced save just fired) could open the same
// file for a second, overlapping write and corrupt it. Chaining guarantees
// they run one at a time, in order, with the most recent export always the
// last one to actually land on disk.
let writeChain: Promise<void> = Promise.resolve()

// Set once a backup restore has replaced notebook.sqlite/media directly on
// disk (see suppressSaveAfterRestore below) — from that point on, sqliteDb's
// in-memory contents are permanently stale (they're still the PRE-restore
// data; only a fresh process start re-reads the restored file), so any
// further export of it would silently overwrite the just-restored file with
// the wrong data. Never reset back to false: the only way out of this state
// is the relaunch a restore always triggers.
let restoring = false

function persistToDisk(): Promise<void> {
  const data = sqliteDb.export()
  const file = dbFilePath()
  writeChain = writeChain.then(() => writeFile(file, Buffer.from(data)))
  return writeChain
}

/** Debounced persist to disk — never writes the whole DB on every keystroke.
 * The write itself is async so a save firing mid-typing session doesn't
 * block the main process (and therefore every pending IPC call) for however
 * long a full-database write takes. */
export function scheduleSave(): void {
  if (restoring) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void persistToDisk()
  }, SAVE_DEBOUNCE_MS)
}

/** Callers must await this — it's used exactly where a stale on-disk file
 * would be a real bug (about to quit, about to zip the DB for a backup,
 * about to copy it to a new storage location), so "started but not
 * necessarily finished" isn't good enough here the way it is for
 * scheduleSave's normal debounced path. */
export async function flushSaveNow(): Promise<void> {
  if (restoring) return
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await persistToDisk()
}

/** Call this right before directly overwriting notebook.sqlite/media on disk
 * (restoreFromBackup, db/backup.ts) — cancels any pending debounced save so
 * it can't fire afterward, waits for a write already in flight to actually
 * finish (its real I/O runs on a separate libuv thread, so without this it
 * could still be mid-write when the caller starts replacing the same file),
 * and then permanently no-ops scheduleSave/flushSaveNow for the rest of this
 * process's life — including the flush before-quit always runs on the way
 * out, which would otherwise silently revert the restore with stale
 * in-memory data. Only call this once the restore is actually going to
 * happen (after the backup's been validated) — it's a one-way door. */
export async function suppressSaveAfterRestore(): Promise<void> {
  restoring = true
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await writeChain
}

export function getDb(): SQLJsDatabase<typeof schema> {
  return drizzleDb
}

export function getRawDb(): Database {
  return sqliteDb
}
