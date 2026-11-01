import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../lib/utils'

const TOOLTIP_DELAY_MS = 400

export type TooltipSide = 'bottom' | 'right'

interface TooltipControls {
  /** Starts the hover delay, anchored to `target`'s current position. */
  show: (target: HTMLElement) => void
  hide: () => void
  /** Render this anywhere next to the trigger — it portals itself to <body>. */
  tooltip: React.ReactNode
}

/** The app's themed tooltip. Native `title` gives the OS's own tooltip box
 * (system font, square corners, no relation to the app's theme) — jarring
 * against the glass UI. Portaled to <body> since toolbar/sidebar ancestors
 * clip overflow (see ToolbarPopover for the same portal reasoning). */
export function useTooltip(label: string | undefined, side: TooltipSide = 'bottom'): TooltipControls {
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearTimer = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }
  const hide = (): void => {
    clearTimer()
    setAnchorRect(null)
  }
  const show = (target: HTMLElement): void => {
    clearTimer()
    if (label) timerRef.current = setTimeout(() => setAnchorRect(target.getBoundingClientRect()), TOOLTIP_DELAY_MS)
  }

  useEffect(() => clearTimer, [])

  // Clamp within the viewport once the tooltip has a real size to measure —
  // same overflow-correction technique as ToolbarPopover.
  useEffect(() => {
    if (!anchorRect) return
    const el = tooltipRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overflowRight = rect.right - (window.innerWidth - 8)
    const overflowLeft = 8 - rect.left
    const overflowBottom = rect.bottom - (window.innerHeight - 8)
    if (overflowRight > 0) el.style.left = `${parseFloat(el.style.left) - overflowRight}px`
    else if (overflowLeft > 0) el.style.left = `${parseFloat(el.style.left) + overflowLeft}px`
    if (overflowBottom > 0) el.style.top = `${parseFloat(el.style.top) - overflowBottom}px`
  }, [anchorRect])

  const tooltip =
    label &&
    anchorRect &&
    createPortal(
      <div
        ref={tooltipRef}
        role="tooltip"
        style={
          side === 'right'
            ? { top: anchorRect.top + anchorRect.height / 2, left: anchorRect.right + 6 }
            : { top: anchorRect.bottom + 6, left: anchorRect.left + anchorRect.width / 2 }
        }
        // Deliberately a solid chip, not another .glass-panel — a tooltip
        // mounts/unmounts on every hover, and CLAUDE.md's blur guardrail
        // reserves backdrop-blur for large, static panels.
        className={cn(
          'pointer-events-none fixed z-[60] whitespace-nowrap rounded-sm bg-zinc-900/95 px-2 py-1 text-[11px] font-medium text-white shadow-lg ring-1 ring-black/5 duration-100 animate-in fade-in-0 zoom-in-95 dark:bg-zinc-100/95 dark:text-zinc-900',
          side === 'right' ? '-translate-y-1/2' : '-translate-x-1/2'
        )}
      >
        {label}
      </div>,
      document.body
    )

  return { show, hide, tooltip }
}
