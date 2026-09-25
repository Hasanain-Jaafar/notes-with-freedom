import { app, shell, ipcMain, BrowserWindow, Menu, MenuItem } from 'electron'
import { join } from 'path'
import { appendFileSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { IPC } from '@shared/ipc-channels'
import type { StorageChangeResult, StorageStatsDTO, BackupResult, PickBackupResult } from '@shared/ipc-channels'
import { initDb, flushSaveNow } from './db/client'
import { registerDbIpcHandlers } from './db/ipc'
import { registerAttachmentIpcHandlers, mediaRootPath } from './db/attachments'
import { registerMediaProtocolPrivileges, registerMediaProtocolHandler } from './mediaProtocol'
import { registerExportIpcHandlers } from './export/ipc'
import { resolveStorageDir, getDataDir, changeStorageLocation } from './storageConfig'
import { getStorageStats, createBackup, pickAndValidateBackupFile, restoreFromBackup } from './db/backup'
import { registerUpdateIpcHandlers, checkForUpdatesInBackground } from './updater'
import { registerLinkPreviewIpcHandlers } from './linkPreview'
import { loadWindowState, trackWindowState } from './windowState'

// userData defaults to a folder named after app.name — pinned explicitly to
// the app's original name ("Notes with Freedom") BEFORE setName() below
// changes the display name to "Own Notes". Without this, every existing
// install would suddenly resolve userData to a brand-new, empty folder on
// next launch: storage-config.json (which remembers where the user's actual
// notebook data lives — see storageConfig.ts) would look unset, along with
// window position and other local prefs, none of which actually moved.
app.setPath('userData', join(app.getPath('appData'), 'Notes with Freedom'))

// Sets the taskbar/window title and jump-list identity. Must happen before
// app.whenReady() — Windows reads this at window-creation time, and in dev
// (running the stock electron.exe rather than a renamed packaged exe) this
// is what keeps the taskbar from falling back to showing "Electron".
app.setName('Own Notes')
electronApp.setAppUserModelId('com.hassanainadm.noteswithfreedom')

// Must happen before app.whenReady() — Electron requires privileged scheme
// registration at module load time.
registerMediaProtocolPrivileges()

// The app occasionally blanks out and repaints itself (reported alongside a
// stuck "Saving…") — a GPU or renderer process dying and being restarted by
// Chromium looks exactly like that. Log those events to userData/crash.log
// so there's something to go on besides "it flickered".
function logCrash(message: string): void {
  try {
    appendFileSync(
      join(app.getPath('userData'), 'crash.log'),
      `${new Date().toISOString()} v${app.getVersion()} ${message}\n`
    )
  } catch {
    // Logging must never be the thing that takes the app down.
  }
}

app.on('child-process-gone', (_e, details) => {
  logCrash(`${details.type} process gone: ${details.reason} (exit ${details.exitCode})`)
})

function createWindow(): void {
  const windowState = loadWindowState()
  const mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    show: false,
    autoHideMenuBar: true,
    // Frameless on purpose: a native Windows title bar can only ever be a
    // flat color (even titleBarOverlay only accepts a single solid color,
    // never a gradient). The gradient title bar lives entirely in the
    // renderer (see TopBar.tsx) with its own drag region and window-control
    // buttons wired through the windowControls IPC bridge below.
    frame: false,
    // Close to the pastel gradient's base tone (see body in index.css) so
    // there's no jarring flash before the renderer paints.
    backgroundColor: '#f2f4f9',
    // Only needed in dev — the packaged Windows exe already carries the icon
    // baked in via the "build.win.icon" electron-builder setting.
    ...(is.dev ? { icon: join(__dirname, '../../resources/icon.png') } : {}),
    // Native Windows 11 frosted-glass window chrome. Ignored (no-op, no
    // error) on Windows 10 and earlier or other platforms — the CSS-based
    // glass panels in the renderer are the real, always-on effect; this is
    // just an extra native touch layered on top where the OS supports it.
    ...(process.platform === 'win32' ? { backgroundMaterial: 'acrylic' as const } : {}),
    // Must come after backgroundMaterial above, both in this object and via
    // the explicit setMaximizable() call below: Electron applies constructor
    // options as setters in key order, and setting backgroundMaterial has
    // the side effect of silently resetting maximizable back to false on
    // this Electron/Windows combination (confirmed via logging —
    // window.isMaximizable() read false only when acrylic was set, and only
    // when maximizable was listed before it in this object). Putting
    // maximizable after backgroundMaterial here — and re-asserting it once
    // more after construction — is what actually makes the maximize button
    // and title-bar double-click work.
    maximizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Belt-and-suspenders against the ordering quirk above: constructor-option
  // application order is an internal Electron implementation detail that
  // could shift across versions, so re-assert maximizable explicitly too.
  mainWindow.setMaximizable(true)

  // Before show, not after — maximizing a window that's already visible
  // produces a brief flash of the smaller restored size first.
  if (windowState.isMaximized) mainWindow.maximize()
  trackWindowState(mainWindow)

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, true)
  })
  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send(IPC.WINDOW_MAXIMIZE_CHANGED, false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Chromium's built-in spellchecker (bundled dictionaries, no OS
  // integration needed) is what actually flags misspelled words with a red
  // squiggle and hands back params.misspelledWord/dictionarySuggestions
  // below — off by default is NOT the case, but setting it explicitly here
  // means this doesn't silently depend on Electron's own default staying
  // enabled in some future version.
  mainWindow.webContents.session.spellCheckerEnabled = true

  // Electron ships no default right-click menu at all — without this, text
  // fields (the TipTap editor, tag/property inputs, dialogs) have no way to
  // cut/copy/paste/select-all via right-click, only keyboard shortcuts.
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = new Menu()
    if (params.isEditable) {
      // Spelling suggestions + "Add to dictionary" — same reasoning as the
      // Cut/Copy/Paste group below: Chromium computes misspelledWord and
      // dictionarySuggestions on every context-menu event regardless, but
      // nothing surfaces them to the user without a menu built from them.
      if (params.misspelledWord) {
        if (params.dictionarySuggestions.length > 0) {
          for (const suggestion of params.dictionarySuggestions) {
            menu.append(
              new MenuItem({
                label: suggestion,
                click: () => mainWindow.webContents.replaceMisspelling(suggestion)
              })
            )
          }
        } else {
          menu.append(new MenuItem({ label: 'No suggestions', enabled: false }))
        }
        menu.append(
          new MenuItem({
            label: 'Add to dictionary',
            click: () =>
              mainWindow.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
          })
        )
        menu.append(new MenuItem({ type: 'separator' }))
      }
      // Selected text in the note editor (the only contenteditable in the
      // app — form fields report 'input-text'/'text-area' instead). The
      // renderer's CommentPopover opens at the selection.
      if (params.selectionText && params.formControlType === 'none') {
        menu.append(
          new MenuItem({
            label: 'Comment',
            accelerator: 'Ctrl+Alt+M',
            click: () => mainWindow.webContents.send(IPC.EDITOR_CONTEXT_COMMENT)
          })
        )
        menu.append(new MenuItem({ type: 'separator' }))
      }
      menu.append(new MenuItem({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut }))
      menu.append(new MenuItem({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy }))
      menu.append(
        new MenuItem({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste })
      )
      menu.append(new MenuItem({ type: 'separator' }))
      menu.append(
        new MenuItem({
          label: 'Select All',
          role: 'selectAll',
          enabled: params.editFlags.canSelectAll
        })
      )
    } else if (params.selectionText) {
      menu.append(new MenuItem({ label: 'Copy', role: 'copy' }))
    } else {
      return
    }
    menu.popup()
  })

  // Electron leaves Chromium's native pinch-to-zoom enabled by default, which
  // scales the ENTIRE custom UI (title bar, sidebar, everything), not just
  // page content — jarring in an app with its own hand-built chrome, and the
  // reason a trackpad drag on graph view's canvas (see GraphView.tsx) could
  // zoom the whole window even after the graph's own pan/zoom was disabled
  // for the duration of a node drag: that only ever controlled the graph
  // library's internal camera, never this separate, native, page-level zoom.
  mainWindow.webContents.setVisualZoomLevelLimits(1, 1)

  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    logCrash(`renderer gone: ${details.reason} (exit ${details.exitCode})`)
  })
  mainWindow.on('unresponsive', () => logCrash('window unresponsive'))
  mainWindow.on('responsive', () => logCrash('window responsive again'))

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerWindowIpcHandlers(): void {
  ipcMain.handle(IPC.WINDOW_TOGGLE_MAXIMIZE, (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window) return
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
  })

  ipcMain.handle(IPC.WINDOW_IS_MAXIMIZED, (event): boolean => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })

  ipcMain.handle(IPC.WINDOW_MINIMIZE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle(IPC.WINDOW_CLOSE, (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })
}

function registerStorageIpcHandlers(): void {
  ipcMain.handle(IPC.STORAGE_GET_PATH, (): string => getDataDir())

  ipcMain.handle(IPC.STORAGE_CHANGE_LOCATION, async (): Promise<StorageChangeResult> => {
    // Capture whatever's still only in memory before copying the on-disk
    // file — otherwise a recent edit sitting in the debounce window would
    // get left behind at the old location. Awaited: flushSaveNow's write is
    // async now, and changeStorageLocation() copies notebook.sqlite from disk.
    await flushSaveNow()
    const result = await changeStorageLocation()
    if (result.changed) {
      // The sql.js connection and the app-media:// protocol's root were
      // both fixed at startup — relaunch rather than try to hot-swap them,
      // so every module picks up the new location consistently.
      //
      // app.quit() here, not app.exit(0): exit() kills the process
      // immediately, without giving Chromium's GPU/renderer subprocesses a
      // chance to release their handles on this instance's cache files —
      // relaunch() then races the brand-new instance's startup against that
      // still-in-progress teardown, which is what produces Chromium's
      // "Unable to move the cache: Access is denied" errors on Windows.
      // quit() runs the normal shutdown sequence first (still fires
      // before-quit/window-all-closed below), so the old process is
      // actually gone before the new one starts.
      app.relaunch()
      app.quit()
    }
    return result
  })

  // Not really "storage", but the Settings panel's only other IPC need —
  // not worth a whole separate registration function for one call.
  ipcMain.handle(IPC.APP_GET_VERSION, (): string => app.getVersion())
}

function registerBackupIpcHandlers(): void {
  ipcMain.handle(IPC.BACKUP_GET_STATS, (): StorageStatsDTO => getStorageStats())

  ipcMain.handle(IPC.BACKUP_CREATE, (): Promise<BackupResult> => createBackup())

  ipcMain.handle(IPC.BACKUP_PICK_AND_VALIDATE, (): Promise<PickBackupResult> =>
    pickAndValidateBackupFile()
  )

  // Only reached after the renderer has already shown its own in-app
  // warning dialog and the user confirmed — see SettingsPanel.tsx. Relaunches
  // the app itself on success (same as storage:changeLocation).
  ipcMain.handle(IPC.BACKUP_RESTORE, (_e, filePath: string): Promise<void> =>
    restoreFromBackup(filePath)
  )
}

app.whenReady().then(async () => {
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Must resolve before anything below touches a DB/media path — prompts
  // for a folder on first launch (or if the configured one has gone
  // missing), migrating any pre-existing userData-folder install in place.
  await resolveStorageDir()

  registerMediaProtocolHandler(mediaRootPath())

  await initDb()
  registerDbIpcHandlers()
  registerAttachmentIpcHandlers()
  registerWindowIpcHandlers()
  registerExportIpcHandlers()
  registerStorageIpcHandlers()
  registerBackupIpcHandlers()
  registerUpdateIpcHandlers()
  registerLinkPreviewIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

  // electron-updater reads app-update.yml, which only exists in a packaged
  // build — skip in dev so this doesn't just error on every launch.
  if (app.isPackaged) checkForUpdatesInBackground()
})

app.on('window-all-closed', () => {
  // No flushSaveNow() call here anymore — before-quit below is the single
  // gate every app.quit() path (this one, STORAGE_CHANGE_LOCATION's,
  // restoreFromBackup's) now goes through, and it guarantees the flush
  // actually finishes before quit is allowed to proceed.
  if (process.platform !== 'darwin') app.quit()
})

// True once the flush below has actually completed — lets the SECOND
// before-quit (from the app.quit() call inside the handler itself) through
// instead of preventDefault()-ing forever.
let readyToQuit = false

app.on('before-quit', (event) => {
  if (readyToQuit) return
  // flushSaveNow's write is async now (see client.ts) — without this,
  // Electron would tear the process down before the write actually
  // finished, same risk the old synchronous writeFileSync never had.
  event.preventDefault()
  void flushSaveNow().finally(() => {
    readyToQuit = true
    app.quit()
  })
})
