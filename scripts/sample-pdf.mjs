// Tiny PDF writer for tests: one A4 page of Helvetica text and filled boxes.

/**
 * @param {Array<{text?: string, x: number, y: number, size?: number, bold?: boolean,
 *   w?: number, h?: number, color?: [number, number, number]}>} items
 *   Text items have `text`; items with `w`/`h` are filled rectangles. Coordinates in PDF points, origin bottom-left.
 */
export function pdfPage(items) {
  const esc = (t) => t.replace(/[\\()]/g, (c) => '\\' + c)
  const ops = items.map((it) => {
    const [r, g, b] = it.color ?? [0.1, 0.1, 0.12]
    if (it.w) return `${r} ${g} ${b} rg ${it.x} ${it.y} ${it.w} ${it.h} re f`
    return `${r} ${g} ${b} rg BT /${it.bold ? 'F2' : 'F1'} ${it.size ?? 11} Tf ${it.x} ${it.y} Td (${esc(it.text)}) Tj ET`
  })
  const stream = ops.join('\n')
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
  ]
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = Buffer.byteLength(out)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = Buffer.byteLength(out)
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  out += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  return out + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
}

/** A one-line page showing `text` big, used by the e2e test. */
export const labelPdf = (text) => pdfPage([{ text, x: 60, y: 700, size: 36 }])
