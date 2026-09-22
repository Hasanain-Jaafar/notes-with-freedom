import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlignLeft,
  Calendar,
  ChevronRight,
  Clock,
  FolderTree,
  Hash,
  Link2,
  Palette,
  Plus,
  Shapes,
  Tag,
  X,
  type LucideIcon
} from 'lucide-react'
import type { PageDTO, SectionListAllDTO } from '@shared/ipc-channels'
import { useAppStore } from '../store/useAppStore'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { formatTimestamp } from '../lib/formatTimestamp'
import { pillColorFor } from '../lib/pillColors'
import { cn } from '../lib/utils'
import { TagPill } from './TagPill'
import { TagContextMenu } from './TagContextMenu'
import { ConfirmDialog } from './ConfirmDialog'

const SAVE_DEBOUNCE_MS = 800

// Seeded into a page's properties the first time it's opened with none yet
// (see the page-switch effect below) — ready-made rows so the user doesn't
// have to click "Add a property" and type each key by hand. Local-state only
// until actually edited (see that effect's comment), and ordinary editable/
// removable entries once they exist, same as any property the user adds
// themselves — not a hardcoded field like Section/Tags/Created/Modified.
const DEFAULT_PROPERTY_KEYS = ['Resource', 'Note-Type', 'Description']

// Resource/Note-Type/Description each get a distinct icon instead of the
// generic Hash every other (user-added) property still uses — Hash reads
// fine for an arbitrary key, but these three have a specific meaning worth
// signaling at a glance: a link out, a category, a block of text.
const PROPERTY_ICONS: Record<string, LucideIcon> = {
  Resource: Link2,
  'Note-Type': Shapes,
  Description: AlignLeft
}

interface PropertyEntry {
  id: number
  key: string
  value: string
  isChoice: boolean
}

function parseProperties(json: string, nextId: () => number): PropertyEntry[] {
  try {
    const obj: unknown = JSON.parse(json)
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return []
    return Object.entries(obj as Record<string, unknown>).map(([key, raw]) => {
      // New shape is {value, isChoice}; older saves (before the choice-pill
      // toggle existed) stored the value as a bare string — read both.
      if (raw && typeof raw === 'object' && 'value' in raw) {
        const r = raw as { value?: unknown; isChoice?: unknown }
        return { id: nextId(), key, value: String(r.value ?? ''), isChoice: Boolean(r.isChoice) }
      }
      return { id: nextId(), key, value: String(raw ?? ''), isChoice: false }
    })
  } catch {
    return []
  }
}

function serializeProperties(list: PropertyEntry[]): string {
  const obj: Record<string, { value: string; isChoice: boolean }> = {}
  for (const { key, value, isChoice } of list) {
    if (key.trim()) obj[key] = { value, isChoice }
  }
  return JSON.stringify(obj)
}

// items-start, not items-center — a wrapped multi-line value (long
// Description text, or Tags wrapping to a second line) would otherwise
// vertically center the row's icon/label against the whole wrapped block,
// leaving them floating next to a middle line instead of lining up with
// the first one.
const ROW = 'grid grid-cols-[1.125rem_7.5rem_1fr] items-start gap-x-2 py-1'

// Shared by the property-value edit textarea below — grows the box to fit
// a long value (e.g. a paragraph in Description) instead of leaving it
// scrolling sideways in a fixed single line, same approach as the page
// title's own auto-resize.
function autoResizeTextarea(el: HTMLTextAreaElement | null): void {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function PillBadge({ label }: { label: string }): React.JSX.Element {
  const c = pillColorFor(label)
  return (
    <span className={cn('inline-block rounded-sm px-2 py-0.5 text-sm', c.bg, c.text)}>
      {label}
    </span>
  )
}

/** Deliberately NOT glass-treated — this sits outside the app's UI-chrome
 * glassmorphism (sidebar, toolbar, menus) and is meant to read as part of
 * the note's own content, Notion-property-style: plain rows, no
 * background/border/shadow/blur. Plain React, outside <EditorContent>, so
 * the "/" slash command and the formatting toolbar never see it. */
export function PagePropertiesPanel({ page }: { page: PageDTO }): React.JSX.Element {
  const pageTags = useAppStore((s) => s.pageTags)
  const allTags = useAppStore((s) => s.tags)
  const notebooks = useAppStore((s) => s.notebooks)
  const loadTags = useAppStore((s) => s.loadTags)
  const loadPageTags = useAppStore((s) => s.loadPageTags)
  const addTagToActivePage = useAppStore((s) => s.addTagToActivePage)
  const removeTagFromActivePage = useAppStore((s) => s.removeTagFromActivePage)
  const updateActivePageProperties = useAppStore((s) => s.updateActivePageProperties)
  const movePageToSection = useAppStore((s) => s.movePageToSection)
  const selectTag = useAppStore((s) => s.selectTag)
  const renameTag = useAppStore((s) => s.renameTag)
  const deleteTag = useAppStore((s) => s.deleteTag)
  const setTagColor = useAppStore((s) => s.setTagColor)

  // Every section across every notebook, for the Section dropdown below —
  // fetched once on mount (same "warm on open, no polling" approach as
  // loadTags right underneath) rather than kept in the global store, since
  // nothing else in the app needs a live-updating vault-wide section list.
  const [allSections, setAllSections] = useState<SectionListAllDTO[]>([])
  const [movingSection, setMovingSection] = useState(false)

  const [expanded, setExpanded] = useState(false)
  // Once the user explicitly toggles the panel, the auto-expand-when-tags-
  // load effect below backs off and leaves their choice alone for the rest
  // of this page's session.
  const userToggledRef = useRef(false)

  const [properties, setProperties] = useState<PropertyEntry[]>([])
  const [focusKeyId, setFocusKeyId] = useState<number | null>(null)
  const [editingValueId, setEditingValueId] = useState<number | null>(null)
  const idCounterRef = useRef(0)
  const nextId = (): number => ++idCounterRef.current

  const [tagInput, setTagInput] = useState('')
  const [tagMenuOpen, setTagMenuOpen] = useState(false)
  const tagContainerRef = useRef<HTMLDivElement>(null)
  const [tagContextMenu, setTagContextMenu] = useState<{
    tagId: number
    x: number
    y: number
  } | null>(null)
  const [deleteTagTarget, setDeleteTagTarget] = useState<{ id: number; name: string } | null>(
    null
  )
  // Renaming inline, not via window.prompt() — Electron's renderer doesn't
  // support prompt()/confirm() (it throws "prompt() is not supported"), so
  // this mirrors the same inline-input-in-place pattern SectionsColumn and
  // PagesColumn already use for their own renames.
  const [renamingTagId, setRenamingTagId] = useState<number | null>(null)
  const [renameTagDraft, setRenameTagDraft] = useState('')
  const renameTagInputRef = useRef<HTMLInputElement>(null)

  const debouncedSaveProperties = useDebouncedCallback((pageId: number, json: string) => {
    void window.api.pages.saveProperties(pageId, json)
  }, SAVE_DEBOUNCE_MS)

  useEffect(() => {
    void loadTags()
    void window.api.sections.listAll().then(setAllSections)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Reset local editing state whenever a different page is opened.
  useEffect(() => {
    userToggledRef.current = false
    setEditingValueId(null)
    const entries = parseProperties(page.properties, nextId)
    // Only seeded when the page truly has no properties yet — a page where
    // the user has already removed a default, or added their own, keeps
    // whatever it actually has instead of the default set reappearing. Not
    // committed to disk here (commitProperties isn't called): if the user
    // never touches these, nothing is written, and they're seeded fresh
    // again next time the page is opened. The first edit persists them for
    // real via the normal editPropertyValue/removeProperty/rename paths.
    const seeded =
      entries.length === 0
        ? DEFAULT_PROPERTY_KEYS.map((key) => ({ id: nextId(), key, value: '', isChoice: false }))
        : entries
    setProperties(seeded)
    setExpanded(seeded.length > 0)
    void loadPageTags(page.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  useEffect(() => {
    if (renamingTagId !== null) renameTagInputRef.current?.select()
  }, [renamingTagId])

  // Tags load asynchronously after the effect above — if they come back
  // non-empty and the user hasn't already toggled the panel, expand it too.
  useEffect(() => {
    if (!userToggledRef.current && pageTags.length > 0) setExpanded(true)
  }, [pageTags])

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (tagContainerRef.current && !tagContainerRef.current.contains(e.target as Node)) {
        setTagMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function commitProperties(next: PropertyEntry[]): void {
    setProperties(next)
    const json = serializeProperties(next)
    updateActivePageProperties(json)
    debouncedSaveProperties(page.id, json)
  }

  function addProperty(): void {
    const entry = { id: nextId(), key: '', value: '', isChoice: false }
    commitProperties([...properties, entry])
    setFocusKeyId(entry.id)
    userToggledRef.current = true
    setExpanded(true)
  }

  function removeProperty(id: number): void {
    commitProperties(properties.filter((p) => p.id !== id))
  }

  function renamePropertyKey(id: number, key: string): void {
    commitProperties(properties.map((p) => (p.id === id ? { ...p, key } : p)))
  }

  function editPropertyValue(id: number, value: string): void {
    commitProperties(properties.map((p) => (p.id === id ? { ...p, value } : p)))
  }

  function toggleChoice(id: number): void {
    commitProperties(properties.map((p) => (p.id === id ? { ...p, isChoice: !p.isChoice } : p)))
  }

  async function commitTag(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) return
    await addTagToActivePage(trimmed)
    setTagInput('')
    setTagMenuOpen(false)
  }

  async function submitTagRename(): Promise<void> {
    const id = renamingTagId
    const name = renameTagDraft.trim()
    setRenamingTagId(null)
    if (id !== null && name) await renameTag(id, name)
  }

  function toggleExpanded(): void {
    userToggledRef.current = true
    setExpanded((v) => !v)
  }

  // Every section, grouped by notebook and sorted the same way the sidebar
  // orders things (notebook sortOrder, then section name — SectionListAllDTO
  // itself carries no sortOrder of its own, unlike the per-notebook
  // SECTION_LIST this app's sidebar columns use). Notebooks with no sections
  // yet are dropped — nothing to pick there. Recomputed only when the
  // underlying lists actually change, not on every render, since this scans
  // every section in the vault.
  const groupedSections = useMemo(() => {
    const byNotebook = new Map<number, SectionListAllDTO[]>()
    for (const section of allSections) {
      const list = byNotebook.get(section.notebookId) ?? []
      list.push(section)
      byNotebook.set(section.notebookId, list)
    }
    return [...notebooks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((notebook) => ({
        notebook,
        sections: (byNotebook.get(notebook.id) ?? []).sort((a, b) => a.name.localeCompare(b.name))
      }))
      .filter((group) => group.sections.length > 0)
  }, [allSections, notebooks])

  async function handleSectionChange(targetSectionId: number): Promise<void> {
    if (targetSectionId === page.sectionId) return
    setMovingSection(true)
    try {
      await movePageToSection(page.id, targetSectionId)
    } finally {
      setMovingSection(false)
    }
  }

  const trimmedTagInput = tagInput.trim()
  const existingTagNames = new Set(pageTags.map((t) => t.name.toLowerCase()))
  // Matching existing tags surface first (avoids near-duplicate tags like
  // "recipe" vs "Recipe") — the exact-match check below is separate from
  // this filtered list so an exact match never shows a redundant "Create
  // tag" option next to the real thing.
  const suggestions = allTags.filter(
    (t) =>
      !existingTagNames.has(t.name.toLowerCase()) &&
      (!trimmedTagInput || t.name.toLowerCase().includes(trimmedTagInput.toLowerCase()))
  )
  const hasExactMatch = allTags.some((t) => t.name.toLowerCase() === trimmedTagInput.toLowerCase())
  const showCreateOption = trimmedTagInput.length > 0 && !hasExactMatch

  const isEmpty = pageTags.length === 0 && properties.length === 0

  return (
    <div className="mb-6 text-xs">
      <button
        onClick={toggleExpanded}
        className="flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ChevronRight
          size={14}
          className={cn('shrink-0 transition-transform', expanded && 'rotate-90')}
        />
        Properties
        {!expanded && !isEmpty && (
          <span className="font-normal text-muted-foreground/70">
            {pageTags.length > 0 && `${pageTags.length} tag${pageTags.length === 1 ? '' : 's'}`}
            {pageTags.length > 0 && properties.length > 0 && ' · '}
            {properties.length > 0 &&
              `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'}`}
          </span>
        )}
      </button>

      {expanded && (
        <div className="pb-1 pt-1">
          <div className={ROW}>
            <FolderTree size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Section</span>
            {/* A different pick moves the page there (handleSectionChange)
                — this is the one property here that isn't just descriptive
                metadata, it's a re-file action. Grouped by notebook via
                <optgroup> since section names can repeat across notebooks.
                Plain native <select>, not a custom popover picker — this
                panel is deliberately NOT glass-treated (see its own comment
                above), so a bare, minimal control fits it better than the
                app's toolbar-style pickers. */}
            <select
              value={page.sectionId}
              disabled={movingSection}
              onChange={(e) => void handleSectionChange(Number(e.target.value))}
              // justify-self-start overrides the grid row's default stretch
              // (its column is 1fr, same as every other row's value cell) —
              // without it, the select's own visible box/border/arrow filled
              // the whole remaining row width instead of just hugging the
              // section name's actual text width the way every other value
              // in this panel does.
              className="max-w-full min-w-0 justify-self-start truncate bg-transparent text-sm outline-none disabled:opacity-50"
            >
              {groupedSections.map((group) => (
                <optgroup key={group.notebook.id} label={group.notebook.name}>
                  {group.sections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          <div className={ROW}>
            <Tag size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Tags</span>
            <div ref={tagContainerRef} className="relative flex flex-wrap items-center gap-1.5">
              {pageTags.map((tag) =>
                tag.id === renamingTagId ? (
                  <input
                    key={tag.id}
                    ref={renameTagInputRef}
                    autoFocus
                    value={renameTagDraft}
                    onChange={(e) => setRenameTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void submitTagRename()
                      if (e.key === 'Escape') setRenamingTagId(null)
                    }}
                    onBlur={() => void submitTagRename()}
                    className="w-24 rounded-sm border border-border bg-background px-1.5 py-0.5 text-sm outline-none"
                  />
                ) : (
                  <TagPill
                    key={tag.id}
                    tag={tag}
                    onClick={() => void selectTag(tag.id)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setTagContextMenu({ tagId: tag.id, x: e.clientX, y: e.clientY })
                    }}
                    onRemove={() => void removeTagFromActivePage(tag.id)}
                  />
                )
              )}
              <input
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value)
                  setTagMenuOpen(true)
                }}
                onFocus={() => setTagMenuOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void commitTag(tagInput)
                  } else if (e.key === 'Escape') {
                    setTagMenuOpen(false)
                  }
                }}
                placeholder={pageTags.length === 0 ? 'Empty' : 'Add…'}
                className="min-w-[4rem] flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              />

              {tagMenuOpen && (suggestions.length > 0 || showCreateOption) && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-48 w-52 overflow-auto rounded-md border border-border bg-background p-1 shadow-xl">
                  {suggestions.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => void commitTag(t.name)}
                      className="flex w-full items-center gap-2 truncate rounded-sm px-2 py-1 text-left text-sm hover:bg-accent"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.color ?? '#94A3B8' }}
                      />
                      <span className="truncate">{t.name}</span>
                    </button>
                  ))}
                  {showCreateOption && (
                    <button
                      onClick={() => void commitTag(trimmedTagInput)}
                      className="flex w-full items-center gap-2 truncate rounded-sm px-2 py-1 text-left text-sm text-primary hover:bg-accent"
                    >
                      <Plus size={13} className="shrink-0" />
                      <span className="truncate">Create tag: &ldquo;{trimmedTagInput}&rdquo;</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {properties.map((prop) => {
            // Description is a free-text paragraph, not a short categorical
            // value — "show as a colored pill" doesn't make sense for it,
            // and it's meant to stay as a permanent default field rather
            // than be removable like an ad hoc property.
            const isDescription = prop.key === 'Description'
            const PropertyIcon = PROPERTY_ICONS[prop.key] ?? Hash
            return (
              <div key={prop.id} className={cn(ROW, 'group')}>
                <PropertyIcon size={16} className="shrink-0 text-muted-foreground" />
                <input
                  autoFocus={focusKeyId === prop.id}
                  value={prop.key}
                  onChange={(e) => renamePropertyKey(prop.id, e.target.value)}
                  placeholder="Property name"
                  className="truncate bg-transparent text-muted-foreground outline-none placeholder:text-muted-foreground/50 focus:text-foreground"
                />
                <div className="flex min-w-0 items-start gap-1.5">
                  {editingValueId === prop.id ? (
                    <textarea
                      autoFocus
                      rows={1}
                      ref={autoResizeTextarea}
                      value={prop.value}
                      onChange={(e) => {
                        editPropertyValue(prop.id, e.target.value)
                        autoResizeTextarea(e.target)
                      }}
                      onFocus={(e) => autoResizeTextarea(e.target)}
                      onBlur={() => setEditingValueId(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault()
                          setEditingValueId(null)
                        }
                      }}
                      className="min-w-0 flex-1 resize-none overflow-hidden bg-transparent text-xs outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingValueId(prop.id)}
                      className="min-w-0 flex-1 break-words text-left"
                    >
                      {prop.value.trim() ? (
                        prop.isChoice && !isDescription ? (
                          <PillBadge label={prop.value} />
                        ) : (
                          prop.value
                        )
                      ) : (
                        <span className="text-muted-foreground/60">Empty</span>
                      )}
                    </button>
                  )}
                  {!isDescription && (
                    <button
                      onClick={() => toggleChoice(prop.id)}
                      title={prop.isChoice ? 'Show as plain text' : 'Show as a colored pill'}
                      className={cn(
                        'shrink-0 rounded-sm p-0.5 opacity-0 group-hover:opacity-100',
                        prop.isChoice ? 'text-primary opacity-100' : 'text-muted-foreground'
                      )}
                    >
                      <Palette size={13} />
                    </button>
                  )}
                  {!isDescription && (
                    <button
                      onClick={() => removeProperty(prop.id)}
                      title="Remove property"
                      className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          <div className={ROW}>
            <Calendar size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Created</span>
            <span>{formatTimestamp(page.createdAt)}</span>
          </div>

          <div className={ROW}>
            <Clock size={16} className="shrink-0 text-muted-foreground" />
            <span className="text-muted-foreground">Modified</span>
            <span>{formatTimestamp(page.updatedAt)}</span>
          </div>

          <button
            onClick={addProperty}
            className={cn(ROW, 'w-full text-left text-muted-foreground/60 hover:text-foreground')}
          >
            <Plus size={16} className="shrink-0" />
            <span className="col-span-2">Add a property</span>
          </button>
        </div>
      )}

      {tagContextMenu &&
        (() => {
          const menuTag = pageTags.find((t) => t.id === tagContextMenu.tagId)
          if (!menuTag) return null
          return (
            <TagContextMenu
              x={tagContextMenu.x}
              y={tagContextMenu.y}
              tagColor={menuTag.color}
              onRename={() => {
                setRenamingTagId(menuTag.id)
                setRenameTagDraft(menuTag.name)
              }}
              onDelete={() => setDeleteTagTarget({ id: menuTag.id, name: menuTag.name })}
              onPickColor={(hex) => void setTagColor(menuTag.id, hex)}
              onClose={() => setTagContextMenu(null)}
            />
          )
        })()}

      {deleteTagTarget && (
        <ConfirmDialog
          title="Delete tag?"
          message={`"${deleteTagTarget.name}" will be removed from every page that has it. The pages themselves won't be deleted.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteTag(deleteTagTarget.id)
            setDeleteTagTarget(null)
          }}
          onCancel={() => setDeleteTagTarget(null)}
        />
      )}
    </div>
  )
}
