import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { PaintBucket } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { HIGHLIGHT_COLORS } from '../../lib/textColors'
import { cn } from '../../lib/utils'

// Only ever shown while the cursor is inside a heading (see Toolbar.tsx's
// insideHeading check) — the command itself would just no-op outside one,
// but there's nothing useful to preview/toggle when there's no heading row
// to color, same reasoning as the table-editing group being conditional.
//
// `current` comes from Toolbar's own tracked useEditorState selector rather
// than being read here via editor.getAttributes — see that selector's
// comment for why (moving between two differently-colored headings doesn't
// otherwise trigger a re-render).
export function HeadingBackgroundPicker({
  editor,
  current
}: {
  editor: Editor
  current: string | null
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={!!current}
        title="Heading row color"
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <PaintBucket size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-auto">
          <div className="grid grid-cols-6 place-items-center gap-1.5">
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c.name}
                title={c.name}
                onClick={() => {
                  editor.chain().focus().setHeadingBackground(c.hex).run()
                  setOpen(false)
                }}
                className="h-6 w-6 shrink-0 rounded-sm border border-border transition-transform hover:scale-105"
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
          <button
            onClick={() => {
              editor.chain().focus().unsetHeadingBackground().run()
              setOpen(false)
            }}
            className={cn(
              'mt-1.5 w-full rounded-sm px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent'
            )}
          >
            Remove row color
          </button>
        </ToolbarPopover>
      )}
    </>
  )
}
