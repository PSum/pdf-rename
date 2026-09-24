export type Action =
  | 'rename'
  | 'confirm'
  | 'skip'
  | 'back'
  | 'undo'
  | 'pageUp'
  | 'pageDown'
  | 'escape'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>

/**
 * The letter on the key as the user's layout labels it. e.key is right for QWERTY and
 * QWERTZ alike (e.code is the US position: German Z reports "KeyY"). Only when Option
 * turns the letter into a symbol (macOS: ⌥Z = Ω) does the key position stand in.
 */
function letter(e: KeyLike): string {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase()
  return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : ''
}

/** Maps a keydown to an app action. `mac` switches the primary modifier from Ctrl to Cmd. */
export function actionFor(e: KeyLike, mac: boolean): Action | null {
  const mod = mac ? e.metaKey : e.ctrlKey
  if (e.key === 'Enter' && !e.isComposing) return e.shiftKey || mod ? 'rename' : 'confirm'
  if (e.key === 'Escape') return 'escape'
  if (mod && e.altKey && letter(e) === 'z') return 'undo'
  // Alt+←/→ like "back/forward" in Explorer and browsers; plain and Ctrl arrows stay
  // free for moving the cursor. On macOS ⌥+arrow jumps words, so it is ⌘+⌥+arrow there.
  const nav = e.altKey && !e.shiftKey && (mac ? e.metaKey && !e.ctrlKey : !e.ctrlKey && !e.metaKey)
  if (nav && e.key === 'ArrowRight') return 'skip'
  if (nav && e.key === 'ArrowLeft') return 'back'
  if (mod && !e.altKey && (e.key === '+' || e.key === '=')) return 'zoomIn'
  if (mod && !e.altKey && e.key === '-') return 'zoomOut'
  if (mod && !e.altKey && e.key === '0') return 'zoomReset'
  if (e.key === 'PageUp') return 'pageUp'
  if (e.key === 'PageDown') return 'pageDown'
  return null
}

/**
 * Keys the embedded browser would act on itself (reload, find, print, caret browsing, …).
 * They mean nothing in this app, so they are swallowed.
 */
export function isBrowserShortcut(e: KeyLike, mac: boolean): boolean {
  const mod = mac ? e.metaKey : e.ctrlKey
  if (['F3', 'F5', 'F7', 'F12', 'BrowserBack', 'BrowserForward', 'BrowserRefresh'].includes(e.key)) return true
  return mod && ['r', 'f', 'g', 'p', 'u', 'j', 'h', 's', 'o', 'n', 'w', 't'].includes(e.key.toLowerCase())
}
