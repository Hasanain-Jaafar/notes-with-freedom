import { generateHTML } from '@tiptap/core'
import katex from 'katex'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
// Vite's ?raw suffix imports the file's contents as a plain string — this
// lets the exported HTML carry KaTeX's stylesheet inline, since it's a
// standalone document outside the app's own compiled CSS bundle.
import katexCss from 'katex/dist/katex.min.css?raw'
import { EDITOR_EXTENSIONS } from './editorExtensions'
import { type PageJson, safeParse, normalizePageJson } from './pageJson'

export type { PageJson }
export { safeParse, normalizePageJson }

/** Headless equivalent of a live editor's `getHTML()` — used for every page
 * being exported, whether or not it's the currently-open one. Must use the
 * exact same extensions array as the live editor (see editorExtensions.ts)
 * or output could silently diverge. */
export function pageToHtml(json: PageJson): string {
  return generateHTML(json, EDITOR_EXTENSIONS)
}

export const AUDIO_PLACEHOLDER_TEXT =
  '🔊 Audio recording not included — see original page in Notes with Freedom'

/** The audio extension (see extensions/AudioNode.tsx) renders as a bare
 * `<div data-audio-node>` — none of PDF/Word/Markdown carry the actual
 * recording, so every export format swaps it for the same placeholder text. */
export function replaceAudioNodesWithPlaceholder(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('div[data-audio-node]').forEach((el) => {
    const p = doc.createElement('p')
    p.className = 'audio-placeholder'
    p.textContent = AUDIO_PLACEHOLDER_TEXT
    el.replaceWith(p)
  })
  return doc.body.innerHTML
}

/** The math extension's schema-level renderHTML (used by both getHTML() and
 * generateHTML()) only emits the raw delimited LaTeX text — e.g.
 * `<span data-type="inlineMath">$x^2$</span>` — the actual KaTeX rendering
 * normally only happens via the live editor's interactive NodeView, which
 * headless HTML generation never touches. For a visual format like PDF that
 * raw text would print literally, so it needs a real KaTeX pass here first;
 * Markdown deliberately skips this (see htmlToMarkdown below) since the same
 * raw `$latex$` text is exactly the required Markdown output. */
export function renderMathInHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('span[data-type="inlineMath"]').forEach((el) => {
    const raw = el.textContent ?? ''
    const displayMode = raw.startsWith('$$') && raw.endsWith('$$')
    const latex = displayMode ? raw.slice(2, -2) : raw.replace(/^\$/, '').replace(/\$$/, '')
    try {
      el.innerHTML = katex.renderToString(latex, { displayMode, throwOnError: false })
    } catch {
      // Leave the raw delimited text in place rather than losing the content.
    }
  })
  return doc.body.innerHTML
}

function mediaFilename(url: string): string {
  return url.split('/').pop() ?? 'image'
}

/** De-duplicated list of app-media:// image URLs referenced in this HTML. */
export function collectImageUrls(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const urls = new Set<string>()
  doc.querySelectorAll('img[src^="app-media://"]').forEach((img) => {
    const src = img.getAttribute('src')
    if (src) urls.add(src)
  })
  return [...urls]
}

/** Points `<img>` src at the sibling images/ folder Markdown exports copy
 * files into, instead of the app's internal app-media:// protocol. */
export function rewriteImageSrcsToRelative(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('img[src^="app-media://"]').forEach((img) => {
    const src = img.getAttribute('src')
    if (!src) return
    img.setAttribute('src', `images/${mediaFilename(src)}`)
  })
  return doc.body.innerHTML
}

export async function fetchMediaBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  return new Uint8Array(await res.arrayBuffer())
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Hand-authored rather than reusing the app's own Tailwind `.prose` classes:
// the exported HTML is a standalone document with no compiled stylesheet of
// its own, so `class="prose"` alone would mean nothing to it.
const EXPORT_CSS = `
  body { font-family: 'Inter', ui-sans-serif, system-ui, sans-serif; color: #1a1a1a; line-height: 1.6; padding: 2rem; }
  h1, h2, h3, h4, h5, h6 { font-weight: 600; margin: 1.2em 0 0.5em; }
  p { margin: 0.6em 0; }
  ul, ol { padding-left: 1.4em; margin: 0.6em 0; }
  table { border-collapse: collapse; margin: 1em 0; }
  th, td { border: 1px solid #ccc; padding: 0.4em 0.6em; }
  blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding-left: 1em; color: #555; }
  code { background: #f2f2f2; padding: 0.1em 0.3em; border-radius: 3px; font-family: monospace; }
  pre { background: #f2f2f2; padding: 0.8em; border-radius: 4px; overflow-x: auto; }
  img { max-width: 100%; }
  .audio-placeholder { font-style: italic; color: #666; }
  ul[data-type='taskList'] { list-style: none; padding-left: 0; }
  ul[data-type='taskList'] li { display: flex; align-items: center; gap: 0.5em; }
  ul[data-type='taskList'] input { margin: 0; }
  .page-break { break-after: page; }
`

/** Wraps one or more pages' already-processed body HTML (audio placeholders
 * and KaTeX math already applied — see buildPdfHtml in the export UI wiring)
 * into a full standalone document for printToPDF. */
export function wrapExportHtml(bodyHtml: string, title: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>${katexCss}</style>
<style>${EXPORT_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`
}

/** Convert a page's HTML into the actual Markdown text. Deliberately does
 * NOT run renderMathInHtml first — the math span's raw `$latex$`/`$$latex$$`
 * text content passes straight through Turndown unchanged, which is exactly
 * the required Markdown output, and colors/highlights are dropped for free
 * since Turndown doesn't represent inline styles at all. */
export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced' })
  turndown.use(gfm)
  // The bundled gfm taskListItems rule expects the checkbox to be a direct
  // child of <li>; TipTap's TaskItem (see @tiptap/extension-task-item)
  // actually renders `<li data-type="taskItem" data-checked="...">
  // <label><input type="checkbox">...</label><div>content</div></li>` — the
  // checkbox's parent is <label>, not <li>, so that rule never matches and
  // silently drops the checkbox. This replaces it with one keyed off the
  // <li> itself, reading TipTap's actual data-checked attribute.
  turndown.addRule('taskListItem', {
    filter: (node) => node.nodeName === 'LI' && node.getAttribute('data-type') === 'taskItem',
    replacement: (content, node) => {
      const checked = (node as HTMLElement).getAttribute('data-checked') === 'true'
      return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`
    }
  })
  return turndown.turndown(html)
}
