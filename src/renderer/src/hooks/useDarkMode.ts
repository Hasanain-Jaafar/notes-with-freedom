import { useCallback, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'darkMode'

/** Light/dark theme toggle. Persisted like the layout font (localStorage,
 * not app data — see useLayoutFont). Applied via the `dark` class on <html>,
 * which Tailwind's darkMode: ['class'] and index.css's .dark overrides key
 * off of. useLayoutEffect (not useEffect) so the class lands before the
 * first paint, avoiding a flash of the wrong theme when dark was persisted. */
export function useDarkMode(): [boolean, (next: boolean) => void] {
  const [dark, setDarkState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useLayoutEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  const setDark = useCallback((next: boolean) => {
    setDarkState(next)
    try {
      localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [])

  return [dark, setDark]
}
