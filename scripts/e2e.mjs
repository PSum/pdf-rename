// End-to-end test: launches the built app (`npm run build` first), drives it with
// real keystrokes and real drops, and checks the files on disk.
// Headless Linux: run under `xvfb-run`.
import { _electron as electron } from 'playwright-core'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { labelPdf as pdf } from './sample-pdf.mjs'

const APP = path.resolve(import.meta.dirname, '..')
const ELECTRON = (await import('electron')).default // path to the binary
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfrename-e2e-'))
const dir = path.join(tmp, 'pdfs')
const more = path.join(tmp, 'more')
const userData = path.join(tmp, 'profile')
const env = { ...process.env, PDF_RENAME_USER_DATA: userData }
fs.mkdirSync(dir)
fs.mkdirSync(more)

for (const n of ['scan10', 'scan2', 'scan1', 'taken']) fs.writeFileSync(path.join(dir, `${n}.pdf`), pdf(n))
fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a pdf')
fs.writeFileSync(path.join(more, 'extra.pdf'), pdf('extra'))
const onDisk = () => fs.readdirSync(dir).sort()

let step = 0
async function check(name, fn) {
  step++
  try {
    await fn()
    console.log(`  ✓ ${step}. ${name}`)
  } catch (e) {
    console.log(`  ✗ ${step}. ${name}`)
    throw e
  }
}

const launch = () =>
  electron.launch({ executablePath: ELECTRON, args: ['--no-sandbox', APP], env, timeout: 30000 })

let app = await launch()
try {
  let page = await app.firstWindow()
  page.on('pageerror', (e) => console.log('  [page error]', e.message))
  await page.waitForSelector('#dropzone')
  const cdp = await page.context().newCDPSession(page)

  /** A real OS-style drop carrying file paths, like dragging from Explorer/Finder. */
  async function drop(paths) {
    const data = { items: [], files: paths, dragOperationsMask: 1 }
    for (const type of ['dragEnter', 'dragOver', 'drop']) {
      await cdp.send('Input.dispatchDragEvent', { type, x: 300, y: 300, data })
    }
  }
  const ui = () =>
    page.evaluate(() => {
      const input = document.getElementById('name')
      return {
        current: document.getElementById('current').textContent,
        value: input.value,
        selected: input.value.slice(input.selectionStart, input.selectionEnd),
        focused: document.activeElement?.id,
        counter: document.getElementById('counter').textContent,
        msg: document.getElementById('msg').textContent
      }
    })
  const waitCounter = (text) =>
    page.waitForFunction((t) => document.getElementById('counter').textContent === t, text)

  await check('drop a folder: PDFs in natural order, non-PDF ignored, name preselected', async () => {
    await drop([dir])
    await page.waitForSelector('#rename:not([hidden])')
    await page.waitForSelector('#preview canvas')
    const s = await ui()
    assert.equal(s.current, 'scan1.pdf')
    assert.equal(s.counter, '1 / 4')
    assert.equal(s.selected, 'scan1')
    assert.equal(s.focused, 'name')
    assert.match(s.msg, /1 non-PDF item\(s\) ignored/)
  })

  await check('Shift+Enter renames on disk and focuses the next file', async () => {
    await page.keyboard.type('Invoice A')
    await page.keyboard.press('Shift+Enter')
    await waitCounter('2 / 4')
    assert.ok(onDisk().includes('Invoice A.pdf'))
    assert.equal((await ui()).focused, 'name')
  })

  await check('illegal characters are blocked', async () => {
    await page.keyboard.type('bad:name')
    assert.match((await ui()).msg, /Not allowed/)
    await page.keyboard.press('Shift+Enter')
    assert.equal((await ui()).counter, '2 / 4')
  })

  await check('existing name asks before overwriting, Esc cancels', async () => {
    await page.keyboard.press('Control+A')
    await page.keyboard.type('taken')
    await page.keyboard.press('Shift+Enter')
    await page.waitForFunction(() => document.getElementById('msg').textContent.includes('already exists'))
    await page.keyboard.press('Escape')
    assert.equal((await ui()).msg, '')
    assert.ok(onDisk().includes('scan2.pdf'))
  })

  await check('Alt+Right skips, Alt+Left goes back, Ctrl+Left still jumps words', async () => {
    await page.keyboard.press('Alt+ArrowRight')
    assert.equal((await ui()).current, 'scan10.pdf')
    await page.keyboard.press('Alt+ArrowLeft')
    assert.equal((await ui()).current, 'scan2.pdf')
    await page.keyboard.press('Alt+ArrowRight')
    await page.keyboard.type('two words')
    await page.keyboard.press('Control+ArrowLeft')
    const caret = await page.evaluate(() => document.getElementById('name').selectionStart)
    assert.equal(caret, 4)
    assert.equal((await ui()).current, 'scan10.pdf')
  })

  await check('Ctrl+Enter renames, Ctrl+Alt+Z undoes', async () => {
    await page.keyboard.press('Control+A')
    await page.keyboard.type('Invoice B')
    await page.keyboard.press('Control+Enter')
    await waitCounter('4 / 4')
    assert.ok(onDisk().includes('Invoice B.pdf'))
    await page.keyboard.press('Control+Alt+KeyZ')
    await waitCounter('3 / 4')
    assert.equal((await ui()).current, 'scan10.pdf')
    assert.ok(onDisk().includes('scan10.pdf'))
  })

  await check('dropping while renaming appends, duplicates skipped', async () => {
    await drop([path.join(more, 'extra.pdf'), path.join(dir, 'taken.pdf')])
    await waitCounter('3 / 5')
    assert.match((await ui()).msg, /1 PDF\(s\) added, 1 already in the list/)
  })

  await check('zoom: Ctrl+= enlarges pages, Ctrl+0 resets, focus stays in the field', async () => {
    const width = () => page.evaluate(() => document.querySelector('#preview .page').getBoundingClientRect().width)
    await page.waitForSelector('#preview .page')
    const base = await width()
    await page.keyboard.press('Control+Equal')
    await page.keyboard.press('Control+Equal')
    assert.ok((await width()) > base * 1.5, 'zoomed in')
    await page.keyboard.press('Control+Digit0')
    assert.ok(Math.abs((await width()) - base) < 1, 'reset')
    await page.mouse.move(300, 300)
    await page.keyboard.down('Control')
    await page.mouse.wheel(0, -100)
    await page.keyboard.up('Control')
    assert.ok((await width()) > base * 1.1, 'Ctrl+wheel zooms')
    await page.keyboard.press('Control+Digit0')
    assert.equal((await ui()).focused, 'name')
  })

  if (process.platform !== 'win32') {
    await check('unreadable file shows a plain-words error', async () => {
      fs.chmodSync(path.join(dir, 'taken.pdf'), 0o000)
      await page.keyboard.press('Alt+ArrowRight')
      assert.equal((await ui()).current, 'taken.pdf')
      await page.waitForSelector('.preview-msg')
      const text = await page.textContent('.preview-msg')
      fs.chmodSync(path.join(dir, 'taken.pdf'), 0o644)
      assert.match(text, /open in another program or you don't have permission/)
      assert.doesNotMatch(text, /invoke remote method/)
    })
  }

  await check('Esc shows the summary, any key returns to the drop zone', async () => {
    await page.keyboard.press('Escape')
    await page.waitForSelector('#summary:not([hidden])')
    assert.equal(await page.textContent('#summary-text'), 'Renamed 1 of 5 files')
    await page.keyboard.press('a')
    assert.ok(await page.isVisible('#dropzone'))
  })

  await check('only one instance runs', async () => {
    const second = spawn(ELECTRON, ['--no-sandbox', APP], { env, stdio: 'ignore' })
    const code = await new Promise((resolve, reject) => {
      second.on('exit', resolve)
      setTimeout(() => {
        second.kill()
        reject(new Error('second instance kept running'))
      }, 10000)
    })
    assert.equal(code, 0)
    assert.equal(app.windows().length, 1)
  })

  await check('window size is remembered across restarts', async () => {
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 40, width: 900, height: 600 })
    )
    await app.close()
    app = await launch()
    page = await app.firstWindow()
    await page.waitForSelector('#dropzone')
    const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
    assert.equal(b.width, 900)
    assert.equal(b.height, 600)
  })

  console.log(`\nAll ${step} checks passed. Files on disk: ${onDisk().join(', ')}`)
} finally {
  await app.close().catch(() => {})
  fs.rmSync(tmp, { recursive: true, force: true })
}
