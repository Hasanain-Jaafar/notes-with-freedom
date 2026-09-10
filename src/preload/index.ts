import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '@shared/ipc-channels'
import type {
  NotebookDTO,
  SectionDTO,
  PageDTO,
  PageSummaryDTO,
  SearchResultDTO,
  AttachmentDTO,
  TagDTO,
  TaggedPageDTO,
  StorageChangeResult,
  StorageStatsDTO,
  BackupResult,
  PickBackupResult,
  ExportPdfPayload,
  ExportDocxPayload,
  ExportMarkdownPayload,
  ExportResult,
  UpdateStatus,
  WhatsNew,
  LinkPreviewResult
} from '@shared/ipc-channels'

const api = {
  notebooks: {
    list: (): Promise<NotebookDTO[]> => ipcRenderer.invoke(IPC.NOTEBOOK_LIST),
    create: (name: string): Promise<NotebookDTO> => ipcRenderer.invoke(IPC.NOTEBOOK_CREATE, name),
    rename: (notebookId: number, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.NOTEBOOK_RENAME, notebookId, name),
    delete: (notebookId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.NOTEBOOK_DELETE, notebookId)
  },
  sections: {
    list: (notebookId: number): Promise<SectionDTO[]> =>
      ipcRenderer.invoke(IPC.SECTION_LIST, notebookId),
    create: (notebookId: number, name: string, color: string | null = null): Promise<SectionDTO> =>
      ipcRenderer.invoke(IPC.SECTION_CREATE, notebookId, name, color),
    delete: (sectionId: number): Promise<void> => ipcRenderer.invoke(IPC.SECTION_DELETE, sectionId),
    setColor: (sectionId: number, color: string | null): Promise<void> =>
      ipcRenderer.invoke(IPC.SECTION_SET_COLOR, sectionId, color),
    rename: (sectionId: number, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.SECTION_RENAME, sectionId, name)
  },
  pages: {
    list: (sectionId: number): Promise<PageSummaryDTO[]> =>
      ipcRenderer.invoke(IPC.PAGE_LIST, sectionId),
    listFull: (sectionId: number): Promise<PageDTO[]> =>
      ipcRenderer.invoke(IPC.PAGE_LIST_FULL, sectionId),
    get: (pageId: number): Promise<PageDTO | undefined> => ipcRenderer.invoke(IPC.PAGE_GET, pageId),
    create: (sectionId: number, title: string): Promise<PageDTO> =>
      ipcRenderer.invoke(IPC.PAGE_CREATE, sectionId, title),
    saveContent: (pageId: number, title: string, contentJson: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PAGE_SAVE_CONTENT, pageId, title, contentJson),
    saveProperties: (pageId: number, propertiesJson: string): Promise<void> =>
      ipcRenderer.invoke(IPC.PAGE_SAVE_PROPERTIES, pageId, propertiesJson),
    delete: (pageId: number): Promise<void> => ipcRenderer.invoke(IPC.PAGE_DELETE, pageId)
  },
  tags: {
    list: (): Promise<TagDTO[]> => ipcRenderer.invoke(IPC.TAG_LIST),
    listForPage: (pageId: number): Promise<TagDTO[]> =>
      ipcRenderer.invoke(IPC.TAG_LIST_FOR_PAGE, pageId),
    addToPage: (pageId: number, tagName: string): Promise<TagDTO | null> =>
      ipcRenderer.invoke(IPC.TAG_ADD_TO_PAGE, pageId, tagName),
    removeFromPage: (pageId: number, tagId: number): Promise<void> =>
      ipcRenderer.invoke(IPC.TAG_REMOVE_FROM_PAGE, pageId, tagId),
    rename: (tagId: number, name: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.TAG_RENAME, tagId, name),
    delete: (tagId: number): Promise<void> => ipcRenderer.invoke(IPC.TAG_DELETE, tagId),
    setColor: (tagId: number, color: string): Promise<void> =>
      ipcRenderer.invoke(IPC.TAG_SET_COLOR, tagId, color),
    pages: (tagId: number): Promise<TaggedPageDTO[]> => ipcRenderer.invoke(IPC.TAG_PAGES, tagId)
  },
  search: {
    query: (text: string): Promise<SearchResultDTO[]> => ipcRenderer.invoke(IPC.SEARCH_QUERY, text)
  },
  storage: {
    getPath: (): Promise<string> => ipcRenderer.invoke(IPC.STORAGE_GET_PATH),
    changeLocation: (): Promise<StorageChangeResult> =>
      ipcRenderer.invoke(IPC.STORAGE_CHANGE_LOCATION)
  },
  backup: {
    getStats: (): Promise<StorageStatsDTO> => ipcRenderer.invoke(IPC.BACKUP_GET_STATS),
    create: (): Promise<BackupResult> => ipcRenderer.invoke(IPC.BACKUP_CREATE),
    pickAndValidate: (): Promise<PickBackupResult> =>
      ipcRenderer.invoke(IPC.BACKUP_PICK_AND_VALIDATE),
    restore: (filePath: string): Promise<void> => ipcRenderer.invoke(IPC.BACKUP_RESTORE, filePath)
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.APP_GET_VERSION)
  },
  updates: {
    check: (): Promise<UpdateStatus> => ipcRenderer.invoke(IPC.UPDATE_CHECK),
    installNow: (): Promise<void> => ipcRenderer.invoke(IPC.UPDATE_INSTALL_NOW),
    onStatusChanged: (callback: (status: UpdateStatus) => void): (() => void) => {
      const listener = (_e: unknown, status: UpdateStatus): void => callback(status)
      ipcRenderer.on(IPC.UPDATE_STATUS_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS_CHANGED, listener)
    },
    // Non-null only right after a launch on a newer version than last
    // recorded — see main/updater.ts's computeWhatsNew().
    getWhatsNew: (): Promise<WhatsNew> => ipcRenderer.invoke(IPC.UPDATE_GET_WHATS_NEW)
  },
  attachments: {
    pickImage: (notebookId: number, pageId: number): Promise<AttachmentDTO | null> =>
      ipcRenderer.invoke(IPC.ATTACHMENT_PICK_IMAGE, notebookId, pageId),
    saveImage: (
      notebookId: number,
      pageId: number,
      bytes: Uint8Array,
      extension: string
    ): Promise<AttachmentDTO> =>
      ipcRenderer.invoke(IPC.ATTACHMENT_SAVE_IMAGE, notebookId, pageId, bytes, extension),
    saveAudio: (
      notebookId: number,
      pageId: number,
      bytes: Uint8Array,
      extension: string
    ): Promise<AttachmentDTO> =>
      ipcRenderer.invoke(IPC.ATTACHMENT_SAVE_AUDIO, notebookId, pageId, bytes, extension),
    delete: (url: string): Promise<void> => ipcRenderer.invoke(IPC.ATTACHMENT_DELETE, url)
  },
  linkPreview: {
    fetch: (notebookId: number, pageId: number, url: string): Promise<LinkPreviewResult> =>
      ipcRenderer.invoke(IPC.LINK_PREVIEW_FETCH, notebookId, pageId, url)
  },
  windowControls: {
    toggleMaximize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_TOGGLE_MAXIMIZE),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke(IPC.WINDOW_IS_MAXIMIZED),
    onMaximizeChanged: (callback: (isMaximized: boolean) => void): (() => void) => {
      const listener = (_e: unknown, isMaximized: boolean): void => callback(isMaximized)
      ipcRenderer.on(IPC.WINDOW_MAXIMIZE_CHANGED, listener)
      return () => ipcRenderer.removeListener(IPC.WINDOW_MAXIMIZE_CHANGED, listener)
    },
    minimize: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_MINIMIZE),
    close: (): Promise<void> => ipcRenderer.invoke(IPC.WINDOW_CLOSE)
  },
  export: {
    pdf: (payload: ExportPdfPayload): Promise<ExportResult> =>
      ipcRenderer.invoke(IPC.EXPORT_PDF, payload),
    docx: (payload: ExportDocxPayload): Promise<ExportResult> =>
      ipcRenderer.invoke(IPC.EXPORT_DOCX, payload),
    markdown: (payload: ExportMarkdownPayload): Promise<ExportResult> =>
      ipcRenderer.invoke(IPC.EXPORT_MARKDOWN, payload)
  }
}

export type NotebookApi = typeof api

// contextIsolation is always on for this app's BrowserWindow (the Electron
// default, never disabled), so contextBridge is the only path exposed.
contextBridge.exposeInMainWorld('electron', electronAPI)
contextBridge.exposeInMainWorld('api', api)
