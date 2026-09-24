// Takes the README screenshots from the built app (`npm run build` first).
// Writes docs/screenshots/{drop,rename}-{light,dark}.png. Headless Linux: xvfb-run.
import { _electron as electron } from 'playwright-core'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { invoicePdf } from './sample-pdf.mjs'

const APP = path.resolve(import.meta.dirname, '..')
const OUT = path.join(APP, 'docs/screenshots')
const ELECTRON = (await import('electron')).default
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfrename-shots-'))
const dir = path.join(tmp, 'Scans')
fs.mkdirSync(dir)
fs.mkdirSync(OUT, { recursive: true })

const scans = [
  ['Acme Office Supplies GmbH', '2026-0912', '12 Sep 2026', [['Copy paper A4, 5 boxes', 5, 24.9], ['Ballpoint pens, blue', 20, 0.85], ['Desk organizer', 2, 18.5]]],
  ['Stadtwerke Berlin', '88-41120', '15 Sep 2026', [['Electricity, August', 1, 64.2], ['Base fee', 1, 9.9]]],
  ['Bike & Co. Werkstatt', 'R-3381', '18 Sep 2026', [['Service, city bike', 1, 59], ['Brake pads', 2, 12.5]]]
]
scans.forEach(([company, number, date, items], i) =>
  fs.writeFileSync(path.join(dir, `SCAN_2026091${2 + i}_00${41 + i}.pdf`), invoicePdf({ company, number, date, items }))
)

const app = await electron.launch({
  executablePath: ELECTRON,
  args: ['--no-sandbox', APP],
  env: { ...process.env, PDF_RENAME_USER_DATA: path.join(tmp, 'profile') }
})
try {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1200, 720))
  const page = await app.firstWindow()
  await page.waitForSelector('#dropzone')
  const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`) })

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(200)
    await shot(`drop-${scheme}`)
  }

  await app.evaluate(({ dialog }, d) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })
  }, dir)
  await page.click('#dropzone')
  await page.waitForSelector('#preview canvas')
  // Rename the first one, then show the second mid-typing.
  await page.keyboard.type('2026-09-12 Acme Office Supplies Invoice')
  await page.keyboard.press('Shift+Enter')
  await page.waitForFunction(() => document.getElementById('counter').textContent === '2 / 3')
  await page.waitForSelector('#preview canvas')
  await page.keyboard.type('2026-09-15 Stadtwerke Elect')
  await page.waitForTimeout(400)

  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(300)
    await shot(`rename-${scheme}`)
  }
  console.log('wrote', fs.readdirSync(OUT).join(', '))
} finally {
  await app.close().catch(() => {})
  fs.rmSync(tmp, { recursive: true, force: true })
}
