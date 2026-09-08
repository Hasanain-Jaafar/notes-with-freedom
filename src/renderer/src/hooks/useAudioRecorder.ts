import { useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'

const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']

function pickMimeType(): { mimeType: string; extension: string } {
  const supported = PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type))
  const mimeType = supported ?? ''
  const extension = mimeType.includes('ogg') ? 'ogg' : 'webm'
  return { mimeType, extension }
}

interface UseAudioRecorderResult {
  recording: boolean
  saving: boolean
  startRecording: () => void
  stopRecording: () => void
}

export function useAudioRecorder(
  editor: Editor | null,
  notebookId: number,
  pageId: number
): UseAudioRecorderResult {
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const extensionRef = useRef('webm')

  async function startRecording(): Promise<void> {
    if (recorderRef.current) return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const { mimeType, extension } = pickMimeType()
    extensionRef.current = extension
    chunksRef.current = []

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      stream.getTracks().forEach((track) => track.stop())
      void handleRecordingStopped(recorder.mimeType)
    }

    recorderRef.current = recorder
    recorder.start()
    setRecording(true)
  }

  async function handleRecordingStopped(mimeType: string): Promise<void> {
    recorderRef.current = null
    setRecording(false)
    if (!editor) return
    setSaving(true)
    try {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const bytes = new Uint8Array(await blob.arrayBuffer())
      const result = await window.api.attachments.saveAudio(
        notebookId,
        pageId,
        bytes,
        extensionRef.current
      )
      editor.chain().focus().insertAudio({ src: result.url }).run()
    } finally {
      setSaving(false)
    }
  }

  return {
    recording,
    saving,
    startRecording: () => void startRecording(),
    stopRecording: () => recorderRef.current?.stop()
  }
}
