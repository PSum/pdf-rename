import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFileAccess, describeFsError, type FileAccess } from '../src/main/files'

let dir: string
let files: FileAccess
const p = (...parts: string[]): string => join(dir, ...parts)
const touch = (name: string, content = name): Promise<void> => fs.writeFile(p(name), content)
const read = (name: string): Promise<string> => fs.readFile(p(name), 'utf8')

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'pdfrename-'))
  files = createFileAccess()
})

/** Opens the given files (granting access) and renames the first. */
async function renameFile(from: string, newBase: string, overwrite: boolean) {
  await files.open([from])
  return files.rename(from, newBase, overwrite)
}
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

describe('open', () => {
  it('expands folders (top level only), filters non-PDFs, dedupes and sorts naturally', async () => {
    await fs.mkdir(p('sub'))
    await Promise.all([touch('b10.pdf'), touch('b2.PDF'), touch('a.txt'), touch('sub/deep.pdf')])
    const res = await files.open([dir, p('b2.PDF'), p('missing.pdf')])
    expect(res.files).toEqual([p('b2.PDF'), p('b10.pdf')])
    expect(res.ignored).toBe(3) // a.txt, sub/, missing.pdf
  })
})

describe('access control', () => {
  it('refuses to read or rename files the user did not open', async () => {
    await touch('secret.pdf')
    await expect(files.read(p('secret.pdf'))).rejects.toThrow(/not opened/)
    await expect(files.rename(p('secret.pdf'), 'x', false)).rejects.toThrow(/not opened/)
  })
  it('grants access to opened files and to their new names', async () => {
    await touch('a.pdf')
    await files.open([dir])
    expect(new TextDecoder().decode(await files.read(p('a.pdf')))).toBe('a.pdf')
    await files.rename(p('a.pdf'), 'b', false)
    expect(new TextDecoder().decode(await files.read(p('b.pdf')))).toBe('a.pdf')
  })
})

describe('rename', () => {
  it('renames and adds .pdf', async () => {
    await touch('old.pdf')
    const res = await renameFile(p('old.pdf'), 'New Name', false)
    expect(res).toEqual({ ok: true, path: p('New Name.pdf') })
    expect(await read('New Name.pdf')).toBe('old.pdf')
  })

  it('rejects invalid names without touching the file', async () => {
    await touch('old.pdf')
    const res = await renameFile(p('old.pdf'), 'a:b', false)
    expect(res).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await read('old.pdf')).toBe('old.pdf')
  })

  it('reports conflicts and only overwrites when asked', async () => {
    await Promise.all([touch('a.pdf'), touch('b.pdf')])
    expect(await renameFile(p('a.pdf'), 'b', false)).toMatchObject({ ok: false, reason: 'exists' })
    expect(await read('b.pdf')).toBe('b.pdf')
    expect(await renameFile(p('a.pdf'), 'b', true)).toEqual({ ok: true, path: p('b.pdf') })
    expect(await read('b.pdf')).toBe('a.pdf')
  })

  it('handles case-only renames', async () => {
    await touch('invoice.pdf')
    expect(await renameFile(p('invoice.pdf'), 'Invoice', false)).toEqual({ ok: true, path: p('Invoice.pdf') })
    expect(await fs.readdir(dir)).toEqual(['Invoice.pdf'])
  })

  it('reports files deleted after opening', async () => {
    await touch('gone.pdf')
    await files.open([p('gone.pdf')])
    await fs.rm(p('gone.pdf'))
    expect(await files.rename(p('gone.pdf'), 'x', false)).toMatchObject({ ok: false, reason: 'missing' })
  })

  it('supports undo by renaming back, refusing if the old name was reused', async () => {
    await touch('orig.pdf')
    await renameFile(p('orig.pdf'), 'renamed', false)
    await touch('orig.pdf', 'other')
    expect(await files.rename(p('renamed.pdf'), 'orig', false)).toMatchObject({ reason: 'exists' })
    await fs.rm(p('orig.pdf'))
    expect(await files.rename(p('renamed.pdf'), 'orig', false)).toEqual({ ok: true, path: p('orig.pdf') })
  })
})

describe('error messages', () => {
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'explains a rename blocked by permissions',
    async () => {
      await touch('locked.pdf')
      await files.open([dir])
      await fs.chmod(dir, 0o555)
      try {
        const res = await files.rename(p('locked.pdf'), 'x', false)
        expect(res).toMatchObject({ ok: false, reason: 'error' })
        expect(res.ok || res.message).toMatch(/open in another program or you don't have permission/)
      } finally {
        await fs.chmod(dir, 0o755)
      }
    }
  )

  it('maps common error codes and falls back to the original message', () => {
    const err = (code: string) => Object.assign(new Error(`raw ${code}`), { code })
    expect(describeFsError(err('EBUSY'), 'a.pdf')).toMatch(/^a.pdf is open in another program/)
    expect(describeFsError(err('ENAMETOOLONG'), 'a.pdf')).toMatch(/too long/)
    expect(describeFsError(err('EXDEV'), 'a.pdf')).toBe('raw EXDEV')
  })
})
