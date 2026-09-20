import ImageExtension from '@tiptap/extension-image'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '../lib/utils'

const MIN_WIDTH = 80

export const ResizableImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => {
          const width = element.getAttribute('width')
          return width ? Number(width) : null
        },
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {})
      }
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  }
})

function ResizableImageView({
  node,
  updateAttributes,
  deleteNode,
  selected
}: NodeViewProps): React.JSX.Element {
  const src = node.attrs.src as string
  const alt = node.attrs.alt as string | null
  const width = node.attrs.width as number | null
  const imgRef = useRef<HTMLImageElement>(null)
  const [resizing, setResizing] = useState(false)
  // Tracks the width live while dragging, without touching ProseMirror state
  // — committing via updateAttributes() on every pointermove dispatched a
  // full editor transaction per pixel of mouse movement, which is far more
  // expensive than a plain re-render and visibly stuttered on longer pages.
  // Only the final value is committed, once, on release.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragWidthRef = useRef<number | null>(null)

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = imgRef.current?.getBoundingClientRect().width ?? 0
      setResizing(true)

      const onMove = (moveEvent: PointerEvent): void => {
        const next = Math.max(MIN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)))
        dragWidthRef.current = next
        setDragWidth(next)
      }
      const onUp = (): void => {
        setResizing(false)
        if (dragWidthRef.current !== null) updateAttributes({ width: dragWidthRef.current })
        dragWidthRef.current = null
        setDragWidth(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [updateAttributes]
  )

  const displayWidth = dragWidth ?? width

  return (
    <NodeViewWrapper
      className="group relative my-2 inline-block max-w-full"
      style={displayWidth ? { width: `${displayWidth}px` } : undefined}
    >
      <img
        ref={imgRef}
        src={src}
        alt={alt ?? ''}
        draggable={false}
        className={cn(
          'block w-full rounded-sm',
          (selected || resizing) && 'outline outline-2 outline-offset-2 outline-primary'
        )}
      />
      <button
        type="button"
        contentEditable={false}
        title="Delete image"
        onClick={() => {
          // Removing the node only ever edited this page's JSON — the file
          // on disk needs its own explicit delete or it just stays in the
          // notebook's media folder forever.
          if (src) void window.api.attachments.delete(src)
          deleteNode()
        }}
        className="absolute right-1.5 top-1.5 hidden h-6 w-6 items-center justify-center rounded-sm bg-black/60 text-white hover:bg-black/80 group-hover:flex"
      >
        <Trash2 size={13} />
      </button>
      <div
        contentEditable={false}
        onPointerDown={startResize}
        title="Drag to resize"
        className={cn(
          'absolute bottom-0.5 right-0.5 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary opacity-0 group-hover:opacity-100',
          resizing && 'opacity-100'
        )}
      />
    </NodeViewWrapper>
  )
}
