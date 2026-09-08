/** Formats a page's created_at/updated_at value. Handles both timestamp
 * shapes the DB produces: sql.js's CURRENT_TIMESTAMP default, "YYYY-MM-DD
 * HH:MM:SS" (UTC, no offset — needs "T" + "Z" added before Date can parse
 * it), and the full ISO string PAGE_SAVE_CONTENT/PAGE_SAVE_PROPERTIES write
 * explicitly via new Date().toISOString() (already has "T", already ends
 * in "Z" — appending another would produce an unparseable "...ZZ"). */
export function formatTimestamp(raw: string): string {
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date)
}
