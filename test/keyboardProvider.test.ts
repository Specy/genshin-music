import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {KeyboardProvider} from '../src/lib/providers/KeyboardProvider'

function dispatchKey(code: string, type: 'keydown' | 'keyup' = 'keydown', init: KeyboardEventInit = {}) {
    window.dispatchEvent(new KeyboardEvent(type, {code, bubbles: true, ...init}))
}

describe('KeyboardProvider', () => {
    beforeEach(() => {
        KeyboardProvider.create()
    })
    afterEach(() => {
        KeyboardProvider.destroy()
        document.body.innerHTML = ''
    })

    it('register(code) fires the callback on a matching keydown', () => {
        const cb = vi.fn()
        KeyboardProvider.register('KeyA', cb)
        dispatchKey('KeyA')
        expect(cb).toHaveBeenCalledTimes(1)
        expect(cb.mock.calls[0][0]).toMatchObject({letter: 'A', shift: false, code: 'KeyA'})
    })

    it('does not fire for a non-matching code', () => {
        const cb = vi.fn()
        KeyboardProvider.register('KeyA', cb)
        dispatchKey('KeyB')
        expect(cb).not.toHaveBeenCalled()
    })

    it('filters on shift: handlers only fire when shiftKey matches their own {shift} option', () => {
        const shiftCb = vi.fn()
        const noShiftCb = vi.fn()
        KeyboardProvider.register('KeyB', shiftCb, {shift: true})
        KeyboardProvider.register('KeyB', noShiftCb, {shift: false})

        dispatchKey('KeyB', 'keydown', {shiftKey: true})
        expect(shiftCb).toHaveBeenCalledTimes(1)
        expect(noShiftCb).not.toHaveBeenCalled()

        dispatchKey('KeyB', 'keydown', {shiftKey: false})
        expect(shiftCb).toHaveBeenCalledTimes(1)
        expect(noShiftCb).toHaveBeenCalledTimes(1)
    })

    it('respects the registered type: keydown and keyup handlers are independent', () => {
        const downCb = vi.fn()
        const upCb = vi.fn()
        KeyboardProvider.register('KeyC', downCb, {type: 'keydown'})
        KeyboardProvider.register('KeyC', upCb, {type: 'keyup'})

        dispatchKey('KeyC', 'keydown')
        expect(downCb).toHaveBeenCalledTimes(1)
        expect(upCb).not.toHaveBeenCalled()

        dispatchKey('KeyC', 'keyup')
        expect(downCb).toHaveBeenCalledTimes(1)
        expect(upCb).toHaveBeenCalledTimes(1)
    })

    it('unregisterById removes both the per-code handler map and the global listeners list', () => {
        const handlerCb = vi.fn()
        const listenerCb = vi.fn()
        KeyboardProvider.register('KeyD', handlerCb, {id: 'grp'})
        KeyboardProvider.listen(listenerCb, {id: 'grp', type: 'keydown'})

        KeyboardProvider.unregisterById('grp')
        dispatchKey('KeyD')

        expect(handlerCb).not.toHaveBeenCalled()
        expect(listenerCb).not.toHaveBeenCalled()
    })

    it('suppresses every keyDOWN handler and listener while a focused element is a text field', () => {
        const input = document.createElement('input')
        document.body.appendChild(input)
        input.focus()
        expect(document.activeElement).toBe(input)

        const handlerCb = vi.fn()
        const listenerCb = vi.fn()
        KeyboardProvider.register('KeyE', handlerCb)
        KeyboardProvider.listen(listenerCb, {type: 'keydown'})

        dispatchKey('KeyE')

        expect(handlerCb).not.toHaveBeenCalled()
        expect(listenerCb).not.toHaveBeenCalled()
    })

    it('suppresses keydown in a <textarea> and a contenteditable too, not just <input>', () => {
        const textarea = document.createElement('textarea')
        const editable = document.createElement('div')
        editable.setAttribute('contenteditable', 'true')
        // jsdom derives isContentEditable from nothing, so state it outright
        Object.defineProperty(editable, 'isContentEditable', {value: true})
        document.body.append(textarea, editable)

        const cb = vi.fn()
        KeyboardProvider.listen(cb, {type: 'keydown'})

        textarea.focus()
        dispatchKey('KeyE')
        editable.focus()
        dispatchKey('KeyE')

        expect(cb).not.toHaveBeenCalled()
    })

    /**
     * The asymmetry hold-to-sustain depends on: typing must not PLAY notes, but a key released
     * after focus moved into a text field still has to reach whoever is holding that note.
     * Swallowing it leaves a looping sustaining instrument sounding with no way to stop it.
     */
    it('still delivers keyUP while a text field has focus, so a held note can be released', () => {
        const input = document.createElement('input')
        document.body.appendChild(input)
        input.focus()

        const handlerCb = vi.fn()
        const listenerCb = vi.fn()
        KeyboardProvider.register('KeyE', handlerCb, {type: 'keyup'})
        KeyboardProvider.listen(listenerCb, {type: 'keyup'})

        dispatchKey('KeyE', 'keyup')

        expect(handlerCb).toHaveBeenCalledTimes(1)
        expect(listenerCb).toHaveBeenCalledTimes(1)
    })

    it('listen() fans out to every keydown of the right type, regardless of code', () => {
        const cb = vi.fn()
        KeyboardProvider.listen(cb, {type: 'keydown'})
        dispatchKey('KeyZ')
        dispatchKey('Digit1')
        expect(cb).toHaveBeenCalledTimes(2)
    })

    it('getTextOfCode falls back to DEFAULT_ENG_KEYBOARD_MAP when no navigator layout map resolved', () => {
        expect(KeyboardProvider.getTextOfCode('KeyA')).toBe('A')
        expect(KeyboardProvider.getTextOfCode('Digit0')).toBe('0')
    })
})
