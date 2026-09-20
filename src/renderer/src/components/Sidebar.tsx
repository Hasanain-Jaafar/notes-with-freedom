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

const viewTabClass = (active: boolean): string =>
  cn(
    'flex items-center justify-center gap-1.5 border-b-2 py-1.5 text-xs font-medium',
    active
      ? // Accent-tinted, not a neutral gray fill — same bg-primary/10 token
        // NotebookSwitcher's selected row and Settings' selected font option
        // already use for "this is the active one," so the tab reads as part
        // of the same active-state language instead of a one-off gray.  Soft,
        // wide, low-opacity shadow (CLAUDE.md's card-shadow guidance) rather
        // than a tight/harsh one — just enough to read as "lifted above the
        // row below it," matching the glass-panel recipe elsewhere.
        'border-primary bg-primary/10 text-foreground shadow-[0_3px_10px_-4px_rgba(15,23,42,0.35)] dark:shadow-[0_3px_10px_-4px_rgba(0,0,0,0.5)]'
      : 'border-muted-foreground/40 text-muted-foreground hover:bg-primary/10 hover:text-foreground'
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
  // Separate from the whole-sidebar `collapsed` above — this hides just the
  // Sections/Tags column while Pages stays visible, as a stop on the way to
  // a full collapse. See resizePagesCascading below.
  const [sectionsCollapsed, setSectionsCollapsed] = usePersistedBoolean('sectionsColumnCollapsed', false)
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

  const effectiveSectionsWidth = sectionsCollapsed ? 0 : sectionsWidth

  // Two ResizeHandles (w-2 = 8px each) sit between/after the columns.
  const expandedWidth = effectiveSectionsWidth + pagesWidth + 16

  // Dragging the Sections/Pages handle back out of a collapsed Sections
  // column un-collapses it first — the stored sectionsWidth never changed
  // while collapsed (still sitting at its min), so this just reveals it
  // again and lets the drag continue growing it normally.
  function resizeSectionsWithReopen(deltaX: number): void {
    if (sectionsCollapsed && deltaX > 0) setSectionsCollapsed(false)
    resizeSections(deltaX)
  }

  // Shrinking the Pages column past its own minimum used to just go dead.
  // Instead: let Pages give up width first: once Pages is at its floor,
  // spill the leftover drag into shrinking Sections too. Once Sections is
  // also out of room, collapse it outright so the drag keeps doing
  // something; a further shrink past that collapses the whole sidebar.
  //
  // Growing mirrors this only for the collapsed case: normally growing only
  // grows Pages (no side effect of pushing Sections wider), but if Sections
  // is currently collapsed and Pages hits its own max, the leftover drag
  // reveals Sections again and grows it with the overflow — otherwise a
  // rightward drag past Pages' max would have no way to bring Sections back.
  function resizePagesCascading(deltaX: number): void {
    if (deltaX > 0) {
      const pagesOverflow = resizePages(deltaX)
      if (pagesOverflow > 0 && sectionsCollapsed) {
        setSectionsCollapsed(false)
        resizeSections(pagesOverflow)
      }
      return
    }
    if (deltaX === 0) return
    const pagesOverflow = resizePages(deltaX)
    if (pagesOverflow === 0) return
    if (!sectionsCollapsed) {
      const sectionsOverflow = resizeSections(pagesOverflow)
      if (sectionsOverflow !== 0) setSectionsCollapsed(true)
    } else {
      setCollapsed(true)
    }
  }

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
            {/* Fixed to exactly the Sections column's own width (not the
                resize handle's midpoint — a previous version added half the
                handle's width here, which pushed this tab's right edge
                visibly past the Sections column's own edge) rather than an
                even 50/50 split, so this tab's right edge lines up with the
                Sections column right below it instead of drifting away from
                it whenever they're resized to an uneven ratio. Tags stays
                flex-1 to soak up whatever width is left, self-correcting
                rather than needing its own matching calculation. */}
            <button
              onClick={() => setSidebarView('notebook')}
              // Floored at 60px so the tab stays clickable even while the
              // Sections column itself is collapsed to 0 below it.
              style={{ width: Math.max(effectiveSectionsWidth, 60) }}
              className={cn(viewTabClass(sidebarView === 'notebook'), 'shrink-0 rounded-tl-md')}
            >
              {/* Icon dropped once collapsed to that floored 60px: icon +
                  gap + "Notebook" doesn't fit that width without crowding
                  or clipping — the label alone is what actually needs to
                  stay legible there. Tags never hits this (it's flex-1, so
                  it doesn't shrink when Sections collapses), which is why
                  only this tab's icon is conditional. */}
              {!sectionsCollapsed && <NotebookIcon size={13} />}
              Notebook
            </button>
            <button
              onClick={() => setSidebarView('tags')}
              className={cn(viewTabClass(sidebarView === 'tags'), 'flex-1 rounded-tr-md')}
            >
              <TagIcon size={13} />
              Tags
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1">
            {sidebarView === 'notebook' ? (
              <>
                <SectionsColumn width={effectiveSectionsWidth} />
                <ResizeHandle
                  onResize={resizeSectionsWithReopen}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeEnd={() => finishResize(commitSectionsWidth)}
                  centerOnBoundary
                />
                <PagesColumn width={pagesWidth} />
              </>
            ) : (
              <>
                <TagsColumn width={effectiveSectionsWidth} />
                <ResizeHandle
                  onResize={resizeSectionsWithReopen}
                  onResizeStart={() => setIsResizing(true)}
                  onResizeEnd={() => finishResize(commitSectionsWidth)}
                  centerOnBoundary
                />
                <TaggedPagesColumn width={pagesWidth} />
              </>
            )}

            {/* Sections has no width to show anything of its own once
                collapsed, so this little glass tab stands in for it —
                grown out of the same left edge it used to occupy, so it
                reads as "the thing that's tucked away here" rather than a
                random floating control. Click to reopen; dragging the
                Sections/Pages handle back out (still living right under
                this tab) works too. */}
            {sectionsCollapsed && (
              <button
                onClick={() => setSectionsCollapsed(false)}
                title={sidebarView === 'notebook' ? 'Show sections' : 'Show tags'}
                className={cn(
                  'group absolute left-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center gap-1',
                  'rounded-r-md border border-l-0 border-white/40 bg-white/60 py-2 pl-1 pr-1.5',
                  'text-muted-foreground shadow-md backdrop-blur-sm transition-all duration-150',
                  'hover:bg-white/90 hover:pr-2 hover:text-foreground hover:shadow-lg',
                  'dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/20'
                )}
              >
                <ChevronRight size={11} className="shrink-0 transition-transform group-hover:translate-x-px" />
                <span
                  className="text-[10px] font-medium tracking-wide"
                  style={{ writingMode: 'vertical-rl' }}
                >
                  {sidebarView === 'notebook' ? 'Sections' : 'Tags'}
                </span>
              </button>
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
          onResize={resizePagesCascading}
          onResizeStart={() => setIsResizing(true)}
          onResizeEnd={() => finishResize(commitPagesWidth)}
          className="absolute top-0 h-full"
          style={{ left: expandedWidth }}
        />
      )}

      {/* Floating glass toggle: anchored to this box's right edge (which is
          exactly what's animating above), so it rides along the seam as the
          sidebar slides shut instead of staying pinned in place. Shaped as a
          flag/kite tab (clip-path: flat edge flush against the sidebar seam,
          one smooth curve out to a single sharp point at the vertical
          center, where the chevron sits) rather than a plain rounded
          rectangle — clip-path clips border+background+content together, so
          the glass border traces the same custom outline for free. A
          concave waist/notch was tried here too but read as a rendering
          glitch at this element's actual small size — this single-curve
          version stays legible. Same glass colors/blur as before, just the
          outer shape changed.

          translate-x is a fixed 23px, not the 9px translate-x-1/2 (half the
          button's own 18px width) used previously — that only poked past
          App.tsx's 8px sidebar/main gap by about 1px at the shape's single
          sharpest point, reading as flush against the seam rather than an
          actually-visible floating tab. A fixed value (independent of the
          button's own width) keeps the clip-path's 0-18 coordinate space
          valid while pushing the whole shape further into open space.

          Light-mode fill bumped from bg-white/50 to /90 — 50% undershot
          CLAUDE.md's own 70-90% glass-opacity floor, so the tab washed out
          against the light pastel body backdrop, worst of all while
          collapsed: with no adjacent sidebar edge to lean on, it's floating
          alone over open background and has to read as visible entirely on
          its own translucency. Shadow moved to a filter: drop-shadow (not
          box-shadow, and not Tailwind's shadow-md/shadow-lg utilities) —
          clip-path clips box-shadow away entirely since it's painted inside
          the element's normal box, while drop-shadow is applied to the
          already-clipped result and correctly traces the kite outline. */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        style={{
          clipPath: "path('M0,0 C10,2 18,20 18,28 C18,36 10,54 0,56 Z')",
          // The clip-path's left edge is a hard vertical cut — this fades it
          // to transparent over the first few px instead, so the tab blends
          // into the sidebar seam rather than showing a sharp seam of its own.
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 6px)',
          maskImage: 'linear-gradient(to right, transparent, black 6px)'
        }}
        className={cn(
          'group absolute bottom-4 right-0 z-10 flex h-[56px] w-[18px] translate-x-[23px]',
          'items-center justify-center border-y border-r border-white/60 bg-white/90 pl-1',
          'text-muted-foreground backdrop-blur-sm transition-all duration-150',
          // filter (not the inline style attribute) so the hover: variant
          // below can actually override it — an inline style.filter would
          // win over any Tailwind class unconditionally, including hover.
          '[filter:drop-shadow(3px_4px_8px_rgba(15,23,42,0.3))]',
          'hover:scale-105 hover:bg-white hover:text-foreground hover:[filter:drop-shadow(3px_5px_10px_rgba(15,23,42,0.4))]',
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
