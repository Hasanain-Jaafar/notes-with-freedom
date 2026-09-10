import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const MIN_ROW_HEIGHT = 24
// How close (in px) the pointer must be to a row's bottom border before the
// drag handle appears.
const HOVER_THRESHOLD = 6

/**
 * prosemirror-tables ships column-width dragging (via Table.configure({
 * resizable: true })) but has no row-height equivalent — rows always
 * auto-fit their tallest cell, the same as Notion/OneNote/Google Docs. This
 * adds an Excel-style drag handle on each row's bottom border and stores
 * the chosen height as a `height` attribute on the tableRow node, so it
 * persists across save/reload like any other node attribute.
 *
 * The handle is a single floating element appended to document.body rather
 * than a NodeView-injected child of the <tr> — ProseMirror's NodeView
 * contentDOM expects a 1:1 match between a row's DOM children and its cell
 * nodes, so injecting an extra handle div as a literal child of <tr> risks
 * confusing that reconciliation. A body-level overlay, positioned from the
 * hovered row's bounding rect, sidesteps that entirely.
 */
export const TableRowResize = Extension.create({
  name: 'tableRowResize',

  addGlobalAttributes() {
    return [
      {
        types: ['tableRow'],
        attributes: {
          height: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const height = element.style.height
              return height ? Number.parseInt(height, 10) : null
            },
            renderHTML: (attributes: { height?: number | null }) =>
              attributes.height ? { style: `height: ${attributes.height}px` } : {}
          }
        }
      }
    ]
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tableRowResize'),
        view: (editorView) => new RowResizeView(editorView)
      })
    ]
  }
})

class RowResizeView {
  private readonly view: EditorView
  private readonly handle: HTMLDivElement
  private activeRow: HTMLTableRowElement | null = null
  private dragging = false
  private dragStartY = 0
  private dragStartHeight = 0
  private dragRowPos = -1

  constructor(view: EditorView) {
    this.view = view
    this.handle = document.createElement('div')
    this.handle.className = 'table-row-resize-handle'
    this.handle.style.display = 'none'
    this.handle.contentEditable = 'false'
    document.body.appendChild(this.handle)

    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseLeave = this.onMouseLeave.bind(this)
    this.onHandlePointerDown = this.onHandlePointerDown.bind(this)
    this.onPointerMove = this.onPointerMove.bind(this)
    this.onPointerUp = this.onPointerUp.bind(this)

    view.dom.addEventListener('mousemove', this.onMouseMove)
    view.dom.addEventListener('mouseleave', this.onMouseLeave)
    this.handle.addEventListener('pointerdown', this.onHandlePointerDown)
  }

  private onMouseMove(event: MouseEvent): void {
    if (this.dragging) return
    const target = event.target as HTMLElement
    const table = target.closest('table')
    if (!table || !this.view.dom.contains(table)) {
      this.hideHandle()
      return
    }

    // Don't trust which row the hit-test landed on: at a shared border
    // between two rows the browser can resolve the target to either the
    // row above (whose relevant edge is its bottom) or the row below
    // (whose relevant edge is its top, not bottom) depending on how the
    // collapsed border paints. Scan every row's own bottom edge instead
    // and pick whichever is actually nearest the cursor.
    let closestRow: HTMLTableRowElement | null = null
    let closestDist = HOVER_THRESHOLD + 1
    for (const row of table.querySelectorAll('tr')) {
      const rect = row.getBoundingClientRect()
      const dist = Math.abs(event.clientY - rect.bottom)
      if (dist < closestDist) {
        closestDist = dist
        closestRow = row
      }
    }

    if (!closestRow) {
      this.hideHandle()
      return
    }
    this.showHandle(closestRow, closestRow.getBoundingClientRect())
  }

  private onMouseLeave(): void {
    this.hideHandle()
  }

  private showHandle(row: HTMLTableRowElement, rect: DOMRect): void {
    this.activeRow = row
    this.handle.style.display = 'block'
    this.handle.style.left = `${rect.left}px`
    this.handle.style.width = `${rect.width}px`
    this.handle.style.top = `${rect.bottom - 3}px`
  }

  private hideHandle(): void {
    if (this.dragging) return
    this.activeRow = null
    this.handle.style.display = 'none'
  }

  private onHandlePointerDown(event: PointerEvent): void {
    if (!this.activeRow) return
    event.preventDefault()
    const row = this.activeRow
    const $pos = this.view.state.doc.resolve(this.view.posAtDOM(row, 0))
    this.dragRowPos = $pos.before($pos.depth)
    this.dragging = true
    this.dragStartY = event.clientY
    this.dragStartHeight = row.getBoundingClientRect().height
    this.handle.classList.add('is-dragging')
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
  }

  private nextHeight(clientY: number): number {
    return Math.max(MIN_ROW_HEIGHT, Math.round(this.dragStartHeight + (clientY - this.dragStartY)))
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.activeRow) return
    const next = this.nextHeight(event.clientY)
    this.activeRow.style.height = `${next}px`
    this.handle.style.top = `${this.activeRow.getBoundingClientRect().bottom - 3}px`
  }

  private onPointerUp(event: PointerEvent): void {
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.handle.classList.remove('is-dragging')
    this.dragging = false

    if (this.dragRowPos >= 0) {
      const next = this.nextHeight(event.clientY)
      const node = this.view.state.doc.nodeAt(this.dragRowPos)
      if (node) {
        const tr = this.view.state.tr.setNodeMarkup(this.dragRowPos, undefined, {
          ...node.attrs,
          height: next
        })
        this.view.dispatch(tr)
      }
    }
    this.dragRowPos = -1
    this.hideHandle()
  }

  destroy(): void {
    this.view.dom.removeEventListener('mousemove', this.onMouseMove)
    this.view.dom.removeEventListener('mouseleave', this.onMouseLeave)
    this.handle.removeEventListener('pointerdown', this.onHandlePointerDown)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    this.handle.remove()
  }
}
