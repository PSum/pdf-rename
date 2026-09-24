import { describe, expect, it } from 'vitest'
import { actionFor } from '../src/renderer/src/keys'

const key = (key: string, mods: Partial<KeyboardEvent> = {}, code = '') =>
  ({ key, code, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, isComposing: false, ...mods }) as KeyboardEvent

describe('actionFor', () => {
  it('maps the shortcuts', () => {
    expect(actionFor(key('Enter', { shiftKey: true }), false)).toBe('rename')
    expect(actionFor(key('Enter', { ctrlKey: true }), false)).toBe('rename')
    expect(actionFor(key('Enter', { metaKey: true }), true)).toBe('rename')
    expect(actionFor(key('Enter'), false)).toBe('confirm')
    expect(actionFor(key('ArrowRight', { altKey: true }), false)).toBe('skip')
    expect(actionFor(key('ArrowLeft', { altKey: true }), false)).toBe('back')
    expect(actionFor(key('ArrowRight', { metaKey: true, altKey: true }), true)).toBe('skip')
    expect(actionFor(key('ArrowLeft', { metaKey: true, altKey: true }), true)).toBe('back')
    expect(actionFor(key('Ω', { metaKey: true, altKey: true }, 'KeyZ'), true)).toBe('undo')
    expect(actionFor(key('Escape'), false)).toBe('escape')
    expect(actionFor(key('+', { ctrlKey: true }), false)).toBe('zoomIn')
    expect(actionFor(key('=', { metaKey: true }), true)).toBe('zoomIn')
    expect(actionFor(key('-', { ctrlKey: true }), false)).toBe('zoomOut')
    expect(actionFor(key('0', { ctrlKey: true }), false)).toBe('zoomReset')
    expect(actionFor(key('0'), false)).toBeNull()
  })
  it('uses Cmd on mac and Ctrl elsewhere', () => {
    expect(actionFor(key('ArrowRight', { altKey: true }), true)).toBeNull() // ⌥+→ = word jump on mac
  })
  it('leaves normal typing alone', () => {
    expect(actionFor(key('a'), false)).toBeNull()
    expect(actionFor(key('ArrowLeft'), false)).toBeNull()
    expect(actionFor(key('ArrowUp', { ctrlKey: true }), false)).toBeNull()
    // word jump / word select must keep working
    expect(actionFor(key('ArrowLeft', { ctrlKey: true }), false)).toBeNull()
    expect(actionFor(key('ArrowRight', { ctrlKey: true, shiftKey: true }), false)).toBeNull()
    expect(actionFor(key('z', { ctrlKey: true }, 'KeyZ'), false)).toBeNull()
    expect(actionFor(key('Enter', { isComposing: true } as Partial<KeyboardEvent>), false)).toBeNull()
  })
})
