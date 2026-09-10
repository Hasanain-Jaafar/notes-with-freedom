import {
  Document,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
  ShadingType,
  PageBreak,
  Packer
} from 'docx'
import katex from 'katex'
import { toPng } from 'html-to-image'
import { fetchMediaBytes, AUDIO_PLACEHOLDER_TEXT, type PageJson } from './pageExport'

interface JsonMark {
  type?: string
  attrs?: Record<string, unknown>
}

interface JsonNode {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  marks?: JsonMark[]
}

type DocxBlock = Paragraph | Table

const HEADING_LEVELS = [
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_1,
  HeadingLevel.HEADING_2,
  HeadingLevel.HEADING_3,
  HeadingLevel.HEADING_4,
  HeadingLevel.HEADING_5,
  HeadingLevel.HEADING_6
]

function toDocxAlignment(textAlign: unknown): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  if (textAlign === 'center') return AlignmentType.CENTER
  if (textAlign === 'right') return AlignmentType.RIGHT
  if (textAlign === 'justify') return AlignmentType.JUSTIFIED
  return undefined
}

// TipTap's color/highlight pickers only ever store #rrggbb (see
// lib/textColors.ts) — docx wants the same six hex digits with no '#'.
function toDocxHex(color: unknown): string | undefined {
  if (typeof color !== 'string') return undefined
  const hex = color.replace(/^#/, '')
  return /^[0-9a-fA-F]{6}$/.test(hex) ? hex : undefined
}

// Font-family values are CSS strings like `"JetBrains Mono", monospace` —
// Word just wants the first family name, unquoted.
function toDocxFontFamily(fontFamily: unknown): string | undefined {
  if (typeof fontFamily !== 'string') return undefined
  const first = fontFamily.split(',')[0]?.trim().replace(/^["']|["']$/g, '')
  return first || undefined
}

// CSS font sizes here are always "<n>px" (see lib/textColors.ts) — Word's
// `size` is in half-points; 1px = 0.75pt at the standard 96dpi assumption.
function toDocxHalfPoints(fontSize: unknown): number | undefined {
  if (typeof fontSize !== 'string') return undefined
  const px = Number.parseFloat(fontSize)
  return Number.isFinite(px) ? Math.round(px * 1.5) : undefined
}

async function buildMathImageRun(latex: string, displayMode: boolean): Promise<ImageRun> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.style.padding = '2px 4px'
  container.style.background = 'white'
  document.body.appendChild(container)
  try {
    katex.render(latex, container, { displayMode, throwOnError: false })
    const rect = container.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    // pixelRatio 2 for a crisp embed at the same physical/on-page size.
    const dataUrl = await toPng(container, { backgroundColor: 'white', pixelRatio: 2 })
    const res = await fetch(dataUrl)
    const bytes = new Uint8Array(await res.arrayBuffer())
    return new ImageRun({ type: 'png', data: bytes, transformation: { width, height } })
  } finally {
    container.remove()
  }
}

async function buildInlineRuns(nodes: JsonNode[]): Promise<(TextRun | ExternalHyperlink | ImageRun)[]> {
  const runs: (TextRun | ExternalHyperlink | ImageRun)[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = node.marks ?? []
      let bold: boolean | undefined
      let italics: boolean | undefined
      let strike: boolean | undefined
      let font: string | undefined
      let color: string | undefined
      let size: number | undefined
      let shading: { type: (typeof ShadingType)[keyof typeof ShadingType]; fill: string } | undefined
      for (const mark of marks) {
        if (mark.type === 'bold') bold = true
        if (mark.type === 'italic') italics = true
        if (mark.type === 'strike') strike = true
        if (mark.type === 'code') font = 'Consolas'
        if (mark.type === 'textStyle') {
          color = toDocxHex(mark.attrs?.color) ?? color
          font = toDocxFontFamily(mark.attrs?.fontFamily) ?? font
          size = toDocxHalfPoints(mark.attrs?.fontSize) ?? size
        }
        // Word's native "highlight" only accepts ~15 fixed named colors, but
        // this app's highlight is an arbitrary hex — run shading (a
        // background fill) accepts any hex instead, so that's used here.
        if (mark.type === 'highlight') {
          const fill = toDocxHex(mark.attrs?.color)
          if (fill) shading = { type: ShadingType.CLEAR, fill }
        }
      }
      const run = new TextRun({ text: node.text ?? '', bold, italics, strike, font, color, size, shading })
      const linkMark = marks.find((m) => m.type === 'link')
      const href = linkMark && typeof linkMark.attrs?.href === 'string' ? linkMark.attrs.href : null
      runs.push(href ? new ExternalHyperlink({ children: [run], link: href }) : run)
    } else if (node.type === 'hardBreak') {
      runs.push(new TextRun({ text: '', break: 1 }))
    } else if (node.type === 'inlineMath') {
      const latex = typeof node.attrs?.latex === 'string' ? node.attrs.latex : ''
      const displayMode = node.attrs?.display === 'yes'
      runs.push(await buildMathImageRun(latex, displayMode))
    }
  }
  return runs
}

async function buildImageParagraph(node: JsonNode): Promise<Paragraph> {
  const src = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
  if (!src) return new Paragraph({})

  // Re-encoded through canvas rather than embedded as-is: the source could be
  // png/jpg/gif/webp/svg (see attachments.ts's image-picker filter), and
  // docx's ImageRun needs to know which — normalizing everything to a real
  // PNG buffer sidesteps format detection entirely rather than guessing from
  // the file extension.
  const bytes = await fetchMediaBytes(src)
  // TS's DOM lib types Uint8Array as generic over ArrayBufferLike, which
  // BlobPart doesn't accept directly even though this is a valid Blob part
  // at runtime — the cast just satisfies the type checker.
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]))
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  ctx?.drawImage(bitmap, 0, 0)
  const pngBlob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/png')
  )
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer())

  const attrWidth = typeof node.attrs?.width === 'number' ? node.attrs.width : null
  const targetWidth = attrWidth && attrWidth > 0 ? attrWidth : Math.min(bitmap.width, 600)
  const targetHeight = Math.round((targetWidth / bitmap.width) * bitmap.height)
  bitmap.close()

  return new Paragraph({
    children: [new ImageRun({ type: 'png', data: pngBytes, transformation: { width: targetWidth, height: targetHeight } })]
  })
}

// linkPreview's live NodeView (see extensions/LinkPreviewNode.tsx) can be
// mid-fetch (status: 'loading', no title/thumbnail yet) — Word has no
// concept of "still loading", so that state just exports as a plain link,
// same as the "no preview data found" fallback the editor itself uses.
async function buildLinkPreviewParagraphs(node: JsonNode): Promise<Paragraph[]> {
  const url = typeof node.attrs?.url === 'string' ? node.attrs.url : ''
  if (!url) return []
  const title = (typeof node.attrs?.title === 'string' && node.attrs.title) || url
  const thumbnailSrc = typeof node.attrs?.thumbnailSrc === 'string' ? node.attrs.thumbnailSrc : null

  const paragraphs: Paragraph[] = []
  if (thumbnailSrc) paragraphs.push(await buildImageParagraph({ attrs: { src: thumbnailSrc } }))
  paragraphs.push(
    new Paragraph({
      children: [new ExternalHyperlink({ children: [new TextRun({ text: title })], link: url })]
    })
  )
  return paragraphs
}

function buildCodeBlockParagraph(node: JsonNode): Paragraph {
  const text = (node.content ?? []).map((c) => c.text ?? '').join('')
  const lines = text.split('\n')
  const children: TextRun[] = []
  lines.forEach((line, i) => {
    if (i > 0) children.push(new TextRun({ text: '', break: 1 }))
    children.push(new TextRun({ text: line, font: 'Consolas' }))
  })
  return new Paragraph({ children, shading: { type: ShadingType.CLEAR, fill: 'F2F2F2' } })
}

async function buildTable(node: JsonNode): Promise<Table> {
  const rows: TableRow[] = []
  for (const rowNode of node.content ?? []) {
    const cells: TableCell[] = []
    for (const cellNode of rowNode.content ?? []) {
      const cellBlocks = await convertBlockChildren(cellNode.content ?? [])
      cells.push(new TableCell({ children: cellBlocks.length > 0 ? cellBlocks : [new Paragraph({})] }))
    }
    rows.push(new TableRow({ children: cells }))
  }
  return new Table({ rows })
}

type ListKind = 'bullet' | 'ordered' | 'task'

// Deliberately simple: a prefixed/indented Paragraph per item rather than
// docx's native multi-level numbering XML — less "native" list fidelity,
// much less code, and avoids the numbering-definition bookkeeping docx's
// proper numbered-list API requires.
async function buildList(node: JsonNode, kind: ListKind, depth: number): Promise<Paragraph[]> {
  const paragraphs: Paragraph[] = []
  let index = 1
  for (const item of node.content ?? []) {
    const checked = item.attrs?.checked === true
    const prefix = kind === 'bullet' ? '•' : kind === 'task' ? (checked ? '☑' : '☐') : `${index}.`
    index += 1
    let firstBlockDone = false
    for (const block of item.content ?? []) {
      if (block.type === 'bulletList' || block.type === 'orderedList' || block.type === 'taskList') {
        const nestedKind: ListKind =
          block.type === 'bulletList' ? 'bullet' : block.type === 'orderedList' ? 'ordered' : 'task'
        paragraphs.push(...(await buildList(block, nestedKind, depth + 1)))
        continue
      }
      const inline = block.type === 'paragraph' ? await buildInlineRuns(block.content ?? []) : []
      const children = firstBlockDone ? inline : [new TextRun({ text: `${prefix} ` }), ...inline]
      firstBlockDone = true
      paragraphs.push(new Paragraph({ children, indent: { left: 360 * (depth + 1) } }))
    }
  }
  return paragraphs
}

async function buildBlockquote(node: JsonNode): Promise<DocxBlock[]> {
  const blocks: DocxBlock[] = []
  for (const child of node.content ?? []) {
    if (child.type === 'paragraph') {
      blocks.push(
        new Paragraph({
          children: await buildInlineRuns(child.content ?? []),
          indent: { left: 360 },
          border: { left: { color: 'CCCCCC', space: 4, style: BorderStyle.SINGLE, size: 12 } }
        })
      )
    } else {
      blocks.push(...(await convertBlockNode(child)))
    }
  }
  return blocks
}

async function convertBlockNode(node: JsonNode): Promise<DocxBlock[]> {
  switch (node.type) {
    case 'paragraph':
      return [
        new Paragraph({
          children: await buildInlineRuns(node.content ?? []),
          alignment: toDocxAlignment(node.attrs?.textAlign)
        })
      ]
    case 'heading': {
      const level = Number(node.attrs?.level) || 1
      return [
        new Paragraph({
          children: await buildInlineRuns(node.content ?? []),
          heading: HEADING_LEVELS[level] ?? HeadingLevel.HEADING_1,
          alignment: toDocxAlignment(node.attrs?.textAlign)
        })
      ]
    }
    case 'bulletList':
      return buildList(node, 'bullet', 0)
    case 'orderedList':
      return buildList(node, 'ordered', 0)
    case 'taskList':
      return buildList(node, 'task', 0)
    case 'blockquote':
      return buildBlockquote(node)
    case 'codeBlock':
      return [buildCodeBlockParagraph(node)]
    case 'horizontalRule':
      return [
        new Paragraph({
          border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 } }
        })
      ]
    case 'table':
      return [await buildTable(node)]
    case 'image':
      return [await buildImageParagraph(node)]
    case 'linkPreview':
      return buildLinkPreviewParagraphs(node)
    case 'audio':
      return [
        new Paragraph({
          children: [new TextRun({ text: AUDIO_PLACEHOLDER_TEXT, italics: true, color: '666666' })]
        })
      ]
    default:
      return node.content ? convertBlockChildren(node.content) : []
  }
}

async function convertBlockChildren(nodes: JsonNode[]): Promise<DocxBlock[]> {
  const blocks: DocxBlock[] = []
  for (const node of nodes) {
    blocks.push(...(await convertBlockNode(node)))
  }
  return blocks
}

export async function buildDocxDocument(pages: { title: string; json: PageJson }[]): Promise<Uint8Array> {
  const children: DocxBlock[] = []
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    if (i > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    children.push(new Paragraph({ text: page.title, heading: HeadingLevel.TITLE }))
    const content = Array.isArray(page.json.content) ? (page.json.content as JsonNode[]) : []
    children.push(...(await convertBlockChildren(content)))
  }
  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  return new Uint8Array(await blob.arrayBuffer())
}
