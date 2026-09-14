export interface GlobalShortcut {
  id: string
  label: string
  keys: string
}

// Single source of truth for display purposes only — TopBar.tsx's own
// document-level listener is the actual implementation, this just feeds the
// "Keyboard shortcuts" list in Settings. Kept separate from EDITOR_SHORTCUTS
// (lib/editorShortcuts.ts), which drives a real ProseMirror keymap and only
// fires while the editor has focus; these fire anywhere in the app. Unlike
// that file, changing a key combo here doesn't change any actual behavior —
// keep it in sync with TopBar.tsx's listener by hand.
export const GLOBAL_SHORTCUTS: GlobalShortcut[] = [
  {
    id: 'toggleGraphView',
    label: 'Toggle graph view',
    keys: 'Ctrl+G'
  }
]
