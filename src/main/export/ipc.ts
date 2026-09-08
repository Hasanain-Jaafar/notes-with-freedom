import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { ExportPdfPayload, ExportDocxPayload, ExportMarkdownPayload } from '@shared/ipc-channels'
import { writePdf } from './toPdf'
import { writeDocx } from './toDocx'
import { writeMarkdown } from './writeMarkdown'

export function registerExportIpcHandlers(): void {
  ipcMain.handle(IPC.EXPORT_PDF, (event, payload: ExportPdfPayload) => writePdf(event, payload))
  ipcMain.handle(IPC.EXPORT_DOCX, (event, payload: ExportDocxPayload) => writeDocx(event, payload))
  ipcMain.handle(IPC.EXPORT_MARKDOWN, (event, payload: ExportMarkdownPayload) =>
    writeMarkdown(event, payload)
  )
}
