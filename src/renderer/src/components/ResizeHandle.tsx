import { useCallback } from 'react'

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
  onResizeStart?: () => void
  onResizeEnd?: () => void
}

export function ResizeHandle({ onResize, onResizeStart, onResizeEnd }: ResizeHandleProps): React.JSX.Element {
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
      className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
    >
      <div className="h-full w-px bg-transparent group-hover:bg-primary/50 group-active:bg-primary/70" />
    </div>
  )
}
