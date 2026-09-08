import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, X, ChevronRight, Download } from 'lucide-react'
import { cn } from '../lib/utils'
import { ExportSubmenuItems, type ExportFormat } from './ExportSubmenuItems'

interface PageContextMenuProps {
  x: number
  y: number
  onRename: () => void
  onDelete: () => void
  onExport: (format: ExportFormat) => void
  onClose: () => void
}

const itemClass =
  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent'

// Modeled directly on SectionContextMenu.tsx — same portal/positioning/
// click-outside/Escape behavior and glass styling, just a shorter action
// list (pages don't have a color picker or nested New Section/New page).
export function PageContextMenu({
  x,
  y,
  onRename,
  onDelete,
  onExport,
  onClose
}: PageContextMenuProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false)

  useEffect(() => {
    function onPointerDown(e: PointerEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose()
    }
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const overflowX = rect.right - window.innerWidth
    const overflowY = rect.bottom - window.innerHeight
    if (overflowX > 0) el.style.left = `${x - overflowX - 8}px`
    if (overflowY > 0) el.style.top = `${y - overflowY - 8}px`
  }, [x, y])

  return createPortal(
    <div
      ref={rootRef}
      style={{ top: y, left: x }}
      onMouseLeave={() => setExportSubmenuOpen(false)}
      className="glass-panel fixed z-30 w-52 rounded-md p-1 shadow-2xl"
    >
      <button
        onClick={() => {
          onRename()
          onClose()
        }}
        className={itemClass}
      >
        <Pencil size={14} className="shrink-0" />
        Rename Page
      </button>

      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className={itemClass}
      >
        <X size={14} className="shrink-0" />
        Delete Page
      </button>

      <div className="my-1 border-t border-border" />

      <div className="relative" onMouseEnter={() => setExportSubmenuOpen(true)}>
        <button
          onClick={() => setExportSubmenuOpen((v) => !v)}
          className={cn(itemClass, 'justify-between')}
        >
          <span className="flex items-center gap-2">
            <Download size={14} className="shrink-0" />
            Export
          </span>
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {exportSubmenuOpen && (
          <ExportSubmenuItems
            onExport={(format) => {
              onExport(format)
              onClose()
            }}
          />
        )}
      </div>
    </div>,
    document.body
  )
}
