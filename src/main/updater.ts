import { app, ipcMain, net, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'
import type { UpdateStatus, WhatsNew } from '@shared/ipc-channels'

// Same repo electron-builder publishes releases to (see package.json's
// build.publish) — used to fetch a specific version's release notes
// directly, for the "just updated" case below where electron-updater itself
// has nothing to tell us (it only compares against the latest, and by the
// time we're running the new version IS the latest).
const RELEASES_REPO = 'Hasanain-Jaafar/notes-with-freedom'

// Downloads happen automatically once an update is found; installing only
// happens when the user clicks "Restart & install" (see UPDATE_INSTALL_NOW
// below) so a check never interrupts someone mid-note.
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

let lastStatus: UpdateStatus = { state: 'idle' }

function broadcast(status: UpdateStatus): void {
  lastStatus = status
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.UPDATE_STATUS_CHANGED, status)
  }
}

// electron-updater's releaseNotes is normally the GitHub Release body as a
// single string, but its type also allows a per-version array (used when
// the check skips over several releases at once) — handle both rather than
// assuming the common case is the only one.
function normalizeReleaseNotes(notes: unknown): string | undefined {
  if (!notes) return undefined
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) =>
        entry && typeof entry === 'object' && 'note' in entry
          ? String((entry as { note: unknown }).note ?? '')
          : ''
      )
      .filter(Boolean)
      .join('\n\n')
    return joined || undefined
  }
  return undefined
}

// Small standalone JSON file in userData, same pattern as windowState.ts —
// just enough to remember which version's "what's new" the user has already
// been shown, across restarts.
const LAST_SEEN_VERSION_FILENAME = 'last-seen-version.json'

function lastSeenVersionFilePath(): string {
  return join(app.getPath('userData'), LAST_SEEN_VERSION_FILENAME)
}

function readLastSeenVersion(): string | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(lastSeenVersionFilePath(), 'utf-8'))
    return parsed && typeof parsed === 'object' && typeof (parsed as { version?: unknown }).version === 'string'
      ? (parsed as { version: string }).version
      : null
  } catch {
    return null
  }
}

function writeLastSeenVersion(version: string): void {
  try {
    writeFileSync(lastSeenVersionFilePath(), JSON.stringify({ version }), 'utf-8')
  } catch {
    // Non-critical — worst case "what's new" shows again (or not at all)
    // next launch.
  }
}

/** GitHub's public releases API, keyed by the same "v<version>" tag the
 * release workflow already pushes — no auth needed for a public repo, and
 * this is a single one-off request at startup, not something to route
 * through electron-updater (which only ever compares against the latest
 * release, not a specific past one). */
async function fetchReleaseNotesForVersion(version: string): Promise<string | undefined> {
  try {
    const response = await net.fetch(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/tags/v${version}`,
      { headers: { Accept: 'application/vnd.github+json' } }
    )
    if (!response.ok) return undefined
    const body: unknown = await response.json()
    const notes =
      body && typeof body === 'object' && typeof (body as { body?: unknown }).body === 'string'
        ? (body as { body: string }).body
        : undefined
    return notes || undefined
  } catch {
    return undefined
  }
}

/** electron-updater's own 'update-available'/'update-downloaded' events
 * (below) only ever fire in the OLD process, before the user restarts to
 * install — by the time this new, just-updated version is what's actually
 * running, that process is long gone and electron-updater has nothing left
 * to say (checking again just reports "already up to date"). Comparing
 * app.getVersion() against the last version recorded in userData is what
 * lets a "what's new" notice survive the restart. Kicked off once at
 * startup (see whatsNewPromise below) rather than computed on demand, so
 * the network round-trip to GitHub starts immediately instead of waiting
 * for the renderer to ask for it. */
async function computeWhatsNew(): Promise<WhatsNew> {
  const currentVersion = app.getVersion()
  const lastSeenVersion = readLastSeenVersion()
  writeLastSeenVersion(currentVersion)

  // No prior record (fresh install) — nothing to compare against, and
  // showing "what's new" on someone's very first launch would be noise, not
  // news.
  if (!lastSeenVersion || lastSeenVersion === currentVersion) return null

  const releaseNotes = await fetchReleaseNotesForVersion(currentVersion)
  return { version: currentVersion, releaseNotes }
}

let whatsNewPromise: Promise<WhatsNew> = Promise.resolve(null)

export function registerUpdateIpcHandlers(): void {
  // Only in a packaged build — dev's version doesn't come from a real
  // published release, and there's nothing on GitHub to fetch notes for.
  if (app.isPackaged) whatsNewPromise = computeWhatsNew()

  ipcMain.handle(IPC.UPDATE_GET_WHATS_NEW, (): Promise<WhatsNew> => whatsNewPromise)

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }))
  autoUpdater.on('update-available', (info) =>
    broadcast({
      state: 'available',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  )
  autoUpdater.on('update-not-available', () => broadcast({ state: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    broadcast({ state: 'downloading', percent: Math.round(progress.percent) })
  )
  autoUpdater.on('update-downloaded', (info) =>
    broadcast({
      state: 'downloaded',
      version: info.version,
      releaseNotes: normalizeReleaseNotes(info.releaseNotes)
    })
  )
  autoUpdater.on('error', (err) => broadcast({ state: 'error', message: err.message }))

  ipcMain.handle(IPC.UPDATE_CHECK, (): UpdateStatus => {
    // Errors surface via the 'error' event above — nothing to catch here.
    void autoUpdater.checkForUpdates()
    return lastStatus
  })

  ipcMain.handle(IPC.UPDATE_INSTALL_NOW, (): void => {
    if (lastStatus.state !== 'downloaded') return
    autoUpdater.quitAndInstall()
  })
}

// Called once on startup, after the window is up — a silent background
// check so updates surface on their own without the user needing to open
// Settings, without ever blocking app launch on a network round trip.
export function checkForUpdatesInBackground(): void {
  void autoUpdater.checkForUpdates()
}
