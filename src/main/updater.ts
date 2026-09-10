import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'
import type { UpdateStatus } from '@shared/ipc-channels'

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

export function registerUpdateIpcHandlers(): void {
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
