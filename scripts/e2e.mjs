// End-to-end test of the real app through tauri-driver (WebDriver). Linux only.
// Needs: `cargo install tauri-driver`, WebKitWebDriver (apt: webkit2gtk-driver) and a build:
//   npm run tauri build -- --debug --no-bundle
// Headless: dbus-run-session -- xvfb-run -a npm run e2e
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { labelPdf as pdf } from './sample-pdf.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const APP =
  process.env.APP_BINARY ??
  ['debug', 'release'].map((m) => path.join(ROOT, 'src-tauri/target', m, 'pdf-rename')).find(fs.existsSync)
if (!APP) throw new Error('No app binary: run `npm run tauri build -- --debug --no-bundle` first')

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfrename-e2e-'))
const dir = path.join(tmp, 'pdfs')
const more = path.join(tmp, 'more')
fs.mkdirSync(dir)
fs.mkdirSync(more)
for (const n of ['scan10', 'scan2', 'scan1', 'taken']) fs.writeFileSync(path.join(dir, `${n}.pdf`), pdf(n))
fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a pdf')
fs.writeFileSync(path.join(more, 'extra.pdf'), pdf('extra'))
const onDisk = () => fs.readdirSync(dir).sort()
// Throwaway profile: window state etc. must not touch the user's.
const env = { ...process.env, XDG_CONFIG_HOME: path.join(tmp, 'config'), XDG_DATA_HOME: path.join(tmp, 'data') }

// ------------------------------------------------------------ tiny WebDriver client

const WD = 'http://127.0.0.1:4444'
let sid

async function wd(method, route, body) {
  const res = await fetch(WD + route.replace(':sid', sid), {
    method,
    headers: { 'content-type': 'application/json' },
    body: body && JSON.stringify(body)
  })
  const { value } = await res.json()
  if (value?.error) throw new Error(`${value.error}: ${value.message}`)
  return value
}

/** Runs `fn` in the page and returns its result. */
const run = (fn, ...args) =>
  wd('POST', '/session/:sid/execute/sync', { script: `return (${fn}).apply(null, arguments)`, args })

const KEY = {
  Shift: '',
  Control: '',
  Alt: '',
  Enter: '',
  Escape: '',
  ArrowLeft: '',
  ArrowRight: ''
}

/** Presses a chord like press('Shift', 'Enter'): all keys down in order, then up in reverse. */
async function press(...keys) {
  const codes = keys.map((k) => KEY[k] ?? k)
  const actions = [
    ...codes.map((value) => ({ type: 'keyDown', value })),
    ...codes.reverse().map((value) => ({ type: 'keyUp', value }))
  ]
  await wd('POST', '/session/:sid/actions', { actions: [{ type: 'key', id: 'kb', actions }] })
}

async function type(text) {
  const actions = [...text].flatMap((value) => [
    { type: 'keyDown', value },
    { type: 'keyUp', value }
  ])
  await wd('POST', '/session/:sid/actions', { actions: [{ type: 'key', id: 'kb', actions }] })
}

async function until(fn, what, ms = 10000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}

const ui = () =>
  run(() => {
    const input = document.getElementById('name')
    return {
      screen: ['drop', 'rename', 'summary'].find((id) => !document.getElementById(id).hidden),
      current: document.getElementById('current').textContent,
      selected: input.value.slice(input.selectionStart, input.selectionEnd),
      caret: input.selectionStart,
      focused: document.activeElement?.id,
      counter: document.getElementById('counter').textContent,
      msg: document.getElementById('msg').textContent,
      pageWidth: document.querySelector('#preview .page')?.getBoundingClientRect().width ?? 0,
      previewMsg: document.querySelector('.preview-msg')?.textContent ?? '',
      summary: document.getElementById('summary-text').textContent,
      canvas: !!document.querySelector('#preview canvas')
    }
  })
const counterIs = (text) => until(async () => (await ui()).counter === text, `counter ${text}`)

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

// ------------------------------------------------------------------------ the test

const driver = spawn('tauri-driver', [], { env, stdio: ['ignore', 'ignore', 'inherit'] })
try {
  await until(() => fetch(WD + '/status').then(() => true, () => false), 'tauri-driver')
  const session = await wd('POST', '/session', {
    capabilities: { alwaysMatch: { 'tauri:options': { application: APP, args: [dir] } } }
  })
  sid = session.sessionId

  await check('opens the folder it was started with: natural order, non-PDF ignored, name preselected', async () => {
    const s = await until(async () => {
      const s = await ui()
      return s.screen === 'rename' && s.canvas && s
    }, 'rename screen with preview')
    assert.equal(s.current, 'scan1.pdf')
    assert.equal(s.counter, '1 / 4')
    assert.equal(s.selected, 'scan1')
    assert.equal(s.focused, 'name')
    assert.match(s.msg, /1 non-PDF item\(s\) ignored/)
  })

  await check('Shift+Enter renames on disk and focuses the next file', async () => {
    await type('Invoice A')
    await press('Shift', 'Enter')
    await counterIs('2 / 4')
    assert.ok(onDisk().includes('Invoice A.pdf'))
    assert.equal((await ui()).focused, 'name')
  })

  await check('illegal characters are blocked', async () => {
    await type('bad:name')
    assert.match((await ui()).msg, /Not allowed/)
    await press('Shift', 'Enter')
    assert.equal((await ui()).counter, '2 / 4')
  })

  await check('existing name asks before overwriting, Esc cancels', async () => {
    await press('Control', 'a')
    await type('taken')
    await press('Shift', 'Enter')
    await until(async () => (await ui()).msg.includes('already exists'), 'overwrite question')
    await press('Escape')
    assert.equal((await ui()).msg, '')
    assert.ok(onDisk().includes('scan2.pdf'))
  })

  await check('Alt+Right skips, Alt+Left goes back, Ctrl+Left still jumps words', async () => {
    await press('Alt', 'ArrowRight')
    assert.equal((await ui()).current, 'scan10.pdf')
    await press('Alt', 'ArrowLeft')
    assert.equal((await ui()).current, 'scan2.pdf')
    await press('Alt', 'ArrowRight')
    await type('two words')
    await press('Control', 'ArrowLeft')
    const s = await ui()
    assert.equal(s.caret, 4)
    assert.equal(s.current, 'scan10.pdf')
  })

  await check('Ctrl+Enter renames, Ctrl+Alt+Z undoes', async () => {
    await press('Control', 'a')
    await type('Invoice B')
    await press('Control', 'Enter')
    await counterIs('4 / 4')
    assert.ok(onDisk().includes('Invoice B.pdf'))
    await press('Control', 'Alt', 'z')
    await counterIs('3 / 4')
    assert.equal((await ui()).current, 'scan10.pdf')
    assert.ok(onDisk().includes('scan10.pdf'))
  })

  await check('a second launch hands its files to the running window (single instance)', async () => {
    const second = spawn(APP, [path.join(more, 'extra.pdf'), path.join(dir, 'taken.pdf')], { env, stdio: 'ignore' })
    const code = await new Promise((resolve) => second.on('exit', resolve))
    assert.equal(code, 0)
    await counterIs('3 / 5')
    assert.match((await ui()).msg, /1 PDF\(s\) added, 1 already in the list/)
  })

  // "+" rather than "=": WebDriver types "=" as the key that gives "=" on a US layout,
  // which is "0" (zoom reset) on German QWERTZ.
  await check('Ctrl++ zooms the preview, Ctrl+0 resets', async () => {
    const base = await until(async () => (await ui()).pageWidth, 'preview page')
    await press('Control', '+')
    await press('Control', '+')
    assert.ok((await ui()).pageWidth > base * 1.5, 'zoomed in')
    await press('Control', '0')
    assert.ok(Math.abs((await ui()).pageWidth - base) < 1, 'reset')
    assert.equal((await ui()).focused, 'name')
  })

  await check('unreadable file shows a plain-words error', async () => {
    fs.chmodSync(path.join(dir, 'taken.pdf'), 0o000)
    await press('Alt', 'ArrowRight')
    assert.equal((await ui()).current, 'taken.pdf')
    const text = await until(async () => (await ui()).previewMsg, 'preview error')
    fs.chmodSync(path.join(dir, 'taken.pdf'), 0o644)
    assert.match(text, /open in another program or you don't have permission/)
  })

  await check('Esc shows the summary, any key returns to the drop zone', async () => {
    await press('Escape')
    await until(async () => (await ui()).screen === 'summary', 'summary')
    assert.equal((await ui()).summary, 'Renamed 1 of 5 files')
    await press('a')
    await until(async () => (await ui()).screen === 'drop', 'drop screen')
  })

  console.log(`\nAll ${step} checks passed. Files on disk: ${onDisk().join(', ')}`)
} finally {
  if (sid) await wd('DELETE', '/session/:sid').catch(() => {})
  driver.kill()
  fs.rmSync(tmp, { recursive: true, force: true })
}
