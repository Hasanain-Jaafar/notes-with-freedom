/** Nearest ancestor that actually scrolls — walks up from `node` rather than
 * assuming it's always a specific hardcoded element (e.g. App.tsx's <main>),
 * so this keeps working if that ancestor's markup ever changes. Shared by
 * Toolbar.tsx (to scope its "is the sticky toolbar currently stuck?"
 * IntersectionObserver to the note's own scroll box) and
 * TableOfContents.tsx (to scroll a clicked heading into view under the
 * sticky toolbar rather than flush behind it).
 *
 * `requireOverflow` also skips ancestors whose content doesn't actually
 * overflow vertically. Needed because setting only overflow-x (e.g.
 * Editor.tsx's `overflow-x-auto` wrapper around the editor content) makes
 * the browser compute overflow-y as `auto` too, so the style check alone
 * matches that non-scrolling wrapper instead of the real scroll box. */
export function getScrollParent(node: HTMLElement | null, requireOverflow = false): HTMLElement | null {
  let el = node?.parentElement ?? null
  while (el) {
    if (
      /(auto|scroll)/.test(getComputedStyle(el).overflowY) &&
      (!requireOverflow || el.scrollHeight > el.clientHeight)
    )
      return el
    el = el.parentElement
  }
  return null
}
