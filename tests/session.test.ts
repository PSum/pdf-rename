import { describe, expect, it } from 'vitest'
import { Session, type RenamePort } from '../src/renderer/src/session'

/** In-memory filesystem adapter for the rename port. */
function memoryFs(paths: string[]) {
  const disk = new Set(paths)
  const rename: RenamePort = async (from, newBase, overwrite) => {
    const to = `/d/${newBase.endsWith('.pdf') ? newBase : newBase + '.pdf'}`
    if (!disk.has(from)) return { ok: false, reason: 'missing', message: 'gone' }
    if (disk.has(to) && !overwrite) return { ok: false, reason: 'exists', message: 'exists' }
    disk.delete(from)
    disk.add(to)
    return { ok: true, path: to }
  }
  return { disk, rename }
}

const setup = (names: string[], extra: string[] = []) => {
  const files = names.map((n) => `/d/${n}.pdf`)
  const fs = memoryFs([...files, ...extra.map((n) => `/d/${n}.pdf`)])
  return { fs, s: new Session(files, fs.rename) }
}

describe('Session', () => {
  it('renames and advances, then finishes after the last file', async () => {
    const { fs, s } = setup(['a', 'b'])
    await s.submit('A')
    expect(s.state).toMatchObject({ file: '/d/b.pdf', position: 1, screen: 'rename' })
    await s.submit('B')
    expect(s.state).toMatchObject({ screen: 'summary', renamedCount: 2, total: 2 })
    expect([...fs.disk].sort()).toEqual(['/d/A.pdf', '/d/B.pdf'])
  })

  it('treats an unchanged name as skip', async () => {
    const { fs, s } = setup(['a', 'b'])
    await s.submit('a')
    expect(s.state.position).toBe(1)
    expect(fs.disk.has('/d/a.pdf')).toBe(true)
  })

  it('blocks invalid names and stays on the file', async () => {
    const { s } = setup(['a'])
    await s.submit('x:y')
    expect(s.state).toMatchObject({ position: 0, screen: 'rename', notice: { kind: 'error' } })
    s.edit('fine')
    expect(s.state.notice).toBeNull()
  })

  it('asks before overwriting, and editing or cancelling drops the question', async () => {
    const { fs, s } = setup(['a', 'b'], ['taken'])
    await s.submit('taken')
    expect(s.state).toMatchObject({ position: 0, confirmingOverwrite: true, notice: { kind: 'warn' } })
    s.cancelOverwrite()
    expect(s.state).toMatchObject({ confirmingOverwrite: false, notice: null })

    await s.submit('taken')
    s.edit('takenX')
    expect(s.state.confirmingOverwrite).toBe(false)
    await s.confirmOverwrite() // nothing pending: no-op
    expect(fs.disk.has('/d/a.pdf')).toBe(true)

    await s.submit('taken')
    await s.confirmOverwrite()
    expect(s.state.position).toBe(1)
    expect(fs.disk.has('/d/a.pdf')).toBe(false)
  })

  it('navigates with skip and back, clamped at the start', () => {
    const { s } = setup(['a', 'b'])
    s.back()
    expect(s.state.position).toBe(0)
    s.next()
    expect(s.state.file).toBe('/d/b.pdf')
    s.back()
    expect(s.state.file).toBe('/d/a.pdf')
    s.next()
    s.next()
    expect(s.state).toMatchObject({ screen: 'summary', renamedCount: 0 })
  })

  it('shows the renamed file under its new name when going back', async () => {
    const { s } = setup(['a', 'b'])
    await s.submit('A')
    s.back()
    expect(s.state.file).toBe('/d/A.pdf')
  })

  it('undoes the last rename, even from the summary screen', async () => {
    const { fs, s } = setup(['a'])
    await s.submit('A')
    expect(s.state.screen).toBe('summary')
    await s.undo()
    expect(s.state).toMatchObject({ screen: 'rename', file: '/d/a.pdf', renamedCount: 0, notice: { kind: 'ok' } })
    expect(fs.disk.has('/d/a.pdf')).toBe(true)
    await s.undo()
    expect(s.state.notice).toMatchObject({ kind: 'warn', text: 'Nothing to undo' })
  })

  it('keeps the history entry when undo fails', async () => {
    const { fs, s } = setup(['a', 'b'])
    await s.submit('A')
    fs.disk.add('/d/a.pdf') // old name reused by someone else
    await s.undo()
    expect(s.state).toMatchObject({ file: '/d/A.pdf', notice: { kind: 'error' } })
    fs.disk.delete('/d/a.pdf')
    await s.undo()
    expect(s.state.file).toBe('/d/a.pdf')
  })

  it('ignores operations while a rename is in flight', async () => {
    const { s } = setup(['a', 'b', 'c'])
    const first = s.submit('A')
    s.next()
    await s.submit('ignored')
    await first
    expect(s.state).toMatchObject({ file: '/d/b.pdf', position: 1 })
  })

  it('appends dropped files, skipping ones already in the batch', async () => {
    const { s } = setup(['a', 'b'])
    await s.submit('A') // a.pdf is now A.pdf
    expect(s.add(['/d/a.pdf', '/d/A.pdf', '/d/b.pdf', '/d/c.pdf'])).toBe(1)
    expect(s.state).toMatchObject({ total: 3, position: 1, notice: { kind: 'ok', text: '1 PDF(s) added, 3 already in the list' } })
    s.next()
    expect(s.state.file).toBe('/d/c.pdf')
    expect(s.add(['/d/c.pdf']).valueOf()).toBe(0)
    expect(s.state.notice?.kind).toBe('warn')
  })
})
