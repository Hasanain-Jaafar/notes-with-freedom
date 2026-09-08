import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Pencil, Trash2, ChevronRight } from 'lucide-react'
import { TAG_COLORS } from '@shared/tagColors'
import { cn } from '../lib/utils'

interface TagContextMenuProps {
  x: number
  y: number
  tagColor: string | null
  onRename: () => void
  onDelete: () => void
  onPickColor: (hex: string) => void
  onClose: () => void
}

const itemClass =
  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent'

/** Mirrors SectionContextMenu's shape (rename/delete/color submenu) — a tag
 * is one shared global row, so recoloring or renaming here applies
 * everywhere that tag appears, not just wherever this menu was opened. */
export function TagContextMenu({
  x,
  y,
  tagColor,
  onRename,
  onDelete,
  onPickColor,
  onClose
}: TagContextMenuProps): React.JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null)
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false)

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
      onMouseLeave={() => setColorSubmenuOpen(false)}
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
        Rename tag
      </button>

      <button
        onClick={() => {
          onDelete()
          onClose()
        }}
        className={itemClass}
      >
        <Trash2 size={14} className="shrink-0" />
        Delete tag
      </button>

      <div className="my-1 border-t border-border" />

      <div className="relative" onMouseEnter={() => setColorSubmenuOpen(true)}>
        <button
          onClick={() => setColorSubmenuOpen((v) => !v)}
          className={cn(itemClass, 'justify-between')}
        >
          <span className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-sm border border-border"
              style={{ backgroundColor: tagColor ?? 'transparent' }}
            />
            Tag color
          </span>
          <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
        </button>

        {colorSubmenuOpen && (
          <div className="glass-panel absolute left-full top-0 ml-1 w-44 rounded-md p-1 shadow-2xl">
            {TAG_COLORS.map((c) => (
              <button
                key={c.name}
                onClick={() => {
                  onPickColor(c.hex)
                  onClose()
                }}
                className={cn(itemClass, c.hex === tagColor && 'bg-accent')}
              >
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-sm border border-border"
                  style={{ backgroundColor: c.hex }}
                />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
