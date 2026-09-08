import { lazy, Suspense } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'

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
        <main className="glass-panel flex-1 overflow-auto rounded-md">
          <Suspense fallback={null}>
            <Editor />
          </Suspense>
        </main>
      </div>
    </div>
  )
}

export default App
