import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import { Play, Pause } from 'lucide-react'

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

function AudioNodeView({ node }: NodeViewProps): React.JSX.Element {
  const src = node.attrs.src as string | null
  const containerRef = useRef<HTMLDivElement>(null)
  const wavesurferRef = useRef<WaveSurfer | null>(null)
  const [playing, setPlaying] = useState(false)

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
      url: src
    })
    wavesurferRef.current = wavesurfer

    const onPlay = (): void => setPlaying(true)
    const onPause = (): void => setPlaying(false)
    wavesurfer.on('play', onPlay)
    wavesurfer.on('pause', onPause)
    wavesurfer.on('finish', onPause)

    return () => {
      wavesurfer.destroy()
      wavesurferRef.current = null
    }
  }, [src])

  return (
    <NodeViewWrapper
      className="glass-card my-2 flex items-center gap-2 rounded-sm p-2"
      contentEditable={false}
    >
      <button
        onClick={() => wavesurferRef.current?.playPause()}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground hover:opacity-90"
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div ref={containerRef} className="min-w-0 flex-1" />
    </NodeViewWrapper>
  )
}
