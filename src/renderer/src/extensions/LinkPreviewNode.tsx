import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useCallback, useRef, useState } from 'react'
import { Link2, Trash2, GripVertical, Play } from 'lucide-react'

export interface LinkPreviewAttrs {
  // Not shown anywhere — exists purely so Editor.tsx can find this exact
  // node again once its async metadata fetch resolves (see insertLinkPreview
  // there), since the node's position in the doc can shift in the meantime.
  previewId: string
  url: string
  status: 'loading' | 'ready'
  title: string | null
  thumbnailSrc: string | null
  // Drives the play-button overlay on the thumbnail — currently true only
  // for a detected YouTube link (see isYouTubeUrl in main/linkPreview.ts).
  isVideo: boolean
  // Card width in px, dragged via the corner handle below — null means "fill
  // the available width" (the original, pre-resize default).
  width: number | null
}

const MIN_WIDTH = 240

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    linkPreview: {
      insertLinkPreview: (attrs: LinkPreviewAttrs) => ReturnType
    }
  }
}

export const LinkPreviewNode = Node.create({
  name: 'linkPreview',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      previewId: { default: null },
      url: { default: null },
      status: { default: 'loading' },
      title: { default: null },
      thumbnailSrc: { default: null },
      isVideo: { default: false },
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

  parseHTML() {
    return [{ tag: 'div[data-link-preview]' }]
  },

  // Only reached by headless HTML generation (PDF/Markdown export — see
  // pageExport.ts) and any copy-paste of the app's own content; the live
  // editor always renders LinkPreviewNodeView below instead. Two separate
  // <a> tags (image, then title) rather than one wrapping both, so
  // Turndown's Markdown conversion comes out as plain
  // `[![title](thumb)](url)` + `[title](url)` instead of an <a> awkwardly
  // wrapping a block-level <p>.
  renderHTML({ node, HTMLAttributes }) {
    const url = typeof node.attrs.url === 'string' ? node.attrs.url : ''
    const title = (typeof node.attrs.title === 'string' && node.attrs.title) || url
    const thumbnailSrc = typeof node.attrs.thumbnailSrc === 'string' ? node.attrs.thumbnailSrc : null
    const linkAttrs = { href: url, target: '_blank', rel: 'noopener noreferrer' }

    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-link-preview': '' }),
      ...(thumbnailSrc ? [['a', linkAttrs, ['img', { src: thumbnailSrc, alt: title }]]] : []),
      ['p', {}, ['a', linkAttrs, title]]
    ]
  },

  addCommands() {
    return {
      insertLinkPreview:
        (attrs: LinkPreviewAttrs) =>
        ({ chain }) =>
          chain().insertContent({ type: this.name, attrs }).run()
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(LinkPreviewNodeView)
  }
})

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function LinkPreviewNodeView({ node, updateAttributes, deleteNode }: NodeViewProps): React.JSX.Element {
  const url = node.attrs.url as string
  const status = node.attrs.status as 'loading' | 'ready'
  const title = node.attrs.title as string | null
  const thumbnailSrc = node.attrs.thumbnailSrc as string | null
  const isVideo = node.attrs.isVideo as boolean
  const width = node.attrs.width as number | null

  const cardRef = useRef<HTMLDivElement>(null)
  // Same "track locally during drag, commit once on release" pattern as
  // ResizableImage.tsx — dispatching a ProseMirror transaction on every
  // pointermove (rather than a plain re-render) is expensive enough to
  // visibly stutter on longer pages.
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const dragWidthRef = useRef<number | null>(null)

  const startResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      const startWidth = cardRef.current?.getBoundingClientRect().width ?? 0

      const onMove = (moveEvent: PointerEvent): void => {
        const next = Math.max(MIN_WIDTH, Math.round(startWidth + (moveEvent.clientX - startX)))
        dragWidthRef.current = next
        setDragWidth(next)
      }
      const onUp = (): void => {
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

  function removeThisPreview(): void {
    // Removing the node only ever edited this page's JSON — the thumbnail
    // file on disk needs its own explicit delete or it just stays in the
    // notebook's media folder forever.
    if (thumbnailSrc) void window.api.attachments.delete(thumbnailSrc)
    deleteNode()
  }

  return (
    <NodeViewWrapper className="group relative my-2 max-w-full" contentEditable={false}>
      {/* Vertical card: a link-styled title/hostname header on top, then the
          thumbnail full-bleed underneath (edge-to-edge, not inset) — mirrors
          how a rich link card (e.g. pasting a YouTube link into an email or
          Slack) reads: the title IS the visible link, the image is what
          sells "this is worth clicking," not a small inline icon.

          No width style at all (not even "100%") when displayWidth is null —
          a plain block div already fills its container by default, which is
          the pre-resize look. Once a width IS set, the same block element
          just as happily respects an explicit pixel value smaller than its
          container. max-w-full is only a safety cap for dragging past the
          content column's own edge. */}
      <div
        ref={cardRef}
        style={displayWidth ? { width: `${displayWidth}px` } : undefined}
        className="glass-card relative max-w-full overflow-hidden rounded-md">
        <div className="flex items-start gap-1.5 py-2 pl-1.5 pr-8">
          <span
            data-drag-handle
            draggable
            title="Drag to move"
            className="mt-0.5 flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            <GripVertical size={13} />
          </span>

          {status === 'loading' ? (
            <div className="min-w-0 flex-1">
              <div className="h-3.5 w-2/3 animate-pulse rounded-sm bg-black/[0.06] dark:bg-white/10" />
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                Fetching preview for {hostnameOf(url)}…
              </p>
            </div>
          ) : (
            <button
              type="button"
              draggable={false}
              onClick={() => window.open(url, '_blank')}
              title={url}
              className="min-w-0 flex-1 text-left"
            >
              {/* Styled to read as a hyperlink specifically — text-primary
                  (not a hardcoded blue) so it follows whichever accent color
                  the user has picked in Settings, same as every other
                  active-state accent use in the app. */}
              <span className="block truncate text-sm text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary">
                {title || url}
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                {hostnameOf(url)}
              </span>
            </button>
          )}
        </div>

        <button
          type="button"
          draggable={false}
          title="Remove"
          onClick={removeThisPreview}
          className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 size={13} />
        </button>

        {status === 'loading' ? (
          <div className="aspect-video w-full animate-pulse bg-black/[0.06] dark:bg-white/10" />
        ) : (
          thumbnailSrc && (
            <button
              type="button"
              draggable={false}
              onClick={() => window.open(url, '_blank')}
              title={url}
              className="relative block aspect-video w-full bg-black/[0.03] dark:bg-white/5"
            >
              <img src={thumbnailSrc} alt="" draggable={false} className="h-full w-full object-cover" />
              {isVideo && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform group-hover:scale-105">
                    <Play size={20} className="ml-0.5 fill-neutral-900 text-neutral-900" />
                  </span>
                </span>
              )}
            </button>
          )
        )}

        {status === 'ready' && !thumbnailSrc && (
          <button
            type="button"
            draggable={false}
            onClick={() => window.open(url, '_blank')}
            title={url}
            className="flex w-full items-center gap-1.5 border-t border-black/[0.06] px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground dark:border-white/10"
          >
            <Link2 size={12} className="shrink-0" />
            <span className="truncate">{url}</span>
          </button>
        )}

        <div
          contentEditable={false}
          onPointerDown={startResize}
          title="Drag to resize"
          className="absolute bottom-0.5 right-0.5 z-10 h-3 w-3 cursor-nwse-resize rounded-sm border border-white bg-primary opacity-0 group-hover:opacity-100"
        />
      </div>
    </NodeViewWrapper>
  )
}
