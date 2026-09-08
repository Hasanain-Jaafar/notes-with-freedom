import { create } from 'zustand'
import type {
  NotebookDTO,
  SectionDTO,
  PageSummaryDTO,
  PageDTO,
  TagDTO,
  TaggedPageDTO
} from '@shared/ipc-channels'
import { nextSectionColor } from '../lib/sectionColors'
import { starterPageContent } from '../lib/starterPageContent'

const STARTER_SECTION_NAME = 'Start Here 😊'
const STARTER_SECTION_COLOR = '#C13B8F'
const STARTER_PAGE_TITLE = 'How to use this App'

/** Seeds a fresh, empty data folder with a starter notebook/section/page so a
 * brand-new install never lands on the confusing "No notebook — Add section
 * does nothing" empty state. Only runs when notebooks.list() comes back
 * empty, i.e. a genuinely new install or a new PC pointed at an empty
 * shared folder — never touches an existing notebook. */
async function seedStarterNotebook(): Promise<void> {
  const notebook = await window.api.notebooks.create('My Notebook')
  const section = await window.api.sections.create(notebook.id, STARTER_SECTION_NAME, STARTER_SECTION_COLOR)
  const page = await window.api.pages.create(section.id, STARTER_PAGE_TITLE)
  await window.api.pages.saveContent(page.id, STARTER_PAGE_TITLE, JSON.stringify(starterPageContent))
}

interface AppState {
  notebooks: NotebookDTO[]
  sectionsByNotebook: Record<number, SectionDTO[]>
  pagesBySection: Record<number, PageSummaryDTO[]>

  activeNotebookId: number | null
  activeSectionId: number | null

  // Only the currently-open page's content lives in memory — the rest of the
  // tree stays as lightweight metadata until the user actually opens it.
  activePage: PageDTO | null
  activePageDirty: boolean

  // Set by navigateToPage when it came from a search result — Editor picks
  // this up once activePage.id matches pageId (content actually loaded), to
  // select and scroll to the matched text instead of just landing at the
  // top of the page. Carrying pageId alongside the term (rather than a bare
  // string) matters: navigateToPage sets this BEFORE the target page finishes
  // loading, so Editor's effect fires first against the still-old activePage
  // — without pageId to check against, it would see no match, clear the
  // term, and the real target page would land with no highlight at all.
  // One-shot: cleared by Editor right after it actually applies.
  searchHighlight: { pageId: number; term: string } | null

  // All tags that exist (for the properties panel's tag-suggestion
  // dropdown) and the tags attached to the currently open page.
  tags: TagDTO[]
  pageTags: TagDTO[]

  // Which of the sidebar's two mutually-exclusive views is showing: the
  // usual Notebook -> Section -> Page tree, or the flat list of every tag
  // in the app. selectedTagId/taggedPages back the latter — set by
  // selectTag, callable from anywhere a tag pill appears (not just the
  // sidebar's own Tags list), since clicking a tag is supposed to jump
  // there and show that tag's pages regardless of where it was clicked.
  sidebarView: 'notebook' | 'tags'
  selectedTagId: number | null
  taggedPages: TaggedPageDTO[]

  loadNotebooks: () => Promise<void>
  loadSections: (notebookId: number) => Promise<void>
  loadPages: (sectionId: number) => Promise<void>
  setActiveNotebook: (notebookId: number) => Promise<void>
  setActiveSection: (sectionId: number) => Promise<void>
  createNotebook: (name: string) => Promise<void>
  renameNotebook: (notebookId: number, name: string) => Promise<void>
  deleteNotebook: (notebookId: number) => Promise<void>
  createSection: (name: string) => Promise<void>
  createPage: (title: string) => Promise<void>
  deleteSection: (sectionId: number) => Promise<void>
  setSectionColor: (sectionId: number, color: string | null) => Promise<void>
  renameSection: (sectionId: number, name: string) => Promise<void>
  deletePage: (pageId: number) => Promise<void>
  renamePage: (pageId: number, title: string) => Promise<void>
  openPage: (pageId: number) => Promise<void>
  // Jumps straight to a page from outside its section's own page list (e.g. a
  // search result) — unlike openPage, also switches the active notebook/section
  // so the sidebar highlights the right place instead of staying on whatever
  // was open before.
  navigateToPage: (
    notebookId: number,
    sectionId: number,
    pageId: number,
    highlightTerm?: string
  ) => Promise<void>
  clearSearchHighlight: () => void
  updateActivePageContent: (title: string, contentJson: string) => void
  updateActivePageProperties: (propertiesJson: string) => void

  loadTags: () => Promise<void>
  loadPageTags: (pageId: number) => Promise<void>
  addTagToActivePage: (tagName: string) => Promise<void>
  removeTagFromActivePage: (tagId: number) => Promise<void>
  setSidebarView: (view: 'notebook' | 'tags') => void
  // Switches the sidebar to the Tags view and loads every page carrying
  // this tag — the single entry point for "clicking a tag pill filters the
  // note list," called both from the sidebar's own Tags list and from tag
  // pills anywhere else (e.g. the properties panel).
  selectTag: (tagId: number) => Promise<void>
  renameTag: (tagId: number, name: string) => Promise<void>
  deleteTag: (tagId: number) => Promise<void>
  setTagColor: (tagId: number, color: string) => Promise<void>
}

export const useAppStore = create<AppState>((set, get) => ({
  notebooks: [],
  sectionsByNotebook: {},
  pagesBySection: {},
  activeNotebookId: null,
  activeSectionId: null,
  activePage: null,
  activePageDirty: false,
  searchHighlight: null,
  tags: [],
  pageTags: [],
  sidebarView: 'notebook',
  selectedTagId: null,
  taggedPages: [],

  loadNotebooks: async () => {
    const notebooks = await window.api.notebooks.list()
    if (notebooks.length === 0) {
      // Fresh data folder (new install, or a new PC pointed at an empty
      // shared folder) — seed a starter notebook instead of landing the
      // user on an empty "No notebook" state with no obvious way forward.
      await seedStarterNotebook()
      return get().loadNotebooks()
    }
    set({ notebooks })
    if (!get().activeNotebookId && notebooks.length > 0) {
      await get().setActiveNotebook(notebooks[0].id)
    }
  },

  loadSections: async (notebookId) => {
    const list = await window.api.sections.list(notebookId)
    set((state) => ({
      sectionsByNotebook: { ...state.sectionsByNotebook, [notebookId]: list }
    }))
  },

  loadPages: async (sectionId) => {
    const list = await window.api.pages.list(sectionId)
    set((state) => ({
      pagesBySection: { ...state.pagesBySection, [sectionId]: list }
    }))
  },

  setActiveNotebook: async (notebookId) => {
    set({ activeNotebookId: notebookId, activeSectionId: null, activePage: null })
    await get().loadSections(notebookId)
    const sections = get().sectionsByNotebook[notebookId] ?? []
    if (sections.length > 0) {
      await get().setActiveSection(sections[0].id)
    }
  },

  setActiveSection: async (sectionId) => {
    set({ activeSectionId: sectionId, activePage: null })
    await get().loadPages(sectionId)
  },

  createNotebook: async (name) => {
    const notebook = await window.api.notebooks.create(name)
    await get().loadNotebooks()
    await get().setActiveNotebook(notebook.id)
  },

  renameNotebook: async (notebookId, name) => {
    set((state) => ({
      notebooks: state.notebooks.map((n) => (n.id === notebookId ? { ...n, name } : n))
    }))
    await window.api.notebooks.rename(notebookId, name)
  },

  deleteNotebook: async (notebookId) => {
    const { activeNotebookId } = get()
    await window.api.notebooks.delete(notebookId)

    // ON DELETE CASCADE (see schema.ts) already removed the notebook's
    // sections/pages/attachments in the database — clear their cached
    // entries here too so a stale row can't briefly flash on screen.
    set((state) => {
      const { [notebookId]: _removedSections, ...sectionsByNotebook } = state.sectionsByNotebook
      return { sectionsByNotebook }
    })

    if (activeNotebookId === notebookId) {
      set({ activeNotebookId: null, activeSectionId: null, activePage: null })
    }
    await get().loadNotebooks()
  },

  createSection: async (name) => {
    const notebookId = get().activeNotebookId
    if (!notebookId) return
    const existing = get().sectionsByNotebook[notebookId] ?? []
    const color = nextSectionColor(existing.length)
    const section = await window.api.sections.create(notebookId, name, color)
    await get().loadSections(notebookId)
    await get().setActiveSection(section.id)
  },

  createPage: async (title) => {
    const sectionId = get().activeSectionId
    if (!sectionId) return
    const page = await window.api.pages.create(sectionId, title)
    await get().loadPages(sectionId)
    await get().openPage(page.id)
  },

  deleteSection: async (sectionId) => {
    const { activeSectionId, activeNotebookId } = get()
    if (!activeNotebookId) return

    await window.api.sections.delete(sectionId)

    set((state) => {
      const { [sectionId]: _removed, ...pagesBySection } = state.pagesBySection
      return { pagesBySection }
    })
    await get().loadSections(activeNotebookId)

    if (activeSectionId === sectionId) {
      const remaining = get().sectionsByNotebook[activeNotebookId] ?? []
      if (remaining.length > 0) {
        await get().setActiveSection(remaining[0].id)
      } else {
        set({ activeSectionId: null, activePage: null })
      }
    }
  },

  setSectionColor: async (sectionId, color) => {
    const { activeNotebookId } = get()
    if (!activeNotebookId) return

    set((state) => ({
      sectionsByNotebook: {
        ...state.sectionsByNotebook,
        [activeNotebookId]: (state.sectionsByNotebook[activeNotebookId] ?? []).map((s) =>
          s.id === sectionId ? { ...s, color } : s
        )
      }
    }))
    await window.api.sections.setColor(sectionId, color)
  },

  renameSection: async (sectionId, name) => {
    const { activeNotebookId } = get()
    if (!activeNotebookId) return

    set((state) => ({
      sectionsByNotebook: {
        ...state.sectionsByNotebook,
        [activeNotebookId]: (state.sectionsByNotebook[activeNotebookId] ?? []).map((s) =>
          s.id === sectionId ? { ...s, name } : s
        )
      }
    }))
    await window.api.sections.rename(sectionId, name)
  },

  deletePage: async (pageId) => {
    const { activeSectionId, activePage } = get()
    if (!activeSectionId) return

    await window.api.pages.delete(pageId)
    await get().loadPages(activeSectionId)

    if (activePage?.id === pageId) set({ activePage: null })
  },

  renamePage: async (pageId, title) => {
    const { activePage, activeSectionId } = get()
    if (activePage?.id === pageId) {
      set({ activePage: { ...activePage, title } })
      await window.api.pages.saveContent(pageId, title, activePage.contentJson)
    } else {
      const page = await window.api.pages.get(pageId)
      if (!page) return
      await window.api.pages.saveContent(pageId, title, page.contentJson)
    }
    if (activeSectionId) await get().loadPages(activeSectionId)
  },

  openPage: async (pageId) => {
    const page = await window.api.pages.get(pageId)
    if (page) set({ activePage: page, activePageDirty: false })
  },

  navigateToPage: async (notebookId, sectionId, pageId, highlightTerm) => {
    // sectionId/notebookId ultimately come from a search result — guard
    // against passing undefined/null through to the IPC layer, where sql.js
    // rejects binding an unknown-type value with an opaque native error
    // instead of a catchable one.
    if (!notebookId || !sectionId || !pageId) return
    set({
      activeNotebookId: notebookId,
      activeSectionId: sectionId,
      searchHighlight: highlightTerm ? { pageId, term: highlightTerm } : null
    })
    await Promise.all([get().loadSections(notebookId), get().loadPages(sectionId)])
    await get().openPage(pageId)
  },

  clearSearchHighlight: () => set({ searchHighlight: null }),

  updateActivePageContent: (title, contentJson) => {
    const current = get().activePage
    if (!current) return
    set((state) => ({
      activePage: { ...current, title, contentJson },
      activePageDirty: true,
      // Keeps the sidebar's page list in sync with the title as it's typed
      // — without this, renaming here (the title input at the top of the
      // page, the normal way to rename) only ever updates activePage, and
      // the sidebar keeps showing the old title until something else
      // happens to trigger a loadPages() for this section (e.g. switching
      // sections away and back).
      pagesBySection: {
        ...state.pagesBySection,
        [current.sectionId]: (state.pagesBySection[current.sectionId] ?? []).map((p) =>
          p.id === current.id ? { ...p, title } : p
        )
      }
    }))
  },

  updateActivePageProperties: (propertiesJson) => {
    const current = get().activePage
    if (!current) return
    set({ activePage: { ...current, properties: propertiesJson }, activePageDirty: true })
  },

  loadTags: async () => {
    const list = await window.api.tags.list()
    set({ tags: list })
  },

  loadPageTags: async (pageId) => {
    const list = await window.api.tags.listForPage(pageId)
    set({ pageTags: list })
  },

  addTagToActivePage: async (tagName) => {
    const page = get().activePage
    if (!page) return
    const tag = await window.api.tags.addToPage(page.id, tagName)
    if (!tag) return
    set((state) => ({
      pageTags: state.pageTags.some((t) => t.id === tag.id) ? state.pageTags : [...state.pageTags, tag],
      tags: state.tags.some((t) => t.id === tag.id)
        ? state.tags
        : [...state.tags, tag].sort((a, b) => a.name.localeCompare(b.name))
    }))
  },

  removeTagFromActivePage: async (tagId) => {
    const page = get().activePage
    if (!page) return
    set((state) => ({ pageTags: state.pageTags.filter((t) => t.id !== tagId) }))
    await window.api.tags.removeFromPage(page.id, tagId)
  },

  setSidebarView: (view) => set({ sidebarView: view }),

  selectTag: async (tagId) => {
    set({ sidebarView: 'tags', selectedTagId: tagId })
    const list = await window.api.tags.pages(tagId)
    // The user may have already clicked a different tag (or left the Tags
    // view) before this resolves — don't let a slow, now-stale fetch
    // overwrite whatever's current.
    if (get().selectedTagId !== tagId) return
    set({ taggedPages: list })
  },

  renameTag: async (tagId, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const ok = await window.api.tags.rename(tagId, trimmed)
    if (!ok) return // name collided with a different existing tag
    set((state) => ({
      tags: state.tags.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t)),
      pageTags: state.pageTags.map((t) => (t.id === tagId ? { ...t, name: trimmed } : t))
    }))
  },

  deleteTag: async (tagId) => {
    await window.api.tags.delete(tagId)
    set((state) => {
      const wasSelected = state.selectedTagId === tagId
      return {
        tags: state.tags.filter((t) => t.id !== tagId),
        pageTags: state.pageTags.filter((t) => t.id !== tagId),
        selectedTagId: wasSelected ? null : state.selectedTagId,
        taggedPages: wasSelected ? [] : state.taggedPages,
        sidebarView: wasSelected ? 'notebook' : state.sidebarView
      }
    })
  },

  setTagColor: async (tagId, color) => {
    set((state) => ({
      tags: state.tags.map((t) => (t.id === tagId ? { ...t, color } : t)),
      pageTags: state.pageTags.map((t) => (t.id === tagId ? { ...t, color } : t))
    }))
    await window.api.tags.setColor(tagId, color)
  }
}))
