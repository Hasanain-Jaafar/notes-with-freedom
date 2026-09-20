import { Fragment, useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Archive, RotateCcw, RefreshCw, ChevronDown } from 'lucide-react'
import type { StorageStatsDTO, UpdateStatus } from '@shared/ipc-channels'
import { SlidePanel } from './SlidePanel'
import { RestoreWarningDialog } from './RestoreWarningDialog'
import { ToolbarPopover } from './editor/ToolbarPopover'
import { formatBytes } from '../lib/formatBytes'
import { formatTimestamp } from '../lib/formatTimestamp'
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts'
import { GLOBAL_SHORTCUTS } from '../lib/globalShortcuts'
import { useLayoutFont, type LayoutFont } from '../hooks/useLayoutFont'
import { useAccentColor, type AccentColor } from '../hooks/useAccentColor'
import { cn } from '../lib/utils'

const buttonClass =
  'flex items-center gap-1.5 rounded-sm border border-black/10 bg-black/[0.03] px-2.5 py-1.5 text-xs hover:border-primary/40 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10'

// Swatch hex values are display-only previews of each preset's --primary
// (see index.css's data-app-accent rules) — picking a swatch never writes a
// hex value anywhere, only the id, which is what actually gets persisted and
// applied via the CSS variable indirection.
const ACCENT_COLOR_OPTIONS: { id: AccentColor; label: string; hex: string }[] = [
  { id: 'blue', label: 'Blue', hex: '#3B82F6' },
  { id: 'purple', label: 'Purple', hex: '#8B5CF6' },
  { id: 'green', label: 'Green', hex: '#16A34A' },
  { id: 'rose', label: 'Rose', hex: '#E11D48' },
  { id: 'amber', label: 'Amber', hex: '#EA7C1A' },
  { id: 'teal', label: 'Teal', hex: '#12897A' }
]

// Each option previews itself in its own actual font (inline style, not a
// Tailwind class) so picking between them isn't just reading plain labels —
// you see exactly what you're about to switch the whole UI to.
const LAYOUT_FONT_OPTIONS: { id: LayoutFont; label: string; previewFamily: string }[] = [
  { id: 'inter', label: 'Inter', previewFamily: "'Inter Variable', 'Inter', ui-sans-serif, sans-serif" },
  { id: 'geist', label: 'Geist', previewFamily: "'Geist Sans', ui-sans-serif, sans-serif" },
  { id: 'manrope', label: 'Manrope', previewFamily: "'Manrope Variable', ui-sans-serif, sans-serif" },
  { id: 'figtree', label: 'Figtree', previewFamily: "'Figtree Variable', ui-sans-serif, sans-serif" },
  { id: 'outfit', label: 'Outfit', previewFamily: "'Outfit Variable', ui-sans-serif, sans-serif" },
  { id: 'jakarta', label: 'Plus Jakarta Sans', previewFamily: "'Plus Jakarta Sans Variable', ui-sans-serif, sans-serif" }
]

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
  const [layoutFont, setLayoutFont] = useLayoutFont()
  const [accentColor, setAccentColor] = useAccentColor()
  const [fontMenuOpen, setFontMenuOpen] = useState(false)
  const [fontAnchorRect, setFontAnchorRect] = useState<DOMRect | null>(null)
  const fontButtonRef = useRef<HTMLButtonElement>(null)
  const currentFontOption = LAYOUT_FONT_OPTIONS.find((o) => o.id === layoutFont) ?? LAYOUT_FONT_OPTIONS[0]

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
        <h3 className="text-sm font-semibold text-foreground">Appearance</h3>
        <p className="mt-1.5 text-xs text-muted-foreground">Layout font</p>

        <button
          ref={fontButtonRef}
          onClick={() => {
            setFontAnchorRect(fontButtonRef.current!.getBoundingClientRect())
            setFontMenuOpen((v) => !v)
          }}
          style={{ fontFamily: currentFontOption.previewFamily }}
          className={cn(buttonClass, 'mt-2 w-48 justify-between text-sm')}
        >
          {currentFontOption.label}
          <ChevronDown size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {fontMenuOpen && fontAnchorRect && (
          <ToolbarPopover
            anchorRect={fontAnchorRect}
            onClose={() => setFontMenuOpen(false)}
            widthClassName="w-48"
            zIndexClassName="z-50"
          >
            {LAYOUT_FONT_OPTIONS.map((option) => (
              <button
                key={option.id}
                onClick={() => {
                  setLayoutFont(option.id)
                  setFontMenuOpen(false)
                }}
                style={{ fontFamily: option.previewFamily }}
                className={cn(
                  'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  option.id === layoutFont && 'bg-primary/10'
                )}
              >
                {option.label}
              </button>
            ))}
          </ToolbarPopover>
        )}
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-foreground">Accent color</h3>

        <div className="mt-2 flex flex-wrap gap-2">
          {ACCENT_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => setAccentColor(option.id)}
              title={option.label}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-sm border-2 transition-colors',
                option.id === accentColor
                  ? 'border-foreground'
                  : 'border-transparent hover:border-black/20 dark:hover:border-white/30'
              )}
            >
              <span
                className="h-full w-full rounded-[3px]"
                style={{ backgroundColor: option.hex }}
              />
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-foreground">Storage location</h3>
        <div className="mt-1.5 flex items-center gap-1 rounded-sm bg-black/[0.03] pl-2 pr-1 dark:bg-white/5">
          <div className="min-w-0 flex-1 truncate py-1.5 text-xs" title={path ?? ''}>
            {path ?? 'Loading…'}
          </div>
          <button
            onClick={() => void handleChangeLocation()}
            disabled={changing || !path}
            title="Change storage location…"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-black/10 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
          >
            <MoreHorizontal size={14} />
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">All your notes and media live here.</p>

        {message ? (
          <p className="mt-2 text-xs text-primary">{message}</p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            Your data will be copied to the new folder when you change the path
          </p>
        )}
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-foreground">Backup &amp; restore</h3>

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
        <h3 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h3>

        <dl className="mt-2 grid grid-cols-[1fr_auto] items-center gap-y-2 text-xs">
          {/* GLOBAL_SHORTCUTS first — work anywhere in the app, unlike
              EDITOR_SHORTCUTS below them, which only fire with the editor
              focused. Same {label, keys} shape, rendered as one combined
              list rather than two labeled groups since there's only a
              couple of entries so far. */}
          {[...GLOBAL_SHORTCUTS, ...EDITOR_SHORTCUTS].map((shortcut) => (
            <Fragment key={shortcut.id}>
              <dt className="text-muted-foreground">{shortcut.label}</dt>
              <dd className="text-right">
                <kbd className="rounded-sm border border-black/10 bg-black/[0.03] px-1.5 py-0.5 font-sans text-[11px] dark:border-white/10 dark:bg-white/5">
                  {shortcut.keys}
                </kbd>
              </dd>
            </Fragment>
          ))}
        </dl>
      </section>

      <section className="mt-6 border-t border-black/[0.06] pt-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-foreground">About</h3>
        <p className="mt-1.5 text-sm font-medium">Own Notes</p>
        <p className="mt-1 text-xs text-muted-foreground">
          A local note-taking app — notebooks, sections, and pages, with rich formatting. No
          cloud sync, no account, no Microsoft dependency — everything stays on your machine.
        </p>
        <p className="mt-1.5 text-xs text-muted-foreground">Version {version ?? '…'}</p>

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
        {(updateStatus.state === 'available' || updateStatus.state === 'downloaded') &&
          updateStatus.releaseNotes && (
            // Plain text, not rendered markdown — release notes come straight
            // from the GitHub Release body, and a full markdown renderer felt
            // like overkill just for a changelog blurb here.
            <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded-sm bg-black/[0.03] p-2 text-xs text-muted-foreground dark:bg-white/5">
              {updateStatus.releaseNotes}
            </div>
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
