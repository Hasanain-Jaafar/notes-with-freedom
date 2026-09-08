import { forwardRef } from 'react'
import { cn } from '../../lib/utils'

interface ToolbarButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export const ToolbarButton = forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton({ active, className, onMouseDown, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        // Without this, clicking the button knocks the editor's selection out
        // (native mousedown blur) before onClick runs. Marks like bold still
        // apply somewhere so the loss goes unnoticed, but table commands
        // (deleteRow, deleteColumn, deleteTable...) need the selection to
        // still be inside the table and silently no-op otherwise.
        onMouseDown={(e) => {
          e.preventDefault()
          onMouseDown?.(e)
        }}
        className={cn(
          'flex h-7 min-w-7 items-center justify-center gap-1 rounded-sm px-1.5 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40',
          active && 'bg-primary/15 text-primary hover:bg-primary/20',
          className
        )}
        {...props}
      />
    )
  }
)
