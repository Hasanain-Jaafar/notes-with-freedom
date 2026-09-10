import { useEffect, useState } from 'react'
import { Square } from 'lucide-react'

interface RecordingBannerProps {
  onStop: () => void
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Rendered inside the note body itself (not just the toolbar button's
 * color change) while an audio recording is in progress — see
 * useAudioRecorder. Deliberately plain React, not a ProseMirror node: a
 * document node would get swept into the debounced autosave if a recording
 * runs longer than the save delay, risking a "Recording…" ghost getting
 * permanently persisted into the page. */
export function RecordingBanner({ onStop }: RecordingBannerProps): React.JSX.Element {
  const [elapsedMs, setElapsedMs] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mb-4 flex w-fit items-center gap-2 rounded-sm border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-sm text-red-600">
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
      </span>
      Recording… {formatElapsed(elapsedMs)}
      <button
        onClick={onStop}
        title="Stop recording"
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm hover:bg-red-500/20"
      >
        <Square size={11} className="fill-current" />
      </button>
    </div>
  )
}
