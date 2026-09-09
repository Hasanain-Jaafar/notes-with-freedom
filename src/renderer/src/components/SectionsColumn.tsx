import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { cn } from '../lib/utils'
import { SectionContextMenu } from './SectionContextMenu'
import { ConfirmDialog } from './ConfirmDialog'
import type { ExportFormat } from './ExportSubmenuItems'
import { DEFAULT_ACCENT_HEX } from '../lib/sectionColors'
import { hexToRgba } from '../lib/hexColor'

interface SectionsColumnProps {
  width: number
}

interface ContextMenuState {
  sectionId: number
  x: number
  y: number
}

interface DeleteTarget {
  id: number
  name: string
}

export function SectionsColumn({ width }: SectionsColumnProps): React.JSX.Element {
  const activeNotebookId = useAppStore((s) => s.activeNotebookId)
  const activeSectionId = useAppStore((s) => s.activeSectionId)
  const sectionsByNotebook = useAppStore((s) => s.sectionsByNotebook)
  const setActiveSection = useAppStore((s) => s.setActiveSection)
  const createSection = useAppStore((s) => s.createSection)
  const createPage = useAppStore((s) => s.createPage)
  const deleteSection = useAppStore((s) => s.deleteSection)
  const setSectionColor = useAppStore((s) => s.setSectionColor)
  const renameSection = useAppStore((s) => s.renameSection)

  const [creating, setCreating] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  const sections = activeNotebookId ? (sectionsByNotebook[activeNotebookId] ?? []) : []
  const hasNotebook = activeNotebookId !== null

  useEffect(() => {
    if (renamingId !== null) renameInputRef.current?.select()
  }, [renamingId])

  async function submit(): Promise<void> {
    const name = draftName.trim()
    if (name) await createSection(name)
    setDraftName('')
    setCreating(false)
  }

  function startRenaming(sectionId: number, currentName: string): void {
    setRenamingId(sectionId)
    setRenameDraft(currentName)
  }

  async function submitRename(): Promise<void> {
    const id = renamingId
    const name = renameDraft.trim()
    setRenamingId(null)
    if (id !== null && name) await renameSection(id, name)
  }

  async function handleNewSectionFromMenu(): Promise<void> {
    const defaultName = 'New Section'
    await createSection(defaultName)
    const newId = useAppStore.getState().activeSectionId
    if (newId !== null) startRenaming(newId, defaultName)
  }

  async function handleNewPageFromMenu(sectionId: number): Promise<void> {
    if (useAppStore.getState().activeSectionId !== sectionId) {
      await setActiveSection(sectionId)
    }
    await createPage('Untitled page')
  }

  async function handleExportSection(sectionId: number, sectionName: string, format: ExportFormat): Promise<void> {
    // Dynamically imported: exportActions pulls in docx/turndown, which are
    // only ever needed once the user actually exports — not worth adding to
    // the app's initial bundle just for a right-click menu action.
    const { resolveSectionPagesForExport, exportPdf, exportDocx, exportMarkdown } = await import(
      '../lib/exportActions'
    )
    const pages = await resolveSectionPagesForExport(sectionId)
    if (format === 'pdf') await exportPdf('section', sectionName, pages)
    else if (format === 'docx') await exportDocx('section', sectionName, pages)
    else await exportMarkdown('section', sectionName, pages)
  }

  const menuSection = contextMenu ? sections.find((s) => s.id === contextMenu.sectionId) : undefined

  return (
    <div className="flex shrink-0 flex-col" style={{ width }}>
      {/* Once there's at least one section, "Add section" moves below the
          list (next to the last section) instead of sitting up here — this
          header slot is only for the empty-list case, where there's no
          "below the last section" to put it next to. */}
      {sections.length === 0 && !creating && (
        <button
          onClick={() => setCreating(true)}
          disabled={!hasNotebook}
          title={hasNotebook ? undefined : 'Create a notebook first'}
          className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <Plus size={13} />
          Add section
        </button>
      )}

      <div className="flex flex-1 flex-col gap-1 overflow-auto p-1">
        {!hasNotebook && (
          <p className="px-2 py-2 text-xs text-muted-foreground">
            Create a notebook first (top left) to add sections.
          </p>
        )}

        {sections.map((section) => {
          const isActive = section.id === activeSectionId
          // Selected background is tied to THIS section's own accent color
          // (falling back to the app's default accent for a "None"-colored
          // section) rather than one fixed app-wide highlight color — so a
          // purple section's selected row actually reads as purple, keeping
          // the section and its pages feeling like one visual system. Plain
          // hover stays neutral (bg-accent) so it never reads as strong as
          // an actual selection.
          const accentHex = section.color ?? DEFAULT_ACCENT_HEX
          return (
            <div
              key={section.id}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ sectionId: section.id, x: e.clientX, y: e.clientY })
              }}
              style={
                isActive
                  ? ({
                      '--row-bg': hexToRgba(accentHex, 0.14),
                      '--row-bg-hover': hexToRgba(accentHex, 0.22)
                    } as React.CSSProperties)
                  : undefined
              }
              className={cn(
                'group relative flex w-full items-stretch rounded-sm',
                isActive ? 'bg-[var(--row-bg)] hover:bg-[var(--row-bg-hover)]' : 'overflow-hidden hover:bg-primary/10'
              )}
            >
              {/* Solid, saturated color bar spanning the row's full height,
                  flush with its left edge — deliberately not translucent
                  like the surrounding glass panel, so it reads clearly
                  against it. Stays in flow (not absolutely positioned) so
                  the row's own text indent never shifts between active and
                  inactive states. */}
              <span
                className="w-1 shrink-0 rounded-sm"
                style={{ backgroundColor: isActive ? accentHex : (section.color ?? 'transparent') }}
              />

              {/* Selection nudge: a wider, shorter pill overlapping the bar
                  above, poking out past the row's own left edge into the
                  sidebar's padding gutter — a clearer, more deliberate
                  selection marker than just widening the flush bar in
                  place. The flush bar stays visible above/below it. */}
              {isActive && (
                <span
                  aria-hidden
                  className="absolute -left-1.5 top-1/2 h-5 w-2.5 -translate-y-1/2 rounded-l-md rounded-r-sm"
                  style={{ backgroundColor: accentHex }}
                />
              )}

              {section.id === renamingId ? (
                <input
                  ref={renameInputRef}
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void submitRename()
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onBlur={() => void submitRename()}
                  className="min-w-0 flex-1 bg-transparent py-1.5 pl-2 pr-2 text-sm outline-none"
                />
              ) : (
                <button
                  onClick={() => void setActiveSection(section.id)}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-2 pr-2 text-left text-sm',
                    // Font weight is a second, hue-independent cue for
                    // selection — never rely on the background tint alone.
                    isActive && 'font-medium'
                  )}
                >
                  <span className="truncate">{section.name}</span>
                </button>
              )}
            </div>
          )
        })}

        {creating ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submit()
              if (e.key === 'Escape') setCreating(false)
            }}
            onBlur={() => void submit()}
            placeholder="Section name…"
            className="glass-card w-full rounded-sm px-2 py-1 text-sm outline-none"
          />
        ) : (
          sections.length > 0 && (
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-primary/10"
            >
              <Plus size={13} />
              Add section
            </button>
          )
        )}
      </div>

      {contextMenu && menuSection && (
        <SectionContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          sectionColor={menuSection.color}
          onRename={() => startRenaming(menuSection.id, menuSection.name)}
          onDelete={() => setDeleteTarget({ id: menuSection.id, name: menuSection.name })}
          onPickColor={(hex) => void setSectionColor(menuSection.id, hex)}
          onNewPage={() => void handleNewPageFromMenu(menuSection.id)}
          onNewSection={() => void handleNewSectionFromMenu()}
          onExport={(format) => void handleExportSection(menuSection.id, menuSection.name, format)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete section?"
          message={`"${deleteTarget.name}" and all its pages will be permanently deleted.`}
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteSection(deleteTarget.id)
            setDeleteTarget(null)
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
