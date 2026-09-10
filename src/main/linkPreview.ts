import { ipcMain, net } from 'electron'
import { extname } from 'path'
import { IPC } from '@shared/ipc-channels'
import type { LinkPreviewResult } from '@shared/ipc-channels'
import { saveImageAttachment } from './db/attachments'

// Generous but bounded — a paste shouldn't hang forever on a slow/dead site,
// and shouldn't download something enormous just to pull a couple of meta
// tags or a thumbnail out of it.
const FETCH_TIMEOUT_MS = 8000
const MAX_HTML_BYTES = 5_000_000
const MAX_IMAGE_BYTES = 15_000_000

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await net.fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

/** Regex rather than a real HTML parser — this only ever needs two specific
 * meta tags out of an arbitrary page, and pulling in a DOM/HTML parsing
 * dependency for that felt like overkill (same reasoning as the app's
 * Markdown export using Turndown only for the one direction it actually
 * needs). Tries both attribute orders since sites write `<meta>` tags either
 * way. */
function extractMetaContent(html: string, property: string): string | null {
  const escaped = escapeForRegex(property)
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["']`, 'i')
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeHtmlEntities(match[1])
  }
  return null
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return match ? decodeHtmlEntities(match[1].trim()) || null : null
}

function isYouTubeUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase().replace(/^www\.|^m\.|^music\./, '')
  return host === 'youtube.com' || host === 'youtu.be'
}

/** YouTube's oEmbed endpoint takes the original watch/share URL directly —
 * no need to parse out a video ID ourselves — and is far more reliable than
 * scraping YouTube's own (heavily scripted) HTML for og:image. */
async function fetchYouTubeMeta(
  rawUrl: string
): Promise<{ title: string | null; imageUrl: string | null }> {
  try {
    const response = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`
    )
    if (!response.ok) return { title: null, imageUrl: null }
    const data: unknown = await response.json()
    const title =
      data && typeof data === 'object' && typeof (data as { title?: unknown }).title === 'string'
        ? (data as { title: string }).title
        : null
    const imageUrl =
      data &&
      typeof data === 'object' &&
      typeof (data as { thumbnail_url?: unknown }).thumbnail_url === 'string'
        ? (data as { thumbnail_url: string }).thumbnail_url
        : null
    return { title, imageUrl }
  } catch {
    return { title: null, imageUrl: null }
  }
}

async function fetchOpenGraphMeta(
  rawUrl: string
): Promise<{ title: string | null; imageUrl: string | null }> {
  try {
    const response = await fetchWithTimeout(rawUrl, { headers: { Accept: 'text/html' } })
    if (!response.ok) return { title: null, imageUrl: null }
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) {
      return { title: null, imageUrl: null }
    }
    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (contentLength > MAX_HTML_BYTES) return { title: null, imageUrl: null }

    const html = await response.text()
    const title = extractMetaContent(html, 'og:title') ?? extractTitleTag(html)
    const rawImageUrl = extractMetaContent(html, 'og:image') ?? extractMetaContent(html, 'og:image:url')
    let imageUrl: string | null = null
    if (rawImageUrl) {
      try {
        imageUrl = new URL(rawImageUrl, rawUrl).toString()
      } catch {
        imageUrl = null
      }
    }
    return { title, imageUrl }
  } catch {
    return { title: null, imageUrl: null }
  }
}

const IMAGE_EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

async function downloadThumbnail(
  notebookId: number,
  pageId: number,
  imageUrl: string
): Promise<string | null> {
  try {
    const response = await fetchWithTimeout(imageUrl)
    if (!response.ok) return null
    const contentLength = Number(response.headers.get('content-length') ?? '0')
    if (contentLength > MAX_IMAGE_BYTES) return null

    const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim()
    const extension =
      IMAGE_EXTENSION_BY_CONTENT_TYPE[contentType] ??
      extname(new URL(imageUrl).pathname).replace('.', '') ??
      'jpg'

    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) return null

    const attachment = await saveImageAttachment(notebookId, pageId, bytes, extension || 'jpg')
    return attachment.url
  } catch {
    return null
  }
}

async function fetchLinkPreview(
  notebookId: number,
  pageId: number,
  rawUrl: string
): Promise<LinkPreviewResult> {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const { title, imageUrl } = isYouTubeUrl(parsed)
    ? await fetchYouTubeMeta(rawUrl)
    : await fetchOpenGraphMeta(rawUrl)

  // Nothing worth showing — the caller falls back to a plain link, exactly
  // like a normal paste would have produced anyway.
  if (!title && !imageUrl) return null

  const thumbnailUrl = imageUrl ? await downloadThumbnail(notebookId, pageId, imageUrl) : null
  return { title, thumbnailUrl }
}

export function registerLinkPreviewIpcHandlers(): void {
  ipcMain.handle(
    IPC.LINK_PREVIEW_FETCH,
    (_e, notebookId: number, pageId: number, url: string): Promise<LinkPreviewResult> =>
      fetchLinkPreview(notebookId, pageId, url)
  )
}
