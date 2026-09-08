import { dialog, app, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import type { ExportDocxPayload, ExportResult } from '@shared/ipc-channels'
import { sanitizeFilename } from '@shared/sanitizeFilename'

// The .docx bytes themselves are fully assembled in the renderer (see
// src/renderer/src/lib/pageToDocx.ts) — the docx package is isomorphic and
// runs fine there. Main's job here is purely the native dialog + file write.
export async function writeDocx(
  event: IpcMainInvokeEvent,
  payload: ExportDocxPayload
): Promise<ExportResult> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions: Electron.SaveDialogOptions = {
    title: 'Export as Word document',
    defaultPath: join(app.getPath('documents'), `${sanitizeFilename(payload.title)}.docx`),
    filters: [{ name: 'Word document', extensions: ['docx'] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  if (result.canceled || !result.filePath) return { canceled: true }

  await writeFile(result.filePath, Buffer.from(payload.bytes))
  return { canceled: false, filePath: result.filePath }
}
