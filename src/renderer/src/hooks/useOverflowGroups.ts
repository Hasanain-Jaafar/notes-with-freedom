import { useLayoutEffect, useRef, useState } from 'react'

const GAP = 4 // px — matches the toolbar's gap-x-1
const TOGGLE_WIDTH = 32 // px — reserved space for the "more" chevron button

/** Measures a hidden clone of `groupCount` items against the container's
 * width and reports how many fit on one line before the rest should be
 * tucked behind an overflow toggle. Re-measures on container resize (e.g.
 * the sidebar being dragged wider/narrower). */
export function useOverflowGroups(groupCount: number): {
  containerRef: React.RefObject<HTMLDivElement | null>
  measureRef: React.RefObject<HTMLDivElement | null>
  visibleCount: number
} {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState(groupCount)

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return

    function recalc(): void {
      const available = container!.clientWidth
      const widths = Array.from(measure!.children).map((el) => (el as HTMLElement).offsetWidth)
      const total = widths.reduce((sum, w) => sum + w, 0) + GAP * Math.max(0, widths.length - 1)

      if (total <= available) {
        setVisibleCount(widths.length)
        return
      }

      const budget = available - TOGGLE_WIDTH
      let used = 0
      let count = 0
      for (let i = 0; i < widths.length; i++) {
        const next = used + (i > 0 ? GAP : 0) + widths[i]
        if (next > budget) break
        used = next
        count++
      }
      setVisibleCount(count)
    }

    recalc()
    const ro = new ResizeObserver(recalc)
    ro.observe(container)
    return () => ro.disconnect()
  }, [groupCount])

  return { containerRef, measureRef, visibleCount }
}
