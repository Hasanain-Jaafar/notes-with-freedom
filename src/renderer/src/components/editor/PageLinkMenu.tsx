import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { FileText } from 'lucide-react'
import type { PageListAllDTO } from '@shared/ipc-channels'
import { DEFAULT_ACCENT_HEX } from '../../lib/sectionColors'

export interface PageLinkMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface PageLinkMenuProps {
  items: PageListAllDTO[]
  command: (page: PageListAllDTO) => void
}

// Mirrors SlashMenu.tsx's shape (glass-panel, forwardRef/useImperativeHandle
// for arrow/enter delegation from the Suggestion plugin) but lists pages
// instead of block types — the shared picker behind both the "[[" typeahead
// and the "/" menu's "Link to page" item (see extensions/InternalLinkSuggestion.tsx
// and extensions/slashItems.tsx).
export const PageLinkMenu = forwardRef<PageLinkMenuHandle, PageLinkMenuProps>(function PageLinkMenu(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  useEffect(() => setSelected(0), [items])

  // Keyboard nav moves `selected` without any pointer movement, so the
  // browser never auto-scrolls the panel — see SlashMenu.tsx's identical fix.
  useEffect(() => {
    itemRefs.current[selected]?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  useImperativeHandle(ref, () => ({
    onKeyDown(event) {
      if (items.length === 0) return false
      if (event.key === 'ArrowDown') {
        setSelected((i) => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setSelected((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        command(items[selected])
        return true
      }
      return false
    }
  }))

  if (items.length === 0) {
    return (
      <div className="glass-panel w-64 rounded-md p-2 text-sm text-muted-foreground shadow-2xl">
        No matching pages
      </div>
    )
  }

  return (
    <div className="glass-panel max-h-72 w-64 overflow-y-auto rounded-md p-1 shadow-2xl">
      {items.map((page, index) => (
        <button
          key={page.id}
          ref={(el) => {
            itemRefs.current[index] = el
          }}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onMouseEnter={() => setSelected(index)}
          onClick={() => command(page)}
          className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
            index === selected ? 'bg-primary/15 text-primary' : 'hover:bg-accent'
          }`}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: page.sectionColor ?? DEFAULT_ACCENT_HEX }}
          />
          <FileText size={13} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{page.title}</span>
        </button>
      ))}
    </div>
  )
})
