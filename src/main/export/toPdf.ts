import { dialog, app, BrowserWindow } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import type { ExportPdfPayload, ExportResult } from '@shared/ipc-channels'
import { sanitizeFilename } from '@shared/sanitizeFilename'

export async function writePdf(
  event: IpcMainInvokeEvent,
  payload: ExportPdfPayload
): Promise<ExportResult> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const dialogOptions: Electron.SaveDialogOptions = {
    title: 'Export as PDF',
    defaultPath: join(app.getPath('documents'), `${sanitizeFilename(payload.title)}.pdf`),
    filters: [{ name: 'PDF', extensions: ['pdf'] }]
  }
  const result = window
    ? await dialog.showSaveDialog(window, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  if (result.canceled || !result.filePath) return { canceled: true }

  // A hidden, self-contained render surface — not the app's own window. The
  // payload HTML already has its styles inlined and any app-media:// image
  // refs are absolute, so a data: URL avoids writing/cleaning up a temp file.
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  })

  try {
    await printWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(payload.html)}`
    )
    const buffer = await printWindow.webContents.printToPDF({ printBackground: true })
    await writeFile(result.filePath, buffer)
  } finally {
    printWindow.destroy()
  }

  return { canceled: false, filePath: result.filePath }
}
