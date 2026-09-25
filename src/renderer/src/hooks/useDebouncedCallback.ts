import { useEffect, useRef } from 'react'

export type DebouncedCallback<Args extends unknown[]> = ((...args: Args) => void) & {
  /** Runs the pending call (if any) right now instead of waiting out the delay. */
  flush: () => void
}

/** Batches rapid calls (e.g. keystrokes) into a single trailing call after `delayMs`
 * of quiet — used so page content is never written to disk on every keystroke. */
export function useDebouncedCallback<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number
): DebouncedCallback<Args> {
  const callbackRef = useRef(callback)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingArgsRef = useRef<Args | null>(null)

  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function flush(): void {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const args = pendingArgsRef.current
    pendingArgsRef.current = null
    if (args) callbackRef.current(...args)
  }

  const debounced = (...args: Args): void => {
    if (timerRef.current) clearTimeout(timerRef.current)
    pendingArgsRef.current = args
    timerRef.current = setTimeout(flush, delayMs)
  }
  return Object.assign(debounced, { flush })
}
