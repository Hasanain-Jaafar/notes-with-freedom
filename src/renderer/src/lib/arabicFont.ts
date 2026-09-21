import type { CSSProperties } from 'react'

// Arabic, Arabic Supplement, Arabic Extended-A/B/C, and the Arabic
// Presentation Forms blocks — covers real Arabic-script text (including
// Persian/Urdu letters that share these blocks) without matching on stray
// neutral punctuation typed alongside it.
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࡰ-ࣿﭐ-﷿ﹰ-﻿]/

export function isArabicText(text: string): boolean {
  return ARABIC_SCRIPT.test(text)
}

// Zain (see main.tsx) is the app's one font with real Arabic glyphs — a
// notebook/section/page named in Arabic should read in it instead of
// whichever Latin-only UI font is active (--font-sans/--font-notes), which
// has no Arabic coverage of its own and falls back to whatever the OS
// happens to substitute. Returns undefined for non-Arabic text so callers
// can spread it straight into a style prop without an extra branch.
export function arabicAwareFontStyle(text: string): CSSProperties | undefined {
  return isArabicText(text) ? { fontFamily: 'Zain, sans-serif' } : undefined
}
