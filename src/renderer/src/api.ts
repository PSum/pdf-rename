// The UI's only way to the filesystem: Tauri commands implemented in src-tauri/src/lib.rs.
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { open } from '@tauri-apps/plugin-dialog'
import type { ExpandResult, RenameResult } from '@shared/types'

// Commands reject with their error string; make that an Error like everywhere else.
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw e instanceof Error ? e : new Error(String(e))
  }
}

/** Expands files/folders to a sorted PDF list and grants the app access to them. */
export const openPaths = (paths: string[]): Promise<ExpandResult> => call('open_paths', { paths })

export async function pickFiles(): Promise<ExpandResult> {
  const picked = await open({ multiple: true, filters: [{ name: 'PDF', extensions: ['pdf', 'PDF'] }] })
  return openPaths(picked ?? [])
}

export const readFile = async (path: string): Promise<Uint8Array> =>
  new Uint8Array(await call<ArrayBuffer>('read_file', { path }))

export const rename = (from: string, newBase: string, overwrite: boolean): Promise<RenameResult> =>
  call('rename_file', { from, newBase, overwrite })

/** Paths the app was started with ("Open with…", dropped onto the app icon). */
export const launchPaths = (): Promise<string[]> => call('launch_paths')

/** Files dragged onto the window, and paths from a second launch of the app. */
export function onFiles(handlers: { hover(active: boolean): void; drop(paths: string[]): void }): void {
  getCurrentWebview().onDragDropEvent(({ payload }) => {
    if (payload.type === 'drop') {
      handlers.hover(false)
      handlers.drop(payload.paths)
    } else {
      handlers.hover(payload.type !== 'leave')
    }
  })
  listen<string[]>('open-paths', (e) => handlers.drop(e.payload))
}

export const isMac = navigator.userAgent.includes('Mac')
