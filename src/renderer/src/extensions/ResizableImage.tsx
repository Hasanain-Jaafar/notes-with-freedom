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

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = imgRef.current?.getBoundingClientRect().width ?? 0
      setResizing(true)

      const onMove = (moveEvent: PointerEvent): void => {
        const next = Math.max(MIN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)))
        updateAttributes({ width: next })
      }
      const onUp = (): void => {
        setResizing(false)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [updateAttributes]
  )

  return (
    <NodeViewWrapper
      className="group relative my-2 inline-block max-w-full"
      style={width ? { width: `${width}px` } : undefined}
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
        onClick={deleteNode}
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
