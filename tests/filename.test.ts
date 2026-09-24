import { describe, expect, it } from 'vitest'
import { baseName, naturalCompare, stripPdf, toPdfName, validateName } from '@shared/filename'

describe('validateName', () => {
  it('accepts normal names', () => {
    for (const n of ['Invoice 2026-09', 'Rechnung_Müller', 'a.b.c', '  leading space', '日本語'])
      expect(validateName(n)).toBeNull()
  })
  it('rejects illegal characters', () => {
    for (const c of ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\x01'])
      expect(validateName(`a${c}b`)).toMatch(/Not allowed/)
  })
  it('rejects empty, trailing dot/space and reserved names', () => {
    expect(validateName('')).toMatch(/empty/)
    expect(validateName('   ')).toMatch(/empty/)
    expect(validateName('name.')).toMatch(/dot or space/)
    expect(validateName('name ')).toMatch(/dot or space/)
    expect(validateName('CON')).toMatch(/reserved/)
    expect(validateName('com1.backup')).toMatch(/reserved/)
    expect(validateName('console')).toBeNull()
  })
  it('ignores a typed .pdf extension', () => {
    expect(validateName('ok.pdf')).toBeNull()
    expect(validateName('.pdf')).toMatch(/empty/)
    expect(validateName('bad:.pdf')).toMatch(/Not allowed/)
  })
  it('rejects names that are too long', () => {
    expect(validateName('a'.repeat(251))).toMatch(/too long/)
  })
})

describe('extension helpers', () => {
  it('adds .pdf once', () => {
    expect(toPdfName('x')).toBe('x.pdf')
    expect(toPdfName('x.PDF')).toBe('x.PDF')
  })
  it('strips .pdf case-insensitively', () => {
    expect(stripPdf('scan.PDF')).toBe('scan')
    expect(stripPdf('scan.pdf.pdf')).toBe('scan.pdf')
  })
})

describe('naturalCompare', () => {
  it('sorts numbers naturally', () => {
    expect(['scan10', 'scan2', 'Scan1'].sort(naturalCompare)).toEqual(['Scan1', 'scan2', 'scan10'])
  })
})

describe('baseName', () => {
  it('handles both separators', () => {
    expect(baseName('/a/b/c.pdf')).toBe('c.pdf')
    expect(baseName('C:\\x\\y.pdf')).toBe('y.pdf')
    expect(baseName('plain.pdf')).toBe('plain.pdf')
  })
})
