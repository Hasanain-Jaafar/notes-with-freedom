import { useEffect, useState } from 'react'
import type { UpdateStatus } from '@shared/ipc-channels'

/** Live electron-updater status, broadcast from main (see main/updater.ts).
 * Subscribes independently wherever it's called — ipcRenderer.on supports
 * any number of listeners on the same channel, so TopBar's badge and
 * SettingsPanel's detail view each just call this rather than one lifting
 * state down to the other. Mounted for the component's whole lifetime (not
 * gated on anything being open), so a background check that finds an update
 * while nothing is visibly showing it is still reflected the moment
 * something that reads this hook renders. */
export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })

  useEffect(() => {
    return window.api.updates.onStatusChanged(setStatus)
  }, [])

  return status
}
