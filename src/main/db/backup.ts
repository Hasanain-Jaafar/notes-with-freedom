import { app, dialog } from 'electron'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, cpSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import AdmZip from 'adm-zip'
import type { StorageStatsDTO, BackupResult, PickBackupResult } from '@shared/ipc-channels'
import { getDataDir, getLastBackupAt, setLastBackupAt } from '../storageConfig'
import { getRawDb, flushSaveNow } from './client'
import { mediaRootPath } from './attachments'

// The first 16 bytes of any real SQLite file — the one thing that can't be
// faked by a file that merely happens to be named notebook.sqlite, so this
// is the actual "is this a real backup" check, not just a filename check.
const SQLITE_MAGIC = 'SQLite format 3\0'

function dirSizeBytes(dir: string): number {
  if (!existsSync(dir)) return 0
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    total += entry.isDirectory() ? dirSizeBytes(full) : statSync(full).size
  }
  return total
}

function isSqliteFile(buf: Buffer): boolean {
  return buf.subarray(0, SQLITE_MAGIC.length).toString('utf-8') === SQLITE_MAGIC
}

export function getStorageStats(): StorageStatsDTO {
  const dataDir = getDataDir()
  const dbPath = join(dataDir, 'notebook.sqlite')
  const countRow = getRawDb().exec('SELECT COUNT(*) FROM pages')
  const pageCount = countRow.length > 0 ? Number(countRow[0].values[0][0]) : 0

  return {
    pageCount,
    dbSizeBytes: existsSync(dbPath) ? statSync(dbPath).size : 0,
    mediaSizeBytes: dirSizeBytes(mediaRootPath()),
    lastBackupAt: getLastBackupAt()
  }
}

function backupFilename(): string {
  const d = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`
  return `own-notes-backup-${stamp}.zip`
}

/** Zips the current .sqlite file and the whole media folder together and
 * lets the user choose where to save it via a native dialog. */
export async function createBackup(): Promise<BackupResult> {
  // Capture whatever's still only in memory before zipping the on-disk file
  // — otherwise a recent edit sitting in the debounce window would be
  // missing from the backup.
  flushSaveNow()

  const dataDir = getDataDir()
  const defaultPath = join(dataDir, '..', backupFilename())

  const result = await dialog.showSaveDialog({
    title: 'Create backup',
    defaultPath,
    filters: [{ name: 'Zip archive', extensions: ['zip'] }]
  })
  if (result.canceled || !result.filePath) return { created: false }

  const zip = new AdmZip()
  zip.addLocalFile(join(dataDir, 'notebook.sqlite'))
  const mediaDir = mediaRootPath()
  if (existsSync(mediaDir)) zip.addLocalFolder(mediaDir, 'media')
  zip.writeZip(result.filePath)

  const lastBackupAt = new Date().toISOString()
  setLastBackupAt(lastBackupAt)

  return { created: true, path: result.filePath, lastBackupAt }
}

/** Opens the native file picker and structurally validates the chosen zip
 * — checked separately from restoreFromBackup() so the renderer can show
 * its in-app warning dialog only once it already knows the file is real,
 * and show a rejection message instead if it isn't. */
export async function pickAndValidateBackupFile(): Promise<PickBackupResult> {
  const result = await dialog.showOpenDialog({
    title: 'Restore from backup',
    filters: [{ name: 'Zip archive', extensions: ['zip'] }],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return { picked: false }
  const filePath = result.filePaths[0]

  try {
    const zip = new AdmZip(filePath)
    const dbEntry = zip.getEntry('notebook.sqlite')
    if (!dbEntry) {
      return {
        picked: true,
        valid: false,
        filePath,
        error: "This doesn't look like an Own Notes backup — no notebook.sqlite found in the zip."
      }
    }
    if (!isSqliteFile(dbEntry.getData())) {
      return {
        picked: true,
        valid: false,
        filePath,
        error: 'The notebook.sqlite file inside this zip is not a valid SQLite database.'
      }
    }
    return { picked: true, valid: true, filePath }
  } catch {
    return {
      picked: true,
      valid: false,
      filePath,
      error: "This file couldn't be read as a zip archive."
    }
  }
}

/** Extracts to a temp staging folder and re-validates there BEFORE touching
 * any current data — the current .sqlite/media only get replaced once
 * we're sure the extracted content is actually usable. */
export async function restoreFromBackup(filePath: string): Promise<void> {
  const staging = mkdtempSync(join(tmpdir(), 'nwf-restore-'))
  try {
    const zip = new AdmZip(filePath)
    zip.extractAllTo(staging, true)

    const stagedDb = join(staging, 'notebook.sqlite')
    if (!existsSync(stagedDb) || !isSqliteFile(readFileSync(stagedDb))) {
      throw new Error('Extracted backup is missing a valid notebook.sqlite')
    }

    const dataDir = getDataDir()
    rmSync(join(dataDir, 'notebook.sqlite'), { force: true })
    cpSync(stagedDb, join(dataDir, 'notebook.sqlite'), { force: true })

    rmSync(join(dataDir, 'media'), { recursive: true, force: true })
    const stagedMedia = join(staging, 'media')
    if (existsSync(stagedMedia)) {
      cpSync(stagedMedia, join(dataDir, 'media'), { recursive: true, force: true })
    }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }

  // Same reasoning as changeStorageLocation(): the live sql.js connection
  // and the app-media:// protocol root are both fixed at startup, so a
  // clean relaunch is simpler and safer than trying to hot-swap either one
  // mid-session.
  app.relaunch()
  app.quit()
}
