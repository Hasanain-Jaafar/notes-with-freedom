import { forwardRef, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

const TOOLTIP_DELAY_MS = 400

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { active, className, title, onMouseDown, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props },
    ref
  ) {
    // Native `title` gives the OS's own tooltip box (system font, square
    // corners, no relation to the app's theme) — jarring against the glass
    // UI. This renders a themed one instead, portaled to <body> since the
    // toolbar's ancestors clip overflow (see ToolbarPopover for the same
    // portal reasoning).
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

    useEffect(() => clearTimer, [])

    // Clamp horizontally within the viewport once the tooltip has a real
    // width to measure — same overflow-correction technique as
    // ToolbarPopover, just centered on the anchor instead of left-aligned.
    useEffect(() => {
      if (!anchorRect) return
      const el = tooltipRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const overflowRight = rect.right - (window.innerWidth - 8)
      const overflowLeft = 8 - rect.left
      if (overflowRight > 0) el.style.left = `${parseFloat(el.style.left) - overflowRight}px`
      else if (overflowLeft > 0) el.style.left = `${parseFloat(el.style.left) + overflowLeft}px`
    }, [anchorRect])

    return (
      <>
        <button
          ref={ref}
          type="button"
          // Without this, clicking the button knocks the editor's selection out
          // (native mousedown blur) before onClick runs. Marks like bold still
          // apply somewhere so the loss goes unnoticed, but table commands
          // (deleteRow, deleteColumn, deleteTable...) need the selection to
          // still be inside the table and silently no-op otherwise.
          onMouseDown={(e) => {
            hide()
            e.preventDefault()
            onMouseDown?.(e)
          }}
          onMouseEnter={(e) => {
            const target = e.currentTarget
            clearTimer()
            if (title) timerRef.current = setTimeout(() => setAnchorRect(target.getBoundingClientRect()), TOOLTIP_DELAY_MS)
            onMouseEnter?.(e)
          }}
          onMouseLeave={(e) => {
            hide()
            onMouseLeave?.(e)
          }}
          onFocus={(e) => {
            const target = e.currentTarget
            clearTimer()
            if (title) timerRef.current = setTimeout(() => setAnchorRect(target.getBoundingClientRect()), TOOLTIP_DELAY_MS)
            onFocus?.(e)
          }}
          onBlur={(e) => {
            hide()
            onBlur?.(e)
          }}
          className={cn(
            'flex h-7 min-w-7 items-center justify-center gap-1 rounded-sm px-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
            // toolbar-btn-active: a plain class hook, not just the Tailwind
            // utilities below — index.css uses it to swap the blue/purple
            // accent presets to a solid fill + white icon (see that rule for
            // why only those two need it).
            active && 'toolbar-btn-active bg-primary/15 text-primary hover:bg-primary/20',
            className
          )}
          {...props}
        />
        {title &&
          anchorRect &&
          createPortal(
            <div
              ref={tooltipRef}
              role="tooltip"
              style={{ top: anchorRect.bottom + 6, left: anchorRect.left + anchorRect.width / 2 }}
              // Deliberately a solid chip, not another .glass-panel — a
              // tooltip mounts/unmounts on every hover, and CLAUDE.md's blur
              // guardrail reserves backdrop-blur for large, static panels.
              className="pointer-events-none fixed z-[60] -translate-x-1/2 whitespace-nowrap rounded-sm bg-zinc-900/95 px-2 py-1 text-[11px] font-medium text-white shadow-lg ring-1 ring-black/5 duration-100 animate-in fade-in-0 zoom-in-95 dark:bg-zinc-100/95 dark:text-zinc-900"
            >
              {title}
            </div>,
            document.body
          )}
      </>
    )
  }
)
