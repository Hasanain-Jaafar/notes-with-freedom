import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
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
        {/* An italic serif "f" (the classic font-family mark) — lucide has
            no such icon, so it's a text glyph sized to match the 15px icons. */}
        <span
          aria-hidden
          className="flex h-[15px] w-[15px] items-center justify-center text-[17px] italic leading-none"
          style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
        >
          f
        </span>
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
          widthClassName="w-44"
        >
          <div className="max-h-80 overflow-y-auto">
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
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
