import { useCallback, useRef, useState } from 'react'

/** Column width that's draggable via ResizeHandle and remembered per-viewer
 * across restarts (localStorage — not app data, so it doesn't belong in the DB). */
export function useResizableWidth(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number
): [number, (deltaX: number) => void, () => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey))
      return stored >= min && stored <= max ? stored : defaultWidth
    } catch {
      return defaultWidth
    }
  })
  // Mirrors `width` synchronously (state updates aren't visible until the
  // next render) so commit() below can persist the latest value the instant
  // dragging ends, without waiting on React to re-render first.
  const widthRef = useRef(width)

  const resize = useCallback(
    (deltaX: number) => {
      setWidth((prev) => {
        const next = Math.min(max, Math.max(min, prev + deltaX))
        widthRef.current = next
        return next
      })
    },
    [min, max]
  )

  // Split out from resize() on purpose: writing to localStorage on every
  // single pointermove during a drag was blocking enough to make the drag
  // itself visibly stutter. Called once, from ResizeHandle's pointerup.
  const commit = useCallback(() => {
    try {
      localStorage.setItem(storageKey, String(widthRef.current))
    } catch {
      // ignore (private browsing / storage disabled)
    }
  }, [storageKey])

  return [width, resize, commit]
}
