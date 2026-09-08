# Notes with Freedom

A desktop note-taking app that replaces Microsoft OneNote — the same notebook →
section → page structure and rich formatting you're used to, but fully local:
no cloud sync, no Microsoft account, no telemetry. Your notes live in a folder
you choose, in a single SQLite file plus a folder of media files, both fully
under your control.

## Why

OneNote is great until you want to own your data. This app keeps the parts of
OneNote that actually work well — the notebook/section/page hierarchy, rich
formatting, embedded audio and images, math equations — and drops everything
that requires a Microsoft account or a round-trip to the cloud.

## Features

- **Notebook → Section → Page** hierarchy with drag-and-drop reordering
- **Linear page layout** (top-to-bottom, like Notion/Obsidian) rather than
  OneNote's freeform floating-textbox canvas
- **Rich text editing** via TipTap: headings, lists, task lists, tables, text
  color/highlight, links, and text alignment
- **Math equations**, rendered with KaTeX
- **Inline images** and **voice note recording/playback** (with waveform
  display)
- **Tags**, with a dedicated view for browsing pages by tag
- **Full-text search** across all notes, backed by SQLite FTS5
- **Export** a page or whole section to PDF, Word (`.docx`), or Markdown
- **Backup & restore** of your entire notebook to a single archive file
- **Apple-inspired glassmorphism UI** — frosted glass panels, soft shadows,
  translucency — light-mode first

## Why not the cloud?

Everything is stored locally in a folder you pick on first launch:

- A single **SQLite database** file holding notebooks, sections, pages, tags,
  and the search index
- A **media folder** alongside it holding images and audio recordings as
  plain files (never as blobs in the database, so the DB file stays small
  and portable)

There is no account, no sign-in, and no network calls to Microsoft or anyone
else. If you want to move your notes between two computers, copy the folder —
over a USB drive, a shared network folder, or whatever you'd like. (Multi-
device *sync* — safely merging changes made on two machines at once — is a
planned future feature; for now, treat the app as single-writer: close it on
one PC before opening the same notebook folder on another.)

## Migrating from OneNote

There's no automatic importer, on purpose — it would mean either talking to
Microsoft's API or reverse-engineering the closed `.one` file format. Instead:

1. In OneNote, use **File → Export** to export each section/page you want to
   keep as `.docx` or `.pdf`. This is a local, offline export — no API calls.
2. Convert the exported `.docx` files with [Pandoc](https://pandoc.org/),
   which you run yourself, once, outside this app. Pandoc isn't bundled with
   or called from Notes with Freedom — it's a general-purpose tool the app
   assumes you already have (or will install) for this one-time step. Pandoc
   is specifically recommended here because its `texmath` engine correctly
   converts Word's math format into LaTeX, so equations survive the
   conversion.
3. Import the converted files into Notes with Freedom.
4. **Audio recordings won't come along automatically** — Word/PDF export
   drops embedded audio. OneNote caches these as `.m4a`/`.wav` files on disk;
   locate them manually and re-attach them to the relevant page after
   importing.

## Tech stack

| Layer | Choice |
|---|---|
| App shell | Electron + Vite + React 19 |
| Database | SQLite via [sql.js](https://github.com/sql-js/sql.js) (WASM — no native module to rebuild per Electron version) |
| ORM | [Drizzle ORM](https://orm.drizzle.team/) |
| Full-text search | SQLite FTS5, updated via row-level triggers |
| Rich text editor | [TipTap v3](https://tiptap.dev/) |
| Math | [`@aarkue/tiptap-math-extension`](https://github.com/aarkue/tiptap-math-extension) + [KaTeX](https://katex.org/) |
| Audio | Browser `MediaRecorder`/`getUserMedia` for capture, [wavesurfer.js](https://wavesurfer.xyz/) for waveform playback |
| Styling | Tailwind CSS + shadcn/ui, restyled for a glassmorphism look |
| Sidebar tree | [react-arborist](https://github.com/brimdata/react-arborist) |
| Drag & drop | [dnd-kit](https://dndkit.com/) |
| State | Zustand, with page content lazy-loaded on open |
| Export | Electron's built-in `printToPDF`, [`docx`](https://www.npmjs.com/package/docx), and [`turndown`](https://www.npmjs.com/package/turndown) — all pure JS, no external binaries |
| Packaging | electron-builder, Windows-only (NSIS installer) |

See [CLAUDE.md](./CLAUDE.md) for the full set of design decisions and
constraints behind these choices.

## Getting started

Requires Node.js and npm.

```bash
npm install
npm run dev
```

### Other scripts

```bash
npm run build      # type-check and build the app (main + preload + renderer)
npm run typecheck   # type-check main and renderer separately
npm run dist        # build and package a Windows installer (.exe)
```

## Platform support

Windows only, by design. There are no macOS or Linux build targets.

## Project status

Actively developed, pre-1.0. The core notebook/section/page experience,
editor, search, export, and backup/restore are functional. Multi-device sync
is planned but not yet implemented.

## License

No license has been chosen yet.
