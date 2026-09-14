// Channel names shared between main and renderer/preload so both sides stay in sync.

export const IPC = {
  NOTEBOOK_LIST: 'notebook:list',
  NOTEBOOK_CREATE: 'notebook:create',
  NOTEBOOK_RENAME: 'notebook:rename',
  NOTEBOOK_DELETE: 'notebook:delete',
  SECTION_LIST: 'section:list',
  SECTION_CREATE: 'section:create',
  SECTION_DELETE: 'section:delete',
  SECTION_SET_COLOR: 'section:setColor',
  SECTION_RENAME: 'section:rename',
  SECTIONS_LIST_ALL: 'section:listAll',
  PAGE_LIST: 'page:list',
  PAGE_LIST_FULL: 'page:listFull',
  PAGE_GET: 'page:get',
  PAGE_CREATE: 'page:create',
  PAGE_SAVE_CONTENT: 'page:saveContent',
  PAGE_SAVE_PROPERTIES: 'page:saveProperties',
  PAGE_DELETE: 'page:delete',
  PAGES_LIST_ALL: 'page:listAll',
  PAGE_GET_LOCATION: 'page:getLocation',
  PAGE_LINKS_LIST_ALL: 'pageLinks:listAll',
  TAG_LIST: 'tag:list',
  TAG_LIST_FOR_PAGE: 'tag:listForPage',
  TAG_ADD_TO_PAGE: 'tag:addToPage',
  TAG_REMOVE_FROM_PAGE: 'tag:removeFromPage',
  TAG_RENAME: 'tag:rename',
  TAG_DELETE: 'tag:delete',
  TAG_SET_COLOR: 'tag:setColor',
  TAG_PAGES: 'tag:pages',
  SEARCH_QUERY: 'search:query',
  ATTACHMENT_PICK_IMAGE: 'attachment:pickImage',
  ATTACHMENT_SAVE_IMAGE: 'attachment:saveImage',
  ATTACHMENT_SAVE_AUDIO: 'attachment:saveAudio',
  ATTACHMENT_DELETE: 'attachment:delete',
  LINK_PREVIEW_FETCH: 'linkPreview:fetch',
  STORAGE_GET_PATH: 'storage:getPath',
  STORAGE_CHANGE_LOCATION: 'storage:changeLocation',
  BACKUP_GET_STATS: 'backup:getStats',
  BACKUP_CREATE: 'backup:create',
  BACKUP_PICK_AND_VALIDATE: 'backup:pickAndValidate',
  BACKUP_RESTORE: 'backup:restore',
  APP_GET_VERSION: 'app:getVersion',
  UPDATE_CHECK: 'update:check',
  UPDATE_INSTALL_NOW: 'update:installNow',
  UPDATE_STATUS_CHANGED: 'update:statusChanged',
  UPDATE_GET_WHATS_NEW: 'update:getWhatsNew',
  WINDOW_TOGGLE_MAXIMIZE: 'window:toggleMaximize',
  WINDOW_IS_MAXIMIZED: 'window:isMaximized',
  WINDOW_MAXIMIZE_CHANGED: 'window:maximizeChanged',
  WINDOW_MINIMIZE: 'window:minimize',
  WINDOW_CLOSE: 'window:close',
  EXPORT_PDF: 'export:pdf',
  EXPORT_DOCX: 'export:docx',
  EXPORT_MARKDOWN: 'export:markdown'
} as const

// Custom scheme media files are served through — see main/mediaProtocol.ts.
// Works identically in dev (Vite's http:// origin) and production (file://
// origin) unlike raw file:// src attributes, which some Chromium versions
// refuse to load cross-scheme.
export const MEDIA_SCHEME = 'app-media'

export interface NotebookDTO {
  id: number
  name: string
  sortOrder: number
}

export interface SectionDTO {
  id: number
  notebookId: number
  name: string
  color: string | null
  sortOrder: number
  pageCount: number
}

export interface PageSummaryDTO {
  id: number
  sectionId: number
  title: string
  updatedAt: string
  sortOrder: number
}

export interface PageDTO extends PageSummaryDTO {
  contentJson: string
  // Custom properties (properties panel) — serialized JSON object, text
  // values only. Parse with a fallback; never trust it's well-formed.
  properties: string
  createdAt: string
}

// Lightweight, vault-wide section metadata — powers graph view's section
// nodes (see GraphView.tsx). Deliberately not SectionDTO (scoped to one
// notebook, and carries a pageCount graph view has no use for).
export interface SectionListAllDTO {
  id: number
  name: string
  color: string | null
  notebookId: number
}

// Lightweight, vault-wide page metadata — deliberately not PageSummaryDTO
// (which is scoped to one section and has no notebook/color context). Powers
// both the internal-link picker's search list and graph view's node list, so
// this is the one "list every page" shape rather than a separate one per
// feature.
export interface PageListAllDTO {
  id: number
  title: string
  notebookId: number
  sectionId: number
  sectionColor: string | null
}

// Graph view's edges. Kept separate from PageListAllDTO/PAGES_LIST_ALL since
// only graph view needs edges — the link picker only needs nodes.
export interface PageLinkDTO {
  sourcePageId: number
  targetPageId: number
}

// Resolves a bare pageId to where it currently lives — an in-editor internal
// link only stores pageId (see extensions/InternalLink.ts), so a click needs
// this to still navigate correctly if the target page moved sections/
// notebooks since the link was created.
export interface PageLocationDTO {
  pageId: number
  title: string
  sectionId: number
  notebookId: number
}

export interface TagDTO {
  id: number
  name: string
  color: string | null
}

// A page as it shows up when browsing "everything with this tag" — spans
// notebooks/sections, so (unlike PageSummaryDTO) it carries enough context
// to display and navigate to that page from outside its own section's list.
export interface TaggedPageDTO {
  pageId: number
  title: string
  updatedAt: string
  sectionId: number
  sectionName: string
  notebookId: number
  notebookName: string
}

// changed:false means the user canceled the folder picker, or picked the
// folder data is already in — nothing happened. changed:true means the
// data was copied and the app is about to relaunch to finish switching over.
export type StorageChangeResult = { changed: false } | { changed: true; newDir: string }

export interface StorageStatsDTO {
  pageCount: number
  dbSizeBytes: number
  mediaSizeBytes: number
  lastBackupAt: string | null
}

export type BackupResult =
  | { created: false }
  | { created: true; path: string; lastBackupAt: string }

// The picker and the structural "is this actually a backup" check happen
// together in one call — valid:true/false only appears once the user has
// actually chosen a file (picked:false means they canceled the dialog).
export type PickBackupResult =
  | { picked: false }
  | { picked: true; valid: true; filePath: string }
  | { picked: true; valid: false; filePath: string; error: string }

export interface SearchResultDTO {
  pageId: number
  title: string
  snippet: string
  sectionId: number
  notebookId: number
}

export interface AttachmentDTO {
  relativePath: string
  url: string
}

// Result of pasting a lone link — see main/linkPreview.ts. Null means
// nothing usable was found (no title, no image), in which case the
// renderer falls back to a plain link, same as before this feature existed.
export type LinkPreviewResult = { title: string | null; thumbnailUrl: string | null } | null

export type ExportScope = 'page' | 'section'

export interface ExportPdfPayload {
  scope: ExportScope
  title: string
  html: string
}

export interface ExportDocxPayload {
  scope: ExportScope
  title: string
  bytes: Uint8Array
}

export interface ExportMarkdownFile {
  filename: string
  content: string
}

export interface ExportMarkdownImage {
  filename: string
  bytes: Uint8Array
}

export interface ExportMarkdownPayload {
  scope: ExportScope
  suggestedName: string
  files: ExportMarkdownFile[]
  images: ExportMarkdownImage[]
}

export type ExportResult = { canceled: true } | { canceled: false; filePath: string }

// Pushed to the renderer whenever electron-updater's state changes — see
// main/updater.ts. 'downloaded' is the only state where installNow() does
// anything; the app otherwise keeps running normally through every other
// state so an update check never interrupts note-taking.
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string }
  | { state: 'not-available' }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string; releaseNotes?: string }
  | { state: 'error'; message: string }

// Resolved once per launch by main/updater.ts's checkWhatsNew(): non-null
// only on the first launch after app.getVersion() has moved on from the
// version recorded on the previous launch. A plain request/response rather
// than a broadcast on UPDATE_STATUS_CHANGED above, so the renderer can just
// ask for it on mount instead of racing to subscribe before main fires it.
export type WhatsNew = { version: string; releaseNotes?: string } | null
