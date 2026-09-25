import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { createPortal } from 'react-dom'
import { TableOfContents as TableOfContentsIcon, X } from 'lucide-react'
import { getScrollParent } from '../../lib/getScrollParent'

// Gap below the sticky toolbar's own bottom edge so a jumped-to heading
// doesn't land flush against it either — purely visual breathing room.
const SCROLL_MARGIN_PX = 12

interface HeadingEntry {
  id: string
  level: number
  text: string
  pos: number
}

// Stable reference so returning "no headings" (panel closed) never counts as
// a changed selector result on its own.
const NO_HEADINGS: HeadingEntry[] = []

function collectHeadings(editor: Editor): HeadingEntry[] {
  const headings: HeadingEntry[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'heading') {
      headings.push({
        id: `h-${pos}`,
        level: node.attrs.level as number,
        text: node.textContent || 'Untitled heading',
        pos
      })
    }
    return true
  })
  return headings
}

/** Floating, click-to-jump outline of the current page's headings — fixed
 * to the viewport (not the note's own scroll container), so it lines up
 * with the top of the note regardless of scroll position rather than
 * scrolling away with the content. top-28 (7rem), not GraphView.tsx's
 * top-[3.25rem]: that value is where the CONTENT AREA starts, but the
 * sticky Toolbar (Toolbar.tsx) lives inside it and occupies roughly
 * 3.25rem-6rem from the window's top once stuck (or a bit lower, unstuck)
 * — starting this panel at 3.25rem put it right on top of the toolbar's
 * own buttons. 7rem clears the toolbar in either state. Hidden entirely
 * (not just emptied) when the page has no headings — nothing to jump to.
 *
 * Portaled to document.body rather than rendered inline: this is a
 * .glass-card sitting on top of <main>'s own .glass-panel (App.tsx), and
 * per CLAUDE.md's blur guardrail a blurred panel should never sit nested
 * inside another blurred panel — same reason ToolbarPopover.tsx portals
 * itself out from under the (also blurred) toolbar. */
export function TableOfContents({
  editor,
  open,
  onClose
}: {
  editor: Editor
  open: boolean
  onClose: () => void
}): React.JSX.Element | null {
  // This component stays mounted (Editor.tsx renders it unconditionally
  // whenever an editor exists) even while the panel itself is closed, which
  // is the common case (showToc defaults to false). useEditorState's
  // selector re-runs on every transaction regardless of mount visibility, so
  // without the `open` check here, every keystroke walked the whole document
  // for headings just to produce a value nothing was reading.
  const state = useEditorState({
    editor,
    selector: (ctx) => ({ headings: open ? collectHeadings(ctx.editor) : NO_HEADINGS })
  })

  if (!open || state.headings.length === 0) return null

  function jumpTo(pos: number): void {
    // nodeDOM, not a ProseMirror selection command — this is read-only
    // navigation (like clicking a search result or a graph node), not
    // meant to also move the text cursor/selection into the heading.
    const dom = editor.view.nodeDOM(pos)
    if (!(dom instanceof HTMLElement)) return

    const scroller = getScrollParent(dom)
    if (!scroller) {
      dom.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }

    // Plain scrollIntoView({block: 'start'}) lines the heading up with the
    // very top of the scroll box — but Toolbar.tsx's toolbar is sticky at
    // top:0 of that same box, so the heading landed right underneath it,
    // clipped from view instead of actually visible. Offsetting by the
    // toolbar's own rendered height (plus a small gap) puts the heading
    // just below it instead.
    const toolbar = scroller.querySelector('.toolbar-panel')
    const toolbarHeight = toolbar instanceof HTMLElement ? toolbar.getBoundingClientRect().height : 0
    const targetTop =
      dom.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop -
      toolbarHeight -
      SCROLL_MARGIN_PX
    scroller.scrollTo({ top: targetTop, behavior: 'smooth' })
  }

  return createPortal(
    <div className="glass-card fixed right-4 top-28 z-20 max-h-[70vh] w-56 overflow-y-auto rounded-md p-2 shadow-xl">
      <div className="mb-1 flex items-center gap-1.5 px-1.5 pt-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <TableOfContentsIcon size={12} className="shrink-0" />
        Contents
        <button
          onClick={onClose}
          title="Close table of contents"
          className="ml-auto rounded-sm p-0.5 hover:bg-accent hover:text-foreground"
        >
          <X size={12} />
        </button>
      </div>
      {state.headings.map((h) => (
        <button
          key={h.id}
          onClick={() => jumpTo(h.pos)}
          title={h.text}
          className="block w-full truncate rounded-sm py-1 pr-1.5 text-left text-xs hover:bg-accent"
          style={{ paddingLeft: `${0.375 + (h.level - 1) * 0.75}rem` }}
        >
          {h.text}
        </button>
      ))}
    </div>,
    document.body
  )
}
