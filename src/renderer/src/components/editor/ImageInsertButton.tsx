import type { Editor } from '@tiptap/react'
import { Image } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'

interface ImageInsertButtonProps {
  editor: Editor
  notebookId: number
  pageId: number
}

export function ImageInsertButton({
  editor,
  notebookId,
  pageId
}: ImageInsertButtonProps): React.JSX.Element {
  async function handleClick(): Promise<void> {
    const result = await window.api.attachments.pickImage(notebookId, pageId)
    if (!result) return
    editor.chain().focus().setImage({ src: result.url }).run()
  }

  return (
    <ToolbarButton title="Insert image" onClick={() => void handleClick()}>
      <Image size={15} />
    </ToolbarButton>
  )
}
