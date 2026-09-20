import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { useAppStore } from '../store/useAppStore'

interface InternalLinkAttrs {
  pageId: number
  pageTitle: string
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    internalLink: {
      insertInternalLink: (attrs: InternalLinkAttrs) => ReturnType
    }
  }
}

// Obsidian-style page-to-page link — a plain styled span of text (not an
// atomic node/chip), storing only pageId plus a pageTitle snapshot taken at
// insert time. pageTitle is NOT kept in sync with the target page's actual
// current title (an accepted v1 simplicity cut — see CLAUDE.md's Graph view
// section); the link still navigates correctly by pageId regardless.
// PAGE_SAVE_CONTENT (main/db/ipc.ts) walks the saved document for marks of
// this type to build graph view's edges.
export const InternalLink = Mark.create({
  name: 'internalLink',
  // Matches the external Link extension's own setting — without this,
  // typing immediately after a link continues the mark onto new text.
  inclusive: false,

  addAttributes() {
    return {
      pageId: {
        default: null,
        parseHTML: (el) => {
          const raw = el.getAttribute('data-page-id')
          return raw ? Number(raw) : null
        },
        renderHTML: (attrs) => ({ 'data-page-id': attrs.pageId })
      },
      pageTitle: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-page-title'),
        renderHTML: (attrs) => ({ 'data-page-title': attrs.pageTitle })
      }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-internal-link]' }]
  },

  // Deliberately a <span>, not an <a> — the target is an app-internal
  // pageId, meaningless as a real href outside this app. Markdown export
  // (pageExport.ts) degrades this to plain text rather than a broken link.
  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-internal-link': '',
        class: 'internal-link',
        title: 'Ctrl+Click to open'
      }),
      0
    ]
  },

  addCommands() {
    return {
      insertInternalLink:
        (attrs: InternalLinkAttrs) =>
        ({ chain }) =>
          chain()
            .insertContent({
              type: 'text',
              text: attrs.pageTitle,
              marks: [{ type: this.name, attrs }]
            })
            .run()
    }
  },

  // No existing click-to-navigate convention exists anywhere in this
  // codebase to mirror — the external Link mark is fully inert on click
  // (openOnClick: false, no handler). Ctrl/Cmd+click navigates here so a
  // plain click still just places the cursor for editing, consistent with
  // that same "links don't hijack a plain click" choice.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('internalLinkClick'),
        props: {
          handleClick: (view, pos, event) => {
            if (!(event.ctrlKey || event.metaKey)) return false
            const node = view.state.doc.nodeAt(pos)
            const mark = node?.marks.find((m) => m.type.name === 'internalLink')
            const pageId = mark?.attrs.pageId as number | undefined
            if (!pageId) return false
            event.preventDefault()
            void window.api.pages.getLocation(pageId).then((loc) => {
              if (loc) void useAppStore.getState().navigateToPage(loc.notebookId, loc.sectionId, loc.pageId)
            })
            return true
          }
        }
      })
    ]
  }
})
