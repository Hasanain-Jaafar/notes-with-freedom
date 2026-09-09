import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { ALargeSmall } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { FONT_SIZES } from '../../lib/textColors'
import { cn } from '../../lib/utils'

export function FontSizePicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const current = editor.getAttributes('textStyle').fontSize as string | undefined

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
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-28">
          <button
            onClick={() => {
              editor.chain().focus().unsetFontSize().run()
              setOpen(false)
            }}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent"
          >
            Default
          </button>
          {FONT_SIZES.map((size) => (
            <button
              key={size}
              onClick={() => {
                editor.chain().focus().setFontSize(size).run()
                setOpen(false)
              }}
              className={cn(
                'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                size === current && 'bg-primary/10'
              )}
            >
              {size}
            </button>
          ))}
        </ToolbarPopover>
      )}
    </>
  )
}
