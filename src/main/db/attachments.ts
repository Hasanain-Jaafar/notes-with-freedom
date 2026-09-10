import { ipcMain, dialog, BrowserWindow } from 'electron'
import { mkdir, copyFile, writeFile, unlink } from 'fs/promises'
import { join, extname, normalize } from 'path'
import { randomUUID } from 'crypto'
import { eq, inArray } from 'drizzle-orm'
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

/** Inverse of toMediaUrl() — mirrors mediaProtocol.ts's own handler exactly
 * (the app-media: scheme is registered "standard", so the first path
 * segment is parsed as the URL's host, not folded into pathname). */
function fromMediaUrl(url: string): string {
  const parsed = new URL(url)
  return decodeURIComponent(parsed.hostname + parsed.pathname).replace(/^\/+/, '')
}

async function notebookMediaDir(notebookId: number): Promise<string> {
  const dir = join(mediaRootPath(), `notebook-${notebookId}`)
  await mkdir(dir, { recursive: true })
  return dir
}

/** Deletes the on-disk files for every attachment belonging to the given
 * pages — called before a page/section/notebook delete, while the
 * attachments rows can still be queried. ON DELETE CASCADE (see schema.ts)
 * cleans up the DB rows themselves once the parent row is deleted; it has
 * no way to touch the filesystem, which is what this covers. Best-effort:
 * a missing file is not an error worth failing the whole delete over. */
export async function deleteAttachmentFilesForPages(pageIds: number[]): Promise<void> {
  if (pageIds.length === 0) return
  const db = getDb()
  const rows = db
    .select({ relativePath: attachments.relativePath })
    .from(attachments)
    .where(inArray(attachments.pageId, pageIds))
    .all()
  const root = normalize(mediaRootPath())

  await Promise.all(
    rows.map(async ({ relativePath }) => {
      const filePath = normalize(join(root, relativePath))
      if (!filePath.startsWith(root)) return
      try {
        await unlink(filePath)
      } catch {
        // Already gone — not fatal.
      }
    })
  )
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

  // Used for pasted/dropped images, which only ever exist as in-memory
  // bytes (clipboard/drag data), unlike ATTACHMENT_PICK_IMAGE's dialog flow
  // which has a real source file on disk to copy from.
  ipcMain.handle(
    IPC.ATTACHMENT_SAVE_IMAGE,
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

  // Removing a node from a page's content (the "delete" button on the
  // image/audio node views) only ever edited the TipTap JSON — the
  // attachments row and, more importantly, the actual file on disk were
  // never touched, so deleted media just piled up in the notebook's media
  // folder forever. This is the missing cleanup step for that.
  ipcMain.handle(IPC.ATTACHMENT_DELETE, async (_e, url: string): Promise<void> => {
    const relativePath = fromMediaUrl(url)
    const root = normalize(mediaRootPath())
    const filePath = normalize(join(root, relativePath))
    if (!filePath.startsWith(root)) return

    db.delete(attachments).where(eq(attachments.relativePath, relativePath)).run()
    scheduleSave()

    try {
      await unlink(filePath)
    } catch {
      // Already gone — not fatal. The DB row (what actually matters for
      // storage bookkeeping) is already cleaned up above regardless.
    }
  })
}
