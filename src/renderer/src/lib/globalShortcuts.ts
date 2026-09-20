interface GlobalShortcut {
  id: string
  label: string
  keys: string
}

// Single source of truth for display purposes only — a plain document-level
// listener next to wherever the toggled state actually lives (TopBar.tsx
// for graph view; Editor.tsx for table of contents/full width, since both
// need the live `editor` instance) is the real implementation; this just
// feeds the "Keyboard shortcuts" list in Settings. Kept separate from
// EDITOR_SHORTCUTS (lib/editorShortcuts.ts), which drives a real ProseMirror
// keymap and only fires while the editor has focus; these fire anywhere in
// the app. Unlike that file, changing a key combo here doesn't change any
// actual behavior — keep it in sync with the real listener by hand.
export const GLOBAL_SHORTCUTS: GlobalShortcut[] = [
  {
    id: 'toggleGraphView',
    label: 'Toggle graph view',
    keys: 'Ctrl+G'
  },
  {
    id: 'toggleDarkMode',
    label: 'Toggle dark mode',
    keys: 'Ctrl+Shift+D'
  },
  {
    id: 'toggleTableOfContents',
    label: 'Toggle table of contents',
    keys: 'Ctrl+Shift+O'
  },
  {
    id: 'toggleFullWidth',
    label: 'Toggle full width',
    keys: 'Ctrl+Shift+W'
  }
]
