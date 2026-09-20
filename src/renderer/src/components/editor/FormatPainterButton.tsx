import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Paintbrush } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { useDebouncedCallback } from '../../hooks/useDebouncedCallback'

interface CapturedStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  code: boolean
  color: string | null
  fontFamily: string | null
  fontSize: string | null
  highlight: string | null
}

function captureStyle(editor: Editor): CapturedStyle {
  const textStyle = editor.getAttributes('textStyle')
  const highlight = editor.getAttributes('highlight')
  return {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    code: editor.isActive('code'),
    color: (textStyle.color as string | undefined) ?? null,
    fontFamily: (textStyle.fontFamily as string | undefined) ?? null,
    fontSize: (textStyle.fontSize as string | undefined) ?? null,
    highlight: (highlight.color as string | undefined) ?? null
  }
}

// Explicit unset-then-set for exactly the marks a format painter cares
// about, rather than unsetAllMarks() first — that would also strip link/
// internalLink marks from the target text, silently breaking a hyperlink
// just because its formatting got painted over. This way a link stays a
// link; only its bold/color/etc. change.
function applyStyle(editor: Editor, style: CapturedStyle): void {
  let chain = editor
    .chain()
    .focus()
    .unsetBold()
    .unsetItalic()
    .unsetUnderline()
    .unsetStrike()
    .unsetCode()
    .unsetColor()
    .unsetFontFamily()
    .unsetFontSize()
    .unsetHighlight()
  if (style.bold) chain = chain.setBold()
  if (style.italic) chain = chain.setItalic()
  if (style.underline) chain = chain.setUnderline()
  if (style.strike) chain = chain.setStrike()
  if (style.code) chain = chain.setCode()
  if (style.color) chain = chain.setColor(style.color)
  if (style.fontFamily) chain = chain.setFontFamily(style.fontFamily)
  if (style.fontSize) chain = chain.setFontSize(style.fontSize)
  if (style.highlight) chain = chain.setHighlight({ color: style.highlight })
  chain.run()
}

/** Word/Docs-style format painter: click to copy the character formatting
 * at the current selection (or cursor), then select any other text to apply
 * it there — a single copy-then-paste action, not a sticky mode, matching
 * the reference apps' default (non-double-click) behavior. */
export function FormatPainterButton({ editor }: { editor: Editor }): React.JSX.Element {
  // Mirrored into a ref alongside the state: the selectionUpdate listener
  // below is registered once and lives for the component's whole lifetime,
  // so it needs a value that's current at call time, not the one captured
  // when the effect last ran (a plain closure over `armed` state would be
  // stale here).
  const armedRef = useRef(false)
  const capturedRef = useRef<CapturedStyle | null>(null)
  const [armed, setArmed] = useState(false)

  function disarm(): void {
    armedRef.current = false
    capturedRef.current = null
    setArmed(false)
  }

  // Debounced rather than acting on the very first selectionUpdate: a
  // mouse-drag selection (and Shift+Arrow keyboard selection) fires this
  // event continuously as the selection grows — from, to A, then A, to B,
  // then A, to C... — not just once at the end. Applying immediately on
  // the first firing painted only the single character selected so far,
  // then disarmed before the drag/key-hold had finished extending. Waiting
  // for a short quiet period means it only fires once the selection has
  // actually settled, covering both the mouse-drag and keyboard cases the
  // same way. useDebouncedCallback's returned function gets a new identity
  // every render, but always dispatches to the latest callback via its own
  // internal ref — safe to call from the effect below without depending on
  // it (same reasoning as GraphView.tsx's reheatForDistanceChange).
  const debouncedApply = useDebouncedCallback(() => {
    if (!armedRef.current || !capturedRef.current) return
    const { from, to } = editor.state.selection
    if (from === to) return
    const style = capturedRef.current
    disarm()
    applyStyle(editor, style)
  }, 250)

  useEffect(() => {
    // Fires on every selection change, including plain caret moves — the
    // debounced callback itself re-checks armed/from!==to once it actually
    // runs, so this just needs to kick the timer on every change.
    function onSelectionUpdate(): void {
      if (armedRef.current) debouncedApply()
    }
    editor.on('selectionUpdate', onSelectionUpdate)
    return () => {
      editor.off('selectionUpdate', onSelectionUpdate)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  useEffect(() => {
    if (!armed) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') disarm()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed])

  return (
    <ToolbarButton
      active={armed}
      title={armed ? 'Select text to apply the copied style (Esc to cancel)' : 'Copy style'}
      onClick={() => {
        if (armed) {
          disarm()
          return
        }
        capturedRef.current = captureStyle(editor)
        armedRef.current = true
        setArmed(true)
      }}
    >
      <Paintbrush size={15} />
    </ToolbarButton>
  )
}
