import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// Self-hosted locally via node_modules (no network fetch at runtime, unlike
// a Google Fonts <link>) — keeps the "layout font" Settings choice working
// fully offline, matching the app's no-cloud principle. Geist Sans is a
// static package, so each weight actually used by the UI (see Tailwind
// font-weight utilities in use) needs its own import.
import '@fontsource-variable/inter'
import '@fontsource/geist-sans/400.css'
import '@fontsource/geist-sans/500.css'
import '@fontsource/geist-sans/600.css'
import '@fontsource-variable/manrope'
import '@fontsource-variable/figtree'
import '@fontsource-variable/outfit'
import '@fontsource-variable/plus-jakarta-sans'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
