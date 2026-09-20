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
        {/* bg-[#FAF5EC]/85 overrides glass-panel's own bg-white/80 in light
            mode only — pure white at 80% opacity read as flat/clinical for a
            surface you spend the whole session looking at (unlike the
            sidebar/status bar, which stay on the default glass-panel white).
            dark:bg-white/10 is restated so dark mode is untouched: Tailwind's
            utilities layer already beats glass-panel's own rule (a
            @layer components class) regardless of source order, but only
            for whichever specific declaration is actually present here —
            leaving dark mode's override out would've let this same plain
            bg-[...] apply there too, since it has no media-query gate of its
            own to stay out of dark mode automatically. */}
        <main className="glass-panel flex-1 overflow-auto rounded-md bg-[#FAF5EC]/85 dark:bg-white/10">
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
