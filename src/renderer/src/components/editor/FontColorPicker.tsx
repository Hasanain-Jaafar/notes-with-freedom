import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Baseline } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { FONT_COLORS } from '../../lib/textColors'

export function FontColorPicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={!!editor.getAttributes('textStyle').color}
        title="Font color"
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <Baseline size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-auto">
          <div className="grid grid-cols-4 place-items-center gap-1.5">
            {FONT_COLORS.map((c) => (
              <button
                key={c.name}
                title={c.name}
                onClick={() => {
                  if (c.hex) editor.chain().focus().setColor(c.hex).run()
                  else editor.chain().focus().unsetColor().run()
                  setOpen(false)
                }}
                className="h-6 w-6 shrink-0 rounded-sm border border-border transition-transform hover:scale-105"
                style={{ backgroundColor: c.hex ?? 'transparent' }}
              />
            ))}
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
