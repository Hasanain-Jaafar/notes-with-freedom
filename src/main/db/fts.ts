import type { Database } from 'sql.js-fts5'

// FTS5 is not exposed by Drizzle, so the virtual table and its sync triggers are
// raw SQL. Triggers update only the row that changed (insert/update/delete on
// `pages`) rather than rebuilding the whole index on every save.

export function setupFts(db: Database): void {
  db.run(`
    CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
      title,
      content_text,
      content='pages',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS pages_fts_ai AFTER INSERT ON pages BEGIN
      INSERT INTO pages_fts(rowid, title, content_text)
      VALUES (new.id, new.title, new.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_fts_ad AFTER DELETE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content_text)
      VALUES ('delete', old.id, old.title, old.content_text);
    END;

    CREATE TRIGGER IF NOT EXISTS pages_fts_au AFTER UPDATE ON pages BEGIN
      INSERT INTO pages_fts(pages_fts, rowid, title, content_text)
      VALUES ('delete', old.id, old.title, old.content_text);
      INSERT INTO pages_fts(rowid, title, content_text)
      VALUES (new.id, new.title, new.content_text);
    END;
  `)
}

export interface FtsHit {
  pageId: number
  title: string
  snippet: string
  sectionId: number
  notebookId: number
}

/** Turns raw user input into a safe, prefix-matching FTS5 query: each word
 * gets quoted (so stray characters FTS5's query syntax would otherwise treat
 * as operators — colons, hyphens, unbalanced quotes — can't throw a MATCH
 * syntax error) and suffixed with `*` (so a still-partial word, like "wor"
 * before the user finishes typing "world", already matches — without this,
 * live-as-you-type search would only ever return results once a whole word
 * was typed). Returns '' for blank input, which callers should short-circuit. */
function buildMatchQuery(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => `"${token.replace(/"/g, '""')}"*`)
    .join(' ')
}

export function searchPages(db: Database, query: string): FtsHit[] {
  const matchQuery = buildMatchQuery(query)
  if (!matchQuery) return []

  const stmt = db.prepare(`
    SELECT
      pages_fts.rowid AS pageId,
      pages_fts.title AS title,
      snippet(pages_fts, 1, '<mark>', '</mark>', '…', 12) AS snippet,
      pages.section_id AS sectionId,
      sections.notebook_id AS notebookId
    FROM pages_fts
    JOIN pages ON pages.id = pages_fts.rowid
    JOIN sections ON sections.id = pages.section_id
    WHERE pages_fts MATCH ?
    ORDER BY rank
    LIMIT 50
  `)
  const results: FtsHit[] = []
  stmt.bind([matchQuery])
  while (stmt.step()) {
    const row = stmt.getAsObject()
    results.push({
      pageId: row.pageId as number,
      title: row.title as string,
      snippet: row.snippet as string,
      sectionId: row.sectionId as number,
      notebookId: row.notebookId as number
    })
  }
  stmt.free()
  return results
}
