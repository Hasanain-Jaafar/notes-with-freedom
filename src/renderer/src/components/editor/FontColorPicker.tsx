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
          {/* One column per color, filled top-down (grid-flow-col over 3
              rows): base swatch on top, its lighter shades stacked beneath,
              empty cells for colors without shades. */}
          <div className="grid grid-flow-col grid-rows-3 place-items-center gap-1.5">
            {FONT_COLORS.flatMap((c) => {
              const cells: ({ name: string; hex: string | null } | undefined)[] = [
                c,
                c.shades?.[0],
                c.shades?.[1]
              ]
              return cells.map((s, i) =>
                s ? (
                  <button
                    key={s.name}
                    title={s.name}
                    onClick={() => {
                      if (s.hex) editor.chain().focus().setColor(s.hex).run()
                      else editor.chain().focus().unsetColor().run()
                      setOpen(false)
                    }}
                    className="h-[1.2rem] w-[1.2rem] shrink-0 rounded-sm border border-border transition-transform hover:scale-105"
                    style={{ backgroundColor: s.hex ?? 'transparent' }}
                  />
                ) : (
                  <span key={`${c.name}-empty-${i}`} className="h-[1.2rem] w-[1.2rem]" />
                )
              )
            })}
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
