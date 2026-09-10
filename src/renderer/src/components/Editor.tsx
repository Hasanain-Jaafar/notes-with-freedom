import { useEditor, EditorContent } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { useEffect, useRef } from 'react'
import 'katex/dist/katex.min.css'
import { useAppStore } from '../store/useAppStore'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { useAudioRecorder } from '../hooks/useAudioRecorder'
import { usePersistedBoolean } from '../hooks/usePersistedBoolean'
import { EDITOR_EXTENSIONS } from '../lib/editorExtensions'
import { safeParse } from '../lib/pageJson'
import { SlashCommand } from '../extensions/SlashCommand'
import type { SlashContext } from '../extensions/slashItems'
import { EditorShortcuts } from '../extensions/EditorShortcuts'
import type { LinkPreviewAttrs } from '../extensions/LinkPreviewNode'
import { Toolbar } from './editor/Toolbar'
import { RecordingBanner } from './editor/RecordingBanner'
import { PagePropertiesPanel } from './PagePropertiesPanel'
import { formatTimestamp } from '../lib/formatTimestamp'
import { cn } from '../lib/utils'

const SAVE_DEBOUNCE_MS = 1200

// Only a paste that is ENTIRELY a single link triggers a rich preview card —
// a URL that's part of a larger sentence just pastes as plain/linked text,
// same as it always has.
const LONE_URL_REGEX = /^https?:\/\/\S+$/i

/** Re-locates a linkPreview node by its previewId attribute rather than a
 * cached position — the async metadata fetch this backs (see
 * insertLinkPreview below) can easily outlive edits elsewhere in the
 * document that would shift a stale position. Returns null if the node was
 * deleted (or the page was switched away from) before the fetch resolved. */
function findLinkPreviewPos(doc: ProseMirrorNode, previewId: string): number | null {
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found !== null) return false
    if (node.type.name === 'linkPreview' && node.attrs.previewId === previewId) {
      found = pos
      return false
    }
    return true
  })
  return found
}

/** First case-insensitive occurrence of `term` in the document's text nodes,
 * as a ProseMirror {from, to} range — used to jump the search result open to
 * the actual matched text instead of just the top of the page. */
function findFirstMatch(doc: ProseMirrorNode, term: string): { from: number; to: number } | null {
  if (!term) return null
  const needle = term.toLowerCase()
  let match: { from: number; to: number } | null = null
  doc.descendants((node, pos) => {
    if (match) return false
    if (!node.isText || !node.text) return true
    const idx = node.text.toLowerCase().indexOf(needle)
    if (idx === -1) return true
    match = { from: pos + idx, to: pos + idx + term.length }
    return false
  })
  return match
}

export function Editor(): React.JSX.Element | null {
  const activePage = useAppStore((s) => s.activePage)
  const activeNotebookId = useAppStore((s) => s.activeNotebookId)
  const updateActivePageContent = useAppStore((s) => s.updateActivePageContent)
  const searchHighlight = useAppStore((s) => s.searchHighlight)
  const clearSearchHighlight = useAppStore((s) => s.clearSearchHighlight)
  // App-wide viewer preference (not per-page, not app data) — same reasoning
  // as the sidebar's collapsed state: belongs in localStorage, not the DB.
  const [fullWidth, setFullWidth] = usePersistedBoolean('fullWidthPage', false)

  const debouncedSave = useDebouncedCallback((pageId: number, title: string, json: string) => {
    void window.api.pages.saveContent(pageId, title, json)
  }, SAVE_DEBOUNCE_MS)

  // Mutable bridge into the slash-command extension below: the extension is
  // configured once when the editor is created, but which page/notebook is
  // active changes on every navigation — the ref lets its command handlers
  // always read the current image-picker/audio-recorder without recreating
  // the editor (and losing undo history) every time the user switches pages.
  const slashContextRef = useRef<SlashContext>({
    pickAndInsertImage: () => {},
    startAudioRecording: () => {}
  })

  // editorProps.handlePaste is captured once, at editor creation, so it
  // can't close over activeNotebookId/activePage directly — same staleness
  // problem the slash command solves above, same fix (a ref updated every
  // render, read from inside a stable callback).
  const insertPastedImageRef = useRef<(file: File) => void>(() => {})
  const insertLinkPreviewRef = useRef<(url: string) => void>(() => {})

  const editor = useEditor({
    extensions: [
      ...EDITOR_EXTENSIONS,
      SlashCommand.configure({ contextRef: slashContextRef }),
      EditorShortcuts
    ],
    content: activePage ? safeParse(activePage.contentJson) : '',
    onUpdate: ({ editor }) => {
      if (!activePage) return
      const json = JSON.stringify(editor.getJSON())
      updateActivePageContent(activePage.title, json)
      debouncedSave(activePage.id, activePage.title, json)
    },
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert max-w-none focus:outline-none min-h-[60vh]'
      },
      // TipTap/ProseMirror don't handle image data on the clipboard at all
      // out of the box — only plain text/HTML paste. A screenshot or a
      // copied image (no file path, just bitmap bytes) needs to be pulled
      // out of the DataTransfer here and saved to disk ourselves.
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        const file = files ? Array.from(files).find((f) => f.type.startsWith('image/')) : undefined
        if (file) {
          event.preventDefault()
          insertPastedImageRef.current(file)
          return true
        }

        // A lone link pasted onto an otherwise-empty line becomes a rich
        // preview card (YouTube thumbnail, or a site's Open Graph
        // title/image) — same "paste a bare URL by itself" trigger Notion
        // and Slack use. Pasted into existing text, it's just a normal
        // link, untouched here.
        const text = event.clipboardData?.getData('text/plain')?.trim()
        const { $from, empty } = view.state.selection
        const pastingIntoEmptyBlock =
          empty && $from.parent.type.name !== 'codeBlock' && $from.parent.content.size === 0
        if (text && LONE_URL_REGEX.test(text) && pastingIntoEmptyBlock) {
          event.preventDefault()
          insertLinkPreviewRef.current(text)
          return true
        }

        return false
      }
    }
  })

  const audioRecorder = useAudioRecorder(editor, activeNotebookId ?? 0, activePage?.id ?? 0)

  async function pickAndInsertImage(): Promise<void> {
    if (!editor || !activeNotebookId || !activePage) return
    const result = await window.api.attachments.pickImage(activeNotebookId, activePage.id)
    if (!result) return
    editor.chain().focus().setImage({ src: result.url }).run()
  }

  async function insertPastedImage(file: File): Promise<void> {
    if (!editor || !activeNotebookId || !activePage) return
    const bytes = new Uint8Array(await file.arrayBuffer())
    // image/jpeg -> jpg, image/svg+xml -> svg, image/png -> png, etc. —
    // matches what ATTACHMENT_PICK_IMAGE's file-extension filter already
    // accepts.
    const subtype = file.type.split('/')[1]?.split('+')[0]
    const extension = subtype === 'jpeg' ? 'jpg' : subtype || 'png'
    const result = await window.api.attachments.saveImage(
      activeNotebookId,
      activePage.id,
      bytes,
      extension
    )
    editor.chain().focus().setImage({ src: result.url }).run()
  }

  // Split out from insertLinkPreview below so the same resolution logic can
  // also run for a "loading" node left over from an interrupted session
  // (e.g. the app was closed before the fetch finished) — see the
  // stale-preview effect further down, which calls this directly without
  // ever having called insertLinkPreview itself.
  async function resolveLinkPreview(previewId: string, url: string): Promise<void> {
    if (!editor || !activeNotebookId || !activePage) return
    const result = await window.api.linkPreview.fetch(activeNotebookId, activePage.id, url)
    // Re-read fresh, right before dispatching — the doc may have changed
    // (typing elsewhere, switching pages) during the network round-trip.
    const pos = findLinkPreviewPos(editor.state.doc, previewId)
    if (pos === null) return

    if (!result) {
      // No usable title/image — fall back to what pasting this URL would
      // have produced before this feature existed: a plain linked line.
      const node = editor.state.doc.nodeAt(pos)
      const linkMark = editor.schema.marks.link?.create({ href: url })
      const paragraph = editor.schema.nodes.paragraph.create(
        null,
        editor.schema.text(url, linkMark ? [linkMark] : [])
      )
      editor.view.dispatch(editor.state.tr.replaceWith(pos, pos + (node?.nodeSize ?? 1), paragraph))
      return
    }

    const readyAttrs: LinkPreviewAttrs = {
      previewId,
      url,
      status: 'ready',
      title: result.title,
      thumbnailSrc: result.thumbnailUrl
    }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, readyAttrs))
  }

  async function insertLinkPreview(url: string): Promise<void> {
    if (!editor || !activeNotebookId || !activePage) return
    const previewId = crypto.randomUUID()
    const attrs: LinkPreviewAttrs = { previewId, url, status: 'loading', title: null, thumbnailSrc: null }
    editor.chain().focus().insertLinkPreview(attrs).run()
    await resolveLinkPreview(previewId, url)
  }

  // No dependency array on purpose — keeps the refs' closures current every
  // render rather than tracking an exhaustive-deps list for them.
  useEffect(() => {
    slashContextRef.current = {
      pickAndInsertImage: () => void pickAndInsertImage(),
      startAudioRecording: audioRecorder.startRecording
    }
    insertPastedImageRef.current = (file) => void insertPastedImage(file)
    insertLinkPreviewRef.current = (url) => void insertLinkPreview(url)
  })

  // Swap document when a different page is opened.
  useEffect(() => {
    if (!editor || !activePage) return
    const incoming = safeParse(activePage.contentJson)
    if (JSON.stringify(editor.getJSON()) !== JSON.stringify(incoming)) {
      editor.commands.setContent(incoming)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePage?.id])

  // A linkPreview node saved mid-fetch (the app was closed, or the page was
  // switched away from, before insertLinkPreview's fetch resolved) would
  // otherwise sit showing its loading skeleton forever — nothing else ever
  // revisits it. Runs after the swap-document effect above, so it sees
  // whatever page just got loaded, and retries each one found stuck.
  useEffect(() => {
    if (!editor || !activePage) return
    const stalePreviews: { previewId: string; url: string }[] = []
    editor.state.doc.descendants((node) => {
      if (node.type.name === 'linkPreview' && node.attrs.status === 'loading') {
        stalePreviews.push({ previewId: node.attrs.previewId as string, url: node.attrs.url as string })
      }
      return true
    })
    stalePreviews.forEach(({ previewId, url }) => void resolveLinkPreview(previewId, url))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, activePage?.id])

  // Runs after the effect above, so editor.state.doc already reflects the
  // page that was just switched to. Kept separate (rather than folded into
  // that effect) because it also needs to react to searchHighlight alone —
  // clicking a search result for the page that's ALREADY open doesn't
  // change activePage.id, but should still jump to the match.
  //
  // navigateToPage sets searchHighlight synchronously, before the target
  // page has actually finished loading — this effect fires immediately
  // after with the still-OLD activePage, so it must check pageId and bail
  // (without clearing) rather than assume activePage is the target. Only
  // once activePage.id catches up does it actually run the search+scroll
  // and clear the one-shot flag.
  useEffect(() => {
    if (!editor || !activePage || !searchHighlight) return
    if (activePage.id !== searchHighlight.pageId) return
    const match = findFirstMatch(editor.state.doc, searchHighlight.term)
    if (match) {
      // focus() first — without it the view never syncs a real DOM/browser
      // selection (setTextSelection alone only updates ProseMirror's
      // internal state on an unfocused view), so nothing becomes visible
      // and scrollIntoView has no reliably-measurable target either.
      editor.chain().focus().setTextSelection(match).scrollIntoView().run()
    }
    clearSearchHighlight()
  }, [editor, activePage, searchHighlight, clearSearchHighlight])

  if (!activePage) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Select or create a page to start writing
      </div>
    )
  }

  return (
    // A sticky element is constrained by its OWN DIRECT PARENT's box, not
    // just any spanning ancestor — nesting the toolbar one level deeper
    // than the content (in its own small wrapper div) still left it with a
    // too-short containing block, even though that wrapper's own parent
    // spanned the whole note. The toolbar must be a DIRECT sibling of the
    // (tall) content div, under this shared pt-4 parent, for sticky to have
    // room to stay pinned for the entire scroll. The horizontal inset that
    // used to live on a wrapping div now lives on the toolbar itself (mx-4
    // in Toolbar.tsx).
    <div className="flex h-full flex-col">
      <div className="pt-4">
        {editor && activeNotebookId && (
          <Toolbar
            editor={editor}
            notebookId={activeNotebookId}
            pageId={activePage.id}
            audioRecorder={audioRecorder}
            fullWidth={fullWidth}
            onToggleFullWidth={() => setFullWidth((v) => !v)}
          />
        )}
        <div className={cn('mx-auto w-full px-8 py-6', fullWidth ? 'max-w-none' : 'max-w-3xl')}>
          <input
            value={activePage.title}
            onChange={(e) => {
              updateActivePageContent(e.target.value, activePage.contentJson)
              debouncedSave(activePage.id, e.target.value, activePage.contentJson)
            }}
            placeholder="Untitled page"
            className="w-full bg-transparent text-3xl font-semibold outline-none placeholder:text-muted-foreground/50"
          />
          <p className="mb-4 mt-1 text-xs text-muted-foreground">
            {formatTimestamp(activePage.createdAt)}
          </p>
          {audioRecorder.recording && <RecordingBanner onStop={audioRecorder.stopRecording} />}
          {/* Plain React, not TipTap content — sits outside <EditorContent>
              entirely, so the "/" slash command and the formatting toolbar
              (both scoped to the ProseMirror view) never see it. */}
          <PagePropertiesPanel page={activePage} />
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
