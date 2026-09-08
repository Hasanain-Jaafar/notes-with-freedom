// Fixed named palette (not a full color wheel), same approach as
// renderer/src/lib/sectionColors.ts's SECTION_COLORS — kept here instead,
// shared, since tag color assignment happens in the main process (on tag
// creation) but the recolor picker also needs the same list in the
// renderer. Unlike sections, tags have no "None" option — a tag is always
// visibly colored.
export interface NamedColor {
  name: string
  hex: string
}

export const TAG_COLORS: NamedColor[] = [
  { name: 'Apple', hex: '#3F7D20' },
  { name: 'Blue', hex: '#1B6EC2' },
  { name: 'Blue Mist', hex: '#7C93AD' },
  { name: 'Cyan', hex: '#00ACC7' },
  { name: 'Green', hex: '#2FA836' },
  { name: 'Lemon', hex: '#9DC10D' },
  { name: 'Magenta', hex: '#C13B8F' },
  { name: 'Orange', hex: '#E2711D' },
  { name: 'Purple', hex: '#6A2E9E' },
  { name: 'Purple Mist', hex: '#8E7CA8' },
  { name: 'Red', hex: '#D22B2B' },
  { name: 'Red Chalk', hex: '#9C3A3A' },
  { name: 'Silver', hex: '#9B9B9B' },
  { name: 'Tan', hex: '#B69368' },
  { name: 'Teal', hex: '#0E9C8D' },
  { name: 'Yellow', hex: '#F0B400' }
]

/** Cycles through the palette for newly created tags. */
export function nextTagColor(existingCount: number): string {
  return TAG_COLORS[existingCount % TAG_COLORS.length].hex
}
