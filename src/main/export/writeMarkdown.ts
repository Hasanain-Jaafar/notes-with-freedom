import { dialog, app, BrowserWindow } from 'electron'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'
import type { IpcMainInvokeEvent } from 'electron'
import type { ExportMarkdownPayload, ExportResult } from '@shared/ipc-channels'
import { sanitizeFilename } from '@shared/sanitizeFilename'

async function writeImages(imagesDir: string, images: ExportMarkdownPayload['images']): Promise<void> {
  if (images.length === 0) return
  await mkdir(imagesDir, { recursive: true })
  await Promise.all(
    images.map((image) => writeFile(join(imagesDir, image.filename), Buffer.from(image.bytes)))
  )
}

export async function writeMarkdown(
  event: IpcMainInvokeEvent,
  payload: ExportMarkdownPayload
): Promise<ExportResult> {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (payload.scope === 'page') {
    const [file] = payload.files
    const dialogOptions: Electron.SaveDialogOptions = {
      title: 'Export as Markdown',
      defaultPath: join(app.getPath('documents'), `${sanitizeFilename(payload.suggestedName)}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const result = window
      ? await dialog.showSaveDialog(window, dialogOptions)
      : await dialog.showSaveDialog(dialogOptions)
    if (result.canceled || !result.filePath) return { canceled: true }

    await writeFile(result.filePath, file.content, 'utf-8')
    await writeImages(join(dirname(result.filePath), 'images'), payload.images)
    return { canceled: false, filePath: result.filePath }
  }

  // Section scope: one .md per page plus a single shared images/ folder,
  // written into a destination folder the user picks (there's no single
  // "file" to Save As when the output is many files).
  const dialogOptions: Electron.OpenDialogOptions = {
    title: 'Choose a folder to export the section into',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = window
    ? await dialog.showOpenDialog(window, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions)
  if (result.canceled || result.filePaths.length === 0) return { canceled: true }

  const destDir = result.filePaths[0]
  await Promise.all(
    payload.files.map((file) => writeFile(join(destDir, file.filename), file.content, 'utf-8'))
  )
  await writeImages(join(destDir, 'images'), payload.images)
  return { canceled: false, filePath: destDir }
}
