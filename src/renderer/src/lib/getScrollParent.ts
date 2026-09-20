/** Nearest ancestor that actually scrolls — walks up from `node` rather than
 * assuming it's always a specific hardcoded element (e.g. App.tsx's <main>),
 * so this keeps working if that ancestor's markup ever changes. Shared by
 * Toolbar.tsx (to scope its "is the sticky toolbar currently stuck?"
 * IntersectionObserver to the note's own scroll box) and
 * TableOfContents.tsx (to scroll a clicked heading into view under the
 * sticky toolbar rather than flush behind it). */
export function getScrollParent(node: HTMLElement | null): HTMLElement | null {
  let el = node?.parentElement ?? null
  while (el) {
    if (/(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el
    el = el.parentElement
  }
  return null
}
