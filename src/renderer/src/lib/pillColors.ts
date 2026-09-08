// Small, fixed palette for tag/choice-property pills (not a full color wheel —
// same "limited swatch, not a picker" philosophy as sectionColors.ts). Colors
// are assigned deterministically by hashing the label text, so the same tag
// or choice value always lands on the same color everywhere it appears,
// without needing to store a color choice anywhere.
export interface PillColorClasses {
  bg: string
  text: string
}

const PILL_PALETTE: PillColorClasses[] = [
  { bg: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-700 dark:text-red-300' },
  { bg: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-700 dark:text-orange-300' },
  { bg: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-700 dark:text-amber-300' },
  { bg: 'bg-lime-100 dark:bg-lime-500/15', text: 'text-lime-700 dark:text-lime-300' },
  { bg: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-700 dark:text-emerald-300' },
  { bg: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-700 dark:text-teal-300' },
  { bg: 'bg-sky-100 dark:bg-sky-500/15', text: 'text-sky-700 dark:text-sky-300' },
  { bg: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-700 dark:text-indigo-300' },
  { bg: 'bg-violet-100 dark:bg-violet-500/15', text: 'text-violet-700 dark:text-violet-300' },
  { bg: 'bg-pink-100 dark:bg-pink-500/15', text: 'text-pink-700 dark:text-pink-300' }
]

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function pillColorFor(label: string): PillColorClasses {
  return PILL_PALETTE[hashString(label) % PILL_PALETTE.length]
}
