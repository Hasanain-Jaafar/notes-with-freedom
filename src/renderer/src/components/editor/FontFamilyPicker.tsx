import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Type } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { FONT_FAMILIES } from '../../lib/textColors'
import { cn } from '../../lib/utils'

export function FontFamilyPicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const current = editor.getAttributes('textStyle').fontFamily as string | undefined
  const currentLabel = FONT_FAMILIES.find((f) => f.value === current)?.name ?? 'Font'

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={!!current}
        title={`Font family (${currentLabel})`}
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <Type size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-40">
          {FONT_FAMILIES.map((f) => (
            <button
              key={f.name}
              onClick={() => {
                if (f.value) editor.chain().focus().setFontFamily(f.value).run()
                else editor.chain().focus().unsetFontFamily().run()
                setOpen(false)
              }}
              style={{ fontFamily: f.value ?? undefined }}
              className={cn(
                'flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                f.value === current && 'bg-primary/10'
              )}
            >
              {f.name}
            </button>
          ))}
        </ToolbarPopover>
      )}
    </>
  )
}
