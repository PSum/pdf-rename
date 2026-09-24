import './style.css'
import { baseName, stripPdf } from '@shared/filename'
import type { ExpandResult } from '@shared/types'
import { actionFor, type Action } from './keys'
import { createPreview } from './preview'
import { Session } from './session'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

const screens = { drop: $('drop'), rename: $('rename'), summary: $('summary') }
const dropzone = $('dropzone')
const input = $<HTMLInputElement>('name')
const field = input.parentElement!
const msg = $('msg')
const preview = createPreview($('preview'), window.api.readFile)

const mac = window.api.platform === 'darwin'
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
  session = new Session(result.files, window.api.rename)
  render()
  if (ignored) {
    msg.textContent = `${result.files.length} PDF(s) loaded, ${ignored}`
    msg.className = 'msg warn'
  }
}

dropzone.addEventListener('click', async () => start(await window.api.openDialog()))
dropzone.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter' || e.key === ' ') start(await window.api.openDialog())
})

// Always prevent the default so a stray drop never navigates the window.
// While renaming, dropped PDFs are appended to the batch; otherwise they start a new one.
document.addEventListener('dragover', (e) => {
  e.preventDefault()
  document.body.classList.add('dragging')
})
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dragging')
})
document.addEventListener('drop', async (e) => {
  e.preventDefault()
  document.body.classList.remove('dragging')
  if (!e.dataTransfer) return
  const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean)
  const result = await window.api.expandPaths(paths)
  if (session?.state.screen === 'rename') {
    session.add(result.files)
    render()
  } else {
    start(result)
  }
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
window.addEventListener('focus', () => {
  if (session?.state.screen === 'rename') input.focus()
})
$('summary').addEventListener('click', endSession)

render()
