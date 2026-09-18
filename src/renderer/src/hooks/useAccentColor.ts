import { useCallback, useLayoutEffect, useState } from 'react'

export type AccentColor = 'blue' | 'purple' | 'green' | 'rose' | 'amber' | 'teal'

const STORAGE_KEY = 'accentColor'
const VALID: AccentColor[] = ['blue', 'purple', 'green', 'rose', 'amber', 'teal']

/** The app's single sparingly-used accent color (active states/highlights,
 * per CLAUDE.md's design guidelines) — a fixed small swatch palette, not a
 * color wheel. Persisted and applied the same way as useLayoutFont.ts: a
 * data-app-accent attribute on <html> that index.css's --primary/--ring vars
 * read, so every text-primary/bg-primary/ring-primary utility class updates
 * app-wide with no per-component changes. useLayoutEffect avoids a flash of
 * the default blue when a non-default choice was persisted. */
export function useAccentColor(): [AccentColor, (color: AccentColor) => void] {
  const [color, setColorState] = useState<AccentColor>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return VALID.includes(stored as AccentColor) ? (stored as AccentColor) : 'blue'
    } catch {
      return 'blue'
    }
  })

  useLayoutEffect(() => {
    document.documentElement.dataset.appAccent = color
  }, [color])

  const setColor = useCallback((next: AccentColor) => {
    setColorState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [])

  return [color, setColor]
}
