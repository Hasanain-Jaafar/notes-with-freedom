import { useEffect, useRef, useState } from 'react'
import { Plus, FileText, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn } from '../lib/utils'
import { PageContextMenu } from './PageContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { ExportFormat } from './ExportSubmenuItems'
import { DEFAULT_ACCENT_HEX } from '../lib/sectionColors'
import { hexToRgba } from '../lib/hexColor'

interface PagesColumnProps {
  width: number
}

interface ContextMenuState {
  pageId: number
  x: number
  y: number
}

interface DeleteTarget {
  id: number
  title: string
}

export function PagesColumn({ width }: PagesColumnProps): React.JSX.Element {
  const activeNotebookId = useAppStore((s) => s.activeNotebookId)
  const activeSectionId = useAppStore((s) => s.activeSectionId)
  const activePage = useAppStore((s) => s.activePage)
  const pagesBySection = useAppStore((s) => s.pagesBySection)
  const sectionsByNotebook = useAppStore((s) => s.sectionsByNotebook)
  const openPage = useAppStore((s) => s.openPage)
  const createPage = useAppStore((s) => s.createPage)
  const deletePage = useAppStore((s) => s.deletePage)
  const renamePage = useAppStore((s) => s.renamePage)

  const [creating, setCreating] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const pages = activeSectionId ? (pagesBySection[activeSectionId] ?? []) : []

  // Every page shown here belongs to the same section, so they all share
  // that section's accent — a page selected under a purple section should
  // feel like part of the same purple system, not a generic app-wide blue.
  const activeSection = activeNotebookId
    ? (sectionsByNotebook[activeNotebookId] ?? []).find((s) => s.id === activeSectionId)
    : undefined
  const accentHex = activeSection?.color ?? DEFAULT_ACCENT_HEX

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.select()
  }, [renamingId])

  async function submit(): Promise<void> {
    const title = draftTitle.trim()
    setDraftTitle('')
    setCreating(false)
    // Blurring (or pressing Enter) on an empty draft just cancels the
    // creation instead of silently creating a page titled "Untitled page" —
    // the user should have to actually type something for a page to appear.
    if (!title) return
    await createPage(title)
  }

  function startRenaming(pageId: number, currentTitle: string): void {
    setRenamingId(pageId)
    setRenameDraft(currentTitle)
  }

  async function submitRename(): Promise<void> {
    const id = renamingId
    const title = renameDraft.trim()
    setRenamingId(null)
    if (id !== null && title) await renamePage(id, title)
  }

  async function handleExportPage(pageId: number, format: ExportFormat): Promise<void> {
    // Dynamically imported: exportActions pulls in docx/turndown, which are
    // only ever needed once the user actually exports — not worth adding to
    // the app's initial bundle just for a right-click menu action.
    const { resolvePageForExport, exportPdf, exportDocx, exportMarkdown } = await import(
      '../lib/exportActions'
    )
    const page = await resolvePageForExport(pageId)
    if (format === 'pdf') await exportPdf('page', page.title, [page])
    else if (format === 'docx') await exportDocx('page', page.title, [page])
    else await exportMarkdown('page', page.title, [page])
  }

  const menuPage = contextMenu ? pages.find((p) => p.id === contextMenu.pageId) : undefined

  return (
    <div className="flex shrink-0 flex-col" style={{ width }}>
      {/* Once there's at least one page, "Add page" moves below the list
          (next to the last page) instead of sitting up here — this header
          slot is only for the empty-list case, where there's no "below the
          last page" to put it next to. */}
      {pages.length === 0 && !creating && (
        <button
          onClick={() => setCreating(true)}
          disabled={!activeSectionId}
          className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-primary/10 disabled:opacity-40"
        >
          <Plus size={13} />
          Add page
        </button>
      )}

      <div className="flex-1 overflow-auto pb-1 pl-1 pr-1 pt-4">
        {pages.map((page) => {
          const isActive = page.id === activePage?.id
          return (
            <div
              key={page.id}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ pageId: page.id, x: e.clientX, y: e.clientY })
              }}
              style={
                isActive
                  ? ({
                      '--row-bg': hexToRgba(accentHex, 0.14),
                      '--row-bg-hover': hexToRgba(accentHex, 0.22)
                    } as React.CSSProperties)
                  : undefined
              }
              className={cn(
                'group flex w-full items-center rounded-sm',
                // Tied to the parent section's own accent color (falling back
                // to the app default for a "None"-colored section) so a page
                // under a purple section reads as part of the same purple
                // system, not a generic app-wide highlight. Plain hover stays
                // neutral so it never reads as strong as an actual selection.
                isActive ? 'bg-[var(--row-bg)] hover:bg-[var(--row-bg-hover)]' : 'hover:bg-primary/10'
              )}
            >
              {page.id === renamingId ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => void submitRename()}
                  className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-2 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => void openPage(page.id)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm',
                    // Weight + icon contrast are second, hue-independent
                    // cues for selection — never rely on the tint alone.
                    isActive && 'font-medium'
                  )}
                >
                  <FileText
                    size={13}
                    className={cn('shrink-0', !isActive && 'text-muted-foreground')}
                    style={isActive ? { color: accentHex } : undefined}
                  />
                  <span className="truncate">{page.title || 'Untitled page'}</span>
                </button>
              )}
              <button
                onClick={() =>
                  setDeleteTarget({ id: page.id, title: page.title || 'Untitled page' })
                }
                title="Delete page"
                className="mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )
        })}

        {creating ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') setCreating(false)
            }}
            onBlur={() => void submit()}
            placeholder="Page title…"
            className={cn(
              'glass-card w-full rounded-sm px-2 py-1 text-sm outline-none',
              pages.length > 0 && 'mt-1'
            )}
          />
        ) : (
          pages.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="mt-1 flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-primary/10"
            >
              <Plus size={13} />
              Add page
            </button>
          )
        )}
      </div>

      {contextMenu && menuPage && (
        <PageContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onRename={() => startRenaming(menuPage.id, menuPage.title)}
          onDelete={() => setDeleteTarget({ id: menuPage.id, title: menuPage.title || 'Untitled page' })}
          onExport={(format) => void handleExportPage(menuPage.id, format)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete page?"
          message={`"${deleteTarget.title}" will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void deletePage(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
