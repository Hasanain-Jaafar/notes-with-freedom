import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-2d'
import { Network, X, SlidersHorizontal } from 'lucide-react'
import type { PageListAllDTO, PageLinkDTO, SectionListAllDTO } from '@shared/ipc-channels'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_ACCENT_HEX } from '../lib/sectionColors'
import { usePersistedBoolean } from '../hooks/usePersistedBoolean'
import { usePersistedNumber } from '../hooks/usePersistedNumber'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { ToolbarPopover } from './editor/ToolbarPopover'
import { cn } from '../lib/utils'

interface GraphViewProps {
  open: boolean
  onClose: () => void
  darkMode: boolean
}

// Two kinds of node share one graph: sections (containers) and pages (the
// notes inside them) — id is namespaced per kind ("section:3"/"page:12")
// since section ids and page ids come from different tables and could
// otherwise collide; refId is the real DB id, used when navigating.
interface SectionNode {
  kind: 'section'
  id: string
  refId: number
  label: string
  notebookId: number
  color: string
  x?: number
  y?: number
}

interface PageNode {
  kind: 'page'
  id: string
  refId: number
  label: string
  notebookId: number
  sectionId: number
  color: string
  x?: number
  y?: number
}

type GraphNode = SectionNode | PageNode

// containment = "this page belongs to this section" (one per page, faint,
// mainly there to cluster a section's pages near it). reference = an actual
// [[link]] the user made between two pages (the more prominent one).
interface GraphLink {
  source: string | GraphNode
  target: string | GraphNode
  kind: 'containment' | 'reference'
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

type GraphRef = ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>>

// Defaults for the persisted settings below — SECTION_NODE_RADIUS isn't one
// of them (only page-node size was asked for; sections stay a fixed, larger
// landmark size).
const DEFAULT_PAGE_NODE_RADIUS = 4
const DEFAULT_CONTAINMENT_DISTANCE = 60
const DEFAULT_CONTAINMENT_WIDTH = 0.6
const REFERENCE_LINK_DISTANCE = 60 // not user-configurable — only asked for section<->page distance
const SECTION_NODE_RADIUS = 7
const TRANSITION_MS = 200

function linkEndId(end: string | GraphNode): string {
  return typeof end === 'object' ? end.id : end
}

function hexToRgbTuple(hex: string): [number, number, number] {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return [148, 163, 184] // neutral gray fallback for a malformed hex — mirrors lib/hexColor.ts
  const int = parseInt(match[1], 16)
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255]
}

function mixChannel(from: number, to: number, t: number): number {
  return Math.round(from + (to - from) * t)
}

// .app-range (index.css) only paints the track's rest color — the filled
// segment from 0 up to the current value is set per-input here, since a bare
// <input type=range> has no cross-browser selector for "before the thumb".
function rangeFillStyle(value: number, min: number, max: number): React.CSSProperties {
  const pct = ((value - min) / (max - min)) * 100
  return { backgroundImage: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--border)) ${pct}%)` }
}

const ACCENT_RGB = hexToRgbTuple(DEFAULT_ACCENT_HEX)
const HOVER_TRANSITION_MS = 220
const DIM_STRENGTH = 0.75 // fully-dimmed nodes/text settle at 25% opacity, not fully invisible
const CONTAINMENT_ALPHA = 0.08
const REFERENCE_ALPHA = 0.2
const REFERENCE_DIM_ALPHA = 0.06

export function GraphView({ open, onClose, darkMode }: GraphViewProps): React.JSX.Element | null {
  const navigateToPage = useAppStore((s) => s.navigateToPage)
  const navigateToSection = useAppStore((s) => s.navigateToSection)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [rawData, setRawData] = useState<{
    pages: PageListAllDTO[]
    links: PageLinkDTO[]
    sections: SectionListAllDTO[]
  } | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsAnchorRect, setSettingsAnchorRect] = useState<DOMRect | null>(null)
  const settingsButtonRef = useRef<HTMLButtonElement>(null)

  // Display preferences, remembered per-viewer across restarts (localStorage
  // — a UI preference, not notebook data, so it doesn't belong in the DB).
  const [alwaysShowLabels, setAlwaysShowLabels] = usePersistedBoolean('graphAlwaysShowLabels', false)
  const [showSectionGrouping, setShowSectionGrouping] = usePersistedBoolean('graphShowSections', true)
  const [pageNodeSize, setPageNodeSize] = usePersistedNumber('graphPageNodeSize', DEFAULT_PAGE_NODE_RADIUS)
  const [containmentDistance, setContainmentDistance] = usePersistedNumber(
    'graphContainmentDistance',
    DEFAULT_CONTAINMENT_DISTANCE
  )
  const [containmentWidth, setContainmentWidth] = usePersistedNumber(
    'graphContainmentWidth',
    DEFAULT_CONTAINMENT_WIDTH
  )
  // Dragging a node was also panning/zooming the canvas underneath it at the
  // same time — the library's own drag-vs-pan disambiguation apparently
  // isn't reliable with the custom nodeCanvasObject/nodePointerAreaPaint
  // rendering this view uses, so pan/zoom is explicitly switched off for the
  // duration of any node drag instead of relying on that disambiguation.
  const [nodeDragging, setNodeDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphRef | undefined>(undefined)
  const hasZoomedRef = useRef(false)
  // 0 = no hover in effect, 1 = fully engaged. Kept as a ref (the source of
  // truth nodeCanvasObject/linkColor/linkWidth read from) rather than state,
  // so its value can update every animation frame without depending on
  // itself in an effect. redrawTick below is the actual trigger: this
  // library's ForceGraphMethods has no exposed "redraw now" method (checked:
  // no refresh()), so each frame bumps redrawTick purely to force
  // nodeCanvasObject/linkColor/linkWidth to get new function identities,
  // which is what makes ForceGraph2D notice and repaint — the same
  // prop-identity mechanism that already made the (un-animated) hover
  // dim/highlight effect work in the first place.
  const hoverProgressRef = useRef(0)
  const hoverAnimFrameRef = useRef<number | null>(null)
  const [redrawTick, setRedrawTick] = useState(0)

  // Same mount-then-fade approach as SlidePanel.tsx (see its comment for why
  // a plain useEffect toggling a class isn't enough — the off-screen/here
  // state needs an actual painted frame before flipping, or the transition
  // has nothing to animate from).
  useEffect(() => {
    if (open) {
      setMounted(true)
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setVisible(false)
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mounted, onClose])

  // Refetched on every open (not cached indefinitely) so newly created
  // pages/sections/links since the last time this was opened show up — three
  // calls on open is a one-time cost, not the repeated-call pattern the
  // chatty-IPC guardrail is about. Kept as raw fetched rows, not yet built
  // into graph nodes/links — see the graphData memo below, which is what
  // actually reacts to the showSectionGrouping toggle without needing to
  // refetch anything from IPC just because a display preference changed.
  useEffect(() => {
    if (!open) return
    setRawData(null)
    setHoverNodeId(null)
    hasZoomedRef.current = false
    let cancelled = false
    Promise.all([window.api.pages.listAll(), window.api.pageLinks.listAll(), window.api.sections.listAll()]).then(
      ([pages, links, sections]) => {
        if (cancelled) return
        setRawData({ pages, links, sections })
      }
    )
    return () => {
      cancelled = true
    }
  }, [open])

  // Re-frame once more if section grouping is toggled mid-view — adding or
  // removing a whole tier of nodes/links changes what "fit everything"
  // means, same as the very first open.
  useEffect(() => {
    hasZoomedRef.current = false
  }, [showSectionGrouping])

  // Rebuilt (not just re-filtered at draw time) when showSectionGrouping
  // changes: section nodes and containment links actually stop existing in
  // the simulation when it's off, not just stop being drawn — leaving them
  // in as invisible nodes would still pull pages toward them via physics.
  // Stays referentially stable across unrelated re-renders (hover, etc.),
  // which matters — rebuilding this on every render would restart the
  // simulation and make it jitter (see the note on ForceGraph2D's graphData
  // prop needing a stable reference).
  const graphData = useMemo<GraphData | null>(() => {
    if (!rawData) return null
    const { pages, links, sections } = rawData
    const pageNodes: PageNode[] = pages.map((p) => ({
      kind: 'page',
      id: `page:${p.id}`,
      refId: p.id,
      label: p.title,
      notebookId: p.notebookId,
      sectionId: p.sectionId,
      color: p.sectionColor ?? DEFAULT_ACCENT_HEX
    }))
    const referenceLinks: GraphLink[] = links.map((l) => ({
      source: `page:${l.sourcePageId}`,
      target: `page:${l.targetPageId}`,
      kind: 'reference'
    }))

    if (!showSectionGrouping) {
      return { nodes: pageNodes, links: referenceLinks }
    }

    const sectionNodes: SectionNode[] = sections.map((s) => ({
      kind: 'section',
      id: `section:${s.id}`,
      refId: s.id,
      label: s.name,
      notebookId: s.notebookId,
      color: s.color ?? DEFAULT_ACCENT_HEX
    }))
    // One per page — every page cascades from a section (schema.ts's FK), so
    // this can never point at a missing node.
    const containmentLinks: GraphLink[] = pages.map((p) => ({
      source: `page:${p.id}`,
      target: `section:${p.sectionId}`,
      kind: 'containment'
    }))
    return {
      nodes: [...sectionNodes, ...pageNodes],
      links: [...containmentLinks, ...referenceLinks]
    }
  }, [rawData, showSectionGrouping])

  useEffect(() => {
    if (!mounted || !containerRef.current) return
    const el = containerRef.current
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [mounted])

  // Every node directly connected to the hovered one (via either kind of
  // link), plus the hovered node itself — null when nothing is hovered,
  // meaning "don't dim anything". Hovering a page reaches its section (and
  // vice versa) exactly the same way hovering a page reaches a page it
  // [[links]] to — containment and reference links aren't distinguished here.
  const neighborIds = useMemo(() => {
    if (hoverNodeId === null || !graphData) return null
    const ids = new Set<string>([hoverNodeId])
    for (const link of graphData.links) {
      const s = linkEndId(link.source)
      const t = linkEndId(link.target)
      if (s === hoverNodeId) ids.add(t)
      if (t === hoverNodeId) ids.add(s)
    }
    return ids
  }, [hoverNodeId, graphData])

  // Animates hoverProgressRef toward 1 (something hovered) or 0 (nothing
  // hovered) whenever hoverNodeId changes, ease-out over ~220ms, calling
  // refresh() each frame so the canvas actually redraws with the new value —
  // this is what turns the dim/highlight effect from an instant snap into a
  // smooth fade. Switching hover directly from one node straight to another
  // (skipping the gap between them) reclassifies instantly rather than
  // cross-fading between the two highlight sets — accepted simplification;
  // in practice the cursor almost always crosses empty canvas between two
  // distinct nodes, which already passes through hoverNodeId === null.
  useEffect(() => {
    const target = hoverNodeId !== null ? 1 : 0
    const start = hoverProgressRef.current
    if (start === target) return

    if (hoverAnimFrameRef.current !== null) cancelAnimationFrame(hoverAnimFrameRef.current)
    const startTime = performance.now()

    function step(now: number): void {
      const t = Math.min(1, (now - startTime) / HOVER_TRANSITION_MS)
      const eased = 1 - (1 - t) * (1 - t)
      hoverProgressRef.current = start + (target - start) * eased
      setRedrawTick((n) => n + 1)
      hoverAnimFrameRef.current = t < 1 ? requestAnimationFrame(step) : null
    }
    hoverAnimFrameRef.current = requestAnimationFrame(step)

    return () => {
      if (hoverAnimFrameRef.current !== null) cancelAnimationFrame(hoverAnimFrameRef.current)
    }
  }, [hoverNodeId])

  // rgb base matches index.css's scrollbar-thumb convention (dark slate in
  // light mode, white in dark mode) rather than introducing a new ad-hoc
  // palette. The one saturated color anywhere here is DEFAULT_ACCENT_HEX,
  // only for edges/nodes touching the hovered node — CLAUDE.md's "accent
  // color sparingly, for active states" guidance applied literally.
  const neutralRgb: [number, number, number] = darkMode ? [255, 255, 255] : [15, 23, 42]
  const textColor = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)'

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isSection = node.kind === 'section'
      const radius = isSection ? SECTION_NODE_RADIUS : pageNodeSize
      const x = node.x ?? 0
      const y = node.y ?? 0
      // Nodes never change color — only fade toward transparent when they're
      // not a neighbor of the hovered node, animated by hoverProgressRef
      // rather than snapping straight to the dimmed state.
      const isDimTarget = neighborIds !== null && !neighborIds.has(node.id)
      const opacity = isDimTarget ? 1 - hoverProgressRef.current * DIM_STRENGTH : 1

      ctx.globalAlpha = opacity

      // Soft contact shadow, offset down — a gradient-filled circle rather
      // than ctx.shadowBlur, which is a per-node Gaussian blur every frame.
      const shadowY = y + radius * 0.35
      const shadow = ctx.createRadialGradient(x, shadowY, 0, x, shadowY, radius * 1.3)
      shadow.addColorStop(0, darkMode ? 'rgba(0,0,0,0.45)' : 'rgba(15,23,42,0.22)')
      shadow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.beginPath()
      ctx.arc(x, shadowY, radius * 1.3, 0, 2 * Math.PI)
      ctx.fillStyle = shadow
      ctx.fill()

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()

      // Sphere shading over the base color: light from the upper left,
      // fading to a darker rim — works for any node.color without having to
      // parse/lighten it.
      const shade = ctx.createRadialGradient(
        x - radius * 0.35,
        y - radius * 0.4,
        0,
        x - radius * 0.35,
        y - radius * 0.4,
        radius * 1.45
      )
      shade.addColorStop(0, 'rgba(255,255,255,0.65)')
      shade.addColorStop(0.3, 'rgba(255,255,255,0.12)')
      shade.addColorStop(0.65, 'rgba(0,0,0,0)')
      shade.addColorStop(1, 'rgba(0,0,0,0.4)')
      ctx.fillStyle = shade
      ctx.fill()

      // Section labels always show (there are few of them — they're meant
      // to be landmarks). Page labels default to hidden: with more than a
      // handful of pages, drawing every title unconditionally turned into
      // unreadable overlapping text. A page's label only appears once it's
      // actually relevant — hovered directly, or a neighbor of whatever is
      // hovered (its own section included, so hovering a section reveals
      // the names of the pages inside it).
      const showLabel = isSection || alwaysShowLabels || (neighborIds !== null && neighborIds.has(node.id))
      if (showLabel) {
        const fontSize = (isSection ? 13 : 11) / globalScale
        ctx.font = `${isSection ? '700 ' : ''}${fontSize}px Inter, sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.fillStyle = textColor
        ctx.fillText(node.label, x, y + radius + 2)
      }
      ctx.globalAlpha = 1
    },
    // redrawTick is read nowhere above — it's there purely so this callback
    // gets a new identity every animation-frame tick, which is what makes
    // ForceGraph2D notice the nodeCanvasObject prop "changed" and repaint
    // (see the comment on redrawTick's declaration).
    [neighborIds, textColor, darkMode, alwaysShowLabels, pageNodeSize, redrawTick]
  )

  const nodePointerAreaPaint = useCallback(
    (node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
      const radius = (node.kind === 'section' ? SECTION_NODE_RADIUS : pageNodeSize) + 2
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
      ctx.fill()
    },
    [pageNodeSize]
  )

  const linkColor = useCallback(
    (link: GraphLink) => {
      const p = hoverProgressRef.current
      const restAlpha = link.kind === 'containment' ? CONTAINMENT_ALPHA : REFERENCE_ALPHA
      const touchesHover =
        neighborIds !== null && (linkEndId(link.source) === hoverNodeId || linkEndId(link.target) === hoverNodeId)

      if (touchesHover) {
        // Animate neutral-gray -> accent as hover engages, rather than
        // snapping straight to the accent color.
        const r = mixChannel(neutralRgb[0], ACCENT_RGB[0], p)
        const g = mixChannel(neutralRgb[1], ACCENT_RGB[1], p)
        const b = mixChannel(neutralRgb[2], ACCENT_RGB[2], p)
        const a = restAlpha + (1 - restAlpha) * p
        return `rgba(${r}, ${g}, ${b}, ${a})`
      }

      // Reference links fade to a dimmer alpha when something ELSE is
      // hovered; containment links don't — they're already faint by design,
      // and this keeps the section-clustering scaffolding from disappearing
      // every time any unrelated page is hovered.
      const dimTargetAlpha = link.kind === 'reference' && neighborIds !== null ? REFERENCE_DIM_ALPHA : restAlpha
      const alpha = restAlpha + (dimTargetAlpha - restAlpha) * p
      return `rgba(${neutralRgb[0]}, ${neutralRgb[1]}, ${neutralRgb[2]}, ${alpha})`
    },
    // redrawTick: see nodeCanvasObject's comment above — same reason.
    [neighborIds, hoverNodeId, neutralRgb, redrawTick]
  )

  const linkWidth = useCallback(
    (link: GraphLink) => {
      const restWidth = link.kind === 'containment' ? containmentWidth : 1
      const hoverWidth = link.kind === 'containment' ? containmentWidth + 0.4 : 1.8
      const touchesHover =
        neighborIds !== null && (linkEndId(link.source) === hoverNodeId || linkEndId(link.target) === hoverNodeId)
      return touchesHover ? restWidth + (hoverWidth - restWidth) * hoverProgressRef.current : restWidth
    },
    // redrawTick: see nodeCanvasObject's comment above — same reason.
    [neighborIds, hoverNodeId, containmentWidth, redrawTick]
  )

  // Reheating on every call is debounced separately from applying the
  // distance value itself — React's onChange fires on every pixel of drag
  // for a range input (it's wired to the native "input" event, not "change",
  // same as a text field), so without this, dragging the slider called
  // d3ReheatSimulation() dozens of times a second. Each reheat sets the
  // layout back in motion toward the new spring length — done that often
  // during an active drag, the whole graph looked like it was continuously
  // rescaling regardless of which way the slider moved, the same physics-
  // scatter-reads-as-zoom effect as the earlier node-drag bug, just
  // triggered by this instead of a drag.
  const reheatForDistanceChange = useDebouncedCallback(() => {
    graphRef.current?.d3ReheatSimulation()
  }, 300)

  // No linkDistance prop exists on this version of the library (checked via
  // typecheck) — d3Force('link') is d3-force's own standard API for reaching
  // the underlying force object, stable regardless of what this React
  // wrapper does or doesn't expose as a convenience prop. The distance
  // function itself is still applied immediately (cheap, no visual effect by
  // itself) so the debounced reheat always picks up the latest value once it
  // actually fires. Re-applied whenever graphData changes too, not just
  // containmentDistance, since a rebuilt graphData resets the simulation the
  // force is attached to (though a fresh simulation is already hot on its
  // own — the debounced reheat here mainly matters for a distance tweak on
  // an already-settled graph, where nothing else would trigger a re-tick).
  useEffect(() => {
    if (!graphData) return
    const linkForce = graphRef.current?.d3Force('link')
    if (!linkForce) return
    linkForce.distance((link: GraphLink) => (link.kind === 'containment' ? containmentDistance : REFERENCE_LINK_DISTANCE))
    reheatForDistanceChange()
    // reheatForDistanceChange deliberately left out of this array:
    // useDebouncedCallback returns a new function identity every render (it
    // isn't memoized), so including it here made this effect re-fire on
    // EVERY GraphView render, for any reason — including just toggling dark
    // mode, which re-renders this component via the darkMode prop. Each of
    // those spurious re-fires reheated an already-settled layout again,
    // which is what was visibly growing the distance between nodes on every
    // toggle, with no distance setting actually having changed. The
    // function's behavior doesn't depend on which render created it — it
    // always debounce-dispatches to the latest callback via an internal ref
    // — so omitting it here is safe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containmentDistance, graphData])

  // NOT driven by onEngineStop (see git history if curious) — d3AlphaDecay
  // was lowered to 0.05 to stop node-dragging from scattering the whole
  // layout (a real, separate bug), but that also made the simulation
  // consider itself "settled" and fire onEngineStop much sooner: often
  // before the layout has actually finished spreading out from its initial
  // clustered starting positions. zoomToFit would then lock the camera onto
  // that still-tight, not-yet-settled bounding box — and since zoomToFit is
  // a one-time camera move, not a continuous auto-fit, nodes that kept
  // drifting outward afterward (as the simulation continued cooling) ended
  // up permanently outside the frame with nothing left to bring them back
  // into view. Nodes were never actually missing, only ever un-viewable.
  // A fixed delay, independent of whichever alpha-decay rate the physics
  // happens to be tuned to, sidesteps needing those two concerns to agree.
  useEffect(() => {
    if (!graphData || hasZoomedRef.current || nodeDragging) return
    const timer = setTimeout(() => {
      hasZoomedRef.current = true
      graphRef.current?.zoomToFit(400, 40)
    }, 1200)
    return () => clearTimeout(timer)
  }, [graphData, nodeDragging])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      if (node.kind === 'section') {
        void navigateToSection(node.notebookId, node.refId)
      } else {
        void navigateToPage(node.notebookId, node.sectionId, node.refId)
      }
      onClose()
    },
    [navigateToPage, navigateToSection, onClose]
  )

  if (!mounted) return null

  const sectionCount = graphData?.nodes.filter((n) => n.kind === 'section').length ?? 0
  const pageCount = graphData?.nodes.filter((n) => n.kind === 'page').length ?? 0
  const referenceLinkCount = graphData?.links.filter((l) => l.kind === 'reference').length ?? 0

  return createPortal(
    // top-[3.25rem] (not inset-0's top-0) deliberately leaves the real
    // TopBar visible/interactive above this overlay — App.tsx's shell is
    // p-2 (0.5rem) + TopBar's h-9 (2.25rem) + gap-2 (0.5rem) = 3.25rem
    // before the content area starts. Covering that area entirely (like
    // this used to) hid the window's drag region and minimize/maximize/
    // close controls for as long as the graph was open, with no way to
    // reach them short of closing the graph first. Keep this in sync with
    // App.tsx's wrapper classes if that layout ever changes.
    <div
      // Higher z-index wins the stacking order — z-[35] is deliberately
      // BELOW SlidePanel's z-40 (Settings) and the modal dialogs' z-50
      // (WhatsNewDialog/ConfirmDialog/RestoreWarningDialog), not between
      // them. (A previous pass here used z-[45] — still higher than
      // Settings' 40, so Settings kept losing the stacking order; narrowing
      // the gap to the dialogs above never flips who wins against Settings
      // below.) Settings should layer over graph view the same way it
      // already layers over the normal Editor/Sidebar (both stay live
      // underneath), and an actual modal dialog should still win over graph
      // view too if one's ever triggered while it's open.
      className={`app-gradient-surface fixed inset-x-0 bottom-0 top-[3.25rem] z-[35] transition-opacity ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ transitionDuration: `${TRANSITION_MS}ms` }}
    >
      <div className="flex h-9 shrink-0 items-center gap-2 px-3">
        <Network size={14} className="text-muted-foreground" />
        <span className="text-sm font-semibold text-foreground">Graph view</span>
        {graphData && (
          <span className="text-xs text-muted-foreground">
            {sectionCount} sections · {pageCount} pages · {referenceLinkCount} links
          </span>
        )}
        <button
          ref={settingsButtonRef}
          // ToolbarPopover closes on any document pointerdown outside it —
          // without this, pressing the button closes the popover and the
          // click that follows immediately toggles it back open.
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setSettingsAnchorRect(settingsButtonRef.current!.getBoundingClientRect())
            setSettingsOpen((v) => !v)
          }}
          title="Graph display settings"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          <SlidersHorizontal size={14} />
        </button>
        <button
          onClick={onClose}
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          <X size={14} />
        </button>
      </div>

      {settingsOpen && settingsAnchorRect && (
        // z-[36]: one above this view's own z-[35] (see the wrapper div's
        // comment), but still below Settings' z-40 — if the app's real
        // Settings panel ever opened while this was also up, it should still
        // win, same as it wins over graph view itself.
        <ToolbarPopover
          anchorRect={settingsAnchorRect}
          onClose={() => setSettingsOpen(false)}
          widthClassName="w-64"
          zIndexClassName="z-[36]"
        >
          <div className="px-1 py-0.5">
            <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span>Always show page labels</span>
              <input
                type="checkbox"
                checked={alwaysShowLabels}
                onChange={(e) => setAlwaysShowLabels(e.target.checked)}
                className="app-checkbox"
              />
            </label>
            <label className="flex items-center justify-between gap-3 py-1.5 text-xs">
              <span>Show section grouping</span>
              <input
                type="checkbox"
                checked={showSectionGrouping}
                onChange={(e) => setShowSectionGrouping(e.target.checked)}
                className="app-checkbox"
              />
            </label>

            <div className="mt-1 border-t border-black/[0.06] pt-2 dark:border-white/10">
              <div className="flex items-center justify-between text-xs">
                <span>Page node size</span>
                <span className="text-muted-foreground">{pageNodeSize}</span>
              </div>
              <input
                type="range"
                min={2}
                max={10}
                step={1}
                value={pageNodeSize}
                onChange={(e) => setPageNodeSize(Number(e.target.value))}
                style={rangeFillStyle(pageNodeSize, 2, 10)}
                className="app-range mt-1.5"
              />
            </div>

            <div className={cn('mt-2', !showSectionGrouping && 'opacity-40')}>
              <div className="flex items-center justify-between text-xs">
                <span>Section ↔ page distance</span>
                <span className="text-muted-foreground">{containmentDistance}</span>
              </div>
              <input
                type="range"
                min={20}
                max={150}
                step={5}
                value={containmentDistance}
                disabled={!showSectionGrouping}
                onChange={(e) => setContainmentDistance(Number(e.target.value))}
                style={rangeFillStyle(containmentDistance, 20, 150)}
                className="app-range mt-1.5"
              />
            </div>

            <div className={cn('mt-2', !showSectionGrouping && 'opacity-40')}>
              <div className="flex items-center justify-between text-xs">
                <span>Section line thickness</span>
                <span className="text-muted-foreground">{containmentWidth.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={3}
                step={0.1}
                value={containmentWidth}
                disabled={!showSectionGrouping}
                onChange={(e) => setContainmentWidth(Number(e.target.value))}
                style={rangeFillStyle(containmentWidth, 0.2, 3)}
                className="app-range mt-1.5"
              />
            </div>
          </div>
        </ToolbarPopover>
      )}

      <div ref={containerRef} className="h-[calc(100%-2.25rem)] w-full">
        {!graphData ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Loading…</div>
        ) : pageCount === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No pages yet — create a page to see it here.
          </div>
        ) : (
          <ForceGraph2D
            ref={graphRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="rgba(0,0,0,0)"
            nodeCanvasObject={nodeCanvasObject}
            nodePointerAreaPaint={nodePointerAreaPaint}
            linkColor={linkColor}
            linkWidth={linkWidth}
            // Dragging a node reheats the whole d3-force simulation (its
            // default drag behavior) — with the default physics constants,
            // that reheat let node-repulsion scatter the whole layout
            // outward for as long as the drag lasted, reading as "zooming
            // out" even though the camera itself never moved. Faster alpha
            // decay means less time spent "hot" and reactive after any
            // perturbation; more velocity decay (friction) means less
            // dramatic movement while it is. Neither is drag-specific — both
            // apply globally, including the initial settle-on-open — but a
            // snappier, more damped feel there is a fine trade-off for not
            // having the graph scatter every time a node moves.
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.5}
            enableZoomInteraction={!nodeDragging}
            enablePanInteraction={!nodeDragging}
            onNodeDrag={() => setNodeDragging(true)}
            onNodeDragEnd={() => setNodeDragging(false)}
            onNodeHover={(node) => setHoverNodeId(node ? (node as GraphNode).id : null)}
            onNodeClick={(node) => handleNodeClick(node as GraphNode)}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
