import { useEffect, useRef, useState } from 'react'
import { Book, ChevronDown, Plus, Pencil, Trash2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn } from '../lib/utils'
import { ConfirmDialog } from './ConfirmDialog'

export function NotebookSwitcher(): React.JSX.Element {
  const notebooks = useAppStore((s) => s.notebooks)
  const activeNotebookId = useAppStore((s) => s.activeNotebookId)
  const setActiveNotebook = useAppStore((s) => s.setActiveNotebook)
  const createNotebook = useAppStore((s) => s.createNotebook)
  const renameNotebook = useAppStore((s) => s.renameNotebook)
  const deleteNotebook = useAppStore((s) => s.deleteNotebook)

  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const activeNotebook = notebooks.find((n) => n.id === activeNotebookId)

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setCreating(false)
        setRenamingId(null)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.select()
  }, [renamingId])

  async function submitNewNotebook(): Promise<void> {
    const name = draftName.trim()
    if (!name) return
    await createNotebook(name)
    setDraftName('')
    setCreating(false)
    setOpen(false)
  }

  function startRenaming(notebookId: number, currentName: string): void {
    setRenamingId(notebookId)
    setRenameDraft(currentName)
  }

  async function submitRename(): Promise<void> {
    const id = renamingId
    const name = renameDraft.trim()
    setRenamingId(null)
    if (id !== null && name) await renameNotebook(id, name)
  }

  return (
    <div ref={containerRef} className="relative px-2 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm font-medium hover:bg-primary/10"
      >
        <Book size={16} className="shrink-0" />
        <span className="truncate">{activeNotebook?.name ?? 'No notebook'}</span>
        <ChevronDown size={14} className="ml-auto shrink-0 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute left-2 right-2 top-full z-20 mt-1 max-h-72 overflow-auto rounded-md border border-border bg-background p-1 shadow-xl">
          {/* Solid surface, not another blurred glass layer — CLAUDE.md warns
              against stacking backdrop-blur, and a translucent popover here
              would read as overlapping with the columns underneath it. */}
          {notebooks.map((nb) =>
            nb.id === renamingId ? (
              <input
                key={nb.id}
                ref={renameInputRef}
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitRename()
                  if (e.key === 'Escape') setRenamingId(null)
                }}
                onBlur={() => void submitRename()}
                className="w-full rounded-sm border border-border bg-muted px-2 py-1.5 text-sm outline-none"
              />
            ) : (
              <div
                key={nb.id}
                className={cn(
                  'group flex w-full items-center rounded-sm hover:bg-primary/10',
                  nb.id === activeNotebookId && 'bg-primary/10 hover:bg-primary/15'
                )}
              >
                <button
                  onClick={() => {
                    void setActiveNotebook(nb.id)
                    setOpen(false)
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left text-sm"
                >
                  <Book size={14} className="shrink-0" />
                  <span className="truncate">{nb.name}</span>
                </button>
                <button
                  onClick={() => startRenaming(nb.id, nb.name)}
                  title="Rename notebook"
                  className="shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={() => setDeleteTarget({ id: nb.id, name: nb.name })}
                  title="Delete notebook"
                  className="mr-1 shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 hover:bg-black/10 group-hover:opacity-100 dark:hover:bg-white/10"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            )
          )}

          {creating ? (
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitNewNotebook()
                if (e.key === 'Escape') setCreating(false)
              }}
              onBlur={() => void submitNewNotebook()}
              placeholder="Notebook name…"
              className="mt-1 w-full rounded-sm border border-border bg-muted px-2 py-1.5 text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-primary/10"
            >
              <Plus size={14} />
              New notebook
            </button>
          )}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete notebook?"
          message={`"${deleteTarget.name}" and all its sections and pages will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteNotebook(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
