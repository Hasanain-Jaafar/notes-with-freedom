import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, X, ChevronRight, Download } from 'lucide-react'
import { cn } from '../lib/utils'
import { ExportSubmenuItems, type ExportFormat } from './ExportSubmenuItems'
import { DEFAULT_PAGE_ICON, PAGE_ICONS, pageIconFor } from '../lib/pageIcons'

interface PageContextMenuProps {
  x: number
  y: number
  pageIcon: string | null
  onRename: () => void
  onDelete: () => void
  onExport: (format: ExportFormat) => void
  onPickIcon: (icon: string | null) => void
  onClose: () => void
}

const itemClass =
  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent'

// Modeled directly on SectionContextMenu.tsx — same portal/positioning/
// click-outside/Escape behavior and glass styling. The icon submenu below
// mirrors TagContextMenu's color submenu (hover-to-open flyout), swapping a
// vertical color list for a grid — a couple dozen small icon buttons reads
// far better as a grid than as one-per-row with labels.
export function PageContextMenu({
  x,
  y,
  pageIcon,
  onRename,
  onDelete,
  onExport,
  onPickIcon,
  onClose
}: PageContextMenuProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [exportSubmenuOpen, setExportSubmenuOpen] = useState(false)
  const [iconSubmenuOpen, setIconSubmenuOpen] = useState(false)
  const CurrentIcon = pageIconFor(pageIcon)

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
      onMouseLeave={() => {
        setExportSubmenuOpen(false)
        setIconSubmenuOpen(false)
      }}
      // w-44, matching SectionContextMenu.tsx (see its comment) — kept
      // consistent between the two menus rather than shrinking this one
      // further just because its own content is a bit shorter.
      className="glass-panel fixed z-30 w-44 rounded-md p-1 shadow-2xl"
    >
      <button
        onClick={() => {
          onRename()
          onClose()
        }}
        className={itemClass}
      >
        <Pencil size={14} className="shrink-0" />
        Rename
      </button>

      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className={itemClass}
      >
        <X size={14} className="shrink-0" />
        Delete
      </button>

      <div className="my-1 border-t border-border" />

      <div
        className="relative"
        onMouseEnter={() => {
          setIconSubmenuOpen(true)
          setExportSubmenuOpen(false)
        }}
      >
        <button
          onClick={() => setIconSubmenuOpen((v) => !v)}
          className={cn(itemClass, 'justify-between')}
        >
          <span className="flex items-center gap-2">
            <CurrentIcon size={14} className="shrink-0" />
            Page icon
          </span>
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {iconSubmenuOpen && (
          <div className="glass-panel absolute left-full top-0 ml-1 w-52 rounded-md p-2 shadow-2xl">
            <div className="grid grid-cols-6 gap-1">
              <button
                onClick={() => {
                  onPickIcon(null)
                  onClose()
                }}
                title="Default"
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-sm hover:bg-accent',
                  pageIcon === null && 'bg-accent'
                )}
              >
                <DEFAULT_PAGE_ICON size={15} />
              </button>
              {Object.entries(PAGE_ICONS).map(([key, Icon]) => (
                <button
                  key={key}
                  onClick={() => {
                    onPickIcon(key)
                    onClose()
                  }}
                  title={key}
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-sm hover:bg-accent',
                    pageIcon === key && 'bg-accent'
                  )}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="my-1 border-t border-border" />

      <div
        className="relative"
        onMouseEnter={() => {
          setExportSubmenuOpen(true)
          setIconSubmenuOpen(false)
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
    </div>,
    document.body
  )
}
