export interface NamedColor {
  name: string
  hex: string | null
}

// Fixed named palette (not a full color wheel) — mirrors OneNote's own
// section-color list. "None" clears a section back to the theme-neutral
// default rather than pointing at a visible swatch.
export const SECTION_COLORS: NamedColor[] = [
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
  { name: 'Yellow', hex: '#F0B400' },
  { name: 'None', hex: null }
]

/** Cycles through the real colors (skipping "None") for newly created sections. */
export function nextSectionColor(existingCount: number): string {
  const palette = SECTION_COLORS.filter((c): c is { name: string; hex: string } => c.hex !== null)
  return palette[existingCount % palette.length].hex
}

/** Matches the app's own --primary accent (see index.css) — used as the
 * selected-row tint for a "None"-colored section (and its pages) so every
 * section still reads as clearly selected, not just the ones with a custom
 * color assigned. */
export const DEFAULT_ACCENT_HEX = '#3B82F6'
