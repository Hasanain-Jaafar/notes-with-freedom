import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause, RotateCcw, RotateCw, Trash2, GripVertical } from 'lucide-react'

const SKIP_SECONDS = 10

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '0:00'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  const secs = total % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    audio: {
      insertAudio: (attrs: { src: string }) => ReturnType
    }
  }
}

export const AudioNode = Node.create({
  name: 'audio',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-audio-node]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-audio-node': '' })]
  },

  addCommands() {
    return {
      insertAudio:
        (attrs: { src: string }) =>
        ({ chain }) =>
          chain()
            .insertContent({ type: this.name, attrs })
            .run()
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioNodeView)
  }
})

function AudioNodeView({ node, deleteNode }: NodeViewProps): React.JSX.Element {
  const src = node.attrs.src as string | null
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!containerRef.current || !src) return

    const wavesurfer = WaveSurfer.create({
      container: containerRef.current,
      height: 36,
      waveColor: '#9ca8ba',
      progressColor: 'hsl(217 91% 60%)',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 2,
      url: src
    })
    wavesurferRef.current = wavesurfer

    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    const onReady = (d: number): void => setDuration(d)
    const onTimeUpdate = (t: number): void => setCurrentTime(t)
    const onFinish = (): void => {
      setPlaying(false)
      setCurrentTime(0)
    }
    wavesurfer.on('play', onPlay)
    wavesurfer.on('pause', onPause)
    wavesurfer.on('ready', onReady)
    wavesurfer.on('timeupdate', onTimeUpdate)
    wavesurfer.on('finish', onFinish)

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
    }
  }, [src])

  const skip = useCallback((deltaSeconds: number) => {
    const wavesurfer = wavesurferRef.current
    if (!wavesurfer) return
    const next = Math.min(
      Math.max(wavesurfer.getCurrentTime() + deltaSeconds, 0),
      wavesurfer.getDuration()
    )
    wavesurfer.setTime(next)
  }, [])

  return (
    // Gradient border via the padding trick: NodeViewWrapper (ProseMirror's
    // required DOM anchor for this node — can't be swapped for a plain div)
    // paints the gradient and shows a 2px ring of it around the inner card;
    // the inner div carries glass-card's own translucent/blurred background
    // so the border color can't just be set directly on it — border-color
    // has no gradient support in CSS. overflow-hidden on the outer div is
    // what actually keeps the corners clean: without it, the inner card's
    // backdrop-blur + border-radius doesn't reliably self-clip in Chromium,
    // so its corners can render a hair outside the gradient's own rounded
    // edge. Matching integer radii (8px outer, 6px inner, exactly the 2px
    // ring apart) avoids the sub-pixel snapping a fractional radius invites.
    <NodeViewWrapper
      className="group my-2 overflow-hidden rounded-lg bg-gradient-to-r from-[#638cff] via-[#a78bfa] to-[#f498c2] p-[2px]"
      contentEditable={false}
    >
      {/* border-0 cancels .glass-card's own 1px border (it's a shared
          utility class, not touched directly) — leaving it in place drew a
          second, misaligned border ring just inside the gradient one,
          which is what made the corners look messy. */}
      <div className="glass-card rounded-md border-0 flex items-center gap-1.5 p-2">
        {/* data-drag-handle is required by TipTap's React node views — the
            schema's draggable:true alone doesn't make a custom React
            NodeView draggable; it just enables the node type to BE dragged,
            and TipTap needs this attribute to know which element within the
            view is the actual grab point. draggable={false} on every other
            interactive element below stops the browser from also trying to
            start a drag from a mousedown-and-move on them. */}
        <span
          data-drag-handle
          draggable
          title="Drag to move"
          className="flex h-7 w-4 shrink-0 cursor-grab items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100"
        >
          <GripVertical size={14} />
        </span>
        <button
          draggable={false}
          title={`Back ${SKIP_SECONDS}s`}
          onClick={() => skip(-SKIP_SECONDS)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        >
          <RotateCcw size={14} />
        </button>
        <button
          draggable={false}
          title={playing ? 'Pause' : 'Play'}
          onClick={() => wavesurferRef.current?.playPause()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground hover:opacity-90"
        >
          {playing ? <Pause size={14} /> : <Play size={14} className="ml-0.5" />}
        </button>
        <button
          draggable={false}
          title={`Forward ${SKIP_SECONDS}s`}
          onClick={() => skip(SKIP_SECONDS)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-primary/10 hover:text-foreground"
        >
          <RotateCw size={14} />
        </button>

        <div
          ref={containerRef}
          draggable={false}
          className="min-w-0 flex-1 rounded-sm bg-black/[0.03] px-1 dark:bg-white/5"
        />

        <span className="shrink-0 select-none text-xs tabular-nums text-muted-foreground">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <button
          draggable={false}
          title="Delete audio"
          onClick={() => {
            // Removing the node only ever edited this page's JSON — the
            // file on disk needs its own explicit delete or it just stays
            // in the notebook's media folder forever.
            if (src) void window.api.attachments.delete(src)
            deleteNode()
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </NodeViewWrapper>
  )
}
