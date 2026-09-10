import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { ExternalLink, Link2, Trash2, GripVertical } from 'lucide-react'
import { cn } from '../lib/utils'

export interface LinkPreviewAttrs {
  // Not shown anywhere — exists purely so Editor.tsx can find this exact
  // node again once its async metadata fetch resolves (see insertLinkPreview
  // there), since the node's position in the doc can shift in the meantime.
  previewId: string
  url: string
  status: 'loading' | 'ready'
  title: string | null
  thumbnailSrc: string | null
}

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
      thumbnailSrc: { default: null }
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

function LinkPreviewNodeView({ node, deleteNode }: NodeViewProps): React.JSX.Element {
  const url = node.attrs.url as string
  const status = node.attrs.status as 'loading' | 'ready'
  const title = node.attrs.title as string | null
  const thumbnailSrc = node.attrs.thumbnailSrc as string | null

  return (
    <NodeViewWrapper className="group my-2" contentEditable={false}>
      <div className="glass-card flex items-center gap-2 rounded-md p-2">
        <span
          data-drag-handle
          draggable
          title="Drag to move"
          className="flex h-8 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={14} />
        </span>

        {status === 'loading' ? (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-sm bg-black/[0.06] dark:bg-white/10" />
            <div className="min-w-0 flex-1">
              <div className="h-3 w-2/3 animate-pulse rounded-sm bg-black/[0.06] dark:bg-white/10" />
              <p className="mt-1.5 truncate text-xs text-muted-foreground">
                Fetching preview for {hostnameOf(url)}…
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            draggable={false}
            onClick={() => window.open(url, '_blank')}
            title={url}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left hover:opacity-90"
          >
            {thumbnailSrc ? (
              <img
                src={thumbnailSrc}
                alt=""
                draggable={false}
                className="h-14 w-14 shrink-0 rounded-sm object-cover"
              />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-black/[0.03] text-muted-foreground dark:bg-white/5">
                <Link2 size={18} />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {title || url}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{hostnameOf(url)}</span>
            </span>
            <ExternalLink
              size={14}
              className={cn('shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100')}
            />
          </button>
        )}

        <button
          type="button"
          draggable={false}
          title="Remove"
          onClick={() => {
            // Removing the node only ever edited this page's JSON — the
            // thumbnail file on disk needs its own explicit delete or it
            // just stays in the notebook's media folder forever.
            if (thumbnailSrc) void window.api.attachments.delete(thumbnailSrc)
            deleteNode()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}
