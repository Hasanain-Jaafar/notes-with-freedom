import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ToolbarPopoverProps {
  anchorRect: DOMRect
  onClose: () => void
  children: React.ReactNode
  widthClassName?: string
}

/** Portaled to document.body (not nested inline where it's used) — the
 * toolbar itself is a .glass-panel, and per CLAUDE.md a blurred panel should
 * never sit nested inside another blurred panel. Portaling keeps this a
 * sibling of body instead, so it can safely carry its own glass styling. */
export function ToolbarPopover({
  anchorRect,
  onClose,
  children,
  widthClassName = 'w-56'
}: ToolbarPopoverProps): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overflowX = rect.right - window.innerWidth
    if (overflowX > 0) el.style.left = `${anchorRect.left - overflowX - 8}px`
    const overflowY = rect.bottom - window.innerHeight
    if (overflowY > 0) el.style.top = `${anchorRect.top - rect.height - 6}px`
  }, [anchorRect])

  return createPortal(
    <div
      ref={ref}
      style={{ top: anchorRect.bottom + 6, left: anchorRect.left }}
      className={`glass-panel fixed z-30 ${widthClassName} rounded-md p-2 shadow-2xl`}
    >
      {children}
    </div>,
    document.body
  )
}
