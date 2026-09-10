import { useCallback } from 'react'
import { cn } from '../lib/utils'

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
  // Shifts the hit-zone left by half its width so it straddles the boundary
  // it sits against instead of starting exactly at it — for a boundary that
  // has its own visible edge/shadow to center on (e.g. SectionsColumn's
  // right-edge shadow). Leave false for a handle whose far edge needs to
  // stay flush with something else (e.g. the sidebar's own right edge,
  // against the note area) — shifting that one too would open a gap
  // between the hit-zone and that edge instead of fixing anything.
  centerOnBoundary?: boolean
  // Escape hatch for the one usage that isn't a normal flex sibling between
  // two columns — the outer (pages/note-area) handle needs to be positioned
  // absolutely so its hit-zone can reach past the sidebar's own clipped
  // edge into the gap before the note area, which a plain flex child can't
  // do. See Sidebar.tsx.
  className?: string
  style?: React.CSSProperties
}

export function ResizeHandle({
  onResize,
  onResizeStart,
  onResizeEnd,
  centerOnBoundary = false,
  className,
  style
}: ResizeHandleProps): React.JSX.Element {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      onResizeStart?.()
      let lastX = e.clientX
      let pendingDeltaX = 0
      let rafId: number | null = null
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      // Pointer events can fire far faster than the display can actually
      // paint (high-poll-rate mice/trackpads routinely exceed 60-120/sec) —
      // applying every single one as its own React state update queued more
      // renders than there were frames to show them in, which is what made
      // the drag feel like it was stuttering/catching up rather than
      // tracking the cursor. Coalescing into at most one update per
      // animation frame matches the update rate to what can actually render.
      function flush(): void {
        rafId = null
        if (pendingDeltaX === 0) return
        onResize(pendingDeltaX)
        pendingDeltaX = 0
      }

      function onMove(ev: PointerEvent): void {
        pendingDeltaX += ev.clientX - lastX
        lastX = ev.clientX
        if (rafId === null) rafId = requestAnimationFrame(flush)
      }
      function onUp(): void {
        if (rafId !== null) {
          cancelAnimationFrame(rafId)
          flush()
        }
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        onResizeEnd?.()
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onResize, onResizeStart, onResizeEnd]
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      style={style}
      // The shift uses transform (not margin — margin would eat into the
      // layout math the sidebar's total width is computed from).
      className={cn(
        'w-2 shrink-0 cursor-col-resize',
        centerOnBoundary && '-translate-x-1/2',
        className
      )}
    />
  )
}
