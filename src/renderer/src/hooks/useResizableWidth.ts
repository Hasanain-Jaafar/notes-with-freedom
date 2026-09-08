import { useCallback, useState } from 'react'

/** Column width that's draggable via ResizeHandle and remembered per-viewer
 * across restarts (localStorage — not app data, so it doesn't belong in the DB). */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number
): [number, (deltaX: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey))
      return stored >= min && stored <= max ? stored : defaultWidth
    } catch {
      return defaultWidth
    }
  })

  const resize = useCallback(
    (deltaX: number) => {
      setWidth((prev) => {
        const next = Math.min(max, Math.max(min, prev + deltaX))
        try {
          localStorage.setItem(storageKey, String(next))
        } catch {
          // ignore (private browsing / storage disabled)
        }
        return next
      })
    },
    [storageKey, min, max]
  )

  return [width, resize]
}
