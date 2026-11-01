import { forwardRef } from 'react'
import { cn } from '../../lib/utils'
import { useTooltip } from '../Tooltip'

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { active, className, title, onMouseDown, onMouseEnter, onMouseLeave, onFocus, onBlur, ...props },
    ref
  ) {
    const { show, hide, tooltip } = useTooltip(title)

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
            show(e.currentTarget)
            onMouseEnter?.(e)
          }}
          onMouseLeave={(e) => {
            hide()
            onMouseLeave?.(e)
          }}
          onFocus={(e) => {
            show(e.currentTarget)
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
        {tooltip}
      </>
    )
  }
)
