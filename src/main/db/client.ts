import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
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

/** Debounced persist to disk — never writes the whole DB on every keystroke. */
export function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const data = sqliteDb.export()
    writeFileSync(dbFilePath(), Buffer.from(data))
  }, SAVE_DEBOUNCE_MS)
}

export function flushSaveNow(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const data = sqliteDb.export()
  writeFileSync(dbFilePath(), Buffer.from(data))
}

export function getDb(): SQLJsDatabase<typeof schema> {
  return drizzleDb
}

export function getRawDb(): Database {
  return sqliteDb
}
