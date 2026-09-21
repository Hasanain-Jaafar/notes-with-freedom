import { Extension } from '@tiptap/core'

// TipTap core (v3) already ships a built-in `setTextDirection(direction,
// position?)` command that walks every non-text node in the selection and
// stamps `dir` onto it directly via setNodeMarkup — no custom command needed
// here, and Toolbar.tsx calls it as-is. But ProseMirror only allows setting
// attributes a node's schema actually declares, so the node types below
// still need `dir` registered as a valid attribute before that command can
// do anything. Rendered as the real HTML `dir` attribute (not a CSS style)
// — that's what gets contentEditable's native RTL behavior right: caret
// movement, selection direction, and (via normal DOM inheritance, no extra
// CSS needed) list marker/checkbox side and default text alignment for
// everything nested inside. dir set on a list/blockquote flips the whole
// block as a unit; children inherit direction natively, so they don't need
// to be listed separately (see the `types` list in editorExtensions.ts).
export const TextDirection = Extension.create({
  name: 'textDirection',

  addOptions() {
    return { types: [] as string[] }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          dir: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const dir = element.getAttribute('dir')
              return dir === 'rtl' || dir === 'ltr' ? dir : null
            },
            renderHTML: (attributes: { dir?: 'ltr' | 'rtl' | null }) => {
              if (!attributes.dir) return {}
              return { dir: attributes.dir }
            }
          }
        }
      }
    ]
  }
})
