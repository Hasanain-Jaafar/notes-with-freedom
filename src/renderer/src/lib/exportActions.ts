import type { ExportResult, ExportScope } from '@shared/ipc-channels'
import { sanitizeFilename } from '@shared/sanitizeFilename'
import { useAppStore } from '../store/useAppStore'
import { buildDocxDocument } from './pageToDocx'
import {
  type PageJson,
  safeParse,
  normalizePageJson,
  pageToHtml,
  wrapExportHtml,
  replaceAudioNodesWithPlaceholder,
  renderMathInHtml,
  collectImageUrls,
  rewriteImageSrcsToRelative,
  fetchMediaBytes,
  htmlToMarkdown,
  escapeHtml
} from './pageExport'

export interface ExportPageContent {
  title: string
  json: PageJson
}

// The Zustand store's activePage.contentJson updates synchronously on every
// keystroke (see updateActivePageContent in store/useAppStore.ts), well
// ahead of the 1200ms debounced write to disk — reading it directly when the
// page being exported is the active one avoids exporting slightly-stale
// content, without needing any special "live editor" code path.
export async function resolvePageForExport(pageId: number): Promise<ExportPageContent> {
  const active = useAppStore.getState().activePage
  if (active?.id === pageId) {
    return { title: active.title, json: normalizePageJson(safeParse(active.contentJson)) }
  }
  const page = await window.api.pages.get(pageId)
  if (!page) return { title: 'Untitled page', json: normalizePageJson(null) }
  return { title: page.title, json: normalizePageJson(safeParse(page.contentJson)) }
}

export async function resolveSectionPagesForExport(sectionId: number): Promise<ExportPageContent[]> {
  const dtos = await window.api.pages.listFull(sectionId)
  const active = useAppStore.getState().activePage
  return dtos.map((dto) => {
    const isActive = active?.id === dto.id
    const title = isActive ? active.title : dto.title
    const contentJson = isActive ? active.contentJson : dto.contentJson
    return { title, json: normalizePageJson(safeParse(contentJson)) }
  })
}

export async function exportPdf(
  scope: ExportScope,
  title: string,
  pages: ExportPageContent[]
): Promise<ExportResult> {
  const bodyParts = pages.map((page, index) => {
    const withAudio = replaceAudioNodesWithPlaceholder(pageToHtml(page.json))
    const withMath = renderMathInHtml(withAudio)
    const divider = index > 0 ? '<div class="page-break"></div>' : ''
    return `${divider}<h1>${escapeHtml(page.title)}</h1>${withMath}`
  })
  const html = wrapExportHtml(bodyParts.join(''), title)
  return window.api.export.pdf({ scope, title, html })
}

export async function exportDocx(
  scope: ExportScope,
  title: string,
  pages: ExportPageContent[]
): Promise<ExportResult> {
  const bytes = await buildDocxDocument(pages)
  return window.api.export.docx({ scope, title, bytes })
}

// New pages all default to the title "Untitled page" (see
// PagesColumn.tsx/useAppStore.ts's createPage) — a section export with more
// than one un-renamed page would otherwise produce two identically-named
// .md files, silently overwriting one with the other.
function dedupeFilename(base: string, used: Map<string, number>): string {
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? `${base}.md` : `${base} (${count + 1}).md`
}

export async function exportMarkdown(
  scope: ExportScope,
  title: string,
  pages: ExportPageContent[]
): Promise<ExportResult> {
  const imageUrls = new Set<string>()
  const usedFilenames = new Map<string, number>()
  const files = pages.map((page) => {
    const withAudio = replaceAudioNodesWithPlaceholder(pageToHtml(page.json))
    collectImageUrls(withAudio).forEach((url) => imageUrls.add(url))
    const relative = rewriteImageSrcsToRelative(withAudio)
    const content = `# ${page.title}\n\n${htmlToMarkdown(relative)}`
    const filename = dedupeFilename(sanitizeFilename(page.title), usedFilenames)
    return { filename, content }
  })
  const images = await Promise.all(
    [...imageUrls].map(async (url) => ({
      filename: url.split('/').pop() ?? 'image',
      bytes: await fetchMediaBytes(url)
    }))
  )
  return window.api.export.markdown({ scope, suggestedName: sanitizeFilename(title), files, images })
}
