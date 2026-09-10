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
    return shortcuts
  }
})
