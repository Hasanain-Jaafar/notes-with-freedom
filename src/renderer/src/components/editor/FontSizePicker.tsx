import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ALargeSmall } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { FONT_SIZES } from '../../lib/textColors'
import { cn } from '../../lib/utils'

export function FontSizePicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  // Free-text entry for a size outside the fixed list below — toggled on by
  // the "Custom…" row, not shown by default.
  const [customOpen, setCustomOpen] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)
  const customInputRef = useRef<HTMLInputElement>(null)
  const current = editor.getAttributes('textStyle').fontSize as string | undefined

  // Runs once when the field actually opens (keyed on customOpen, not
  // customValue) — an inline `ref={el => el?.select()}` callback re-fires on
  // every keystroke instead, since it's a new function each render, which
  // re-selects the field's own in-progress value and makes it impossible to
  // type more than one digit.
  useEffect(() => {
    if (customOpen) customInputRef.current?.select()
  }, [customOpen])

  function close(): void {
    setOpen(false)
    setCustomOpen(false)
  }

  function applyCustom(): void {
    // parseInt (not parseFloat) — TipTap/CSS font-size only needs whole
    // pixels here, matching the fixed list's own values, and it quietly
    // drops anything non-numeric the user typed instead of erroring.
    const n = parseInt(customValue, 10)
    if (Number.isFinite(n) && n > 0) editor.chain().focus().setFontSize(`${Math.min(n, 400)}px`).run()
    close()
  }

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={!!current}
        title={`Font size${current ? ` (${current})` : ''}`}
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <ALargeSmall size={16} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={close} widthClassName="w-32">
          <button
            onClick={() => {
              editor.chain().focus().unsetFontSize().run()
              close()
            }}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
          >
            Default
          </button>

          <div className="max-h-56 overflow-y-auto">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                onClick={() => {
                  editor.chain().focus().setFontSize(size).run()
                  close()
                }}
                className={cn(
                  'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  size === current && 'bg-primary/10'
                )}
              >
                {size}
              </button>
            ))}
          </div>

          {customOpen ? (
            <input
              ref={customInputRef}
              autoFocus
              type="number"
              min={1}
              max={400}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyCustom()
                if (e.key === 'Escape') close()
              }}
              onBlur={applyCustom}
              placeholder="Size in px…"
              className="glass-card mt-1 w-full rounded-sm px-2 py-1 text-sm outline-none"
            />
          ) : (
            <button
              onClick={() => {
                setCustomValue(current ? String(parseInt(current, 10)) : '')
                setCustomOpen(true)
              }}
              className="mt-1 flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
            >
              Custom…
            </button>
          )}
        </ToolbarPopover>
      )}
    </>
  )
}
