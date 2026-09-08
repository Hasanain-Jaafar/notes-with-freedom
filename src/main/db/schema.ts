import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Notebook -> Section -> Page hierarchy. Page content is stored as a TipTap JSON
// document (text column). Attachments (audio/images) are never stored here — only
// their relative file path, resolved against the per-notebook media folder on disk.

export const notebooks = sqliteTable('notebooks', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`)
})

export const sections = sqliteTable('sections', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  notebookId: integer('notebook_id')
    .notNull()
    .references(() => notebooks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  color: text('color'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`)
})

export const pages = sqliteTable('pages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sectionId: integer('section_id')
    .notNull()
    .references(() => sections.id, { onDelete: 'cascade' }),
  title: text('title').notNull().default('Untitled page'),
  // TipTap JSON document, serialized. Kept debounced on write (see db/client.ts).
  contentJson: text('content_json').notNull().default('{}'),
  // Plain-text extraction of contentJson, kept in sync by the IPC save handler so
  // the FTS5 index (see db/fts.ts) never has to parse JSON inside a trigger.
  contentText: text('content_text').notNull().default(''),
  // Arbitrary user-defined key/value pairs (properties panel) — serialized JSON
  // object, text values only. Kept as a JSON blob rather than a separate table
  // since these are free-form and per-page, not a relation worth normalizing.
  properties: text('properties').notNull().default('{}'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`),
  updatedAt: text('updated_at').notNull().default(sql`(current_timestamp)`)
})

export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color')
})

export const pageTags = sqliteTable('page_tags', {
  pageId: integer('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  tagId: integer('tag_id')
    .notNull()
    .references(() => tags.id, { onDelete: 'cascade' })
})

// Attachments referenced by relative file path only — binary data lives on disk
// under <notebookFolder>/media/, never in the database.
export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  pageId: integer('page_id')
    .notNull()
    .references(() => pages.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['image', 'audio'] }).notNull(),
  relativePath: text('relative_path').notNull(),
  createdAt: text('created_at').notNull().default(sql`(current_timestamp)`)
})
