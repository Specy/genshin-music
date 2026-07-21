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

    it('suppresses every handler and listener while a focused element is an <input>', () => {
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
