import { useEffect, useRef, useState } from 'react'
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

const SECTIONS_MIN = 120
const SECTIONS_MAX = 320

// Horizontal space in a SectionsColumn row besides the title text: list
// padding (pl-3 + pr-1), color bar (w-1), button padding (pl-2 + pr-2), the
// gap before the page count, plus slack for a scrollbar.
const SECTION_ROW_CHROME_PX = 12 + 4 + 4 + 16 + 8 + 12

let measureCtx: CanvasRenderingContext2D | null = null

/** Width that shows every section title untruncated (clamped by the caller). */
function fitWidthForSections(sections: { name: string; pageCount: number }[]): number {
  measureCtx ??= document.createElement('canvas').getContext('2d')
  if (!measureCtx || sections.length === 0) return 0
  const family = getComputedStyle(document.body).fontFamily
  let widest = 0
  for (const section of sections) {
    // text-sm, measured at font-medium (the active row's weight) so the
    // title still fits when it's the selected one.
    measureCtx.font = `500 14px ${family}`
    let w = measureCtx.measureText(section.name).width
    if (section.pageCount > 0) {
      measureCtx.font = `400 12px ${family}`
      w += measureCtx.measureText(String(section.pageCount)).width
    }
    widest = Math.max(widest, w)
  }
  return Math.ceil(widest) + SECTION_ROW_CHROME_PX
}

export function Sidebar(): React.JSX.Element {
  const loadNotebooks = useAppStore((s) => s.loadNotebooks)
  const sidebarView = useAppStore((s) => s.sidebarView)
  const setSidebarView = useAppStore((s) => s.setSidebarView)

  const [sectionsWidth, resizeSections, commitSectionsWidth, setSectionsWidth] = useResizableWidth(
    'sectionsColumnWidth',
    160,
    SECTIONS_MIN,
    SECTIONS_MAX
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

  const sections = useAppStore((s) =>
    s.activeNotebookId ? s.sectionsByNotebook[s.activeNotebookId] : undefined
  )

  // Reopening Sections sizes it to fit its titles (Notebook view only — the
  // Tags view reuses this column for tags and keeps its stored width).
  function reopenSections(): void {
    setSectionsCollapsed(false)
    if (sidebarView === 'notebook' && sections) {
      const fit = fitWidthForSections(sections)
      if (fit > 0) setSectionsWidth(fit)
    }
  }

  // Sections/Pages handle, VS Code-style snap: once Sections is at its min
  // width, keep tracking how far the cursor has travelled past that edge
  // (overshoot). Past SNAP_PX it collapses Sections; dragging back under
  // SNAP_PX reopens it, sized to fit its titles. Tracking the overshoot
  // rather than reacting to any single leftward/rightward pixel keeps a
  // little hand jitter at the boundary from flickering it open/closed.
  const SNAP_PX = 60
  const sectionsOvershootRef = useRef(0)

  function startSectionsResize(): void {
    setIsResizing(true)
    // Starting from collapsed: the cursor is a full min-width left of where
    // the open column's edge would be.
    sectionsOvershootRef.current = sectionsCollapsed ? SECTIONS_MIN : 0
  }

  function resizeSectionsWithSnap(deltaX: number): void {
    const overshoot = sectionsOvershootRef.current
    if (overshoot > 0) {
      // Still past the min-width edge — only the overshoot moves.
      const next = overshoot - deltaX
      if (next > 0) {
        sectionsOvershootRef.current = next
        // Only on a flip — the setter writes localStorage on every call.
        const shouldCollapse = next >= SNAP_PX
        if (shouldCollapse !== sectionsCollapsed) setSectionsCollapsed(shouldCollapse)
        return
      }
      // Came back past the edge: reopen and grow with the remainder.
      sectionsOvershootRef.current = 0
      if (sectionsCollapsed) reopenSections()
      else resizeSections(-next)
      return
    }
    const overflow = resizeSections(deltaX)
    if (overflow < 0) sectionsOvershootRef.current = -overflow
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

          {/* Border lives on this wrapper, not on each tab button — putting
              it on the buttons individually would draw two 1px lines right
              next to each other at the seam where they meet (Notebook's
              right edge + Tags' left edge), reading as a slightly doubled/
              thicker line instead of one clean border. This way the whole
              bar gets a single outer frame, while each button keeps its own
              border-b-2 active/inactive indicator untouched. */}
          <div className="flex shrink-0 rounded-t-md border-x border-t border-x-border border-t-border">
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
                  onResize={resizeSectionsWithSnap}
                  onResizeStart={startSectionsResize}
                  onResizeEnd={() => finishResize(commitSectionsWidth)}
                  centerOnBoundary
                />
                <PagesColumn width={pagesWidth} />
              </>
            ) : (
              <>
                <TagsColumn width={effectiveSectionsWidth} />
                <ResizeHandle
                  onResize={resizeSectionsWithSnap}
                  onResizeStart={startSectionsResize}
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
                onClick={reopenSections}
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
          sidebar slides shut instead of staying pinned in place.

          Chevron + vertical text label, same combo as the sectionsCollapsed
          reopen tab just above (Sections/Tags) — Close while expanded
          (clicking collapses it), Open while collapsed (clicking reopens
          it), rather than a plain icon with no state readout of its own.
          Sized by its own padding, not a fixed height, for the same reason
          that other tab is: "Close" and "Open" aren't the same rendered
          height in vertical-rl writing mode, so forcing a fixed box would
          either clip one or leave dead space under the other.

          Still a plain rounded-md capsule (medium radius on every corner,
          deliberately short of pill-length — CLAUDE.md rules out
          large/pill-shaped corners), not the earlier flag/kite clip-path
          shape, which read as too sharp-edged — no clip-path or
          mask-image fade needed either, since a rounded-md corner has no
          hard flat edge to hide.

          translate-x is a fixed 23px, not a translate-x-1/2 tied to the
          button's own width — that only poked past App.tsx's 8px
          sidebar/main gap by about 1px, reading as flush against the seam
          rather than an actually-visible floating tab.

          Light-mode fill is a neutral bg-muted/border-border (not white) —
          the tab sits half over the pastel body backdrop and half over
          <main>'s own bright white .glass-panel depending on scroll/collapse
          state, and a white fill (tried first, at both 50% and 90% opacity)
          all but disappeared specifically against that white panel — no
          opacity fix helps when the fill color itself matches the
          background. A neutral gray reads as a distinct chip against both.
          backdrop-blur dropped too: bg-muted is fully opaque, so there's
          nothing behind it left to blur. */}
      <button
        onClick={() => setCollapsed((v) => !v)}
        title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        className={cn(
          'group absolute bottom-4 right-0 z-10 flex translate-x-[23px] flex-col items-center gap-1',
          'rounded-md border border-border bg-muted px-1 py-2',
          'text-muted-foreground shadow-md transition-all duration-150',
          // hover:bg-border, not a darker one-off value — it's the very next
          // step in the same neutral scale bg-muted/border-border already
          // use, so the hover state stays in the same gray family instead
          // of introducing an unrelated shade.
          'hover:scale-105 hover:bg-border hover:text-foreground hover:shadow-lg',
          'dark:border-white/10 dark:bg-white/10 dark:hover:bg-white/20'
        )}
      >
        {collapsed ? (
          <ChevronRight size={11} className="shrink-0 transition-transform group-hover:translate-x-px" />
        ) : (
          <ChevronLeft size={11} className="shrink-0 transition-transform group-hover:-translate-x-px" />
        )}
        <span className="text-[10px] font-medium tracking-wide" style={{ writingMode: 'vertical-rl' }}>
          {collapsed ? 'Open' : 'Close'}
        </span>
      </button>
    </div>
  )
}
