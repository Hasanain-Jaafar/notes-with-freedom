import { useEffect, useRef, useState } from 'react'
import { Tag as TagIcon } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn } from '../lib/utils'
import { TagContextMenu } from './TagContextMenu'
import { ConfirmDialog } from './ConfirmDialog'

interface TagsColumnProps {
  width: number
}

interface ContextMenuState {
  tagId: number
  x: number
  y: number
}

interface DeleteTarget {
  id: number
  name: string
}

/** The sidebar's "Tags" view — every tag in the app, flat, independent of
 * notebook/section. Sits alongside TaggedPagesColumn the same way
 * SectionsColumn sits alongside PagesColumn in the Notebook view. */
export function TagsColumn({ width }: TagsColumnProps): React.JSX.Element {
  const tags = useAppStore((s) => s.tags)
  const selectedTagId = useAppStore((s) => s.selectedTagId)
  const loadTags = useAppStore((s) => s.loadTags)
  const selectTag = useAppStore((s) => s.selectTag)
  const renameTag = useAppStore((s) => s.renameTag)
  const deleteTag = useAppStore((s) => s.deleteTag)
  const setTagColor = useAppStore((s) => s.setTagColor)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.select()
  }, [renamingId])

  function startRenaming(tagId: number, currentName: string): void {
    setRenamingId(tagId)
    setRenameDraft(currentName)
  }

  async function submitRename(): Promise<void> {
    const id = renamingId
    const name = renameDraft.trim()
    setRenamingId(null)
    if (id !== null && name) await renameTag(id, name)
  }

  const menuTag = contextMenu ? tags.find((t) => t.id === contextMenu.tagId) : undefined

  return (
    <div className="flex shrink-0 flex-col" style={{ width }}>
      <div className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        <TagIcon size={13} />
        Tags
      </div>

      <div className="flex flex-1 flex-col gap-1 overflow-auto p-1">
        {tags.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">
            No tags yet — add one from a page&rsquo;s Properties panel.
          </p>
        )}

        {tags.map((tag) => (
          <div
            key={tag.id}
            onContextMenu={(e) => {
              e.preventDefault()
              setContextMenu({ tagId: tag.id, x: e.clientX, y: e.clientY })
            }}
            className={cn(
              'group flex w-full items-center rounded-sm hover:bg-accent',
              tag.id === selectedTagId && 'bg-primary/10 hover:bg-primary/15'
            )}
          >
            {tag.id === renamingId ? (
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
                onClick={() => void selectTag(tag.id)}
                className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-2 text-left text-sm"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tag.color ?? '#94A3B8' }}
                />
                <span className="truncate">{tag.name}</span>
              </button>
            )}
          </div>
        ))}
      </div>

      {contextMenu && menuTag && (
        <TagContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          tagColor={menuTag.color}
          onRename={() => startRenaming(menuTag.id, menuTag.name)}
          onDelete={() => setDeleteTarget({ id: menuTag.id, name: menuTag.name })}
          onPickColor={(hex) => void setTagColor(menuTag.id, hex)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete tag?"
          message={`"${deleteTarget.name}" will be removed from every page that has it. The pages themselves won't be deleted.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteTag(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
