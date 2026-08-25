import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {KeyboardProvider} from '../src/lib/providers/KeyboardProvider'
import {createKeyboardListener, createShortcutListener, keyBinds} from '../src/lib/stores/KeybindsStore.svelte'

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

/**
 * THE COMBO COMPOSER'S TRANSPARENCY RULE (user revision 2026-08-22) - KeybindsStore's
 * KeyComboOptions, and the reason it exists: a composer shortcut is matched against the WHOLE set of
 * keys currently down, and the composer's note keys ARE the letter row that carries a/d. A note key
 * held (a sustain being performed, or a Duration Hold editing a span - CONTEXT.md) used to poison
 * every combo for as long as it was down.
 *
 * Driven through the real KeyboardProvider rather than a fake, because the composer is what these
 * two listeners share: one of them is what puts the key in the set at all.
 */
describe('shortcut combos and held note keys', () => {
    beforeEach(() => {
        KeyboardProvider.create()
    })
    afterEach(() => {
        KeyboardProvider.destroy()
        document.body.innerHTML = ''
    })

    /** The shortcut names a listener saw, in order - the whole of what these rows assert. */
    function listenFor<T extends 'composer' | 'player'>(
        page: T,
        id: string,
        options?: {transparentCodes?: () => ReadonlySet<string>}
    ) {
        const fired: string[] = []
        const dispose = createShortcutListener(
            page,
            id,
            ({shortcut}) => fired.push((shortcut as {name: string}).name),
            options
        )
        return {fired, dispose}
    }

    it('a HELD note key steps aside, so the column shortcuts still fire under it', () => {
        //KeyF is a note key on both games' default instruments; here it stands for "currently
        //holding a note", which is what the composer's own registry answers
        const held = new Set(['KeyF'])
        const {fired, dispose} = listenFor('composer', 'combo_transparent', {
            transparentCodes: () => held,
        })
        try {
            dispatchKey('KeyF')
            dispatchKey('KeyD')
            //...and again after that one is let go: a shortcut key held down is still part of the
            //next combo, transparency being about keys that are HOLDING A NOTE and nothing else
            dispatchKey('KeyD', 'keyup')
            dispatchKey('KeyA')
            expect(fired).toEqual(['next_column', 'previous_column'])
        } finally {
            dispose()
        }
    })

    it('...and without the option the same held key blocks them, exactly as before', () => {
        const {fired, dispose} = listenFor('composer', 'combo_opaque')
        try {
            dispatchKey('KeyF')
            dispatchKey('KeyD')
            expect(fired).toEqual([])
        } finally {
            dispose()
        }
    })

    it('the key being PRESSED is never transparent, whatever the set says', () => {
        //the composer's own note keys are the column keys too: `d` pressed on its own is
        //next_column, and it is only a key held from BEFORE the press that steps aside
        const held = new Set(['KeyD'])
        const {fired, dispose} = listenFor('composer', 'combo_pressed_key', {
            transparentCodes: () => held,
        })
        try {
            dispatchKey('KeyD')
            expect(fired).toEqual(['next_column'])
        } finally {
            dispose()
        }
    })

    it('leaves real combos alone: a held note key does not break Shift+S', () => {
        const held = new Set(['KeyF'])
        const {fired, dispose} = listenFor('player', 'combo_shift', {
            transparentCodes: () => held,
        })
        try {
            dispatchKey('KeyF')
            dispatchKey('ShiftLeft')
            dispatchKey('KeyS')
            //the shift combo resolves under the held note key - which is also what keeps
            //"Shift+note is note entry" true in the composer: that combo is still matched whole
            expect(fired).toEqual(['stop'])
        } finally {
            dispose()
        }
    })

    it('a key that stops holding a note comes back into the combos with no second keydown', () => {
        const held = new Set(['KeyF'])
        const {fired, dispose} = listenFor('composer', 'combo_released_hold', {
            transparentCodes: () => held,
        })
        try {
            dispatchKey('KeyF')
            dispatchKey('KeyD')
            expect(fired).toEqual(['next_column'])
            //the note is let go while the KEY is still physically down (a covered button, a layer
            //change, the popover's own release path): `currentKeybinds` never lost it, so the
            //combo is the full set again the moment the registry stops naming it
            held.delete('KeyF')
            dispatchKey('KeyA')
            expect(fired).toEqual(['next_column'])
        } finally {
            dispose()
        }
    })
})

/**
 * NOTE ENTRY IS BARE-KEY ONLY (ADR-0013 fallout). The note listener matches on `code` alone and
 * KeyboardProvider fans every keydown out to every listener, so the composer's Ctrl+Z used to walk
 * the history AND enter note Z in the same event - and the Step that added it cleared the redo
 * branch the undo had just created. Both listeners are driven here together, the way the composer
 * registers them.
 */
describe('note keys and application chords', () => {
    beforeEach(() => {
        KeyboardProvider.create()
    })
    afterEach(() => {
        KeyboardProvider.destroy()
        document.body.innerHTML = ''
    })

    /** Both games' Label Sets bind Z, which is exactly why Ctrl+Z collided with it. */
    const NOTE_CODE = 'KeyZ'

    function listenForNotes(id: string) {
        const down: string[] = []
        const up: string[] = []
        const dispose = createKeyboardListener(id, ({code}) => down.push(code), {
            onRelease: ({code}) => up.push(code),
        })
        return {down, up, dispose}
    }

    it('binds the colliding key at all, so the rows below are not vacuous', () => {
        expect(keyBinds.getShortcut('keyboard', NOTE_CODE)).toBeDefined()
    })

    it('enters nothing while Ctrl or Meta is held, and everything without them', () => {
        const {down, dispose} = listenForNotes('note_chords')
        try {
            dispatchKey(NOTE_CODE, 'keydown', {ctrlKey: true})
            dispatchKey(NOTE_CODE, 'keydown', {metaKey: true})
            expect(down).toEqual([])
            //shift is the composer's own edit modifier and stays note entry
            dispatchKey(NOTE_CODE, 'keydown', {shiftKey: true})
            dispatchKey(NOTE_CODE)
            expect(down).toEqual([NOTE_CODE, NOTE_CODE])
        } finally {
            dispose()
        }
    })

    it('still delivers the RELEASE under a modifier, so a held note cannot be stranded', () => {
        const {up, dispose} = listenForNotes('note_chord_release')
        try {
            //ctrl pressed while the note key is already down: the key-up is the only thing that
            //stops a looping sustaining voice
            dispatchKey(NOTE_CODE, 'keyup', {ctrlKey: true})
            expect(up).toEqual([NOTE_CODE])
        } finally {
            dispose()
        }
    })

    it('Ctrl+Z reaches the composer combo and ONLY it', () => {
        const notes = listenForNotes('undo_collision_notes')
        const shortcuts: string[] = []
        const disposeShortcuts = createShortcutListener(
            'composer',
            'undo_collision_combo',
            ({shortcut}) => shortcuts.push((shortcut as {name: string}).name)
        )
        try {
            dispatchKey('ControlLeft', 'keydown', {ctrlKey: true})
            dispatchKey(NOTE_CODE, 'keydown', {ctrlKey: true})
            expect(shortcuts).toEqual(['undo'])
            expect(notes.down).toEqual([])
        } finally {
            disposeShortcuts()
            notes.dispose()
        }
    })
})
