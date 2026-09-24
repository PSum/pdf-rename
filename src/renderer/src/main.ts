import './style.css'
import { baseName, stripPdf } from '@shared/filename'
import type { ExpandResult } from '@shared/types'
import { isMac, launchPaths, onFiles, openPaths, pickFiles, readFile, rename } from './api'
import { actionFor, isBrowserShortcut, type Action } from './keys'
import { createPreview } from './preview'
import { Session } from './session'
import logoUrl from '../../../build/icon.svg?url'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

const screens = { drop: $('drop'), rename: $('rename'), summary: $('summary') }
const dropzone = $('dropzone')
const input = $<HTMLInputElement>('name')
const field = input.parentElement!
const msg = $('msg')
const preview = createPreview($('preview'), readFile)

$<HTMLImageElement>('logo').src = logoUrl

const mac = isMac
document.querySelectorAll('kbd.mod').forEach((k) => (k.textContent = mac ? '⌘' : 'Ctrl'))
document.querySelectorAll('kbd.alt').forEach((k) => (k.textContent = mac ? '⌥' : 'Alt'))
document.querySelectorAll('kbd.nav').forEach((k) => (k.textContent = mac ? '⌘+⌥' : 'Alt'))

let session: Session | null = null
let shownFile: string | null = null // the file the name field was last filled for

// ------------------------------------------------------------------- render

/** Paints the whole UI from the session. The only place that touches the screens. */
function render(): void {
  const state = session?.state
  const screen = state?.screen ?? 'drop'
  for (const [name, el] of Object.entries(screens)) el.hidden = name !== screen

  if (!state || screen === 'drop') {
    shownFile = null
    preview.show(null)
    dropzone.focus()
    return
  }
  if (screen === 'summary') {
    shownFile = null
    preview.show(null)
    const unchanged = state.total - state.renamedCount
    $('summary-text').textContent = `Renamed ${state.renamedCount} of ${state.total} file${state.total === 1 ? '' : 's'}`
    $('summary-detail').textContent = unchanged ? `${unchanged} unchanged` : ''
    return
  }

  if (state.file !== shownFile) {
    shownFile = state.file
    $('current').textContent = baseName(state.file)
    input.value = stripPdf(baseName(state.file))
    input.focus()
    input.select()
    preview.show(state.file)
  }
  $('counter').textContent = `${state.position + 1} / ${state.total}`
  msg.textContent = state.notice?.text ?? ''
  msg.className = `msg ${state.notice?.kind ?? ''}`
  field.classList.toggle('invalid', state.notice?.kind === 'error')
}

// ---------------------------------------------------------------- drop screen

function start(result: ExpandResult): void {
  const ignored = result.ignored ? `${result.ignored} non-PDF item(s) ignored` : ''
  $('drop-msg').textContent = result.files.length ? '' : ignored && `No PDFs found (${ignored})`
  if (!result.files.length) return
  session = new Session(result.files, rename)
  render()
  if (ignored) {
    msg.textContent = `${result.files.length} PDF(s) loaded, ${ignored}`
    msg.className = 'msg warn'
  }
}

dropzone.addEventListener('click', async () => start(await pickFiles()))
dropzone.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' || e.key === ' ') start(await pickFiles())
})

// Always prevent the default so a stray drop never navigates the window.
// While renaming, dropped PDFs are appended to the batch; otherwise they start a new one.
async function openDropped(paths: string[]): Promise<void> {
  const result = await openPaths(paths)
  if (session?.state.screen === 'rename') {
    session.add(result.files)
    render()
  } else {
    start(result)
  }
}

onFiles({
  hover: (active) => document.body.classList.toggle('dragging', active),
  drop: openDropped
})
launchPaths().then((paths) => {
  if (paths.length) openDropped(paths)
})

// ------------------------------------------------------------------ keyboard

function endSession(): void {
  session = null
  render()
}

/** What each action does on the rename screen. */
function perform(s: Session, action: Action): void | Promise<void> {
  switch (action) {
    case 'rename':
      return s.submit(input.value)
    case 'confirm':
      return s.state.confirmingOverwrite ? s.confirmOverwrite() : undefined
    case 'skip':
      return s.next()
    case 'back':
      return s.back()
    case 'undo':
      return s.undo()
    case 'pageUp':
      return preview.scroll(-1)
    case 'pageDown':
      return preview.scroll(1)
    case 'zoomIn':
      return preview.zoom(1)
    case 'zoomOut':
      return preview.zoom(-1)
    case 'zoomReset':
      return preview.zoom(0)
    case 'escape':
      if (s.state.confirmingOverwrite) {
        s.cancelOverwrite()
        input.select()
      } else {
        s.finish()
      }
  }
}

document.addEventListener('keydown', async (e) => {
  if (isBrowserShortcut(e, mac)) {
    e.preventDefault()
    return
  }
  if (!session) return
  const action = actionFor(e, mac)

  if (session.state.screen === 'summary') {
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
    e.preventDefault()
    if (action === 'undo') await session.undo()
    else return endSession()
  } else {
    if (!action) return
    e.preventDefault()
    await perform(session, action)
  }
  render()
})

input.addEventListener('input', () => {
  session?.edit(input.value)
  render()
})

// Ctrl/⌘+wheel zooms the preview, never the whole window.
document.addEventListener(
  'wheel',
  (e) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    if (session?.state.screen === 'rename') preview.zoom(e.deltaY < 0 ? 1 : -1)
  },
  { passive: false }
)

// ------------------------------------------------------------------- focus

// Keep keyboard focus in the name field: clicking elsewhere must not steal it.
$('preview').addEventListener('mousedown', (e) => {
  const p = e.currentTarget as HTMLElement
  const onScrollbar = e.target === p && e.offsetX >= p.clientWidth
  if (!onScrollbar) e.preventDefault()
})
$('panel').addEventListener('mousedown', (e) => {
  const t = e.target as HTMLElement
  if (t !== input && !t.closest('.current')) e.preventDefault()
})
// No browser context menu (reload, inspect, …) except for cut/copy/paste in the name field.
document.addEventListener('contextmenu', (e) => {
  if (e.target !== input) e.preventDefault()
})
window.addEventListener('focus', () => {
  if (session?.state.screen === 'rename') input.focus()
})
$('summary').addEventListener('click', endSession)

render()
