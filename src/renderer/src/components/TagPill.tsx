import { X } from 'lucide-react'
import type { TagDTO } from '@shared/ipc-channels'
import { hexToRgba } from '../lib/hexColor'
import { cn } from '../lib/utils'

interface TagPillProps {
  tag: TagDTO
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onRemove?: () => void
  className?: string
}

const FALLBACK_HEX = '#94A3B8' // neutral slate — only hit if a tag somehow has no color yet

/** Small colored pill for a tag — click filters the note list to that tag,
 * right-click opens the rename/delete/recolor menu (color applies globally
 * since it's one shared tag row, not per-page). */
export function TagPill({ tag, onClick, onContextMenu, onRemove, className }: TagPillProps): React.JSX.Element {
  const hex = tag.color ?? FALLBACK_HEX
  return (
    <span
      onContextMenu={onContextMenu}
      style={{ backgroundColor: hexToRgba(hex, 0.15), color: hex }}
      className={cn('group inline-flex items-center gap-1 rounded-sm px-2 py-0.5 text-sm', className)}
    >
      <button
        onClick={onClick}
        disabled={!onClick}
        className={cn('max-w-[10rem] truncate', onClick && 'hover:underline')}
      >
        {tag.name}
      </button>
      {onRemove && (
        <button
          onClick={onRemove}
          title={`Remove ${tag.name}`}
          className="rounded-sm opacity-0 hover:opacity-100 group-hover:opacity-70"
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}
