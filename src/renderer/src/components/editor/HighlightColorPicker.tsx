import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Highlighter } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { HIGHLIGHT_COLORS } from '../../lib/textColors'
import { cn } from '../../lib/utils'

export function HighlightColorPicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={editor.isActive('highlight')}
        title="Highlight color"
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <Highlighter size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-48">
          <div className="grid grid-cols-3 gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                title={c.name}
                onClick={() => {
                  editor.chain().focus().toggleHighlight({ color: c.hex }).run()
                  setOpen(false)
                }}
                className="h-7 w-full rounded-sm border border-border transition-transform hover:scale-105"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              editor.chain().focus().unsetHighlight().run()
              setOpen(false)
            }}
            className={cn(
              'mt-1.5 w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent'
            )}
          >
            Remove highlight
          </button>
        </ToolbarPopover>
      )}
    </>
  )
}
