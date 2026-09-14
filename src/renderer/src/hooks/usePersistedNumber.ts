import { useCallback, useState } from 'react'

/** Numeric UI preference remembered per-viewer across restarts (localStorage
 * — not app data, so it doesn't belong in the DB). Mirrors usePersistedBoolean. */
export function usePersistedNumber(
  storageKey: string,
  defaultValue: number
): [number, (updater: number | ((prev: number) => number)) => void] {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored === null) return defaultValue
      const parsed = Number(stored)
      return Number.isFinite(parsed) ? parsed : defaultValue
    } catch {
      return defaultValue
    }
  })

  const update = useCallback((updater: number | ((prev: number) => number)) => {
    setValue((prev) => {
      const next = typeof updater === 'function' ? (updater as (p: number) => number)(prev) : updater
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
