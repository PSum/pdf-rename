// Filename rules shared by main and renderer. The same (Windows-strict) rules
// apply on every OS so renamed files stay portable.

const ILLEGAL_CHARS = /[/\\:*?"<>|\x00-\x1f]/
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_LENGTH = 250 // leaves room for ".pdf" within the common 255-byte limit

/**
 * Validates what the user typed as the new name (".pdf" optional).
 * Returns an error message, or null if the name is fine.
 */
export function validateName(input: string): string | null {
  const base = stripPdf(input)
  if (base.trim() === '') return 'Name cannot be empty'
  const bad = base.match(ILLEGAL_CHARS)
  if (bad) {
    const ch = bad[0].charCodeAt(0) < 0x20 ? 'control characters' : `"${bad[0]}"`
    return `Not allowed: ${ch}  (forbidden: / \\ : * ? " < > |)`
  }
  if (/[. ]$/.test(base)) return 'Name cannot end with a dot or space'
  if (RESERVED.test(base.split('.')[0].trim())) return `"${base}" is a reserved name on Windows`
  if (new TextEncoder().encode(base).length > MAX_LENGTH) return 'Name is too long'
  return null
}

/** "Invoice" -> "Invoice.pdf". Does not double the extension if the user typed it. */
export function toPdfName(input: string): string {
  return isPdf(input) ? input : `${input}.pdf`
}

/** "scan_001.PDF" -> "scan_001" */
export function stripPdf(name: string): string {
  return name.replace(/\.pdf$/i, '')
}

export function isPdf(name: string): boolean {
  return /\.pdf$/i.test(name)
}

/** Last path segment, for both / and \ separators (the renderer has no node:path). */
export function baseName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Natural sort: "scan2" before "scan10". */
export function naturalCompare(a: string, b: string): number {
  return collator.compare(a, b)
}
