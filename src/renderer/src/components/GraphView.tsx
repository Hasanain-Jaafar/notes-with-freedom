import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import ForceGraph2D, { type ForceGraphMethods, type NodeObject, type LinkObject } from 'react-force-graph-2d'
import { Network, X } from 'lucide-react'
import type { PageListAllDTO } from '@shared/ipc-channels'
import { useAppStore } from '../store/useAppStore'
import { DEFAULT_ACCENT_HEX } from '../lib/sectionColors'

interface GraphViewProps {
  open: boolean
  onClose: () => void
  darkMode: boolean
}

interface GraphNode extends PageListAllDTO {
  x?: number
  y?: number
}

interface GraphLink {
  source: number | GraphNode
  target: number | GraphNode
}

interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

type GraphRef = ForceGraphMethods<NodeObject<GraphNode>, LinkObject<GraphNode, GraphLink>>

const NODE_RADIUS = 4
const TRANSITION_MS = 200

function linkEndId(end: number | GraphNode): number {
  return typeof end === 'object' ? end.id : end
}

export function GraphView({ open, onClose, darkMode }: GraphViewProps): React.JSX.Element | null {
  const navigateToPage = useAppStore((s) => s.navigateToPage)
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [hoverNodeId, setHoverNodeId] = useState<number | null>(null)
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
  // pages/links since the last time this was opened show up — a couple of
  // calls on open is a one-time cost, not the repeated-call pattern the
  // chatty-IPC guardrail is about.
  useEffect(() => {
    if (!open) return
    setGraphData(null)
    setHoverNodeId(null)
    hasZoomedRef.current = false
    let cancelled = false
    Promise.all([window.api.pages.listAll(), window.api.pageLinks.listAll()]).then(([pages, links]) => {
      if (cancelled) return
      setGraphData({
        nodes: pages.map((p) => ({ ...p })),
        links: links.map((l) => ({ source: l.sourcePageId, target: l.targetPageId }))
      })
    })
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

  // Every node directly connected to the hovered one, plus the hovered node
  // itself — null when nothing is hovered, meaning "don't dim anything".
  const neighborIds = useMemo(() => {
    if (hoverNodeId === null || !graphData) return null
    const ids = new Set<number>([hoverNodeId])
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
  // DEFAULT_ACCENT_HEX, only for the hovered node's own edges — CLAUDE.md's
  // "accent color sparingly, for active states" guidance applied literally.
  const linkColorDefault = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.2)'
  const linkColorDim = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)'
  const nodeDimColor = darkMode ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.2)'
  const textColor = darkMode ? 'rgba(255,255,255,0.85)' : 'rgba(15,23,42,0.85)'
  const textDimColor = darkMode ? 'rgba(255,255,255,0.3)' : 'rgba(15,23,42,0.3)'

  const nodeCanvasObject = useCallback(
    (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const isDimmed = neighborIds !== null && !neighborIds.has(node.id)
      const x = node.x ?? 0
      const y = node.y ?? 0

      ctx.beginPath()
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI)
      ctx.fillStyle = isDimmed ? nodeDimColor : node.sectionColor ?? DEFAULT_ACCENT_HEX
      ctx.fill()

      const fontSize = 11 / globalScale
      ctx.font = `${fontSize}px Inter, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillStyle = isDimmed ? textDimColor : textColor
      ctx.fillText(node.title, x, y + NODE_RADIUS + 2)
    },
    [neighborIds, nodeDimColor, textColor, textDimColor]
  )

  const nodePointerAreaPaint = useCallback((node: GraphNode, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(node.x ?? 0, node.y ?? 0, NODE_RADIUS + 2, 0, 2 * Math.PI)
    ctx.fill()
  }, [])

  const linkColor = useCallback(
    (link: GraphLink) => {
      if (neighborIds === null) return linkColorDefault
      const touchesHover = linkEndId(link.source) === hoverNodeId || linkEndId(link.target) === hoverNodeId
      return touchesHover ? DEFAULT_ACCENT_HEX : linkColorDim
    },
    [neighborIds, hoverNodeId, linkColorDefault, linkColorDim]
  )

  const handleEngineStop = useCallback(() => {
    if (hasZoomedRef.current) return
    hasZoomedRef.current = true
    graphRef.current?.zoomToFit(400, 40)
  }, [])

  const handleNodeClick = useCallback(
    (node: GraphNode) => {
      void navigateToPage(node.notebookId, node.sectionId, node.id)
      onClose()
    },
    [navigateToPage, onClose]
  )

  if (!mounted) return null

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
            {graphData.nodes.length} pages · {graphData.links.length} links
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
        ) : graphData.nodes.length === 0 ? (
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
            linkWidth={1}
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
