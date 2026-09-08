import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { Sigma } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { ToolbarPopover } from './ToolbarPopover'

export function MathPopover({ editor }: { editor: Editor }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [latex, setLatex] = useState('')
  const buttonRef = useRef<HTMLButtonElement>(null)

  function insert(): void {
    const expr = latex.trim()
    // The math extension (see Editor.tsx) recognizes $...$ inline syntax and
    // renders it via KaTeX — inserting that literal text is the documented,
    // stable way to trigger it rather than depending on an undocumented
    // internal command.
    if (expr) editor.chain().focus().insertContent(`$${expr}$ `).run()
    setLatex('')
    setOpen(false)
  }

  return (
    <>
      <ToolbarButton
        ref={buttonRef}
        title="Insert equation"
        onClick={() => {
          setAnchorRect(buttonRef.current!.getBoundingClientRect())
          setOpen((v) => !v)
        }}
      >
        <Sigma size={15} />
      </ToolbarButton>

      {open && anchorRect && (
        <ToolbarPopover anchorRect={anchorRect} onClose={() => setOpen(false)} widthClassName="w-72">
          <label className="mb-1 block text-xs text-muted-foreground">LaTeX expression</label>
          <input
            autoFocus
            value={latex}
            onChange={(e) => setLatex(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') insert()
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="e^{i\pi} + 1 = 0"
            className="glass-card w-full rounded-sm px-2 py-1.5 font-mono text-sm outline-none"
          />
          <div className="mt-1.5 flex justify-end">
            <button
              onClick={insert}
              className="rounded-sm bg-primary px-2 py-1 text-xs text-primary-foreground hover:opacity-90"
            >
              Insert
            </button>
          </div>
        </ToolbarPopover>
      )}
    </>
  )
}
