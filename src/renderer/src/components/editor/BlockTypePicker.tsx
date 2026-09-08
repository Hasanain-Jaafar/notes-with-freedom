import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ChevronDown, Heading1, Heading2, Heading3, Pilcrow, Quote, type LucideIcon } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { cn } from '../../lib/utils'

interface BlockType {
  label: string
  icon: LucideIcon
  isActive: (editor: Editor) => boolean
  apply: (editor: Editor) => void
}

// Same set (and the same icons) as the "/" slash menu's block-type entries
// in slashItems.tsx — this picker is the equivalent action for text that's
// already written and selected, rather than a fresh line being typed.
const BLOCK_TYPES: BlockType[] = [
  {
    label: 'Paragraph',
    icon: Pilcrow,
    isActive: (editor) => editor.isActive('paragraph'),
    apply: (editor) => editor.chain().focus().setParagraph().run()
  },
  {
    label: 'Heading 1',
    icon: Heading1,
    isActive: (editor) => editor.isActive('heading', { level: 1 }),
    apply: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
  },
  {
    label: 'Heading 2',
    icon: Heading2,
    isActive: (editor) => editor.isActive('heading', { level: 2 }),
    apply: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    label: 'Heading 3',
    icon: Heading3,
    isActive: (editor) => editor.isActive('heading', { level: 3 }),
    apply: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
  },
  {
    label: 'Blockquote',
    icon: Quote,
    isActive: (editor) => editor.isActive('blockquote'),
    apply: (editor) => editor.chain().focus().toggleBlockquote().run()
  }
]

export function BlockTypePicker({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Own useEditorState subscription (rather than reading editor.isActive()
  // straight in the render body, like the simpler pickers do) — Toolbar's
  // own selector doesn't track heading/blockquote state, so without this
  // the button could show a stale block type after the cursor moves between
  // a heading and a paragraph without any of Toolbar's *other* tracked
  // flags (bold, lists, align...) happening to change too.
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      current: BLOCK_TYPES.find((t) => t.isActive(ctx.editor)) ?? BLOCK_TYPES[0]
    })
  })
  const CurrentIcon = state.current.icon

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        title="Text style"
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
        className="w-32 justify-between px-2"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <CurrentIcon size={14} className="shrink-0" />
          <span className="truncate">{state.current.label}</span>
        </span>
        <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover
          anchorRect={anchorRect}
          onClose={() => setOpen(false)}
          widthClassName="w-40"
        >
          {BLOCK_TYPES.map((type) => {
            const ItemIcon = type.icon
            const active = type.isActive(editor)
            return (
              <button
                key={type.label}
                onClick={() => {
                  type.apply(editor)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                  active && 'bg-primary/10 text-primary'
                )}
              >
                <ItemIcon size={14} className="shrink-0" />
                {type.label}
              </button>
            )
          })}
        </ToolbarPopover>
      )}
    </>
  )
}
