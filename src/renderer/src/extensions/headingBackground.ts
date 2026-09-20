import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    headingBackground: {
      setHeadingBackground: (color: string) => ReturnType
      unsetHeadingBackground: () => ReturnType
    }
  }
}

// A node attribute on `heading` (not a text mark, unlike Highlight/Color) —
// the colored band in OneNote/Notion-style "highlighted heading rows" spans
// the whole block regardless of what text is selected, which only a
// node-level attribute can express. Same pattern as fontSize.ts (a small
// Extension adding a global attribute to an existing node/mark type rather
// than redefining the node), just scoped to 'heading' instead of 'textStyle'.
export const HeadingBackground = Extension.create({
  name: 'headingBackground',

  addGlobalAttributes() {
    return [
      {
        types: ['heading'],
        attributes: {
          background: {
            default: null,
            parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
            // class + a --row-bg custom property, not a plain inline
            // background-color, so index.css's .heading-row-bg rule can add
            // the padding/rounded-corner/negative-margin band styling
            // (same --row-bg custom-property pattern SectionsColumn.tsx and
            // PagesColumn.tsx already use for their own selected-row tint).
            renderHTML: (attributes: { background?: string | null }) => {
              if (!attributes.background) return {}
              return { class: 'heading-row-bg', style: `--row-bg: ${attributes.background}` }
            }
          }
        }
      }
    ]
  },

  addCommands() {
    return {
      setHeadingBackground:
        (color: string) =>
        ({ commands }) =>
          commands.updateAttributes('heading', { background: color }),
      unsetHeadingBackground:
        () =>
        ({ commands }) =>
          commands.updateAttributes('heading', { background: null })
    }
  }
})
