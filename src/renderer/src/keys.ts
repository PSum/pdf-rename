export type Action =
  | 'rename'
  | 'confirm'
  | 'skip'
  | 'back'
  | 'undo'
  | 'pageUp'
  | 'pageDown'
  | 'escape'

type KeyLike = Pick<KeyboardEvent, 'key' | 'code' | 'shiftKey' | 'ctrlKey' | 'metaKey' | 'altKey' | 'isComposing'>

/** Maps a keydown to an app action. `mac` switches the primary modifier from Ctrl to Cmd. */
export function actionFor(e: KeyLike, mac: boolean): Action | null {
  const mod = mac ? e.metaKey : e.ctrlKey
  if (e.key === 'Enter' && !e.isComposing) return e.shiftKey || mod ? 'rename' : 'confirm'
  if (e.key === 'Escape') return 'escape'
  // e.code, because Alt/Option changes e.key on macOS.
  if (mod && e.altKey && e.code === 'KeyZ') return 'undo'
  // Alt+←/→ like "back/forward" in Explorer and browsers; plain and Ctrl arrows stay
  // free for moving the cursor. On macOS ⌥+arrow jumps words, so it is ⌘+⌥+arrow there.
  const nav = e.altKey && !e.shiftKey && (mac ? e.metaKey && !e.ctrlKey : !e.ctrlKey && !e.metaKey)
  if (nav && e.key === 'ArrowRight') return 'skip'
  if (nav && e.key === 'ArrowLeft') return 'back'
  if (e.key === 'PageUp') return 'pageUp'
  if (e.key === 'PageDown') return 'pageDown'
  return null
}
