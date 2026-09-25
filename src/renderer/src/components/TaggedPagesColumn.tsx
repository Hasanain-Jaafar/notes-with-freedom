import { FileText } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'

interface TaggedPagesColumnProps {
  width: number
  /** The Tags list beside this column is collapsed — nothing to pick from. */
  tagsHidden?: boolean
  onShowTags?: () => void
}

/** Right-hand column of the sidebar's Tags view — every page (across every
 * notebook/section) carrying the selected tag. Unlike PagesColumn, each row
 * shows its notebook/section since results aren't scoped to just one. */
export function TaggedPagesColumn({ width, tagsHidden, onShowTags }: TaggedPagesColumnProps): React.JSX.Element {
  const selectedTagId = useAppStore((s) => s.selectedTagId)
  const tags = useAppStore((s) => s.tags)
  const taggedPages = useAppStore((s) => s.taggedPages)
  const navigateToPage = useAppStore((s) => s.navigateToPage)

  const selectedTag = tags.find((t) => t.id === selectedTagId)

  return (
    <div className="flex shrink-0 flex-col" style={{ width }}>
      <div className="truncate border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
        {selectedTag ? `Tagged "${selectedTag.name}"` : 'Select a tag'}
      </div>

      <div className="flex-1 overflow-auto p-1">
        {!selectedTagId && tagsHidden && (
          <p className="px-2 py-3 pl-5 text-xs text-muted-foreground">
            The tags list is collapsed.{' '}
            <button onClick={onShowTags} className="font-medium text-primary hover:underline">
              Expand it
            </button>{' '}
            to see available tags.
          </p>
        )}

        {selectedTagId && taggedPages.length === 0 && (
          <p className="px-2 py-3 text-xs text-muted-foreground">No pages have this tag yet.</p>
        )}

        {taggedPages.map((page) => (
          <button
            key={page.pageId}
            onClick={() => void navigateToPage(page.notebookId, page.sectionId, page.pageId)}
            className="flex w-full flex-col items-start gap-0.5 rounded-sm px-2 py-1.5 text-left hover:bg-accent"
          >
            <span className="flex w-full items-center gap-2 text-sm">
              <FileText size={13} className="shrink-0 text-muted-foreground" />
              <span className="truncate">{page.title || 'Untitled page'}</span>
            </span>
            <span className="truncate pl-[1.25rem] text-xs text-muted-foreground">
              {page.notebookName} › {page.sectionName}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
