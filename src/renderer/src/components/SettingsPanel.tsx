import { useEffect, useState } from 'react'
import { FolderOpen, Archive, RotateCcw, RefreshCw } from 'lucide-react'
import type { StorageStatsDTO, UpdateStatus } from '@shared/ipc-channels'
import { SlidePanel } from './SlidePanel'
import { RestoreWarningDialog } from './RestoreWarningDialog'
import { formatBytes } from '../lib/formatBytes'
import { formatTimestamp } from '../lib/formatTimestamp'

const buttonClass =
  'flex items-center gap-1.5 rounded-sm border border-black/10 bg-black/[0.03] px-2.5 py-1.5 text-xs hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'

export function SettingsPanel({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const [path, setPath] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [stats, setStats] = useState<StorageStatsDTO | null>(null)
  const [creatingBackup, setCreatingBackup] = useState(false)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const [pendingRestoreFile, setPendingRestoreFile] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })

  // Subscribed for the component's whole lifetime (not gated on `open`) so a
  // background check that finds an update while Settings is closed is still
  // reflected the moment the panel is opened.
  useEffect(() => {
    return window.api.updates.onStatusChanged(setUpdateStatus)
  }, [])

  // Fetched once the panel actually opens rather than on every app launch —
  // this is the only place any of these are used.
  useEffect(() => {
    if (!open) return
    void window.api.storage.getPath().then(setPath)
    void window.api.app.getVersion().then(setVersion)
    void window.api.backup.getStats().then(setStats)
  }, [open])

  async function handleChangeLocation(): Promise<void> {
    setChanging(true)
    setMessage(null)
    const result = await window.api.storage.changeLocation()
    if (!result.changed) {
      // Canceled the folder picker, or picked the folder data's already in.
      setChanging(false)
      return
    }
    // The app relaunches itself right after this resolves (see
    // storage:changeLocation in main/index.ts) — nothing else to do here.
    setMessage('Copied your notes to the new folder — restarting…')
  }

  async function handleCreateBackup(): Promise<void> {
    setCreatingBackup(true)
    setBackupMessage(null)
    const result = await window.api.backup.create()
    setCreatingBackup(false)
    if (!result.created) return // canceled the save dialog
    setBackupMessage(`Backup saved to ${result.path}`)
    // Updates the "Last backup" stat immediately, without waiting for the
    // panel to be reopened — the whole point of returning lastBackupAt here.
    setStats((prev) => (prev ? { ...prev, lastBackupAt: result.lastBackupAt } : prev))
  }

  async function handlePickRestoreFile(): Promise<void> {
    setRestoreError(null)
    setBackupMessage(null)
    const result = await window.api.backup.pickAndValidate()
    if (!result.picked) return // canceled the open dialog
    if (!result.valid) {
      setRestoreError(result.error)
      return
    }
    // Structural validation already passed — the in-app warning dialog
    // below is the actual "are you sure" gate before anything is touched.
    setPendingRestoreFile(result.filePath)
  }

  async function handleConfirmRestore(): Promise<void> {
    if (!pendingRestoreFile) return
    setRestoring(true)
    await window.api.backup.restore(pendingRestoreFile)
    // The app relaunches itself on success (see backup:restore in
    // main/index.ts) — nothing else to do here.
  }

  function updateStatusLabel(status: UpdateStatus): string {
    switch (status.state) {
      case 'idle':
        return ''
      case 'checking':
        return 'Checking for updates…'
      case 'available':
        return `Update ${status.version} found — downloading…`
      case 'not-available':
        return "You're up to date."
      case 'downloading':
        return `Downloading update… ${status.percent}%`
      case 'downloaded':
        return `Update ${status.version} ready to install.`
      case 'error':
        // electron-updater's raw message for "no non-draft release matches
        // this platform yet" is a confusing, GitHub-internals-flavored
        // string — reword it instead of surfacing it verbatim.
        if (/no published versions/i.test(status.message)) {
          return 'No update available yet — check back later.'
        }
        return `Update check failed: ${status.message}`
    }
  }

  return (
    <SlidePanel open={open} onClose={onClose} title="Settings">
      <section>
        <h3 className="text-xs font-medium text-muted-foreground">Storage location</h3>
        <div
          className="mt-1.5 truncate rounded-sm bg-black/[0.03] px-2 py-1.5 text-xs dark:bg-white/5"
          title={path ?? ''}
        >
          {path ?? 'Loading…'}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          All your notes and media live here. Point this at a USB or shared folder to sync
          between PCs.
        </p>

        <button
          onClick={() => void handleChangeLocation()}
          disabled={changing || !path}
          className={`mt-3 ${buttonClass}`}
        >
          <FolderOpen size={13} />
          Change…
        </button>

        {message ? (
          <p className="mt-2 text-xs text-primary">{message}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Your data will be copied to the new folder — the old copy stays put. The app will
            restart to finish up.
          </p>
        )}
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-xs font-medium text-muted-foreground">Backup &amp; restore</h3>

        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-y-1.5 text-xs">
          <dt className="text-muted-foreground">Notes</dt>
          <dd className="text-right">{stats ? stats.pageCount : '…'}</dd>
          <dt className="text-muted-foreground">Database size</dt>
          <dd className="text-right">{stats ? formatBytes(stats.dbSizeBytes) : '…'}</dd>
          <dt className="text-muted-foreground">Media size</dt>
          <dd className="text-right">{stats ? formatBytes(stats.mediaSizeBytes) : '…'}</dd>
          <dt className="text-muted-foreground">Last backup</dt>
          <dd className="text-right">
            {stats ? (stats.lastBackupAt ? formatTimestamp(stats.lastBackupAt) : 'Never') : '…'}
          </dd>
        </dl>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => void handleCreateBackup()}
            disabled={creatingBackup || !stats}
            className={buttonClass}
          >
            <Archive size={13} />
            Create backup now
          </button>
          <button
            onClick={() => void handlePickRestoreFile()}
            disabled={restoring}
            className={buttonClass}
          >
            <RotateCcw size={13} />
            Restore from backup…
          </button>
        </div>

        {backupMessage && (
          <p className="mt-2 truncate text-xs text-primary" title={backupMessage}>
            {backupMessage}
          </p>
        )}
        {restoreError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{restoreError}</p>
        )}
        {restoring && (
          <p className="mt-2 text-xs text-primary">Restoring your backup — restarting…</p>
        )}
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-xs font-medium text-muted-foreground">About</h3>
        <p className="mt-1.5 text-sm">Notes with freedom</p>
        <p className="text-xs text-muted-foreground">Version {version ?? '…'}</p>

        <div className="mt-3 flex flex-wrap gap-2">
          {updateStatus.state === 'downloaded' ? (
            <button
              onClick={() => void window.api.updates.installNow()}
              className={buttonClass}
            >
              <RefreshCw size={13} />
              Restart &amp; install
            </button>
          ) : (
            <button
              onClick={() => void window.api.updates.check()}
              disabled={updateStatus.state === 'checking' || updateStatus.state === 'downloading'}
              className={buttonClass}
            >
              <RefreshCw size={13} />
              Check for updates
            </button>
          )}
        </div>

        {updateStatus.state !== 'idle' && (
          <p className="mt-2 text-xs text-muted-foreground">{updateStatusLabel(updateStatus)}</p>
        )}
      </section>

      {pendingRestoreFile && (
        <RestoreWarningDialog
          fileName={pendingRestoreFile}
          onCancel={() => setPendingRestoreFile(null)}
          onConfirm={() => void handleConfirmRestore()}
        />
      )}
    </SlidePanel>
  )
}
