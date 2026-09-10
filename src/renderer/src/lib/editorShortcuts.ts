import type { Editor } from '@tiptap/core'

export interface EditorShortcut {
  id: string
  label: string
  // Windows-only app (see CLAUDE.md) — no Mac-symbol variant needed.
  keys: string
  // TipTap/ProseMirror keymap string — 'Mod' maps to Ctrl on Windows/Linux.
  tiptapKeys: string
  run: (editor: Editor) => boolean
}

// Single source of truth for every custom editor keyboard shortcut (i.e.
// anything beyond StarterKit's own defaults like Ctrl+B). Feeds both the
// actual keymap (see extensions/EditorShortcuts.ts) and the "Keyboard
// shortcuts" list in Settings — add a new shortcut here once and it shows
// up in both places.
export const EDITOR_SHORTCUTS: EditorShortcut[] = [
  {
    id: 'divider',
    label: 'Insert divider',
    keys: 'Ctrl+Shift+H',
    tiptapKeys: 'Mod-Shift-h',
    run: (editor) => editor.chain().focus().setHorizontalRule().run()
  }
]
