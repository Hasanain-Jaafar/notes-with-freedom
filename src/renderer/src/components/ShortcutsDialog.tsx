import { Fragment, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Keyboard, X } from 'lucide-react'
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts'
import { GLOBAL_SHORTCUTS } from '../lib/globalShortcuts'

const SHORTCUT_GROUPS = [
  { title: 'General', shortcuts: GLOBAL_SHORTCUTS },
  { title: 'Editor', shortcuts: EDITOR_SHORTCUTS }
]

/** Opened from the Settings panel's "Keyboard shortcuts" button. Portaled at
 * the same z-index as RestoreWarningDialog so it stacks above SlidePanel. */
export function ShortcutsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  // Capture phase on window so Escape closes only this dialog — otherwise
  // SlidePanel's own document-level Escape listener would close Settings too.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel flex max-h-[calc(100vh-2rem)] w-[28rem] flex-col rounded-md p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Keyboard size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Editor shortcuts work while a page is focused.
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-black/10 dark:hover:bg-white/10"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-3 min-h-0 overflow-y-auto pb-0.5 pr-1">
          {SHORTCUT_GROUPS.map((group, i) => (
            <section
              key={group.title}
              className={i > 0 ? 'mt-4 border-t border-black/[0.06] pt-3 dark:border-white/10' : ''}
            >
              <h3 className="text-xs font-semibold text-foreground">{group.title}</h3>
              <dl className="mt-2 grid grid-cols-[1fr_auto] items-center gap-y-2 text-xs">
                {group.shortcuts.map((shortcut) => (
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
          ))}
        </div>
      </div>
    </div>,
    document.body
  )
}
