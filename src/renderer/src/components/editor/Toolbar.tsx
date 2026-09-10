import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Fragment, useRef, useState } from 'react'
import {
  Bold,
  Italic,
  Underline,
  RemoveFormatting,
  List,
  ListOrdered,
  ListTodo,
  Indent,
  Outdent,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Table,
  Plus,
  Minus,
  Trash2,
  ChevronRight,
  StretchHorizontal
} from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { BlockTypePicker } from './BlockTypePicker'
import { HighlightColorPicker } from './HighlightColorPicker'
import { FontColorPicker } from './FontColorPicker'
import { FontFamilyPicker } from './FontFamilyPicker'
import { FontSizePicker } from './FontSizePicker'
import { LinkPopover } from './LinkPopover'
import { MathPopover } from './MathPopover'
import { ImageInsertButton } from './ImageInsertButton'
import { AudioRecordButton } from './AudioRecordButton'
import { useOverflowGroups } from '../../hooks/useOverflowGroups'
import { cn } from '../../lib/utils'

interface ToolbarProps {
  editor: Editor
  notebookId: number
  pageId: number
  audioRecorder: {
    recording: boolean
    saving: boolean
    startRecording: () => void
    stopRecording: () => void
  }
  fullWidth: boolean
  onToggleFullWidth: () => void
}

const Divider = (): React.JSX.Element => <div className="mx-1 h-5 w-px shrink-0 bg-border" />

/** Keeps a logical set of buttons (plus its leading divider) together as one
 * flex item, so a group moves behind the overflow toggle as a whole instead
 * of splitting partway through when the toolbar runs out of width. */
const Group = ({ children }: { children: React.ReactNode }): React.JSX.Element => (
  <div className="flex shrink-0 items-center gap-1">{children}</div>
)

export function Toolbar({
  editor,
  notebookId,
  pageId,
  audioRecorder,
  fullWidth,
  onToggleFullWidth
}: ToolbarProps): React.JSX.Element {
  const state = useEditorState({
    editor,
    selector: (ctx) => ({
      bold: ctx.editor.isActive('bold'),
      italic: ctx.editor.isActive('italic'),
      underline: ctx.editor.isActive('underline'),
      bulletList: ctx.editor.isActive('bulletList'),
      orderedList: ctx.editor.isActive('orderedList'),
      taskList: ctx.editor.isActive('taskList'),
      alignLeft: ctx.editor.isActive({ textAlign: 'left' }),
      alignCenter: ctx.editor.isActive({ textAlign: 'center' }),
      alignRight: ctx.editor.isActive({ textAlign: 'right' }),
      alignJustify: ctx.editor.isActive({ textAlign: 'justify' }),
      insideTable: ctx.editor.isActive('table')
    })
  })

  const groups: { key: string; render: () => React.JSX.Element }[] = [
    {
      key: 'blockType',
      render: () => (
        <Group>
          <BlockTypePicker editor={editor} />
        </Group>
      )
    },
    {
      key: 'format',
      render: () => (
        <Group>
          <Divider />
          <ToolbarButton
            active={state.bold}
            title="Bold"
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.italic}
            title="Italic"
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.underline}
            title="Underline"
            onClick={() => editor.chain().focus().toggleUnderline().run()}
          >
            <Underline size={15} />
          </ToolbarButton>
          <ToolbarButton
            title="Clear formatting"
            // unsetAllMarks() only clears character-level marks (bold,
            // italic, underline, color, font, highlight, link, code) — it
            // deliberately leaves the block type alone (headings/lists stay
            // headings/lists), same as "clear formatting" in Word/Docs.
            onClick={() => editor.chain().focus().unsetAllMarks().run()}
          >
            <RemoveFormatting size={15} />
          </ToolbarButton>
        </Group>
      )
    },
    {
      key: 'colors',
      render: () => (
        <Group>
          <Divider />
          <HighlightColorPicker editor={editor} />
          <FontColorPicker editor={editor} />
        </Group>
      )
    },
    {
      key: 'font',
      render: () => (
        <Group>
          <Divider />
          <FontFamilyPicker editor={editor} />
          <FontSizePicker editor={editor} />
        </Group>
      )
    },
    {
      key: 'lists',
      render: () => (
        <Group>
          <Divider />
          <ToolbarButton
            active={state.bulletList}
            title="Bullet list"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.orderedList}
            title="Numbered list"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.taskList}
            title="Checklist"
            onClick={() => editor.chain().focus().toggleTaskList().run()}
          >
            <ListTodo size={15} />
          </ToolbarButton>
          <ToolbarButton
            title="Indent"
            onClick={() => {
              // Checklists use a separate 'taskItem' node type from
              // bullet/numbered lists' 'listItem' — sinkListItem only sinks
              // the exact type it's given, so try both instead of hardcoding
              // one (which silently no-op'd inside checklists before).
              const chain = editor.chain().focus()
              if (editor.can().sinkListItem('listItem')) chain.sinkListItem('listItem').run()
              else if (editor.can().sinkListItem('taskItem')) chain.sinkListItem('taskItem').run()
            }}
          >
            <Indent size={15} />
          </ToolbarButton>
          <ToolbarButton
            title="Outdent"
            onClick={() => {
              const chain = editor.chain().focus()
              if (editor.can().liftListItem('listItem')) chain.liftListItem('listItem').run()
              else if (editor.can().liftListItem('taskItem')) chain.liftListItem('taskItem').run()
            }}
          >
            <Outdent size={15} />
          </ToolbarButton>
        </Group>
      )
    },
    {
      key: 'align',
      render: () => (
        <Group>
          <Divider />
          <ToolbarButton
            active={state.alignLeft}
            title="Align left"
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
          >
            <AlignLeft size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.alignCenter}
            title="Align center"
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
          >
            <AlignCenter size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.alignRight}
            title="Align right"
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
          >
            <AlignRight size={15} />
          </ToolbarButton>
          <ToolbarButton
            active={state.alignJustify}
            title="Justify"
            onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          >
            <AlignJustify size={15} />
          </ToolbarButton>
        </Group>
      )
    },
    {
      key: 'insert',
      render: () => (
        <Group>
          <Divider />
          <LinkPopover editor={editor} />
          <ToolbarButton
            title="Insert table"
            onClick={() =>
              editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
            }
          >
            <Table size={15} />
          </ToolbarButton>
          <ImageInsertButton editor={editor} notebookId={notebookId} pageId={pageId} />
          <MathPopover editor={editor} />
          <AudioRecordButton
            recording={audioRecorder.recording}
            saving={audioRecorder.saving}
            onStart={audioRecorder.startRecording}
            onStop={audioRecorder.stopRecording}
          />
        </Group>
      )
    },
    ...(state.insideTable
      ? [
          {
            key: 'table',
            render: () => (
              <Group>
                <Divider />
                <ToolbarButton
                  title="Add row below"
                  onClick={() => editor.chain().focus().addRowAfter().run()}
                >
                  <Plus size={13} />
                  <span className="text-xs">Row</span>
                </ToolbarButton>
                <ToolbarButton
                  title="Delete row"
                  onClick={() => editor.chain().focus().deleteRow().run()}
                >
                  <Minus size={13} />
                  <span className="text-xs">Row</span>
                </ToolbarButton>
                <ToolbarButton
                  title="Add column right"
                  onClick={() => editor.chain().focus().addColumnAfter().run()}
                >
                  <Plus size={13} />
                  <span className="text-xs">Col</span>
                </ToolbarButton>
                <ToolbarButton
                  title="Delete column"
                  onClick={() => editor.chain().focus().deleteColumn().run()}
                >
                  <Minus size={13} />
                  <span className="text-xs">Col</span>
                </ToolbarButton>
                <ToolbarButton
                  title="Delete table"
                  onClick={() => editor.chain().focus().deleteTable().run()}
                >
                  <Trash2 size={13} />
                </ToolbarButton>
              </Group>
            )
          }
        ]
      : []),
    {
      key: 'layout',
      render: () => (
        <Group>
          <Divider />
          <ToolbarButton
            active={fullWidth}
            title={fullWidth ? 'Switch to centered width' : 'Switch to full width'}
            onClick={onToggleFullWidth}
          >
            <StretchHorizontal size={15} />
          </ToolbarButton>
        </Group>
      )
    }
  ]

  const { containerRef, measureRef, visibleCount } = useOverflowGroups(groups.length)
  const hasOverflow = visibleCount < groups.length
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)

  return (
    // overflow-hidden here (not just on containerRef below) matters: the
    // off-screen measurement clone further down is absolute-positioned at
    // its full, unwrapped width — with nothing clipping it, an absolutely
    // positioned descendant still counts toward its scroll-container
    // ancestor's (the editor pane's) scrollable overflow, which was forcing
    // the whole note body to scroll horizontally even on pages with no wide
    // content of their own.
    <div className="toolbar-panel sticky top-0 z-20 mx-4 overflow-hidden rounded-md p-1.5">
      <div ref={containerRef} className="flex items-center gap-1 overflow-hidden">
        {groups.slice(0, visibleCount).map((g) => (
          <Fragment key={g.key}>{g.render()}</Fragment>
        ))}

        {hasOverflow && (
          <ToolbarButton
            ref={toggleRef}
            title="More tools"
            active={overflowOpen}
            onClick={() => {
              setAnchorRect(toggleRef.current!.getBoundingClientRect())
              setOverflowOpen((v) => !v)
            }}
          >
            <ChevronRight size={15} className={cn('transition-transform', overflowOpen && 'rotate-90')} />
          </ToolbarButton>
        )}
      </div>

      {overflowOpen && anchorRect && (
        <ToolbarPopover
          anchorRect={anchorRect}
          onClose={() => setOverflowOpen(false)}
          widthClassName="w-auto max-w-xs"
        >
          <div className="flex flex-wrap items-center gap-1">
            {groups.slice(visibleCount).map((g) => (
              <Fragment key={g.key}>{g.render()}</Fragment>
            ))}
          </div>
        </ToolbarPopover>
      )}

      {/* Off-screen clone used only to measure each group's natural width —
          keeps the visible/overflow split accurate across container resizes
          without affecting layout (see useOverflowGroups). */}
      <div
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute left-0 top-0 flex items-center gap-1"
      >
        {groups.map((g) => (
          <Fragment key={g.key}>{g.render()}</Fragment>
        ))}
      </div>
    </div>
  )
}
