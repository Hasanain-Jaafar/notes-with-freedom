import { useCallback, useLayoutEffect, useState } from 'react'

export type LayoutFont = 'inter' | 'geist'

const STORAGE_KEY = 'layoutFont'
const VALID: LayoutFont[] = ['inter', 'geist']

/** The app's overall UI font (sidebar, menus, buttons, Settings panel
 * itself) — separate from the note editor's own per-selection font picker.
 * Persisted like the sidebar's width/collapse prefs (localStorage, not app
 * data — see useResizableWidth/usePersistedBoolean). Applied via a
 * data-app-font attribute on <html> that index.css's --font-sans var reads,
 * rather than threading the value through every component that renders
 * text. useLayoutEffect (not useEffect) so the attribute lands before the
 * first paint, avoiding a flash of the default font when a non-default
 * choice was persisted. */
export function useLayoutFont(): [LayoutFont, (font: LayoutFont) => void] {
  const [font, setFontState] = useState<LayoutFont>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return VALID.includes(stored as LayoutFont) ? (stored as LayoutFont) : 'inter'
    } catch {
      return 'inter'
    }
  })

  useLayoutEffect(() => {
    document.documentElement.dataset.appFont = font
  }, [font])

  const setFont = useCallback((next: LayoutFont) => {
    setFontState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [])

  return [font, setFont]
}
