// Deliberately dependency-free (no katex/turndown/@tiptap/core) — the live
// Editor needs safeParse on every app startup and page switch, whereas
// pageExport.ts's other helpers pull in the whole export-rendering stack
// that's only needed once the user actually exports. Keeping this apart lets
// that heavy code stay out of the bundle Editor.tsx (and therefore the app's
// startup path) pulls in.
export type PageJson = Record<string, unknown>

const EMPTY_DOC: PageJson = { type: 'doc', content: [{ type: 'paragraph' }] }

export function safeParse(json: string): PageJson | string {
  try {
    return JSON.parse(json)
  } catch {
    return ''
  }
}

function isDoc(value: unknown): value is PageJson {
  return typeof value === 'object' && value !== null && (value as PageJson).type === 'doc'
}

export function normalizePageJson(value: unknown): PageJson {
  return isDoc(value) ? value : EMPTY_DOC
}
