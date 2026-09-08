# Project: Notes with Freedom (OneNote Replacement)

A desktop note-taking app that replaces Microsoft OneNote — same notebook/section/page
structure and rich formatting, but fully local, no cloud sync, no Microsoft account.

## Core principles (non-negotiable)

- **No cloud, no Microsoft API, ever.** Not for storage, not for migration, not for sync.
  Everything reads/writes to a local folder the user chooses.
- **Linear page layout**, not a freeform/click-anywhere canvas. Pages read top to bottom,
  like Notion/Obsidian — not OneNote's floating text-box canvas.
- **Database stays small.** Media (audio, images) is stored as files on disk, referenced
  by file path in the database. Never store binary blobs in the database itself.
- **Debounced writes only.** Never write to disk on every keystroke — batch saves
  (e.g. 1-2 seconds after typing stops).

## Tech stack

| Layer | Choice | Why / notes |
|---|---|---|
| App shell | Electron + Vite + React 19 | Desktop app, no browser sandbox limits on filesystem access |
| Database | SQLite via **sql.js** (WASM) | Deliberately chosen over `better-sqlite3` to avoid native-module ABI rebuild issues across Electron versions |
| ORM / query layer | **Drizzle ORM** | Thin, type-safe, no separate query-engine binary (unlike Prisma). Chosen over Prisma specifically for easier raw-SQL access needed by FTS5 |
| Full-text search | SQLite **FTS5** | Not supported natively by Drizzle or Prisma — implement via raw SQL / triggers that update only the changed row, not a full reindex per save |
| Rich text editor | **TipTap v3** | Requires Vite (incompatible with Create React App — not relevant here since we use Vite) |
| Math equations | `@aarkue/tiptap-math-extension` + **KaTeX** | Free/open, avoids TipTap Pro's paywalled math extension |
| Audio record/playback | Browser-standard `MediaRecorder` + `getUserMedia` | Native to Electron's Chromium renderer, no extra library needed for capture |
| Audio player UI | **wavesurfer.js** | Waveform visual for playback |
| Styling | **Tailwind CSS** | Use `backdrop-blur-*` and `bg-white/opacity` utilities for the glass effect (see Visual style below) |
| Component primitives | **shadcn/ui** | Restyle with glass utility classes rather than using default flat styling |
| Icons | **lucide-react** | — |
| Sidebar tree (Notebook → Section → Page) | **react-arborist** | Virtualized tree view |
| Drag & drop | **dnd-kit** | Current standard; do not use react-beautiful-dnd (unmaintained) |
| Highlight/color picker | **react-colorful**, or a small fixed swatch palette | OneNote-style colored highlights/headers use a limited palette, not a full color wheel |
| State management | **Zustand** | Lazy-load page content into state — never load the whole notebook tree's content upfront |
| Packaging | **electron-builder**, Windows-only target (NSIS installer) | Target is Windows PCs only — do not configure Mac (.dmg) or Linux (.AppImage/.deb) build targets |

## Data model (starting point)

Hierarchy: **Notebook → Section → Page**, plus a **Tags** table and an **FTS5 virtual
table** for search. Each Page's rich-text content is stored as HTML or a TipTap JSON
document. Attachments (images, audio) are stored as files on disk in a per-notebook
folder structure; the database only stores their relative file paths.

## Migration from existing OneNote notebooks

1. Export old notebooks locally via OneNote's own **File → Export** (.docx or .pdf per
   section/page) — this is a local, offline action, not an API call.
2. Convert exported .docx files with **Pandoc**, run manually by the user on their own
   machine as a one-time migration step. **Pandoc is NOT bundled with the app or called
   from app code** — it is not installed as part of the build and has no integration in
   the codebase. This is intentional: bundling the Pandoc binary would add ~150-280MB to
   the installer and requires shipping GPL license/attribution notices. The app assumes
   the user has run this conversion themselves before importing the converted files.
   Pandoc's underlying `texmath` engine correctly converts Word's math format (OMML) into
   LaTeX — this is why Pandoc specifically is recommended for this manual step, over
   other docx-to-something converters that don't handle math.
3. **Audio recordings will not migrate automatically** — docx/pdf export drops embedded
   audio. These need to be manually located (OneNote caches them as .m4a/.wav files) and
   re-attached after migration. Do not attempt to build automated audio migration.
4. Do not implement any Microsoft Graph API integration, sign-in flow, or `.one` binary
   file parser — these were explicitly rejected.

## Export feature (page/section → PDF, Word, Markdown)

Used for sharing notes outside the app — see "no cloud sharing" principle. Built with
**pure-JS libraries only, no external binaries** (this was an explicit decision after
confirming Pandoc is migration-only, per the section above, and not something to bundle
into the app itself):

| Format | Tool | Notes |
|---|---|---|
| PDF | Electron's built-in `printToPDF` | No external dependency — built into Electron |
| Word (.docx) | `docx` (npm package) | Pure JS, no external binary |
| Markdown | `turndown` (HTML-to-Markdown) | Pure JS, no external binary |

**Trade-off accepted**: math equations in the Word export render as images, not live
editable OMML equations (no pure-JS library converts LaTeX to real Word equations). PDF
math still renders correctly as typeset text. Markdown math stays as plain LaTeX (`$...$`
syntax). This trade-off was accepted specifically to keep the app free of external binary
dependencies and avoid GPL bundling/licensing obligations.

- **Colored highlights/headers**: Word and PDF preserve color natively. Markdown has no
  standard way to represent color — flag this in the export UI (e.g. "Markdown export
  does not preserve colors").
- **Audio**: doesn't carry into any of the three formats — insert a placeholder note in
  the exported file instead of silently dropping it.
- **Images**: embed directly in PDF/Word; for Markdown, copy into a subfolder alongside
  the exported `.md` file with relative-path references.
- Export scope: single page, or a whole section (bundled). Do not build notebook-wide or
  full site/wiki export.
- No cloud upload, no shareable link generation, no built-in "send via email" — the app
  produces a file only.



- **Apple glassmorphism**: frosted glass panels, translucency, layered depth (similar to
  Apple's "Liquid Glass" language). Achieved via Tailwind's `backdrop-blur-*` and
  translucent background utilities — no extra glassmorphism library needed.
- **Reference notes** (from user-approved sample images, light-mode-leaning style):
  - Background behind the app content should be a soft gradient or subtle pastel
    backdrop, not flat white/gray — blur and translucency need visual texture behind
    them to actually read as "glass."
  - Cards/panels should be semi-opaque (roughly 70-90% opacity), not heavily transparent
    (avoid ~30% opacity levels — too transparent reads as washed out, not glassy).
  - Use soft, wide, low-opacity drop shadows under cards (not tight/harsh shadows) —
    this is what sells the "gently lifted, slightly 3D" card feel, more than blur alone.
  - Add a subtle light top-edge border/highlight on cards, like a bevel catching light.
  - Use one accent color sparingly for active states/highlights (not spread across the
    whole UI) — let most of the interface stay neutral/translucent.
- **Corner radius: small/medium only.** Do not use large rounded corners anywhere —
  buttons, cards, panels, and inputs should all use small-to-medium radius values, never
  large/pill-shaped corners.
- **Typography**: use Inter or Geist, not a literal "SF Pro" import — Apple's San
  Francisco font isn't licensed for use outside Apple's own platforms.
- **Light mode is the primary target**, not dark mode. The glass effect should still work
  well against a light background — use a soft gradient or subtle pastel backdrop (not
  flat white) behind the app content, since glass/blur effects need visual texture behind
  them to read clearly.

## Performance guardrails

- **Blur usage**: apply `backdrop-blur` to a small number of large, static panels only
  (sidebar, top bar). Do not nest blurred panels on top of other blurred panels, and do
  not apply blur to many small/frequently-updating elements — `backdrop-filter` is GPU-
  expensive and stacking it causes visible frame drops.
- **sql.js writes**: debounce all saves; never re-serialize and write the whole database
  on every keystroke.
- **Media storage**: audio and images are files on disk, referenced by path — never
  stored as blobs inside the database. This keeps the DB file small, which also matters
  for the planned future sync method (see below).
- **Lazy loading**: only load a page's content when the user opens it. Do not load every
  section/page's content into memory or global state at app startup.
- **FTS5 index updates**: update via triggers on the specific changed row, not a full
  reindex of every note on every save.
- **IPC**: batch related Electron main/renderer calls; avoid many small chatty IPC calls
  for a single user action.
- **TipTap/ProseMirror**: keep individual pages reasonably sized — ProseMirror does not
  virtualize extremely long single documents, so avoid letting one "page" grow into an
  extremely long single document.

## Sync (future, not required for v1)

The user wants to eventually sync the notebook data across two PCs via a shared folder
or USB drive — no cloud service. Design for **single-writer discipline**: the app should
assume it fully owns the SQLite file while running, and the user closes it on one PC
before opening it on another, rather than building conflict-merge logic for v1. Do not
build multi-writer conflict resolution unless explicitly asked.

## Explicitly out of scope / rejected

- Mac/Linux builds — this app targets Windows PCs only
- Cloud sync of any kind
- Microsoft Graph API or any Microsoft sign-in flow
- Freeform/floating-textbox canvas (OneNote's actual page model)
- Automated audio migration from old notebooks
- Large/pill-shaped rounded corners
- `better-sqlite3` or any native-module SQLite binding (rejected in favor of sql.js,
  specifically to avoid Electron ABI rebuild issues)
- Prisma (rejected in favor of Drizzle, specifically for easier raw-SQL/FTS5 access)
- Bundling a Pandoc binary into the app (rejected for the export feature — ~150-280MB
  installer size increase and GPL license/attribution obligations; Pandoc remains a
  manual, user-run migration tool only, never called from app code)