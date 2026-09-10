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
import { Toolbar } from './editor/Toolbar'
import { PagePropertiesPanel } from './PagePropertiesPanel'
import { formatTimestamp } from '../lib/formatTimestamp'
import { cn } from '../lib/utils'

const SAVE_DEBOUNCE_MS = 1200

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

  const editor = useEditor({
    extensions: [...EDITOR_EXTENSIONS, SlashCommand.configure({ contextRef: slashContextRef })],
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

  // No dependency array on purpose — keeps the ref's closures current every
  // render rather than tracking an exhaustive-deps list for it.
  useEffect(() => {
    slashContextRef.current = {
      pickAndInsertImage: () => void pickAndInsertImage(),
      startAudioRecording: audioRecorder.startRecording
    }
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
