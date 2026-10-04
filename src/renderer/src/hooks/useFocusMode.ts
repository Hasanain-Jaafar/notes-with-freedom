import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/useAppStore'

/** Wires up focus mode's side effects — mounted once, in App. The on/off
 * state itself lives in the store so the TopBar/Toolbar buttons and the
 * Editor can all read and toggle it. */
export function useFocusMode(): boolean {
  const focusMode = useAppStore((s) => s.focusMode)
  const setFocusMode = useAppStore((s) => s.setFocusMode)

  // Ctrl+Shift+F toggles, from anywhere — same document-level pattern as
  // TopBar's Ctrl+G and Editor's Ctrl+Shift+O/W (see globalShortcuts.ts).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.key.toLowerCase() !== 'f') return
      e.preventDefault()
      setFocusMode(!useAppStore.getState().focusMode)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setFocusMode])

  // Escape exits too — but Escape already closes popovers, menus, the slash
  // menu and graph view, and most of those listeners don't preventDefault.
  // So wait until every handler has run, then only exit if nothing claimed
  // the key: not defaultPrevented (ProseMirror/slash menu), and no portaled
  // overlay was removed from <body> (toolbar popovers, context menus, graph
  // view). Otherwise one Escape would close the popover AND drop out of
  // focus mode.
  useEffect(() => {
    if (!focusMode) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key !== 'Escape') return
      const overlaysBefore = document.body.childElementCount
      setTimeout(() => {
        if (e.defaultPrevented || document.body.childElementCount !== overlaysBefore) return
        setFocusMode(false)
      }, 0)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [focusMode, setFocusMode])

  // Full screen follows focus mode. Skips the initial (off) render so app
  // startup never touches the window's full-screen state.
  const firstRunRef = useRef(true)
  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false
      return
    }
    void window.api.windowControls.setFocusFullScreen(focusMode)
  }, [focusMode])

  // Leaving full screen some other way (F11) also leaves focus mode — with
  // the top bar hidden, a windowed focus mode would have no title bar to
  // drag and no window buttons.
  useEffect(
    () => window.api.windowControls.onLeftFullScreen(() => setFocusMode(false)),
    [setFocusMode]
  )

  return focusMode
}
