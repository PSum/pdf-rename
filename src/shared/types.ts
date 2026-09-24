export interface ExpandResult {
  files: string[]
  ignored: number
}

export type RenameResult =
  | { ok: true; path: string }
  | { ok: false; reason: 'invalid' | 'exists' | 'missing' | 'error'; message: string }
