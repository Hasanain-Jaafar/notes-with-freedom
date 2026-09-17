import { useEffect, useState } from 'react'
import { Link2 } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { safeParse } from '../lib/pageJson'
import { countWords } from '../lib/wordCount'
import { TagPill } from './TagPill'
import { cn } from '../lib/utils'

/** App-wide note count comes from a cheap SELECT COUNT(*) (the same call
 * Settings' storage stats already uses) rather than summing the sidebar's
 * per-notebook pageCount fields — those are only loaded for the ACTIVE
 * notebook (lazy loading), so they can't answer "how many notes total"
 * without a real query. Refetched whenever the tree's own state changes
 * (create/delete page/section/notebook all touch one of these), not on a
 * timer or per keystroke. */
function useTotalPageCount(): number | null {
  const notebooks = useAppStore((s) => s.notebooks)
  const sectionsByNotebook = useAppStore((s) => s.sectionsByNotebook)
  const pagesBySection = useAppStore((s) => s.pagesBySection)
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    void window.api.backup.getStats().then((stats) => setCount(stats.pageCount))
  }, [notebooks, sectionsByNotebook, pagesBySection])

  return count
}

/** How many OTHER pages link to the open page — a plain COUNT query
 * (pageLinks:countBacklinks), not GraphView's full listAll(): the status
 * bar only ever needs a number for whichever page is open right now, so
 * fetching the whole link graph on every page switch would be wasted work. */
function useBacklinkCount(pageId: number | undefined): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!pageId) {
      setCount(0)
      return
    }
    let cancelled = false
    void window.api.pageLinks.countBacklinks(pageId).then((n) => {
      if (!cancelled) setCount(n)
    })
    return () => {
      cancelled = true
    }
  }, [pageId])

  return count
}

export function StatusBar(): React.JSX.Element {
  const activePage = useAppStore((s) => s.activePage)
  const activePageDirty = useAppStore((s) => s.activePageDirty)
  const pageTags = useAppStore((s) => s.pageTags)
  const selectTag = useAppStore((s) => s.selectTag)
  const totalPageCount = useTotalPageCount()
  const backlinkCount = useBacklinkCount(activePage?.id)

  const { words } = activePage ? countWords(safeParse(activePage.contentJson)) : { words: 0 }

  return (
    <footer className="glass-panel flex h-7 shrink-0 items-center gap-3 rounded-md px-3 text-xs text-muted-foreground">
      <span>{totalPageCount === null ? '…' : `${totalPageCount} ${totalPageCount === 1 ? 'note' : 'notes'}`}</span>

      {activePage && (
        <>
          <span className="h-3 w-px bg-border" />
          <span>{words} {words === 1 ? 'word' : 'words'}</span>

          {backlinkCount > 0 && (
            <span className="flex items-center gap-1" title={`${backlinkCount} page${backlinkCount === 1 ? '' : 's'} link here`}>
              <Link2 size={12} />
              {backlinkCount} backlink{backlinkCount === 1 ? '' : 's'}
            </span>
          )}

          {pageTags.length > 0 && (
            <span className="flex items-center gap-1">
              {pageTags.map((tag) => (
                <TagPill
                  key={tag.id}
                  tag={tag}
                  onClick={() => void selectTag(tag.id)}
                  className="px-1.5 py-0 text-[11px] leading-4"
                />
              ))}
            </span>
          )}
        </>
      )}

      {activePage && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              activePageDirty ? 'bg-amber-500' : 'bg-emerald-500'
            )}
          />
          {activePageDirty ? 'Saving…' : 'Saved'}
        </span>
      )}
    </footer>
  )
}
