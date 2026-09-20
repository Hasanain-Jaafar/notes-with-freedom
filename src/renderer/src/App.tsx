import { lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { StatusBar } from './components/StatusBar'

// Lazy-loaded: TipTap + the KaTeX math extension pull in a large chunk of JS
// that isn't needed just to paint the shell (sidebar/top bar). Splitting it
// into its own chunk keeps the app's initial bundle small so the window can
// paint sooner — this chunk then loads in parallel, right behind it.
const Editor = lazy(() => import('./components/Editor').then((m) => ({ default: m.Editor })))

function App(): React.JSX.Element {
  return (
    // No background here — the pastel gradient lives on <body> (see index.css)
    // and needs to show through the gaps between panels for the glass panels'
    // backdrop-blur to actually have something to blur.
    <div className="flex h-screen w-screen flex-col gap-2 p-2">
      <TopBar />
      <div className="flex min-h-0 flex-1 gap-2">
        <Sidebar />
        {/* Two overrides of glass-panel's own defaults, both via Tailwind's
            utilities-beat-components layering (regardless of source order):
            - bg-[#FAF5EC]/85, light mode only (dark:bg-white/10 restates the
              original so dark stays untouched) — flat white at 80% opacity
              read as clinical for a surface you spend the whole session
              looking at, unlike the sidebar/status bar which keep it.
            - border-transparent, both modes — glass-panel's border-white/40
              read as a stray outline around the note area specifically,
              sitting right next to the sidebar's own border. The bevel
              highlight (glass-panel's inset box-shadow) is a separate
              property and still applies. */}
        <main className="glass-panel flex-1 overflow-auto rounded-md border-transparent bg-[#FAF5EC]/85 dark:bg-white/10">
          <Suspense fallback={null}>
            <Editor />
          </Suspense>
        </main>
      </div>
      <StatusBar />
    </div>
  )
}

export default App
