import { Mark, mergeAttributes } from '@tiptap/core'
import type { Node as ProseMirrorNode, Mark as ProseMirrorMark } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    comment: {
      setComment: (text: string) => ReturnType
      unsetComment: () => ReturnType
    }
  }
}

// DOM event the Ctrl+Alt+M shortcut (lib/editorShortcuts.ts) dispatches on
// the editor's root element — CommentPopover listens for it and opens,
// keeping the popover's React state out of the keymap.
export const OPEN_COMMENT_EVENT = 'own-notes:open-comment'

// A comment on a range of text. The comment body lives in the mark's own
// attribute, inside the page content — no separate table, so comments move,
// copy, undo and (later) sync together with the text they're attached to.
// Exports carry the text but not the comment (unknown span → plain text).
export const Comment = Mark.create({
  name: 'comment',
  // Typing right after commented text shouldn't extend the comment.
  inclusive: false,

  addAttributes() {
    return {
      text: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-comment') ?? '',
        renderHTML: (attrs) => ({ 'data-comment': attrs.text, title: attrs.text })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-comment]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'comment-mark' }), 0]
  },

  // Comment icon: a small badge widget placed right after each commented
  // range, inline with the text. Decorations never reach getHTML(), so
  // exports are unaffected.
  addProseMirrorPlugins() {
    const editor = this.editor
    const markName = this.name

    function iconFor(mark: ProseMirrorMark) {
      return (_view: unknown, getPos: () => number | undefined): HTMLElement => {
        const icon = document.createElement('span')
        icon.className = 'comment-margin-icon'
        icon.contentEditable = 'false'
        icon.title = mark.attrs.text as string
        icon.addEventListener('mousedown', (e) => {
          e.preventDefault()
          const pos = getPos()
          if (pos === undefined) return
          editor.chain().focus().setTextSelection(pos).extendMarkRange(markName, mark.attrs).run()
          editor.view.dom.dispatchEvent(
            new CustomEvent<DOMRect>(OPEN_COMMENT_EVENT, { detail: icon.getBoundingClientRect() })
          )
        })
        return icon
      }
    }

    function build(doc: ProseMirrorNode): DecorationSet {
      const ranges: { mark: ProseMirrorMark; end: number }[] = []
      doc.descendants((node, pos) => {
        if (!node.isText) return
        const mark = node.marks.find((m) => m.type.name === markName)
        if (!mark) return
        const prev = ranges[ranges.length - 1]
        // Adjacent text nodes (e.g. bold inside the comment) are one comment.
        if (prev && prev.end === pos && prev.mark.eq(mark)) prev.end = pos + node.nodeSize
        else ranges.push({ mark, end: pos + node.nodeSize })
      })
      return DecorationSet.create(
        doc,
        ranges.map(({ mark, end }) =>
          Decoration.widget(end, iconFor(mark), { side: 1, key: `comment:${mark.attrs.text}` })
        )
      )
    }

    return [
      new Plugin({
        key: new PluginKey('commentMarginIcons'),
        state: {
          init: (_, { doc }) => build(doc),
          apply: (tr, old) => (tr.docChanged ? build(tr.doc) : old)
        },
        props: {
          decorations(state) {
            return this.getState(state)
          }
        }
      })
    ]
  },

  addCommands() {
    return {
      setComment:
        (text: string) =>
        ({ chain }) =>
          chain().extendMarkRange(this.name).setMark(this.name, { text }).run(),
      unsetComment:
        () =>
        ({ chain }) =>
          chain().extendMarkRange(this.name).unsetMark(this.name).run()
    }
  }
})
