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

// `shades` are lighter variants shown stacked under their base swatch in
// FontColorPicker; a color without them just leaves empty cells below it.
export const FONT_COLORS: {
  name: string
  hex: string | null
  shades?: { name: string; hex: string }[]
}[] = [
  { name: 'Default', hex: null },
  {
    name: 'Slate',
    hex: '#334155',
    shades: [
      { name: 'Slate (light)', hex: '#64748B' },
      { name: 'Slate (lighter)', hex: '#94A3B8' }
    ]
  },
  {
    name: 'Red',
    hex: '#DC2626',
    shades: [
      { name: 'Red (light)', hex: '#EF4444' },
      { name: 'Red (lighter)', hex: '#F87171' }
    ]
  },
  {
    name: 'Orange',
    hex: '#EA580C',
    shades: [
      { name: 'Orange (light)', hex: '#F97316' },
      { name: 'Orange (lighter)', hex: '#FB923C' }
    ]
  },
  {
    name: 'Green',
    hex: '#16A34A',
    shades: [
      { name: 'Green (light)', hex: '#22C55E' },
      { name: 'Green (lighter)', hex: '#4ADE80' }
    ]
  },
  {
    name: 'Blue',
    hex: '#2563EB',
    shades: [
      { name: 'Blue (light)', hex: '#3B82F6' },
      { name: 'Blue (lighter)', hex: '#60A5FA' }
    ]
  },
  {
    name: 'Purple',
    hex: '#7C3AED',
    shades: [
      { name: 'Purple (light)', hex: '#8B5CF6' },
      { name: 'Purple (lighter)', hex: '#A78BFA' }
    ]
  }
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
  { name: 'Zain', value: 'Zain, sans-serif' },
  // Self-hosted too (main.tsx). The plain family name comes first so
  // pageToDocx.ts's toDocxFontFamily (which keeps only the first name) hands
  // Word a real font name rather than Fontsource's "… Variable" alias — the
  // browser just skips it (not installed) and lands on the bundled one.
  { name: 'Caveat', value: 'Caveat, "Caveat Variable", cursive' },
  { name: 'Dancing Script', value: '"Dancing Script", "Dancing Script Variable", cursive' },
  { name: 'Playfair Display', value: '"Playfair Display", "Playfair Display Variable", serif' },
  { name: 'Space Grotesk', value: '"Space Grotesk", "Space Grotesk Variable", sans-serif' },
  { name: 'Special Elite', value: '"Special Elite", "Courier New", monospace' },
  // Arabic-script faces, alongside Zain: Reem Kufi is a geometric Kufi
  // display face, Amiri a classic Naskh book face.
  { name: 'Reem Kufi', value: '"Reem Kufi", "Reem Kufi Variable", sans-serif' },
  { name: 'Amiri', value: 'Amiri, serif' }
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
