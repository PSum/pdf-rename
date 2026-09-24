export interface ExpandResult {
  files: string[]
  ignored: number
}

export type RenameResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid' | 'exists' | 'missing' | 'error'; message: string }

/** API exposed to the renderer by the preload script as `window.api`. */
export interface Api {
  pathForFile(file: File): string
  expandPaths(paths: string[]): Promise<ExpandResult>
  openDialog(): Promise<ExpandResult>
  readFile(path: string): Promise<Uint8Array>
  rename(from: string, newBase: string, overwrite: boolean): Promise<RenameResult>
  platform: string
}
