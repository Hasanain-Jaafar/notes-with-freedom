import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import type { SlashItem } from '../../extensions/slashItems'

export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean
}

interface SlashMenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(function SlashMenu(
  { items, command },
  ref
) {
  const [selected, setSelected] = useState(0)

  // The filtered list changes on every keystroke — keep the highlighted
  // row in range instead of pointing at a row that scrolled out of the list.
  useEffect(() => setSelected(0), [items])

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
      <div className="glass-panel w-56 rounded-md p-2 text-sm text-muted-foreground shadow-2xl">
        No matches
      </div>
    )
  }

  return (
    <div className="glass-panel max-h-72 w-56 overflow-y-auto rounded-md p-1 shadow-2xl">
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <button
            key={item.title}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onMouseEnter={() => setSelected(index)}
            onClick={() => command(item)}
            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm ${
              index === selected ? 'bg-primary/15 text-primary' : 'hover:bg-accent'
            }`}
          >
            <Icon size={15} className="shrink-0" />
            {item.title}
          </button>
        )
      })}
    </div>
  )
})
