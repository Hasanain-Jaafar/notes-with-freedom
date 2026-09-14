import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-2d'
import { Network, X } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_ACCENT_HEX } from '../lib/sectionColors'

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

const PAGE_NODE_RADIUS = 4
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
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
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
  // chatty-IPC guardrail is about.
  useEffect(() => {
    if (!open) return
    setGraphData(null)
    setHoverNodeId(null)
    hasZoomedRef.current = false
    let cancelled = false
    Promise.all([window.api.pages.listAll(), window.api.pageLinks.listAll(), window.api.sections.listAll()]).then(
      ([pages, links, sections]) => {
        if (cancelled) return
        const sectionNodes: SectionNode[] = sections.map((s) => ({
          kind: 'section',
          id: `section:${s.id}`,
          refId: s.id,
          label: s.name,
          notebookId: s.notebookId,
          color: s.color ?? DEFAULT_ACCENT_HEX
        }))
        const pageNodes: PageNode[] = pages.map((p) => ({
          kind: 'page',
          id: `page:${p.id}`,
          refId: p.id,
          label: p.title,
          notebookId: p.notebookId,
          sectionId: p.sectionId,
          color: p.sectionColor ?? DEFAULT_ACCENT_HEX
        }))
        // One per page — every page cascades from a section (schema.ts's FK),
        // so this can never point at a missing node.
        const containmentLinks: GraphLink[] = pages.map((p) => ({
          source: `page:${p.id}`,
          target: `section:${p.sectionId}`,
          kind: 'containment'
        }))
        const referenceLinks: GraphLink[] = links.map((l) => ({
          source: `page:${l.sourcePageId}`,
          target: `page:${l.targetPageId}`,
          kind: 'reference'
        }))
        setGraphData({
          nodes: [...sectionNodes, ...pageNodes],
          links: [...containmentLinks, ...referenceLinks]
        })
      }
    )
    return () => {
      cancelled = true
    }
  }, [open])

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
      const radius = isSection ? SECTION_NODE_RADIUS : PAGE_NODE_RADIUS
      const x = node.x ?? 0
      const y = node.y ?? 0
      // Nodes never change color — only fade toward transparent when they're
      // not a neighbor of the hovered node, animated by hoverProgressRef
      // rather than snapping straight to the dimmed state.
      const isDimTarget = neighborIds !== null && !neighborIds.has(node.id)
      const opacity = isDimTarget ? 1 - hoverProgressRef.current * DIM_STRENGTH : 1

      ctx.globalAlpha = opacity
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = node.color
      ctx.fill()

      // Section labels always show (there are few of them — they're meant
      // to be landmarks). Page labels default to hidden: with more than a
      // handful of pages, drawing every title unconditionally turned into
      // unreadable overlapping text. A page's label only appears once it's
      // actually relevant — hovered directly, or a neighbor of whatever is
      // hovered (its own section included, so hovering a section reveals
      // the names of the pages inside it).
      const showLabel = isSection || (neighborIds !== null && neighborIds.has(node.id))
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
    [neighborIds, textColor, redrawTick]
  )

  const nodePointerAreaPaint = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    const radius = (node.kind === 'section' ? SECTION_NODE_RADIUS : PAGE_NODE_RADIUS) + 2
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x ?? 0, node.y ?? 0, radius, 0, 2 * Math.PI)
    ctx.fill()
  }, [])

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
      const restWidth = link.kind === 'containment' ? 0.6 : 1
      const hoverWidth = link.kind === 'containment' ? 1 : 1.8
      const touchesHover =
        neighborIds !== null && (linkEndId(link.source) === hoverNodeId || linkEndId(link.target) === hoverNodeId)
      return touchesHover ? restWidth + (hoverWidth - restWidth) * hoverProgressRef.current : restWidth
    },
    // redrawTick: see nodeCanvasObject's comment above — same reason.
    [neighborIds, hoverNodeId, redrawTick]
  )

  const handleEngineStop = useCallback(() => {
    if (hasZoomedRef.current) return
    hasZoomedRef.current = true
    graphRef.current?.zoomToFit(400, 40)
  }, [])

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
    <div
      className={`fixed inset-0 z-50 bg-background transition-opacity ease-out ${visible ? 'opacity-100' : 'opacity-0'}`}
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
          onClick={onClose}
          title="Close"
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          <X size={14} />
        </button>
      </div>

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
            enableZoomInteraction={!nodeDragging}
            enablePanInteraction={!nodeDragging}
            onNodeDrag={() => setNodeDragging(true)}
            onNodeDragEnd={() => setNodeDragging(false)}
            onNodeHover={(node) => setHoverNodeId(node ? (node as GraphNode).id : null)}
            onNodeClick={(node) => handleNodeClick(node as GraphNode)}
            onEngineStop={handleEngineStop}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
