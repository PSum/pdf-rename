import { screen, type BrowserWindow, type Rectangle } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'

export interface WindowState {
  bounds?: Rectangle
  maximized?: boolean
}

/** The saved window size/position, dropped if its display is no longer attached. */
export function loadWindowState(file: string): WindowState {
  let state: WindowState
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return {}
  }
  const b = state.bounds
  if (!b) return state
  const area = screen.getDisplayMatching(b).workArea
  const visible =
    b.x < area.x + area.width && b.x + b.width > area.x && b.y < area.y + area.height && b.y + b.height > area.y
  return visible ? state : { maximized: state.maximized }
}

/** Saves size, position and maximized state when the window closes. */
export function trackWindowState(win: BrowserWindow, file: string): void {
  win.on('close', () => {
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() }
    try {
      writeFileSync(file, JSON.stringify(state))
    } catch {
      // Not being able to remember the window is no reason to block closing it.
    }
  })
}
