import { useEffect, useRef, useState } from 'react'
import { Search, Settings, Square, Copy, Minus, X } from 'lucide-react'
import type { SearchResultDTO } from '@shared/ipc-channels'
import { useAppStore } from '../store/useAppStore'
import { useDebouncedCallback } from '../hooks/useDebouncedCallback'
import { cn } from '../lib/utils'
import { SettingsPanel } from './SettingsPanel'
import { WhatsNewDialog } from './WhatsNewDialog'

// Electron's drag-region CSS property isn't in React's CSSProperties type —
// this narrow extension keeps the casts out of the JSX below.
type AppRegionStyle = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
const dragRegion: AppRegionStyle = { WebkitAppRegion: 'drag' }
const noDragRegion: AppRegionStyle = { WebkitAppRegion: 'no-drag' }

const SEARCH_DEBOUNCE_MS = 200

/** sqlite's snippet() wraps matches in literal <mark></mark> — split on those
 * markers and render as real elements instead of dangerouslySetInnerHTML, so
 * the rest of the snippet (the user's own note text, not sanitized HTML)
 * can't be interpreted as markup. */
function renderSnippet(snippet: string): React.ReactNode {
  return snippet
    .split(/<mark>|<\/mark>/)
    .map((part, i) =>
      i % 2 === 1 ? (
        <mark key={i} className="rounded-sm bg-primary/20 text-foreground">
          {part}
        </mark>
      ) : (
        part
      )
    )
}

export function TopBar(): React.JSX.Element {
  const [maximized, setMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const navigateToPage = useAppStore((s) => s.navigateToPage)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResultDTO[]>([])
  const [open, setOpen] = useState(false)
  const [searched, setSearched] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    void window.api.windowControls.isMaximized().then(setMaximized)
    return window.api.windowControls.onMaximizeChanged(setMaximized)
  }, [])

  const runSearch = useDebouncedCallback(async (text: string, requestId: number) => {
    const hits = await window.api.search.query(text)
    // A slower, now-outdated request can resolve after a newer keystroke's —
    // requestId was captured synchronously when this call was scheduled, so
    // if the ref has since moved on, drop these results instead of letting
    // them clobber what's currently on screen.
    if (requestId !== requestIdRef.current) return
    setResults(hits)
    setSearched(true)
    setActiveIndex(0)
  }, SEARCH_DEBOUNCE_MS)

  function handleQueryChange(text: string): void {
    setQuery(text)
    setOpen(true)
    // Bumped synchronously on every keystroke (not inside the debounced
    // callback) so a stale pending search can be told apart from the latest
    // one once it actually resolves.
    const requestId = ++requestIdRef.current
    setSearched(false) // clears any stale "No results for …" from a previous query while this one debounces
    if (!text.trim()) {
      setResults([])
      return
    }
    runSearch(text, requestId)
  }

  function selectResult(result: SearchResultDTO): void {
    void navigateToPage(result.notebookId, result.sectionId, result.pageId, query.trim())
    setQuery('')
    setResults([])
    setSearched(false)
    setOpen(false)
    inputRef.current?.blur()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
      return
    }
    if (!results.length) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      selectResult(results[activeIndex])
    }
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const showDropdown = open && query.trim().length > 0

  return (
    <header
      style={dragRegion}
      onDoubleClick={() => void window.api.windowControls.toggleMaximize()}
      className="glass-titlebar flex h-9 shrink-0 items-center gap-3 rounded-md px-3"
    >
      <img src="./icon.png" alt="" width={18} height={18} className="shrink-0" />
      <span className="text-sm font-semibold tracking-tight text-foreground">
        Own Notes
      </span>
      <div
        ref={containerRef}
        style={noDragRegion}
        onDoubleClick={(e) => e.stopPropagation()}
        className="relative ml-auto w-96"
      >
        <div className="search-bar flex items-center gap-2 rounded-sm px-2 py-1 text-sm text-muted-foreground transition-shadow focus-within:ring-1 focus-within:ring-primary/60">
          <Search size={14} className="shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes…"
            className="w-full bg-transparent text-foreground outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        {showDropdown && (
          // Solid surface, not another blurred glass layer — same reasoning
          // as ToolbarPopover/NotebookSwitcher's dropdown: CLAUDE.md warns
          // against stacking backdrop-blur panels.
          <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-md border border-border bg-background p-1 shadow-2xl">
            {results.length > 0
              ? results.map((r, i) => (
                  <button
                    key={r.pageId}
                    onClick={() => selectResult(r)}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      'block w-full rounded-sm px-2 py-1.5 text-left',
                      i === activeIndex ? 'bg-accent' : 'hover:bg-accent'
                    )}
                  >
                    <div className="truncate text-sm font-medium text-foreground">{r.title}</div>
                    <div className="truncate text-xs text-muted-foreground [&_mark]:font-medium">
                      {renderSnippet(r.snippet)}
                    </div>
                  </button>
                ))
              : searched && (
                  <div className="px-2 py-3 text-center text-sm text-muted-foreground">
                    No results for &ldquo;{query}&rdquo;
                  </div>
                )}
          </div>
        )}
      </div>
      <div style={noDragRegion} className="flex shrink-0 items-center gap-1">
        <button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          <Settings size={14} />
        </button>
        <button
          onClick={() => void window.api.windowControls.minimize()}
          title="Minimize"
          className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          <Minus size={13} />
        </button>
        <button
          onClick={() => void window.api.windowControls.toggleMaximize()}
          title={maximized ? 'Restore' : 'Maximize'}
          className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-accent"
        >
          {maximized ? <Copy size={13} /> : <Square size={13} />}
        </button>
        <button
          onClick={() => void window.api.windowControls.close()}
          title="Close"
          className="flex h-7 w-7 items-center justify-center rounded-sm text-foreground/80 hover:bg-red-500 hover:text-white"
        >
          <X size={14} />
        </button>
      </div>

      {/* Not gated on settingsOpen here — SlidePanel needs to stay mounted
          for one extra transition after `open` goes false, so the slide-out
          animation actually plays instead of the panel just vanishing. */}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <WhatsNewDialog />
    </header>
  )
}
