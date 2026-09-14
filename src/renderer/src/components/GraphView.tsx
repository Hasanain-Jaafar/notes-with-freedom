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

export function GraphView({ open, onClose, darkMode }: GraphViewProps): React.JSX.Element | null {
  const navigateToPage = useAppStore((s) => s.navigateToPage)
  const navigateToSection = useAppStore((s) => s.navigateToSection)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const graphRef = useRef<GraphRef | undefined>(undefined)
  const hasZoomedRef = useRef(false)

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

  // rgba base values match index.css's scrollbar-thumb convention (dark
  // slate in light mode, white in dark mode) rather than introducing a new
  // ad-hoc palette. The one saturated color used anywhere here is
  // DEFAULT_ACCENT_HEX, only for edges touching the hovered node — CLAUDE.md's
  // "accent color sparingly, for active states" guidance applied literally.
  const linkColorDefault = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.2)'
  const linkColorDim = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'
  // Containment edges stay faint even unhovered — they're structural
  // scaffolding for clustering, not content to compete with actual links.
  const linkColorContainment = darkMode ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)'
  const nodeDimColor = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.2)'
  const textColor = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)'
  const textDimColor = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)'

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isDimmed = neighborIds !== null && !neighborIds.has(node.id)
      const isSection = node.kind === 'section'
      const radius = isSection ? SECTION_NODE_RADIUS : PAGE_NODE_RADIUS
      const x = node.x ?? 0
      const y = node.y ?? 0

      ctx.beginPath()
      ctx.arc(x, y, radius, 0, 2 * Math.PI)
      ctx.fillStyle = isDimmed ? nodeDimColor : node.color
      ctx.fill()

      const fontSize = (isSection ? 13 : 11) / globalScale
      ctx.font = `${isSection ? '700 ' : ''}${fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = isDimmed ? textDimColor : textColor
      ctx.fillText(node.label, x, y + radius + 2)
    },
    [neighborIds, nodeDimColor, textColor, textDimColor]
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
      const touchesHover =
        neighborIds !== null && (linkEndId(link.source) === hoverNodeId || linkEndId(link.target) === hoverNodeId)
      if (touchesHover) return DEFAULT_ACCENT_HEX
      if (link.kind === 'containment') return linkColorContainment
      return neighborIds === null ? linkColorDefault : linkColorDim
    },
    [neighborIds, hoverNodeId, linkColorDefault, linkColorDim, linkColorContainment]
  )

  const linkWidth = useCallback((link: GraphLink) => (link.kind === 'containment' ? 0.6 : 1), [])

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
