import type { JSONContent } from '@tiptap/react'

// Pages pasted from a website before the paste-time color strip (see
// Editor.tsx's transformPastedHTML) already have hardcoded near-black text
// colors baked into their saved TipTap JSON — the source site's own default
// body-text color, applied for a light background. Those are unreadable
// against this app's dark background. This walks a page's content once at
// load time and drops any textStyle color that's too dark to read in dark
// mode, falling back to the theme's own --foreground. Only touched when dark
// mode is actually active — the same color is fine as-is in light mode.
//
// A user's own deliberate FontColorPicker choice is safe from this: every
// swatch in FONT_COLORS (textColors.ts) sits well above the threshold except
// "Default", which never carries a color attr to begin with.
const DARK_LIGHTNESS_THRESHOLD = 0.22

function isTooDarkToReadInDarkMode(color: string): boolean {
  const probe = document.createElement('div')
  probe.style.color = color
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  document.body.removeChild(probe)

  const channels = resolved.match(/[\d.]+/g)
  if (!channels || channels.length < 3) return false
  const [r, g, b] = channels.map(Number)
  const lightness = (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255
  return lightness < DARK_LIGHTNESS_THRESHOLD
}

function stripNode(node: JSONContent): JSONContent {
  const next = { ...node }

  if (Array.isArray(next.marks)) {
    next.marks = next.marks
      .map((mark) => {
        if (mark.type !== 'textStyle' || !mark.attrs?.color) return mark
        if (!isTooDarkToReadInDarkMode(mark.attrs.color)) return mark
        const { color: _color, ...restAttrs } = mark.attrs
        return { ...mark, attrs: restAttrs }
      })
      .filter((mark) => mark.type !== 'textStyle' || Object.values(mark.attrs ?? {}).some((v) => v != null))
  }

  if (Array.isArray(next.content)) {
    next.content = next.content.map(stripNode)
  }

  return next
}

// Accepts safeParse()'s '' fallback for unparseable content and passes it
// through untouched — spreading a string in stripNode would turn it into {},
// which isn't a valid doc for the editor to load.
export function sanitizeContentColorsForDarkMode(doc: JSONContent | string): JSONContent | string {
  if (typeof doc === 'string') return doc
  if (!document.documentElement.classList.contains('dark')) return doc
  return stripNode(doc)
}
