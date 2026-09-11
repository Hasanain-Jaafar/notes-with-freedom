import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

interface ToolbarPopoverProps {
  anchorRect: DOMRect
  onClose: () => void
  children: React.ReactNode
  widthClassName?: string
  // Defaults to the toolbar/context-menu tier (z-30). A caller anchored
  // inside a higher stacking context — e.g. SettingsPanel's SlidePanel,
  // which is z-40 — needs to raise this or the popover renders behind it
  // despite being portaled to document.body (portaling escapes the DOM
  // nesting, not the z-index stacking order).
  zIndexClassName?: string
}

/** Portaled to document.body (not nested inline where it's used) — the
 * toolbar itself is a .glass-panel, and per CLAUDE.md a blurred panel should
 * never sit nested inside another blurred panel. Portaling keeps this a
 * sibling of body instead, so it can safely carry its own glass styling. */
export function ToolbarPopover({
  anchorRect,
  onClose,
  children,
  widthClassName = 'w-56',
  zIndexClassName = 'z-30'
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
      className={`glass-panel fixed ${zIndexClassName} ${widthClassName} rounded-md p-2 shadow-2xl`}
    >
      {children}
    </div>,
    document.body
  )
}
