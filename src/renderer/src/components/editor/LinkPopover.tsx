import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Link2 } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'

export function LinkPopover({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [url, setUrl] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  function applyLink(): void {
    const href = url.trim()
    if (href) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    }
    setOpen(false)
  }

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        active={editor.isActive('link')}
        title="Link"
        onClick={() => {
          setUrl((editor.getAttributes('link').href as string | undefined) ?? '')
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <Link2 size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-64">
          <input
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyLink()
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="https://example.com"
            className="glass-card w-full rounded-sm px-2 py-1.5 text-sm outline-none"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            {editor.isActive('link') && (
              <button
                onClick={() => {
                  editor.chain().focus().unsetLink().run()
                  setOpen(false)
                }}
                className="rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
              >
                Remove
              </button>
            )}
            <button
              onClick={applyLink}
              className="rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              Apply
            </button>
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
