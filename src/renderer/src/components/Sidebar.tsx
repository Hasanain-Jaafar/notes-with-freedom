import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Notebook as NotebookIcon, Tag as TagIcon } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { useResizableWidth } from '../hooks/useResizableWidth'
import { usePersistedBoolean } from '../hooks/usePersistedBoolean'
import { NotebookSwitcher } from './NotebookSwitcher'
import { SectionsColumn } from './SectionsColumn'
import { PagesColumn } from './PagesColumn'
import { TagsColumn } from './TagsColumn'
import { TaggedPagesColumn } from './TaggedPagesColumn'
import { ResizeHandle } from './ResizeHandle'
import { cn } from '../lib/utils'

// Matches ResizeHandle's `w-2` — needed below to line the tab boundary up
// with the middle of the actual resize handle between the two columns.
const RESIZE_HANDLE_WIDTH = 8

const viewTabClass = (active: boolean): string =>
  cn(
    'flex items-center justify-center gap-1.5 border-b-2 py-1.5 text-xs font-medium',
    active
      ? 'border-primary bg-black/[0.06] text-foreground dark:bg-white/10'
      : 'border-muted-foreground/40 text-muted-foreground hover:text-foreground'
  )

export function Sidebar(): React.JSX.Element {
  const loadNotebooks = useAppStore((s) => s.loadNotebooks)
  const sidebarView = useAppStore((s) => s.sidebarView)
  const setSidebarView = useAppStore((s) => s.setSidebarView)

  const [sectionsWidth, resizeSections, commitSectionsWidth] = useResizableWidth(
    'sectionsColumnWidth',
    160,
    120,
    320
  )
  const [pagesWidth, resizePages, commitPagesWidth] = useResizableWidth('pagesColumnWidth', 208, 140, 400)
  const [collapsed, setCollapsed] = usePersistedBoolean('sidebarCollapsed', false)
  // The wrapper below animates width changes for the collapse/expand toggle
  // — while an active drag is also changing that same width on every frame,
  // that transition kept re-targeting mid-flight instead of tracking the
  // cursor, which is what made resizing feel like it was lagging and
  // snapping rather than moving smoothly. Suppressing the transition only
  // for the duration of a drag keeps the collapse animation intact.
  const [isResizing, setIsResizing] = useState(false)

  useEffect(() => {
    void loadNotebooks()
  }, [loadNotebooks])

  // Two ResizeHandles (w-2 = 8px each) sit between/after the columns.
  const expandedWidth = sectionsWidth + pagesWidth + 16

  // Re-enabling the transition and applying the drag's final width change
  // in the very same render let the transition catch that last bit of
  // movement instead of it landing instantly — a brief animated "settle"
  // right as you release the mouse, most visible as the centered tab labels
  // above the columns visibly sliding/re-centering for a beat. Deferring the
  // transition's return to the frame after the final width has already
  // committed (with the transition still off) means there's no width change
  // left for it to catch.
  function finishResize(commit: () => void): void {
    commit()
    requestAnimationFrame(() => setIsResizing(false))
  }

  return (
    // Not overflow-hidden here — the floating toggle below needs to poke
    // outside this box's edge, which an overflow-hidden ancestor would clip.
    <div className="relative h-full shrink-0">
      {/* Collapses by animating this inner box's pixel width to 0 while the
          aside inside keeps its full natural width (and stays mounted, so
          loadNotebooks() above keeps running and re-expanding doesn't
          re-fetch) — clipped by this box's own overflow-hidden. A grid
          0fr<->1fr track trick doesn't reliably collapse here since the
          outer wrapper is itself intrinsically sized (shrink-to-fit) inside
          a flex row rather than stretched to a definite parent width. */}
      <div
        className={cn('h-full overflow-hidden', !isResizing && 'transition-[width] duration-200 ease-in-out')}
        style={{ width: collapsed ? 0 : expandedWidth }}
      >
        <aside
          className="sidebar-panel relative flex h-full flex-col overflow-hidden rounded-md"
          style={{ width: expandedWidth }}
        >
          {/* Blurred background lives on its own layer, overscanned a few
              px past the panel's own edge (-inset-2) and relying on the
              parent's overflow-hidden to do the actual rounded clipping —
              see .sidebar-panel-bg in index.css for why. */}
          <div className="sidebar-panel-bg absolute -inset-2 -z-10" />

          <NotebookSwitcher />

          <div className="flex shrink-0">
            {/* Fixed to the Sections column's own width (plus half the
                resize handle) rather than an even 50/50 split, so this tab's
                right edge lines up with the actual divider between the two
                columns below instead of drifting away from it whenever
                they're resized to an uneven ratio. Tags stays flex-1 to
                soak up whatever width is left, self-correcting rather than
                needing its own matching calculation. */}
            <button
              onClick={() => setSidebarView('notebook')}
              style={{ width: sectionsWidth + RESIZE_HANDLE_WIDTH / 2 }}
              className={cn(viewTabClass(sidebarView === 'notebook'), 'shrink-0')}
            >
              <NotebookIcon size={13} />
              Notebook
            </button>
            <button
              onClick={() => setSidebarView('tags')}
              className={cn(viewTabClass(sidebarView === 'tags'), 'flex-1')}
            >
              <TagIcon size={13} />
              Tags
            </button>
          </div>

          <div className="flex min-h-0 flex-1">
            {sidebarView === 'notebook' ? (
              <>
                <SectionsColumn width={sectionsWidth} />
                <ResizeHandle
                  onResize={resizeSections}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeEnd={() => finishResize(commitSectionsWidth)}
                  centerOnBoundary
                />
                <PagesColumn width={pagesWidth} />
              </>
            ) : (
              <>
                <TagsColumn width={sectionsWidth} />
                <ResizeHandle
                  onResize={resizeSections}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeEnd={() => finishResize(commitSectionsWidth)}
                  centerOnBoundary
                />
                <TaggedPagesColumn width={pagesWidth} />
              </>
            )}
          </div>
        </aside>
      </div>

      {/* Deliberately NOT inside the aside/collapsible box above — that box
          clips (overflow-hidden) at exactly the sidebar's own edge, so a
          handle living inside it could never reach the note area's edge on
          the other side of the gap-2 space (see App.tsx) between the two
          panels. Positioned here, as a sibling, its hit-zone can extend
          across that whole gap instead of stopping 8px short of it. */}
      {!collapsed && (
        <ResizeHandle
          onResize={resizePages}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => finishResize(commitPagesWidth)}
          className="absolute top-0 h-full"
          style={{ left: expandedWidth }}
        />
      )}

      {/* Floating glass toggle: anchored to this box's right edge (which is
          exactly what's animating above), so it rides along the seam as the
          sidebar slides shut instead of staying pinned in place. Subtle at
          rest, reads as a solid glass chip on hover — small/medium radius
          only per the app's corner-radius rule, not a true pill shape. */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        className={cn(
          'group absolute right-0 top-1/2 z-10 flex h-8 w-5 -translate-y-1/2 translate-x-1/2',
          'items-center justify-center rounded-md border border-white/40 bg-white/50',
          'text-muted-foreground shadow-md backdrop-blur-sm transition-all duration-150',
          'hover:scale-105 hover:bg-white/90 hover:text-foreground hover:shadow-lg',
          'dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/20'
        )}
      >
        {collapsed ? (
          <ChevronRight size={13} className="transition-transform group-hover:translate-x-px" />
        ) : (
          <ChevronLeft size={13} className="transition-transform group-hover:-translate-x-px" />
        )}
      </button>
    </div>
  )
}
