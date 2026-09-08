/** Converts "#RRGGBB" to "rgba(r, g, b, alpha)" — used to make a tag's own
 * saturated palette hex read as a soft pastel pill background (full-strength
 * hex as fill would fight the small-pill, Notion-style properties design),
 * while the hex itself stays legible as the pill's text color. */
export function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return `rgba(148, 163, 184, ${alpha})` // neutral gray fallback for a malformed hex
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
