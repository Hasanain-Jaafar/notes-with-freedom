import type { Editor } from '@tiptap/react'
import { Mail } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'

// mailto: bodies are plain text only (no client reliably renders HTML
// there), and most mail clients start silently truncating or refusing very
// long mailto: URLs somewhere past a few thousand characters — there's no
// standard limit, just a de-facto safe ceiling. Trimmed well under that
// rather than risking a note that silently fails to open the mail client
// at all.
const MAX_BODY_CHARS = 1800

export function EmailShareButton({
  editor,
  pageTitle
}: {
  editor: Editor
  pageTitle: string
}): React.JSX.Element {
  return (
    <ToolbarButton
      title="Share via email"
      onClick={() => {
        const text = editor.getText({ blockSeparator: '\n\n' }).trim()
        const truncated = text.length > MAX_BODY_CHARS
        const body = truncated
          ? `${text.slice(0, MAX_BODY_CHARS)}…\n\n(Note truncated for email — open it in Own Notes to see the rest.)`
          : text
        const url = `mailto:?subject=${encodeURIComponent(pageTitle || 'Untitled page')}&body=${encodeURIComponent(body)}`
        // Not shell.openExternal via IPC — App.tsx's setWindowOpenHandler
        // already routes any window.open() through shell.openExternal,
        // which is what hands a mailto: URL off to the OS's default mail
        // client, so no separate main-process wiring is needed here.
        window.open(url)
      }}
    >
      <Mail size={15} />
    </ToolbarButton>
  )
}
