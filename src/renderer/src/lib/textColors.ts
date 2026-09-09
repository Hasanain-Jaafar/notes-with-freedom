// Small fixed palettes (not a full color wheel) for the toolbar's highlight
// and font-color pickers — distinct from the section-color palette, which is
// a separate concept scoped to sections only.

export const HIGHLIGHT_COLORS = [
  { name: 'Yellow', hex: '#FDE68A' },
  { name: 'Green', hex: '#BBF7D0' },
  { name: 'Blue', hex: '#BFDBFE' },
  { name: 'Pink', hex: '#FBCFE8' },
  { name: 'Orange', hex: '#FED7AA' },
  { name: 'Purple', hex: '#E9D5FF' }
]

export const FONT_COLORS = [
  { name: 'Default', hex: null },
  { name: 'Slate', hex: '#334155' },
  { name: 'Red', hex: '#DC2626' },
  { name: 'Orange', hex: '#EA580C' },
  { name: 'Green', hex: '#16A34A' },
  { name: 'Blue', hex: '#2563EB' },
  { name: 'Purple', hex: '#7C3AED' },
  { name: 'Pink', hex: '#DB2777' }
]

export const FONT_FAMILIES = [
  { name: 'Default', value: null },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Serif', value: 'Georgia, serif' },
  { name: 'Monospace', value: '"JetBrains Mono", monospace' },
  { name: 'Comic Sans', value: '"Comic Sans MS", cursive' }
]

export const FONT_SIZES = ['12px', '14px', '16px', '20px', '24px', '32px', '40px', '48px']
