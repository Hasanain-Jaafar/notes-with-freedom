import { Mic, Square } from 'lucide-react'
import { ToolbarButton } from './ToolbarButton'
import { cn } from '../../lib/utils'

interface AudioRecordButtonProps {
  recording: boolean
  saving: boolean
  onStart: () => void
  onStop: () => void
}

export function AudioRecordButton({
  recording,
  saving,
  onStart,
  onStop
}: AudioRecordButtonProps): React.JSX.Element {
  return (
    <ToolbarButton
      title={recording ? 'Stop recording' : 'Record audio'}
      onClick={recording ? onStop : onStart}
      disabled={saving}
      className={cn(recording && 'bg-red-500/15 text-red-600 hover:bg-red-500/20')}
    >
      {recording ? <Square size={13} className="fill-current" /> : <Mic size={15} />}
    </ToolbarButton>
  )
}
