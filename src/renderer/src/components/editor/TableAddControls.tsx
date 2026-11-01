import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useTooltip } from '../Tooltip'

const HIDE_DELAY_MS = 250
// Gap between the table's edge and its "+" bar, and the bar's thickness.
const GAP_PX = 4
const BAR_PX = 16

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Appends a column/row at the table's far edge, wherever the cursor is — set
 * the selection into the last column's (or last row's) cell first, since
 * addColumnAfter/addRowAfter act relative to the selected cell. */
function addAtEnd(editor: Editor, wrapper: HTMLElement, kind: 'column' | 'row'): void {
  const firstCell = wrapper.querySelector('td, th')
  if (!firstCell) return
  const $pos = editor.state.doc.resolve(editor.view.posAtDOM(firstCell, 0))
  let depth = $pos.depth
  while (depth > 0 && $pos.node(depth).type.name !== 'table') depth--
  if (depth === 0) return
  const map = TableMap.get($pos.node(depth))
  const cellPos =
    $pos.start(depth) + (kind === 'column' ? map.map[map.width - 1] : map.map[(map.height - 1) * map.width])
  const chain = editor
    .chain()
    .focus()
    .command(({ tr }) => {
      tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)))
      return true
    })
  void (kind === 'column' ? chain.addColumnAfter() : chain.addRowAfter()).run()
}

/** Notion-style "+" bars along a table's right and bottom edges, so adding a
 * column/row doesn't mean a trip up to the toolbar. Shown for the hovered
 * table, falling back to the one holding the cursor. Positioned absolutely
 * inside `container` (the page's padded content column — its px-8 gutter is
 * the room the right-edge bar sits in), not inside the editor's own
 * overflow-x-auto wrapper, which would clip anything past the table's edge. */
export function TableAddControls({
  editor,
  container
}: {
  editor: Editor
  container: HTMLElement | null
}): React.JSX.Element | null {
  const [hovered, setHovered] = useState<HTMLElement | null>(null)
  const [box, setBox] = useState<Box | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const columnTooltip = useTooltip('Add column', 'right')
  const rowTooltip = useTooltip('Add row')

  const selectedTablePos = useEditorState({
    editor,
    selector: ({ editor }) => {
      const { $from } = editor.state.selection
      for (let d = $from.depth; d > 0; d--) {
        if ($from.node(d).type.name === 'table') return $from.before(d)
      }
      return null
    }
  })
  const selectedWrapper =
    selectedTablePos !== null ? (editor.view.nodeDOM(selectedTablePos) as HTMLElement | null) : null
  const wrapper = hovered?.isConnected ? hovered : selectedWrapper

  // Hover tracking on the whole content column, not just the table — the
  // bars sit a few px outside the table, so leaving the table on the way to
  // one only starts a short hide delay that reaching the bar cancels.
  useEffect(() => {
    if (!container) return
    const clearHideTimer = (): void => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    const scheduleHide = (): void => {
      clearHideTimer()
      hideTimerRef.current = setTimeout(() => setHovered(null), HIDE_DELAY_MS)
    }
    function onMouseMove(e: MouseEvent): void {
      const target = e.target as Element
      if (target.closest('[data-table-add-control]')) return clearHideTimer()
      const table = target.closest<HTMLElement>('.tableWrapper')
      if (table && editor.view.dom.contains(table)) {
        clearHideTimer()
        setHovered(table)
      } else {
        scheduleHide()
      }
    }
    container.addEventListener('mousemove', onMouseMove)
    container.addEventListener('mouseleave', scheduleHide)
    return () => {
      clearHideTimer()
      container.removeEventListener('mousemove', onMouseMove)
      container.removeEventListener('mouseleave', scheduleHide)
    }
  }, [container, editor])

  // Re-measured whenever the table or the content around it can have moved:
  // its own size (typing, added rows/columns), the content column's size
  // (text above it growing), any doc change, or scrolling a wide table.
  useLayoutEffect(() => {
    if (!wrapper || !container) {
      setBox(null)
      return
    }
    function measure(): void {
      const table = wrapper!.querySelector('table')
      if (!table) return setBox(null)
      const c = container!.getBoundingClientRect()
      const t = table.getBoundingClientRect()
      const w = wrapper!.getBoundingClientRect()
      // A table wider than the page scrolls inside its wrapper — clip to the
      // visible part so the column bar stays at the edge you can see.
      const left = Math.max(t.left, w.left)
      const right = Math.min(t.right, w.right)
      setBox({ top: t.top - c.top, left: left - c.left, width: right - left, height: t.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(wrapper)
    observer.observe(container)
    editor.on('update', measure)
    wrapper.addEventListener('scroll', measure)
    return () => {
      observer.disconnect()
      editor.off('update', measure)
      wrapper.removeEventListener('scroll', measure)
    }
  }, [wrapper, container, editor])

  if (!wrapper || !box || !editor.isEditable) return null

  const barClass =
    'absolute z-10 flex items-center justify-center rounded-sm bg-muted/70 text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary'

  return (
    <>
      <button
        type="button"
        data-table-add-control
        aria-label="Add column"
        // Keeps focus (and the selection) in the editor — see ToolbarButton.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          columnTooltip.hide()
          addAtEnd(editor, wrapper, 'column')
        }}
        onMouseEnter={(e) => columnTooltip.show(e.currentTarget)}
        onMouseLeave={columnTooltip.hide}
        className={barClass}
        style={{ top: box.top, left: box.left + box.width + GAP_PX, width: BAR_PX, height: box.height }}
      >
        <Plus size={12} />
      </button>
      <button
        type="button"
        data-table-add-control
        aria-label="Add row"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          rowTooltip.hide()
          addAtEnd(editor, wrapper, 'row')
        }}
        onMouseEnter={(e) => rowTooltip.show(e.currentTarget)}
        onMouseLeave={rowTooltip.hide}
        className={barClass}
        style={{ top: box.top + box.height + GAP_PX, left: box.left, width: box.width, height: BAR_PX }}
      >
        <Plus size={12} />
      </button>
      {columnTooltip.tooltip}
      {rowTooltip.tooltip}
    </>
  )
}
