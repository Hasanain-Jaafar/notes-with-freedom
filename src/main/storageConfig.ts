import { app, dialog } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { join } from 'path'
import type { StorageChangeResult } from '@shared/ipc-channels'

// Pointer file only — the actual notes live wherever it points to, not here.
// Always in userData regardless of where the user's data itself lives, so
// the app can always find where to look on the next launch.
const CONFIG_FILENAME = 'storage-config.json'

interface StorageConfig {
  dataDir: string
  lastBackupAt?: string
}

function configFilePath(): string {
  return join(app.getPath('userData'), CONFIG_FILENAME)
}

function readConfig(): StorageConfig | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(configFilePath(), 'utf-8'))
    if (parsed && typeof parsed === 'object' && typeof (parsed as StorageConfig).dataDir === 'string') {
      return parsed as StorageConfig
    }
    return null
  } catch {
    return null
  }
}

function writeConfig(config: StorageConfig): void {
  writeFileSync(configFilePath(), JSON.stringify(config, null, 2), 'utf-8')
}

function defaultSuggestedDir(): string {
  return join(app.getPath('documents'), 'Notes With Freedom')
}

/** True if data exists at the OLD hardcoded location (Electron's userData
 * folder itself) from before storage location was configurable — an
 * existing install being upgraded, not a fresh one. */
function legacyDataExists(): boolean {
  return existsSync(join(app.getPath('userData'), 'notebook.sqlite'))
}

async function pickFolder(defaultPath: string, title: string): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title,
    defaultPath,
    buttonLabel: 'Choose this folder',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
}

/** Copies the sqlite file and media folder from one data directory into
 * another — used for both the legacy-install migration and later
 * user-triggered moves. Leaves the source untouched (copy, not move): if
 * anything goes wrong partway through, the original data is never at risk. */
function copyDataInto(sourceDir: string, targetDir: string): void {
  mkdirSync(targetDir, { recursive: true })
  const dbSrc = join(sourceDir, 'notebook.sqlite')
  if (existsSync(dbSrc)) cpSync(dbSrc, join(targetDir, 'notebook.sqlite'))
  const mediaSrc = join(sourceDir, 'media')
  if (existsSync(mediaSrc)) cpSync(mediaSrc, join(targetDir, 'media'), { recursive: true })
}

let resolvedDataDir: string | null = null

/** The directory notebook.sqlite and the media folder currently live in.
 * Only valid after resolveStorageDir() has run at startup. */
export function getDataDir(): string {
  if (!resolvedDataDir) {
    throw new Error('getDataDir() called before resolveStorageDir()')
  }
  return resolvedDataDir
}

/** Resolves where notebook data lives, prompting the user the first time
 * (or if the configured folder has gone missing) rather than silently
 * defaulting back to userData. Must run before any DB/media path is read —
 * called once at startup, before initDb(). */
export async function resolveStorageDir(): Promise<string> {
  const existing = readConfig()
  if (existing && existsSync(existing.dataDir)) {
    resolvedDataDir = existing.dataDir
    return existing.dataDir
  }

  const isUpgrade = legacyDataExists()
  const suggested = defaultSuggestedDir()
  const chosen =
    (await pickFolder(
      suggested,
      isUpgrade ? 'Choose where to move your existing notes' : 'Choose where to store your notes'
    )) ?? suggested

  if (isUpgrade) {
    copyDataInto(app.getPath('userData'), chosen)
  } else {
    mkdirSync(chosen, { recursive: true })
  }

  writeConfig({ dataDir: chosen })
  resolvedDataDir = chosen
  return chosen
}

export function getLastBackupAt(): string | null {
  return readConfig()?.lastBackupAt ?? null
}

/** Merges into the existing config rather than overwriting it wholesale —
 * writeConfig() replaces the whole file, so this has to carry dataDir
 * forward itself or a backup would silently erase the storage location. */
export function setLastBackupAt(iso: string): void {
  writeConfig({ dataDir: getDataDir(), lastBackupAt: iso })
}

/** User-triggered move to a new folder (Settings -> Change storage
 * location). Copies data across and updates the config, but doesn't try to
 * hot-swap the live sql.js connection or the already-registered app-media://
 * protocol root — the caller relaunches the app afterward so every module
 * that read the old path at startup picks up the new one cleanly. */
export async function changeStorageLocation(): Promise<StorageChangeResult> {
  const current = getDataDir()
  const chosen = await pickFolder(current, 'Choose a new location for your notes')
  if (!chosen || chosen === current) return { changed: false }

  copyDataInto(current, chosen)
  writeConfig({ dataDir: chosen })
  resolvedDataDir = chosen
  return { changed: true, newDir: chosen }
}
