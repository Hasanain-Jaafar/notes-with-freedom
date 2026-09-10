import { ipcMain } from 'electron'
import { eq, and, desc, sql } from 'drizzle-orm'
import { IPC } from '@shared/ipc-channels'
import type {
  NotebookDTO,
  SectionDTO,
  PageDTO,
  PageSummaryDTO,
  TagDTO,
  TaggedPageDTO
} from '@shared/ipc-channels'
import { nextTagColor } from '@shared/tagColors'
import { getDb, getRawDb, scheduleSave, flushSaveNow } from './client'
import { notebooks, sections, pages, tags, pageTags } from './schema'
import { searchPages } from './fts'
import { deleteAttachmentFilesForPages } from './attachments'

/** Strips TipTap JSON down to plain text for the FTS index — kept in main so the
 * renderer never has to ship a text-extraction copy of the schema. */
function extractPlainText(contentJson: string): string {
  try {
    const doc = JSON.parse(contentJson)
    const parts: string[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const n = node as { text?: string; content?: unknown[] }
      if (typeof n.text === 'string') parts.push(n.text)
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(doc)
    return parts.join(' ')
  } catch {
    return ''
  }
}

export function registerDbIpcHandlers(): void {
  const db = getDb()

  // The sql.js-fts5 binary is compiled against an older SQLite than 3.35, so
  // INSERT ... RETURNING isn't available — insert, then re-select the row by
  // the connection's last insert rowid instead.
  function lastInsertRowid(): number {
    const [[id]] = getRawDb().exec('SELECT last_insert_rowid()')[0].values
    return Number(id)
  }

  ipcMain.handle(IPC.NOTEBOOK_LIST, (): NotebookDTO[] => {
    return db.select().from(notebooks).orderBy(notebooks.sortOrder).all()
  })

  ipcMain.handle(IPC.NOTEBOOK_CREATE, (_e, name: string): NotebookDTO => {
    db.insert(notebooks).values({ name }).run()
    const row = db.select().from(notebooks).where(eq(notebooks.id, lastInsertRowid())).get()!
    scheduleSave()
    return row
  })

  ipcMain.handle(IPC.NOTEBOOK_RENAME, (_e, notebookId: number, name: string): void => {
    db.update(notebooks).set({ name }).where(eq(notebooks.id, notebookId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.NOTEBOOK_DELETE, async (_e, notebookId: number): Promise<void> => {
    // ON DELETE CASCADE (see schema.ts) takes care of the notebook's
    // sections, their pages, and those pages' attachments ROWS — foreign_keys
    // is turned on for this connection (see db/client.ts). It can't touch
    // the filesystem though, so the attachments' actual files have to be
    // cleaned up explicitly first, while their rows can still be queried.
    const pageIds = db
      .select({ id: pages.id })
      .from(pages)
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .where(eq(sections.notebookId, notebookId))
      .all()
      .map((p) => p.id)
    await deleteAttachmentFilesForPages(pageIds)

    db.delete(notebooks).where(eq(notebooks.id, notebookId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.SECTION_LIST, (_e, notebookId: number): SectionDTO[] => {
    return db
      .select({
        id: sections.id,
        notebookId: sections.notebookId,
        name: sections.name,
        color: sections.color,
        sortOrder: sections.sortOrder,
        pageCount: sql<number>`count(${pages.id})`
      })
      .from(sections)
      .leftJoin(pages, eq(pages.sectionId, sections.id))
      .where(eq(sections.notebookId, notebookId))
      .groupBy(sections.id)
      .all()
  })

  ipcMain.handle(
    IPC.SECTION_CREATE,
    (_e, notebookId: number, name: string, color: string | null): SectionDTO => {
      db.insert(sections).values({ notebookId, name, color }).run()
      const row = db.select().from(sections).where(eq(sections.id, lastInsertRowid())).get()!
      scheduleSave()
      return { ...row, pageCount: 0 }
    }
  )

  ipcMain.handle(IPC.SECTION_DELETE, async (_e, sectionId: number): Promise<void> => {
    // ON DELETE CASCADE (see schema.ts) takes care of the section's pages
    // and their attachment ROWS, but not the attachments' actual files —
    // same reasoning as NOTEBOOK_DELETE above.
    const pageIds = db
      .select({ id: pages.id })
      .from(pages)
      .where(eq(pages.sectionId, sectionId))
      .all()
      .map((p) => p.id)
    await deleteAttachmentFilesForPages(pageIds)

    db.delete(sections).where(eq(sections.id, sectionId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.SECTION_SET_COLOR, (_e, sectionId: number, color: string | null): void => {
    db.update(sections).set({ color }).where(eq(sections.id, sectionId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.SECTION_RENAME, (_e, sectionId: number, name: string): void => {
    db.update(sections).set({ name }).where(eq(sections.id, sectionId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.PAGE_LIST, (_e, sectionId: number): PageSummaryDTO[] => {
    return db
      .select({
        id: pages.id,
        sectionId: pages.sectionId,
        title: pages.title,
        updatedAt: pages.updatedAt,
        sortOrder: pages.sortOrder
      })
      .from(pages)
      .where(eq(pages.sectionId, sectionId))
      .orderBy(pages.sortOrder)
      .all()
  })

  ipcMain.handle(IPC.PAGE_GET, (_e, pageId: number): PageDTO | undefined => {
    return db.select().from(pages).where(eq(pages.id, pageId)).get()
  })

  // Bulk fetch (full contentJson, not just PageSummaryDTO) for section export
  // — exporting a section needs every page's content, and a loop of PAGE_GET
  // calls would be exactly the chatty-IPC pattern CLAUDE.md warns against.
  ipcMain.handle(IPC.PAGE_LIST_FULL, (_e, sectionId: number): PageDTO[] => {
    return db
      .select()
      .from(pages)
      .where(eq(pages.sectionId, sectionId))
      .orderBy(pages.sortOrder)
      .all()
  })

  ipcMain.handle(IPC.PAGE_CREATE, (_e, sectionId: number, title: string): PageDTO => {
    db.insert(pages).values({ sectionId, title }).run()
    const row = db.select().from(pages).where(eq(pages.id, lastInsertRowid())).get()!
    scheduleSave()
    return row
  })

  ipcMain.handle(
    IPC.PAGE_SAVE_CONTENT,
    (_e, pageId: number, title: string, contentJson: string): void => {
      db.update(pages)
        .set({
          title,
          contentJson,
          contentText: extractPlainText(contentJson),
          updatedAt: new Date().toISOString()
        })
        .where(eq(pages.id, pageId))
        .run()
      // Debounced: caller (renderer) already debounces keystrokes before invoking
      // this, and the write-to-disk is debounced again here.
      scheduleSave()
    }
  )

  ipcMain.handle(IPC.PAGE_SAVE_PROPERTIES, (_e, pageId: number, propertiesJson: string): void => {
    db.update(pages)
      .set({ properties: propertiesJson, updatedAt: new Date().toISOString() })
      .where(eq(pages.id, pageId))
      .run()
    // Debounced the same way as PAGE_SAVE_CONTENT — the renderer already
    // debounces before calling this.
    scheduleSave()
  })

  ipcMain.handle(IPC.PAGE_DELETE, async (_e, pageId: number): Promise<void> => {
    // Same reasoning as NOTEBOOK_DELETE/SECTION_DELETE above — the cascade
    // only takes care of the attachments row, not its file on disk.
    await deleteAttachmentFilesForPages([pageId])
    db.delete(pages).where(eq(pages.id, pageId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.TAG_LIST, (): TagDTO[] => {
    return db.select().from(tags).orderBy(tags.name).all()
  })

  ipcMain.handle(IPC.TAG_LIST_FOR_PAGE, (_e, pageId: number): TagDTO[] => {
    return db
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(pageTags)
      .innerJoin(tags, eq(pageTags.tagId, tags.id))
      .where(eq(pageTags.pageId, pageId))
      .all()
  })

  // Find-or-create the tag by name and attach it to the page in one round
  // trip — chatty-IPC guardrail (CLAUDE.md) rather than a separate
  // create-tag + attach-tag call pair. Raw SQL (not Drizzle's
  // onConflictDoNothing) for the same reason lastInsertRowid() below is
  // raw: the sql.js-fts5 binary here is an older SQLite than modern
  // ON CONFLICT usage should assume, but INSERT OR IGNORE is universal.
  ipcMain.handle(IPC.TAG_ADD_TO_PAGE, (_e, pageId: number, tagName: string): TagDTO | null => {
    const name = tagName.trim()
    if (!name) return null
    const raw = getRawDb()

    const existingStmt = raw.prepare('SELECT id, name, color FROM tags WHERE name = ?')
    existingStmt.bind([name])
    const found = existingStmt.step()
    const existing = found ? (existingStmt.getAsObject() as unknown as TagDTO) : null
    existingStmt.free()

    let tag: TagDTO
    if (existing) {
      tag = existing
    } else {
      // A brand new tag — assign the next color in rotation (same
      // round-robin approach as section colors) rather than leaving it null.
      const countStmt = raw.prepare('SELECT COUNT(*) AS n FROM tags')
      countStmt.step()
      const { n } = countStmt.getAsObject() as unknown as { n: number }
      countStmt.free()
      const color = nextTagColor(n)
      raw.run('INSERT INTO tags (name, color) VALUES (?, ?)', [name, color])
      tag = { id: lastInsertRowid(), name, color }
    }

    raw.run('INSERT OR IGNORE INTO page_tags (page_id, tag_id) VALUES (?, ?)', [pageId, tag.id])
    scheduleSave()
    return tag
  })

  ipcMain.handle(IPC.TAG_REMOVE_FROM_PAGE, (_e, pageId: number, tagId: number): void => {
    db.delete(pageTags)
      .where(and(eq(pageTags.pageId, pageId), eq(pageTags.tagId, tagId)))
      .run()
    scheduleSave()
  })

  ipcMain.handle(IPC.TAG_RENAME, (_e, tagId: number, name: string): boolean => {
    const trimmed = name.trim()
    if (!trimmed) return false
    // tags.name is UNIQUE — check for a collision with a DIFFERENT tag
    // first, rather than letting a raw SQLite constraint error reach the
    // renderer as an unhandled IPC rejection.
    const collision = db
      .select({ id: tags.id })
      .from(tags)
      .where(eq(tags.name, trimmed))
      .get()
    if (collision && collision.id !== tagId) return false
    db.update(tags).set({ name: trimmed }).where(eq(tags.id, tagId)).run()
    scheduleSave()
    return true
  })

  ipcMain.handle(IPC.TAG_DELETE, (_e, tagId: number): void => {
    // ON DELETE CASCADE (see schema.ts) removes the tag's page_tags rows —
    // the pages themselves are never touched.
    db.delete(tags).where(eq(tags.id, tagId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.TAG_SET_COLOR, (_e, tagId: number, color: string): void => {
    db.update(tags).set({ color }).where(eq(tags.id, tagId)).run()
    scheduleSave()
  })

  ipcMain.handle(IPC.TAG_PAGES, (_e, tagId: number): TaggedPageDTO[] => {
    return db
      .select({
        pageId: pages.id,
        title: pages.title,
        updatedAt: pages.updatedAt,
        sectionId: sections.id,
        sectionName: sections.name,
        notebookId: notebooks.id,
        notebookName: notebooks.name
      })
      .from(pageTags)
      .innerJoin(pages, eq(pageTags.pageId, pages.id))
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .innerJoin(notebooks, eq(sections.notebookId, notebooks.id))
      .where(eq(pageTags.tagId, tagId))
      .orderBy(desc(pages.updatedAt))
      .all()
  })

  ipcMain.handle(IPC.SEARCH_QUERY, (_e, query: string) => {
    if (!query.trim()) return []
    return searchPages(getRawDb(), query)
  })

  // Ensure the in-memory sql.js database is flushed to disk before the app exits.
  process.on('beforeExit', flushSaveNow)
}
