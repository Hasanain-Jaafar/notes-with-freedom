import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, X, ChevronRight, FilePlus, Clipboard, FolderPlus, Download } from 'lucide-react'
import { SECTION_COLORS } from '../lib/sectionColors'
import { cn } from '../lib/utils'
import { ExportSubmenuItems, type ExportFormat } from './ExportSubmenuItems'

interface SectionContextMenuProps {
  x: number
  y: number
  sectionColor: string | null
  onRename: () => void
  onDelete: () => void
  onPickColor: (hex: string | null) => void
  onNewPage: () => void
  onNewSection: () => void
  onExport: (format: ExportFormat) => void
  onClose: () => void
}

const itemClass =
  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent'

export function SectionContextMenu({
  x,
  y,
  sectionColor,
  onRename,
  onDelete,
  onPickColor,
  onNewPage,
  onNewSection,
  onExport,
  onClose
}: SectionContextMenuProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false)
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

  // Keep the menu fully on-screen if it was opened near the window's edge.
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
      onMouseLeave={() => {
        setColorSubmenuOpen(false)
        setExportSubmenuOpen(false)
      }}
      // Portaled to document.body, so this is a standalone glass surface, not
      // nested inside the sidebar's own .glass-panel — a single blur layer,
      // not a stacked one.
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
        Rename Section
      </button>

      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className={itemClass}
      >
        <X size={14} className="shrink-0" />
        Delete Section
      </button>

      <div className="my-1 border-t border-border" />

      <div
        className="relative"
        onMouseEnter={() => {
          setColorSubmenuOpen(true)
          setExportSubmenuOpen(false)
        }}
      >
        <button
          onClick={() => setColorSubmenuOpen((v) => !v)}
          className={cn(itemClass, 'justify-between')}
        >
          <span className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm border border-border"
              style={{ backgroundColor: sectionColor ?? 'transparent' }}
            />
            Section Color
          </span>
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {colorSubmenuOpen && (
          <div className="glass-panel absolute left-full top-0 ml-1 w-44 rounded-md p-1 shadow-2xl">
            {SECTION_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  onPickColor(c.hex)
                  onClose()
                }}
                className={cn(itemClass, c.hex === sectionColor && 'bg-accent')}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: c.hex ?? 'transparent' }}
                />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="my-1 border-t border-border" />

      <button
        onClick={() => {
          onNewPage()
          onClose()
        }}
        className={itemClass}
      >
        <FilePlus size={14} className="shrink-0" />
        New page
      </button>

      <button
        disabled
        title="Nothing to paste"
        className={cn(itemClass, 'cursor-not-allowed text-muted-foreground/50 hover:bg-transparent')}
      >
        <Clipboard size={14} className="shrink-0" />
        Paste
      </button>

      <div
        className="relative"
        onMouseEnter={() => {
          setExportSubmenuOpen(true)
          setColorSubmenuOpen(false)
        }}
      >
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

      <button
        onClick={() => {
          onNewSection()
          onClose()
        }}
        className={itemClass}
      >
        <FolderPlus size={14} className="shrink-0" />
        New Section
      </button>
    </div>,
    document.body
  )
}
