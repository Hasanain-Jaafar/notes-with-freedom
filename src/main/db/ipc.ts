import { ipcMain } from 'electron'
import { eq, and, or, desc, inArray, sql } from 'drizzle-orm'
import { IPC } from '@shared/ipc-channels'
import type {
  NotebookDTO,
  SectionDTO,
  SectionListAllDTO,
  PageDTO,
  PageSummaryDTO,
  PageListAllDTO,
  PageLinkDTO,
  PageLocationDTO,
  TagDTO,
  TaggedPageDTO
} from '@shared/ipc-channels'
import { nextTagColor } from '@shared/tagColors'
import { getDb, getRawDb, scheduleSave, flushSaveNow } from './client'
import { notebooks, sections, pages, tags, pageTags, pageLinks } from './schema'
import { searchPages } from './fts'
import { deleteAttachmentFilesForPages } from './attachments'

// Every new page starts with a divider up top (matches the onboarding page's
// own layout — see starterPageContent.ts) rather than the schema's bare '{}'
// column default, so a brand-new blank page still has a title/divider visual
// break before its own body content starts. Set explicitly here rather than
// via the pages table's DDL default (db/client.ts) so it also applies for
// anyone on an existing install, not just a fresh CREATE TABLE.
const DEFAULT_PAGE_CONTENT = { type: 'doc', content: [{ type: 'horizontalRule' }, { type: 'paragraph' }] }

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

/** Collects target pageIds from every internalLink mark in a TipTap JSON doc
 * — powers graph view's edges. Same walk shape as extractPlainText, since
 * this can't be a SQL trigger (see PAGE_SAVE_CONTENT below): triggers can't
 * parse TipTap JSON, only JS can. */
function extractPageLinks(contentJson: string): number[] {
  try {
    const doc = JSON.parse(contentJson)
    const targetIds: number[] = []
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return
      const n = node as { marks?: unknown[]; content?: unknown[] }
      if (Array.isArray(n.marks)) {
        for (const mark of n.marks) {
          if (!mark || typeof mark !== 'object') continue
          const m = mark as { type?: string; attrs?: { pageId?: unknown } }
          if (m.type === 'internalLink' && typeof m.attrs?.pageId === 'number') {
            targetIds.push(m.attrs.pageId)
          }
        }
      }
      if (Array.isArray(n.content)) n.content.forEach(walk)
    }
    walk(doc)
    return targetIds
  } catch {
    return []
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

  // Vault-wide, lightweight — powers graph view's section nodes (see
  // GraphView.tsx). Not SECTION_LIST: that's scoped to one notebook and
  // joins in a pageCount graph view has no use for.
  ipcMain.handle(IPC.SECTIONS_LIST_ALL, (): SectionListAllDTO[] => {
    return db
      .select({ id: sections.id, name: sections.name, color: sections.color, notebookId: sections.notebookId })
      .from(sections)
      .all()
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

  // Lightweight, vault-wide page metadata — reused by both the internal-link
  // picker's search list and graph view's node list (one "list every page"
  // mechanism, not two).
  ipcMain.handle(IPC.PAGES_LIST_ALL, (): PageListAllDTO[] => {
    return db
      .select({
        id: pages.id,
        title: pages.title,
        notebookId: notebooks.id,
        sectionId: sections.id,
        sectionColor: sections.color
      })
      .from(pages)
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .innerJoin(notebooks, eq(sections.notebookId, notebooks.id))
      .all()
  })

  // Resolves a bare pageId to its current section/notebook — an in-editor
  // internal-link mark only stores pageId (see extensions/InternalLink.ts),
  // so a click needs this to still land correctly if the target page was
  // moved to a different section/notebook since the link was made.
  ipcMain.handle(IPC.PAGE_GET_LOCATION, (_e, pageId: number): PageLocationDTO | undefined => {
    return db
      .select({
        pageId: pages.id,
        title: pages.title,
        sectionId: sections.id,
        notebookId: notebooks.id
      })
      .from(pages)
      .innerJoin(sections, eq(pages.sectionId, sections.id))
      .innerJoin(notebooks, eq(sections.notebookId, notebooks.id))
      .where(eq(pages.id, pageId))
      .get()
  })

  // Backs the properties panel's Section dropdown (PagePropertiesPanel.tsx)
  // — re-parenting a page under a different section, possibly in a different
  // notebook. Returns the page's new location (same shape as
  // PAGE_GET_LOCATION) so the renderer can navigate the sidebar to follow it
  // there, the same way clicking a search result does.
  ipcMain.handle(
    IPC.PAGE_MOVE_TO_SECTION,
    (_e, pageId: number, targetSectionId: number): PageLocationDTO | undefined => {
      db.update(pages)
        .set({ sectionId: targetSectionId, updatedAt: new Date().toISOString() })
        .where(eq(pages.id, pageId))
        .run()
      scheduleSave()

      return db
        .select({
          pageId: pages.id,
          title: pages.title,
          sectionId: sections.id,
          notebookId: notebooks.id
        })
        .from(pages)
        .innerJoin(sections, eq(pages.sectionId, sections.id))
        .innerJoin(notebooks, eq(sections.notebookId, notebooks.id))
        .where(eq(pages.id, pageId))
        .get()
    }
  )

  // Filters out any link whose source/target page no longer exists rather
  // than trusting ON DELETE CASCADE (schema.ts) alone — a stale row here
  // (e.g. from before that constraint existed) points graph view's
  // react-force-graph at a node id that isn't in its nodes list, which
  // crashes d3-force outright ("node not found") and blanks the whole graph,
  // not just the dangling link.
  ipcMain.handle(IPC.PAGE_LINKS_LIST_ALL, (): PageLinkDTO[] => {
    const validIds = new Set(
      db
        .select({ id: pages.id })
        .from(pages)
        .all()
        .map((p) => p.id)
    )
    return db
      .select({ sourcePageId: pageLinks.sourcePageId, targetPageId: pageLinks.targetPageId })
      .from(pageLinks)
      .all()
      .filter((l) => validIds.has(l.sourcePageId) && validIds.has(l.targetPageId))
  })

  // Status bar wants just a count for the open page, not the whole graph —
  // a plain COUNT(*) instead of reusing PAGE_LINKS_LIST_ALL's full-table
  // fetch (that one's shaped for graph view, which genuinely needs every
  // edge at once).
  ipcMain.handle(IPC.PAGE_LINKS_COUNT_BACKLINKS, (_e, pageId: number): number => {
    return db.select().from(pageLinks).where(eq(pageLinks.targetPageId, pageId)).all().length
  })

  ipcMain.handle(IPC.PAGE_CREATE, (_e, sectionId: number, title: string): PageDTO => {
    db.insert(pages).values({ sectionId, title, contentJson: JSON.stringify(DEFAULT_PAGE_CONTENT) }).run()
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

      // Rebuild this page's outgoing graph-view edges — touches only this
      // source page's rows, same "just the changed row" spirit as the FTS5
      // triggers in fts.ts, just done in JS since parsing TipTap JSON is
      // beyond what a SQL trigger body can do. Validate against real pages
      // first: target_page_id has ON DELETE CASCADE with foreign_keys ON
      // (db/client.ts), so inserting a stale id (its page got deleted after
      // the link was made) would throw and abort this whole handler,
      // silently losing the title/content update above too.
      const targetIds = [...new Set(extractPageLinks(contentJson))].filter((id) => id !== pageId)
      const validIds = targetIds.length
        ? db
            .select({ id: pages.id })
            .from(pages)
            .where(inArray(pages.id, targetIds))
            .all()
            .map((p) => p.id)
        : []
      db.delete(pageLinks).where(eq(pageLinks.sourcePageId, pageId)).run()
      if (validIds.length) {
        db.insert(pageLinks)
          .values(validIds.map((targetPageId) => ({ sourcePageId: pageId, targetPageId })))
          .run()
      }

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
    // Explicit, not left to ON DELETE CASCADE alone — see PAGE_LINKS_LIST_ALL's
    // comment on why a surviving page_links row here is worse than a no-op
    // (it crashes graph view's force simulation entirely, not just itself).
    db.delete(pageLinks)
      .where(or(eq(pageLinks.sourcePageId, pageId), eq(pageLinks.targetPageId, pageId)))
      .run()
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

  // Ensure the in-memory sql.js database is flushed to disk before the app
  // exits. flushSaveNow's write is async now (see client.ts), but that's
  // still safe here without an explicit await: 'beforeExit' only fires once
  // the event loop has no other work left, and a real pending fs write keeps
  // the loop alive on its own, so Node won't actually exit mid-write.
  process.on('beforeExit', flushSaveNow)
}
