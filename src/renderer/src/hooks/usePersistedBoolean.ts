import { useCallback, useState } from 'react'

/** Boolean UI preference remembered per-viewer across restarts (localStorage
 * — not app data, so it doesn't belong in the DB). Mirrors useResizableWidth. */
export function usePersistedBoolean(
  storageKey: string,
  defaultValue: boolean
): [boolean, (updater: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      return stored === null ? defaultValue : stored === 'true'
    } catch {
      return defaultValue
    }
  })

  const update = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: boolean) => boolean)(prev) : updater
      try {
        localStorage.setItem(storageKey, String(next))
      } catch {
        // ignore (private browsing / storage disabled)
      }
      return next
    })
  }, [storageKey])

  return [value, update]
}
