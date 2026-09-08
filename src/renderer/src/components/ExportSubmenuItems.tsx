import { FileText, FileType, FileCode } from 'lucide-react'

export type ExportFormat = 'pdf' | 'docx' | 'markdown'

interface ExportSubmenuItemsProps {
  onExport: (format: ExportFormat) => void
}

const itemClass =
  'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm hover:bg-accent'

/** The PDF/Word/Markdown flyout shared by SectionContextMenu and
 * PageContextMenu's "Export" row — kept as one component so the two menus
 * can't drift apart on wording/icons/the Markdown color caveat. */
export function ExportSubmenuItems({ onExport }: ExportSubmenuItemsProps): React.JSX.Element {
  return (
    <div className="glass-panel absolute left-full top-0 ml-1 w-48 rounded-md p-1 shadow-2xl">
      <button onClick={() => onExport('pdf')} className={itemClass}>
        <FileText size={14} className="shrink-0" />
        Export as PDF
      </button>
      <button onClick={() => onExport('docx')} className={itemClass}>
        <FileType size={14} className="shrink-0" />
        Export as Word
      </button>
      <button onClick={() => onExport('markdown')} className={itemClass}>
        <FileCode size={14} className="mt-0.5 shrink-0" />
        <span className="flex flex-col items-start">
          <span>Export as Markdown</span>
          <span className="text-[10px] text-muted-foreground/50">Colors are not preserved</span>
        </span>
      </button>
    </div>
  )
}
