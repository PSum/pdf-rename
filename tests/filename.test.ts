import { describe, expect, it } from 'vitest'
import { baseName, naturalCompare, stripPdf, toPdfName, validateName } from '@shared/filename'
import fixture from './fixtures/names.json'

describe('validateName', () => {
  // The same cases run against the Rust implementation (src-tauri/src/names.rs).
  it.each(fixture.cases)('$input', ({ input, error }) => {
    const message = validateName(input)
    if (error === null) expect(message).toBeNull()
    else expect(message).toContain(error)
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
    const shuffled = [...fixture.sort].reverse()
    expect(shuffled.sort(naturalCompare)).toEqual(fixture.sort)
  })
})

describe('baseName', () => {
  it('handles both separators', () => {
    expect(baseName('/a/b/c.pdf')).toBe('c.pdf')
    expect(baseName('C:\\x\\y.pdf')).toBe('y.pdf')
    expect(baseName('plain.pdf')).toBe('plain.pdf')
  })
})
