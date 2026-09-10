import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import TextAlign from '@tiptap/extension-text-align'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import { MathExtension } from '@aarkue/tiptap-math-extension'
import type { AnyExtension } from '@tiptap/core'
import { FontSize } from '../extensions/fontSize'
import { AudioNode } from '../extensions/AudioNode'
import { ResizableImage } from '../extensions/ResizableImage'
import { LinkPreviewNode } from '../extensions/LinkPreviewNode'

// The live editor's schema, minus SlashCommand (needs a live contextRef,
// meaningless for headless HTML generation) — shared so the export pipeline
// (src/renderer/src/lib/pageExport.ts, pageToDocx.ts) builds its schema from
// the exact same set of node/mark types the live editor uses. Two separate
// copies of this list could silently drift apart over time.
export const EDITOR_EXTENSIONS: AnyExtension[] = [
  // The built-in link extension is disabled in favor of our own instance
  // below, configured with openOnClick: false and driven by LinkPopover.
  StarterKit.configure({ link: false }),
  Highlight.configure({ multicolor: true }),
  Link.configure({ openOnClick: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Placeholder.configure({ placeholder: 'Start writing…' }),
  TextStyle,
  Color,
  FontFamily,
  FontSize,
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ResizableImage,
  LinkPreviewNode,
  Table.configure({ resizable: true }),
  TableRow,
  TableCell,
  TableHeader,
  AudioNode,
  // Type `$...$` inline or `$$...$$` block for LaTeX, rendered via KaTeX.
  MathExtension.configure({ evaluation: false })
]
