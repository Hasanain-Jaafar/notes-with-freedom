import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdir, copyFile, writeFile } from 'fs/promises'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { IPC } from '@shared/ipc-channels'
import type { AttachmentDTO } from '@shared/ipc-channels'
import { getDb, scheduleSave } from './client'
import { attachments } from './schema'
import { getDataDir } from '../storageConfig'

// Resolved from storageConfig, same as the database file — see the comment
// on dbFilePath() in client.ts.
export function mediaRootPath(): string {
  return join(getDataDir(), 'media')
}

function toMediaUrl(relativePath: string): string {
  return `app-media:///${relativePath.split('\\').join('/')}`
}

async function notebookMediaDir(notebookId: number): Promise<string> {
  const dir = join(mediaRootPath(), `notebook-${notebookId}`)
  await mkdir(dir, { recursive: true })
  return dir
}

export function registerAttachmentIpcHandlers(): void {
  const db = getDb()

  ipcMain.handle(
    IPC.ATTACHMENT_PICK_IMAGE,
    async (event, notebookId: number, pageId: number): Promise<AttachmentDTO | null> => {
      const window = BrowserWindow.fromWebContents(event.sender)
      const dialogOptions: Electron.OpenDialogOptions = {
        title: 'Insert image',
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }]
      }
      const result = window
        ? await dialog.showOpenDialog(window, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions)
      if (result.canceled || result.filePaths.length === 0) return null

      const sourcePath = result.filePaths[0]
      const ext = extname(sourcePath) || '.png'
      const filename = `${randomUUID()}${ext}`
      const dir = await notebookMediaDir(notebookId)
      await copyFile(sourcePath, join(dir, filename))

      const relativePath = `notebook-${notebookId}/${filename}`
      db.insert(attachments).values({ pageId, kind: 'image', relativePath }).run()
      scheduleSave()

      return { relativePath, url: toMediaUrl(relativePath) }
    }
  )

  ipcMain.handle(
    IPC.ATTACHMENT_SAVE_AUDIO,
    async (
      _e,
      notebookId: number,
      pageId: number,
      bytes: Uint8Array,
      extension: string
    ): Promise<AttachmentDTO> => {
      const filename = `${randomUUID()}.${extension}`
      const dir = await notebookMediaDir(notebookId)
      await writeFile(join(dir, filename), Buffer.from(bytes))

      const relativePath = `notebook-${notebookId}/${filename}`
      db.insert(attachments).values({ pageId, kind: 'audio', relativePath }).run()
      scheduleSave()

      return { relativePath, url: toMediaUrl(relativePath) }
    }
  )
}
