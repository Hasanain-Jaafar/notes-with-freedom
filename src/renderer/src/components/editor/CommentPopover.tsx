import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { MessageSquare } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'
import { OPEN_COMMENT_EVENT } from '../../extensions/Comment'

/** Toolbar button — only dispatches OPEN_COMMENT_EVENT. The toolbar renders
 * its groups more than once (overflow menu + an off-screen measuring clone),
 * so the popover itself must not live here or it would open twice. */
export function CommentButton({ editor }: { editor: Editor }): React.JSX.Element {
  const buttonRef = useRef<HTMLButtonElement>(null)
  return (
    <ToolbarButton
      ref={buttonRef}
      active={editor.isActive('comment')}
      title="Comment (Ctrl+Alt+M)"
      onClick={() =>
        editor.view.dom.dispatchEvent(
          new CustomEvent<DOMRect>(OPEN_COMMENT_EVENT, {
            detail: buttonRef.current!.getBoundingClientRect()
          })
        )
      }
    >
      <MessageSquare size={15} />
    </ToolbarButton>
  )
}

/** Add/edit/delete a comment on the selected text — mounted once per editor
 * (Editor.tsx). Opens from CommentButton, Ctrl+Alt+M, or a click on
 * already-commented text (anchored to that text). */
export function CommentPopover({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [text, setText] = useState('')

  const openAt = useCallback(
    (rect: DOMRect) => {
      const existing = editor.isActive('comment')
      // Nothing to attach a new comment to.
      if (!existing && editor.state.selection.empty) return
      setText(existing ? ((editor.getAttributes('comment').text as string) ?? '') : '')
      setAnchorRect(rect)
      setOpen(true)
    },
    [editor]
  )

  useEffect(() => {
    const dom = editor.view.dom
    function onClick(e: MouseEvent): void {
      // Ctrl+click is reserved for following internal links.
      if (e.ctrlKey || e.metaKey) return
      const span = (e.target as HTMLElement).closest('.comment-mark')
      if (!span) return
      // Select the whole commented span: a bare caret at its edge doesn't
      // count as "in" the mark (inclusive: false), and the selection also
      // shows which text the comment covers.
      const from = editor.view.posAtDOM(span, 0)
      const to = editor.view.posAtDOM(span, span.childNodes.length)
      editor.commands.setTextSelection({ from, to })
      openAt(span.getBoundingClientRect())
    }
    function onOpenRequest(e: Event): void {
      // From CommentButton: anchored under the button.
      const fromButton = (e as CustomEvent<DOMRect | undefined>).detail
      if (fromButton) return openAt(fromButton)
      // From the keyboard shortcut: anchored at the caret.
      const { from } = editor.state.selection
      const coords = editor.view.coordsAtPos(from)
      openAt(new DOMRect(coords.left, coords.top, 0, coords.bottom - coords.top))
    }
    dom.addEventListener('click', onClick)
    dom.addEventListener(OPEN_COMMENT_EVENT, onOpenRequest)
    // "Comment" from the native right-click menu (main/index.ts) — same
    // caret-anchored path as the keyboard shortcut.
    const offContextComment = window.api.editor.onContextComment(() =>
      dom.dispatchEvent(new CustomEvent(OPEN_COMMENT_EVENT))
    )
    return () => {
      offContextComment()
      dom.removeEventListener('click', onClick)
      dom.removeEventListener(OPEN_COMMENT_EVENT, onOpenRequest)
    }
  }, [editor, openAt])

  function save(): void {
    const body = text.trim()
    if (body) editor.chain().focus().setComment(body).run()
    else editor.chain().focus().unsetComment().run()
    setOpen(false)
  }

  const close = useCallback(() => setOpen(false), [])

  return (
    <>
      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={close} widthClassName="w-72">
          <textarea
            autoFocus
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter saves, Shift+Enter adds a new line.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                save()
              }
            }}
            placeholder="Add a comment…"
            className="glass-card w-full resize-none rounded-sm px-2 py-1.5 text-sm outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            {editor.isActive('comment') && (
              <button
                onClick={() => {
                  editor.chain().focus().unsetComment().run()
                  setOpen(false)
                }}
                className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Delete
              </button>
            )}
            <button
              onClick={save}
              className="rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
