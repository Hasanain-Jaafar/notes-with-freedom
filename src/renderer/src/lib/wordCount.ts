import type { PageJson } from './pageJson'

/** Walks a TipTap JSON doc's text nodes to count words/characters for the
 * status bar — dependency-free, same reasoning as pageJson.ts's safeParse:
 * this runs on every page switch, so it shouldn't pull in TipTap/ProseMirror
 * just to count text. */
export function countWords(doc: PageJson | string): { words: number; characters: number } {
  if (typeof doc === 'string') return { words: 0, characters: 0 }

  let text = ''
  function walk(node: unknown): void {
    if (!node || typeof node !== 'object') return
    const n = node as { type?: string; text?: string; content?: unknown[] }
    if (n.type === 'text' && typeof n.text === 'string') text += n.text + ' '
    if (Array.isArray(n.content)) n.content.forEach(walk)
  }
  walk(doc)

  const trimmed = text.trim()
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    characters: trimmed.replace(/\s+/g, '').length
  }
}
