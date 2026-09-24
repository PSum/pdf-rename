import { baseName, toPdfName, validateName } from '@shared/filename'
import type { RenameResult } from '@shared/types'

/** Renames a file on disk. Production: IPC to main. Tests: in-memory. */
export type RenamePort = (from: string, newBase: string, overwrite: boolean) => Promise<RenameResult>

export interface Notice {
  kind: 'error' | 'warn' | 'ok'
  text: string
}

export interface SessionState {
  screen: 'rename' | 'summary'
  /** Current path on disk of the file being shown. */
  file: string
  position: number
  total: number
  /** A notice to show beside the name field, if any. */
  notice: Notice | null
  /** True while waiting for the user to confirm overwriting an existing file. */
  confirmingOverwrite: boolean
  renamedCount: number
}

interface Item {
  original: string
  path: string
}

interface Rename {
  position: number
  from: string
  to: string
}

/**
 * One batch of PDFs being renamed: the cursor, the undo history and the pending
 * overwrite confirmation. Operations run one at a time; calls made while one is
 * in flight are ignored, so fast key repeats cannot rename the wrong file.
 */
export class Session {
  private readonly items: Item[]
  private readonly history: Rename[] = []
  private position = 0
  private screen: SessionState['screen'] = 'rename'
  private notice: Notice | null = null
  private conflict: string | null = null // the name waiting for overwrite confirmation
  private busy = false

  constructor(
    files: string[],
    private readonly rename: RenamePort
  ) {
    if (files.length === 0) throw new Error('A session needs at least one file')
    this.items = files.map((p) => ({ original: p, path: p }))
  }

  get state(): SessionState {
    return {
      screen: this.screen,
      file: this.items[this.position].path,
      position: this.position,
      total: this.items.length,
      notice: this.notice,
      confirmingOverwrite: this.conflict !== null,
      renamedCount: this.items.filter((i) => i.path !== i.original).length
    }
  }

  /** Append more files to the end of the batch, skipping ones already in it. Returns how many were added. */
  add(files: string[]): number {
    const known = new Set(this.items.flatMap((i) => [i.original, i.path]))
    const fresh = files.filter((f) => !known.has(f))
    fresh.forEach((f) => this.items.push({ original: f, path: f }))
    const dupes = files.length - fresh.length
    const text = `${fresh.length} PDF(s) added` + (dupes ? `, ${dupes} already in the list` : '')
    this.notice = { kind: fresh.length ? 'ok' : 'warn', text }
    return fresh.length
  }

  /** The user changed the new-name text: re-validate and drop any pending confirmation. */
  edit(input: string): void {
    this.conflict = null
    const error = validateName(input)
    this.notice = error ? { kind: 'error', text: error } : null
  }

  /** Rename the current file to `input` and move on. Unchanged names just move on. */
  submit(input: string): Promise<void> {
    return this.exclusive(() => this.renameCurrent(input, false))
  }

  confirmOverwrite(): Promise<void> {
    return this.exclusive(async () => {
      if (this.conflict !== null) await this.renameCurrent(this.conflict, true)
    })
  }

  cancelOverwrite(): void {
    this.conflict = null
    this.notice = null
  }

  next(): void {
    if (this.busy) return
    this.moveTo(this.position + 1)
  }

  back(): void {
    if (this.busy || this.position === 0) return
    this.moveTo(this.position - 1)
  }

  finish(): void {
    this.screen = 'summary'
  }

  /** Revert the most recent rename and show that file again. */
  undo(): Promise<void> {
    return this.exclusive(async () => {
      const last = this.history.at(-1)
      if (!last) {
        this.notice = { kind: 'warn', text: 'Nothing to undo' }
        return
      }
      const res = await this.rename(last.to, baseName(last.from), false)
      this.moveTo(last.position)
      this.screen = 'rename'
      if (!res.ok) {
        this.notice = { kind: 'error', text: `Undo failed: ${res.message}` }
        return
      }
      this.history.pop()
      this.items[last.position].path = res.path
      this.notice = { kind: 'ok', text: `Restored "${baseName(res.path)}"` }
    })
  }

  private async renameCurrent(input: string, overwrite: boolean): Promise<void> {
    const error = validateName(input)
    if (error) {
      this.notice = { kind: 'error', text: error }
      return
    }
    const item = this.items[this.position]
    if (toPdfName(input) === baseName(item.path)) return this.moveTo(this.position + 1)

    const res = await this.rename(item.path, input, overwrite)
    if (res.ok) {
      this.history.push({ position: this.position, from: item.path, to: res.path })
      item.path = res.path
      this.moveTo(this.position + 1)
    } else if (res.reason === 'exists') {
      this.conflict = input
      this.notice = {
        kind: 'warn',
        text: `"${toPdfName(input)}" already exists.\nEnter = overwrite (cannot be undone), Esc = cancel`
      }
    } else {
      this.notice = { kind: 'error', text: res.message }
    }
  }

  /** Past the last file means the batch is finished. */
  private moveTo(position: number): void {
    this.conflict = null
    this.notice = null
    if (position >= this.items.length) {
      this.screen = 'summary'
      return
    }
    this.position = position
  }

  private async exclusive(op: () => Promise<void>): Promise<void> {
    if (this.busy) return
    this.busy = true
    try {
      await op()
    } finally {
      this.busy = false
    }
  }
}
