import { Extension } from '@tiptap/core'
import { EDITOR_SHORTCUTS } from '../lib/editorShortcuts'

// Binds every entry in lib/editorShortcuts.ts's shared list to its actual
// TipTap keymap string — kept as its own tiny extension (rather than folded
// into EDITOR_EXTENSIONS) because, like SlashCommand, it's part of the live
// editing surface only and adds no node/mark types the export pipeline's
// headless schema would need.
export const EditorShortcuts = Extension.create({
  name: 'editorShortcuts',

  addKeyboardShortcuts() {
    const shortcuts: Record<string, () => boolean> = {}
    for (const shortcut of EDITOR_SHORTCUTS) {
      shortcuts[shortcut.tiptapKeys] = () => shortcut.run(this.editor)
    }

    // Pressing Enter at the end of a styled line (font family/size/color —
    // all textStyle mark attributes) dropped the styling on the new line:
    // ProseMirror's ResolvedPos.marks() returns no marks at all for a
    // freshly-split, still-empty paragraph, so the *next* typed character
    // fell back to the theme default font instead of continuing the line
    // above. TipTap's splitBlock command has a built-in fix for exactly
    // this — { keepMarks: true } — which the default StarterKit keymap
    // doesn't opt into. Only overrides Enter for the plain "typing a normal
    // paragraph/heading" case (depth 1 = a direct child of the doc, not
    // nested in a list item/table cell/blockquote/code block) and defers
    // (returns false) for everything else, so ListItem/TaskItem's own
    // Enter handling (new list item, not just a mark-preserving split)
    // and codeBlock's newline-in-place behavior are untouched. Extensions
    // registered later win a shortcut conflict, and this one is added last
    // in EDITOR_EXTENSIONS, so it gets first refusal on every Enter press.
    shortcuts.Enter = () => {
      const { $from } = this.editor.state.selection
      if ($from.depth !== 1) return false
      const parentType = $from.parent.type.name
      if (parentType !== 'paragraph' && parentType !== 'heading') return false
      return this.editor.commands.first(({ commands }) => [
        () => commands.newlineInCode(),
        () => commands.createParagraphNear(),
        () => commands.liftEmptyBlock(),
        () => commands.splitBlock({ keepMarks: true })
      ])
    }

    return shortcuts
  }
})
