import { promises as fs } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isPdf, naturalCompare, toPdfName, validateName } from '@shared/filename'
import type { ExpandResult, RenameResult } from '@shared/types'

export interface FileAccess {
  /** Turns dropped/picked files and folders into a sorted list of PDFs, and grants access to them. */
  open(paths: string[]): Promise<ExpandResult>
  read(path: string): Promise<Uint8Array>
  /** Renames within the same folder; never overwrites unless `overwrite` is true. */
  rename(from: string, newBase: string, overwrite: boolean): Promise<RenameResult>
}

/**
 * The renderer's only way to the filesystem. It can read and rename only files the
 * user opened (and the names they were renamed to), whatever the renderer asks for.
 */
export function createFileAccess(): FileAccess {
  const granted = new Set<string>()
  const check = (path: string): void => {
    if (!granted.has(path)) throw new Error('File was not opened by the user')
  }
  return {
    async open(paths) {
      const result = await expandPaths(paths)
      result.files.forEach((f) => granted.add(f))
      return result
    },
    async read(path) {
      check(path)
      return new Uint8Array(await fs.readFile(path))
    },
    async rename(from, newBase, overwrite) {
      check(from)
      const result = await renameFile(from, newBase, overwrite)
      if (result.ok) granted.add(result.path)
      return result
    }
  }
}

async function expandPaths(paths: string[]): Promise<ExpandResult> {
  const found = new Set<string>()
  let ignored = 0

  for (const p of paths) {
    const abs = resolve(p)
    let stat
    try {
      stat = await fs.stat(abs)
    } catch {
      ignored++
      continue
    }
    if (stat.isDirectory()) {
      const entries = await fs.readdir(abs, { withFileTypes: true }).catch(() => [])
      for (const e of entries) {
        if (e.isFile() && isPdf(e.name)) found.add(join(abs, e.name))
        else ignored++
      }
    } else if (stat.isFile() && isPdf(abs)) {
      found.add(abs)
    } else {
      ignored++
    }
  }

  const files = [...found].sort(
    (a, b) => naturalCompare(basename(a), basename(b)) || naturalCompare(a, b)
  )
  return { files, ignored }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p)
    return true
  } catch {
    return false
  }
}

/** True if both paths point at the same file (e.g. case-only change on a case-insensitive FS). */
async function sameFile(a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fs.stat(a, { bigint: true }), fs.stat(b, { bigint: true })])
    return sa.dev === sb.dev && sa.ino === sb.ino
  } catch {
    return false
  }
}

async function renameFile(
  from: string,
  newBase: string,
  overwrite: boolean
): Promise<RenameResult> {
  const error = validateName(newBase)
  if (error) return { ok: false, reason: 'invalid', message: error }

  const target = join(dirname(from), toPdfName(newBase))
  if (target === from) return { ok: true, path: from }
  if (!(await exists(from))) {
    return { ok: false, reason: 'missing', message: `${basename(from)} no longer exists` }
  }

  try {
    if (await exists(target)) {
      if (await sameFile(from, target)) {
        // Case-only rename on a case-insensitive filesystem: go through a temp name.
        const tmp = join(dirname(from), `.${basename(from)}.${process.pid}.${Date.now()}.tmp`)
        await fs.rename(from, tmp)
        await fs.rename(tmp, target)
        return { ok: true, path: target }
      }
      if (!overwrite) return { ok: false, reason: 'exists', message: `${basename(target)} exists` }
    }
    await fs.rename(from, target)
    return { ok: true, path: target }
  } catch (e) {
    return { ok: false, reason: 'error', message: (e as Error).message }
  }
}
