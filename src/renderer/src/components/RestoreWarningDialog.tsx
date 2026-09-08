import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface RestoreWarningDialogProps {
  fileName: string
  onConfirm: () => void
  onCancel: () => void
}

/** Deliberately not styled like the neutral ConfirmDialog used for
 * deleting a tag/section/page — restoring replaces the ENTIRE database and
 * media folder, not one row, so this breaks from the app's one-sparing-
 * accent-color rule on purpose to read as more severe: a warning-red icon
 * and heading instead of the usual primary blue. Portaled at a higher
 * z-index than SlidePanel so it stacks above the Settings panel it's
 * triggered from. */
export function RestoreWarningDialog({
  fileName,
  onConfirm,
  onCancel
}: RestoreWarningDialogProps): React.JSX.Element {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-96 rounded-md p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-red-500/15 text-red-600 dark:text-red-400">
            <AlertTriangle size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400">
              Restore from backup?
            </h2>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fileName}>
              {fileName}
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm text-muted-foreground">
          This replaces your current notebook database and every image or audio recording with
          the contents of this backup. Your current data will be gone unless you have a separate
          backup of it —{' '}
          <span className="font-medium text-foreground">this cannot be undone.</span>
        </p>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-sm px-3 py-1.5 text-sm hover:bg-accent">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-sm bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
          >
            Replace my data and restart
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
