import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../lib/utils'

const TRANSITION_MS = 300

interface SlidePanelProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  widthClassName?: string
}

/** Generic right-edge slide-in overlay — built for Settings, but deliberately
 * not Settings-specific, so the same panel/animation/dismiss behavior is
 * available for whatever needs this shape next. Stays mounted for one extra
 * transition after `open` goes false, so the close animation actually gets
 * to play instead of the panel just vanishing. */
export function SlidePanel({
  open,
  onClose,
  title,
  children,
  widthClassName = 'w-[360px]'
}: SlidePanelProps): React.JSX.Element | null {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      // Mount off-screen first, then flip to the "in" position — but not on
      // just the next frame. React applies the "off-screen" class and the
      // browser's very next rAF callback both land inside the same paint
      // cycle here, so a single rAF still lets the "on-screen" class win
      // before anything's actually been painted, and the transition never
      // has a "before" state to animate from (confirmed: screenshots taken
      // mid- and post-transition were pixel-identical). Nesting a second
      // rAF defers to the frame *after* the browser has painted the
      // off-screen state, which is what actually makes the transition run.
      let raf2 = 0
      const raf1 = requestAnimationFrame(() => {
        raf2 = requestAnimationFrame(() => setVisible(true))
      })
      return () => {
        cancelAnimationFrame(raf1)
        cancelAnimationFrame(raf2)
      }
    }
    setVisible(false)
    const timeout = setTimeout(() => setMounted(false), TRANSITION_MS)
    return () => clearTimeout(timeout)
  }, [open])

  useEffect(() => {
    if (!mounted) return
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mounted, onClose])

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/20 transition-opacity ease-out',
          visible ? 'opacity-100' : 'opacity-0'
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      />

      <div
        className={cn(
          'glass-panel-left absolute right-0 top-0 flex h-full flex-col transition-transform ease-out',
          widthClassName,
          visible ? 'translate-x-0' : 'translate-x-full'
        )}
        style={{ transitionDuration: `${TRANSITION_MS}ms` }}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3 dark:border-white/10">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            onClick={onClose}
            title="Close"
            className="rounded-sm p-1 text-muted-foreground hover:bg-black/[0.06] hover:text-foreground dark:hover:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-4">{children}</div>
      </div>
    </div>,
    document.body
  )
}
