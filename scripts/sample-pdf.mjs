// Tiny PDF writer for tests and screenshots: one A4 page of Helvetica text and filled boxes.

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

/** A realistic-looking invoice for screenshots. */
export function invoicePdf({ company, number, date, items }) {
  const accent = [0.78, 0.2, 0.15]
  const grey = [0.45, 0.45, 0.5]
  const rows = items.flatMap(([desc, qty, price], i) => {
    const y = 470 - i * 28
    return [
      { text: desc, x: 60, y },
      { text: String(qty), x: 380, y },
      { text: `${price.toFixed(2)} EUR`, x: 470, y }
    ]
  })
  const total = items.reduce((s, [, q, p]) => s + q * p, 0)
  const last = 470 - items.length * 28
  return pdfPage([
    { x: 0, y: 812, w: 595, h: 30, color: accent },
    { text: company, x: 60, y: 760, size: 20, bold: true },
    { text: 'Hauptstrasse 12, 10115 Berlin, Germany', x: 60, y: 740, size: 10, color: grey },
    { text: 'INVOICE', x: 60, y: 660, size: 30, bold: true, color: accent },
    { text: `Invoice no. ${number}`, x: 60, y: 630, size: 11 },
    { text: `Date: ${date}`, x: 60, y: 614, size: 11 },
    { text: 'Bill to: Philipp Sum', x: 360, y: 630, size: 11 },
    { x: 60, y: 505, w: 475, h: 24, color: [0.95, 0.93, 0.93] },
    { text: 'Description', x: 68, y: 513, size: 10, bold: true },
    { text: 'Qty', x: 380, y: 513, size: 10, bold: true },
    { text: 'Price', x: 470, y: 513, size: 10, bold: true },
    ...rows,
    { x: 60, y: last - 4, w: 475, h: 1, color: grey },
    { text: 'Total', x: 380, y: last - 26, size: 12, bold: true },
    { text: `${total.toFixed(2)} EUR`, x: 470, y: last - 26, size: 12, bold: true },
    { text: 'Payable within 14 days. Thank you for your business!', x: 60, y: 120, size: 10, color: grey }
  ])
}
