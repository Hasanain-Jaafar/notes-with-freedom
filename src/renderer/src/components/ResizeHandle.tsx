import { useCallback } from 'react'

interface ResizeHandleProps {
  onResize: (deltaX: number) => void
}

export function ResizeHandle({ onResize }: ResizeHandleProps): React.JSX.Element {
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      let lastX = e.clientX
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      function onMove(ev: PointerEvent): void {
        onResize(ev.clientX - lastX)
        lastX = ev.clientX
      }
      function onUp(): void {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onResize]
  )

  return (
    <div
      onPointerDown={handlePointerDown}
      className="group flex w-2 shrink-0 cursor-col-resize items-center justify-center"
    >
      <div className="h-full w-px bg-border group-hover:bg-primary/50 group-active:bg-primary/70" />
    </div>
  )
}
