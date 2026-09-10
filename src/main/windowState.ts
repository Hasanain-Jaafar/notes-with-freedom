import { app, screen, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

// Small standalone JSON file in userData, same pattern as storageConfig.ts —
// this is viewer UI state (window size/position), not notebook data, so it
// has nothing to do with the user's chosen storage folder.
const STATE_FILENAME = 'window-state.json'
const DEFAULT_WIDTH = 1280
const DEFAULT_HEIGHT = 832
// Resize/move fire continuously during a live drag — same debounced-write
// discipline as the sqlite saves, just for this much smaller file.
const SAVE_DEBOUNCE_MS = 500

interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized: boolean
}

function stateFilePath(): string {
  return join(app.getPath('userData'), STATE_FILENAME)
}

function readState(): Partial<WindowState> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(stateFilePath(), 'utf-8'))
    if (parsed && typeof parsed === 'object') return parsed as Partial<WindowState>
    return null
  } catch {
    return null
  }
}

function writeState(state: WindowState): void {
  try {
    writeFileSync(stateFilePath(), JSON.stringify(state), 'utf-8')
  } catch {
    // Non-critical — worst case the next launch falls back to defaults.
  }
}

/** A saved position from a monitor that's no longer connected (laptop
 * undocked, external display unplugged) would otherwise open the window
 * off-screen and invisible — only trust x/y if they still land on some
 * currently-attached display's work area. */
function isOnScreen(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((d) => {
    const area = d.workArea
    return x < area.x + area.width && x + width > area.x && y < area.y + area.height && y + height > area.y
  })
}

/** Bounds/maximized state to construct the BrowserWindow with — read once at
 * startup, before the window exists. Falls back to the app's original
 * defaults on a fresh install, a corrupt file, or a now-disconnected
 * monitor's saved position. */
export function loadWindowState(): WindowState {
  const saved = readState()
  const width = saved?.width ?? DEFAULT_WIDTH
  const height = saved?.height ?? DEFAULT_HEIGHT
  const hasPosition = typeof saved?.x === 'number' && typeof saved?.y === 'number'
  const positionValid = hasPosition && isOnScreen(saved!.x!, saved!.y!, width, height)

  return {
    width,
    height,
    x: positionValid ? saved!.x : undefined,
    y: positionValid ? saved!.y : undefined,
    isMaximized: saved?.isMaximized ?? false
  }
}

/** Persists bounds/maximized state on resize/move/maximize/unmaximize
 * (debounced) and once more, synchronously, right before the window
 * actually closes — so a quit mid-debounce-window doesn't lose the very
 * last resize. */
export function trackWindowState(window: BrowserWindow): void {
  let saveTimer: NodeJS.Timeout | null = null

  const save = (): void => {
    // getNormalBounds(), not getBounds(): while maximized, getBounds()
    // returns the maximized (screen-filling) size — saving that as the
    // restored size would make un-maximizing snap back to a
    // screen-filling window instead of whatever size it was before.
    const bounds = window.getNormalBounds()
    writeState({ ...bounds, isMaximized: window.isMaximized() })
  }

  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(save, SAVE_DEBOUNCE_MS)
  }

  window.on('resize', scheduleSave)
  window.on('move', scheduleSave)
  window.on('maximize', scheduleSave)
  window.on('unmaximize', scheduleSave)

  window.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    save()
  })
}
