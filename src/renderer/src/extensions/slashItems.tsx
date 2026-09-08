import type { Editor, Range } from '@tiptap/core'
import {
  Pilcrow,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Table,
  Image,
  Sigma,
  Mic,
  Link2,
  Quote,
  SeparatorHorizontal,
  type LucideIcon
} from 'lucide-react'

export interface SlashContext {
  pickAndInsertImage: () => void
  startAudioRecording: () => void
}

export interface SlashItem {
  title: string
  icon: LucideIcon
  keywords?: string[]
  run: (editor: Editor, range: Range, context: SlashContext) => void
}

export const SLASH_ITEMS: SlashItem[] = [
  {
    title: 'Paragraph',
    icon: Pilcrow,
    keywords: ['text', 'normal'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run()
  },
  {
    title: 'Heading 1',
    icon: Heading1,
    keywords: ['h1', 'title'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run()
  },
  {
    title: 'Heading 2',
    icon: Heading2,
    keywords: ['h2', 'subtitle'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run()
  },
  {
    title: 'Heading 3',
    icon: Heading3,
    keywords: ['h3'],
    run: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run()
  },
  {
    title: 'Bulleted list',
    icon: List,
    keywords: ['bullet', 'ul'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
  },
  {
    title: 'Numbered list',
    icon: ListOrdered,
    keywords: ['ordered', 'ol', 'numbers'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
  },
  {
    title: 'Checklist',
    icon: ListTodo,
    keywords: ['todo', 'task', 'checkbox'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
  },
  {
    title: 'Table',
    icon: Table,
    keywords: ['grid'],
    run: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run()
  },
  {
    title: 'Image',
    icon: Image,
    keywords: ['picture', 'photo'],
    run: (editor, range, context) => {
      editor.chain().focus().deleteRange(range).run()
      context.pickAndInsertImage()
    }
  },
  {
    title: 'Math equation',
    icon: Sigma,
    keywords: ['latex', 'formula', 'equation'],
    run: (editor, range) => {
      // Mirrors MathPopover: the math extension recognizes literal $...$
      // text — insert it with the cursor left between the two $ signs so
      // the user can type the expression straight in, in place.
      editor.chain().focus().deleteRange(range).insertContent('$$').run()
      editor.commands.setTextSelection(range.from + 1)
    }
  },
  {
    title: 'Audio recording',
    icon: Mic,
    keywords: ['record', 'voice', 'mic'],
    run: (editor, range, context) => {
      editor.chain().focus().deleteRange(range).run()
      context.startAudioRecording()
    }
  },
  {
    title: 'Link',
    icon: Link2,
    keywords: ['url', 'href'],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).run()
      const href = window.prompt('Link URL')?.trim()
      if (href) {
        editor
          .chain()
          .focus()
          .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
          .run()
      }
    }
  },
  {
    title: 'Blockquote',
    icon: Quote,
    keywords: ['quote'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
  },
  {
    title: 'Divider',
    icon: SeparatorHorizontal,
    keywords: ['hr', 'separator', 'line', 'rule'],
    run: (editor, range) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
  }
]

export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS
  return SLASH_ITEMS.filter(
    (item) => item.title.toLowerCase().includes(q) || item.keywords?.some((k) => k.includes(q))
  )
}
