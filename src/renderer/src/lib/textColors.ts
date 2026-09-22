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

// Heading row backgrounds span the whole block width rather than just
// selected text (see headingBackground.ts), so this gets its own, larger
// palette instead of reusing HIGHLIGHT_COLORS — e.g. Gray reads fine as a
// neutral section-header band but would be a strange choice for an inline
// text highlighter pen.
export const HEADING_ROW_COLORS = [
  ...HIGHLIGHT_COLORS,
  { name: 'Gray', hex: '#E5E7EB' },
  { name: 'Red', hex: '#FECACA' },
  { name: 'Teal', hex: '#99F6E4' },
  { name: 'Indigo', hex: '#C7D2FE' }
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
  { name: 'Comic Sans', value: '"Comic Sans MS", cursive' },
  // Self-hosted (see main.tsx) — has Arabic-script glyphs, unlike the other
  // entries above, so it's the one that actually renders RTL note content
  // instead of silently falling back to a system font.
  { name: 'Zain', value: 'Zain, sans-serif' }
]

export const FONT_SIZES = [
  '9px',
  '10px',
  '12px',
  '14px',
  '16px',
  '18px',
  '20px',
  '22px',
  '24px',
  '26px',
  '28px',
  '30px',
  '32px',
  '34px',
  '36px',
  '38px',
  '40px',
  '42px'
]
