import {
  FileText,
  BookOpen,
  Lightbulb,
  CheckSquare,
  Calendar,
  Star,
  Flag,
  Rocket,
  Code,
  Coffee,
  Utensils,
  Plane,
  DollarSign,
  Heart,
  Music,
  ShoppingCart,
  Briefcase,
  GraduationCap,
  Target,
  MessageSquare,
  Camera,
  Map,
  Users,
  Gift,
  type LucideIcon
} from 'lucide-react'

// Every page's sidebar row icon defaults to this.
export const DEFAULT_PAGE_ICON = FileText

// Small curated set for the page-icon picker (PageContextMenu.tsx) — not the
// whole lucide-react library, same "limited palette, not full customization"
// reasoning as the tag/section color swatches (CLAUDE.md). Picked for common
// note-taking contexts (ideas, tasks, journal, meetings, recipes, travel...)
// rather than being exhaustive. Keys are what actually gets stored in the
// pages.icon column — stable identifiers, not the icon's display label, so
// renaming a label here later can't orphan existing pages' saved choice.
export const PAGE_ICONS: Record<string, LucideIcon> = {
  'book-open': BookOpen,
  lightbulb: Lightbulb,
  'check-square': CheckSquare,
  calendar: Calendar,
  star: Star,
  flag: Flag,
  rocket: Rocket,
  code: Code,
  coffee: Coffee,
  utensils: Utensils,
  plane: Plane,
  'dollar-sign': DollarSign,
  heart: Heart,
  music: Music,
  'shopping-cart': ShoppingCart,
  briefcase: Briefcase,
  'graduation-cap': GraduationCap,
  target: Target,
  'message-square': MessageSquare,
  camera: Camera,
  map: Map,
  users: Users,
  gift: Gift
}

/** Resolves a page's stored icon key to its component, falling back to the
 * default for null OR an unrecognized key (e.g. a future version removes an
 * icon from the set — an old saved key shouldn't crash the sidebar). */
export function pageIconFor(icon: string | null): LucideIcon {
  if (!icon) return DEFAULT_PAGE_ICON
  return PAGE_ICONS[icon] ?? DEFAULT_PAGE_ICON
}
