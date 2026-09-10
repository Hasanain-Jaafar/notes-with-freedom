import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Sparkles } from 'lucide-react'
import type { WhatsNew } from '@shared/ipc-channels'

/** Shown at most once per version, right after a launch on a newer version
 * than last recorded (see main/updater.ts's computeWhatsNew()) — this is the
 * only place the release notes for a version the user just installed are
 * ever surfaced, since SettingsPanel's own release-notes blurb only reflects
 * a live update-available/downloaded event, which happened in the OLD
 * process and is gone by the time this new version is actually running. */
export function WhatsNewDialog(): React.JSX.Element | null {
  const [whatsNew, setWhatsNew] = useState<WhatsNew>(null)

  useEffect(() => {
    void window.api.updates.getWhatsNew().then(setWhatsNew)
  }, [])

  if (!whatsNew) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => setWhatsNew(null)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-panel w-96 rounded-md p-4 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <Sparkles size={17} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">What&apos;s new</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Updated to version {whatsNew.version}
            </p>
          </div>
        </div>

        {whatsNew.releaseNotes ? (
          // Plain text, not rendered markdown — same call as SettingsPanel's
          // release-notes blurb, and for the same reason.
          <div className="mt-3 max-h-64 overflow-y-auto whitespace-pre-line rounded-sm bg-black/[0.03] p-2 text-xs text-muted-foreground dark:bg-white/5">
            {whatsNew.releaseNotes}
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">
            No release notes were found for this version.
          </p>
        )}

        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setWhatsNew(null)}
            className="rounded-sm bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
