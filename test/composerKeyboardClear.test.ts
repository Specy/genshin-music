/**
 * THE LOWERED SHEET'S PLAYBACK CLEAR (spec §4, 2026-08-22).
 *
 * In the Pro View the composer keyboard is a bottom sheet that spends most of a playback translated
 * off-screen, and it stayed MOUNTED down there flashing every column's notes at whatever the
 * transport's tempo is - a full per-key repaint per column advance, of a surface nobody can see.
 * The rule the user asked for is not an unmount and not a freeze: with the sheet down AND the song
 * running the keys show nothing at all, while the same sheet down with the song STOPPED keeps
 * updating exactly as it always has, because that is how one browses and edits with it lowered.
 *
 * Composer.svelte owns the gate (`proView && !keyboardSheetRaised && isPlaying`) and this file
 * mounts the keyboard on either side of it. What a source-grep could not see, and what the second
 * case here is for: clearing by handing back a FRESH empty Map would show the same nothing and
 * repaint every key to do it, which is the cost the whole thing exists to avoid.
 *
 * The mount harness is test/composerInstrumentPanel.test.ts's; the reactive props object is what
 * lets the gate be flipped on a LIVE component rather than compared across two mounts.
 */
import {flushSync, mount, unmount, type ComponentProps} from 'svelte'
import {readFileSync} from 'node:fs'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import ComposerKeyboard from '../src/lib/components/pages/Composer/ComposerKeyboard.svelte'
import {ComposedSong, ComposerSettings, INSTRUMENTS, INSTRUMENTS_DATA} from './imports'
import {reactiveProps} from './signals.svelte'
import {Instrument} from '$lib/audio/Instrument.svelte'
import {numberToButton} from '$core/Songs/noteIds'

type Mounted = ReturnType<typeof mount>

/** Every class a note icon can carry a layer in - see ComposerNote's classNameMap. */
const LAYER_CLASSES = '.layer-1, .layer-2, .layer-3, .layer-4'
/** The held bar ComposerNote draws under a key, identified by the one colour only it uses. */
const HELD_MARK = '[style*="var(--accent)"]'

const INSTRUMENT = INSTRUMENTS[0]
const NOTES = INSTRUMENTS_DATA[INSTRUMENT as keyof typeof INSTRUMENTS_DATA].notes

describe('the Pro View keyboard while the lowered sheet is cleared', () => {
    let target: HTMLDivElement
    let component: Mounted | null = null
    let props: ComponentProps<typeof ComposerKeyboard>

    /**
     * A song with one note on the current layer, mounted through the keyboard exactly as
     * Composer.svelte wires it - `heldButtons` included, since that side table is computed up
     * there and the keyboard only reads it.
     */
    function openKeyboard(noteStatesCleared: boolean) {
        const song = new ComposedSong('cleared keyboard', [INSTRUMENT, INSTRUMENT])
        const number = NOTES[3].sounding
        song.addNoteAt(0, 0, number)
        const button = numberToButton(INSTRUMENT, 'C', number)
        expect(button).toBeGreaterThanOrEqual(0)
        props = reactiveProps({
            data: {
                keyboard: new Instrument(INSTRUMENT),
                instruments: song.instruments,
                currentLayer: 0,
                currentColumn: song.columns[0],
                pitch: 'C',
                settings: ComposerSettings.data,
                isPlaying: true,
                noteNameType: ComposerSettings.data.noteNameType.value,
                heldButtons: noteStatesCleared ? new Set<number>() : new Set([button]),
                proView: true,
                noteStatesCleared,
            },
            //nothing here is invoked: no pointer ever lands on these keys, and what this file is
            //about is what they SHOW
            functions: {
                handleClick: () => {},
                handleNoteRelease: () => {},
                handleNoteLongPress: () => {},
                handleNoteDrag: () => {},
                selectColumnFromDirection: () => {},
                handleTempoChanger: () => {},
            },
        })
        component = mount(ComposerKeyboard, {target, props})
        flushSync()
    }

    beforeEach(() => {
        target = document.createElement('div')
        document.body.append(target)
    })

    afterEach(() => {
        if (component) unmount(component)
        component = null
        target.remove()
    })

    it('lights nothing, over a column that has notes in it', () => {
        openKeyboard(true)
        //the keys are all there - this is not an unmount, and the sheet is still tappable
        expect(target.querySelectorAll('.button-hitbox').length).toBeGreaterThan(0)
        expect(target.querySelectorAll(LAYER_CLASSES)).toHaveLength(0)
        expect(target.querySelectorAll(HELD_MARK)).toHaveLength(0)
        //and never the error branch, which is the OTHER thing an empty answer could have been
        expect(target.textContent).not.toContain('Err')
    })

    it('paints the column the moment the gate lets go, without a remount', () => {
        openKeyboard(true)
        const keys = target.querySelectorAll('.button-hitbox')
        expect(target.querySelectorAll(LAYER_CLASSES)).toHaveLength(0)

        props.data.noteStatesCleared = false
        flushSync()

        expect(target.querySelectorAll('.layer-1').length).toBeGreaterThan(0)
        //the same key elements throughout: raising the sheet or stopping the song restores the
        //statuses on the keyboard that was already standing there
        expect([...target.querySelectorAll('.button-hitbox')]).toEqual([...keys])

        props.data.noteStatesCleared = true
        flushSync()

        expect(target.querySelectorAll(LAYER_CLASSES)).toHaveLength(0)
    })

    it('shows the held marks the prop carries, and only then', () => {
        //`heldButtons` is Composer.svelte's derived, cleared by the same gate up there; from here
        //the rule is simply that a button in the set wears the bar and the rest do not
        openKeyboard(false)
        expect(target.querySelectorAll(HELD_MARK)).toHaveLength(1)

        props.data.heldButtons = new Set<number>()
        flushSync()

        expect(target.querySelectorAll(HELD_MARK)).toHaveLength(0)
    })
})

describe('the gate Composer.svelte states the clear with', () => {
    const COMPOSER = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8')

    it('is one derived, of the three things it is the conjunction of', () => {
        expect(COMPOSER).toContain(
            'const noteStatesCleared = $derived(proView && !keyboardSheetRaised && isPlaying);'
        )
        //...and it reaches the keyboard through the props channel rather than being re-derived there
        expect(COMPOSER).toContain('noteStatesCleared,')
    })

    it('returns from heldButtons before the derived reads the song at all', () => {
        //THE POINT OF THE EARLY RETURN, and the one thing no mount can see: a derived that has read
        //`song.selected` before deciding stays subscribed to it, so every column advance re-runs
        //the whole span scan below to build a Set it then throws away.
        const from = COMPOSER.indexOf('const heldButtons = $derived.by(() => {')
        expect(from).toBeGreaterThan(-1)
        const beforeFirstSongRead = COMPOSER.slice(from, COMPOSER.indexOf('song.', from))
        expect(beforeFirstSongRead).toContain('if (noteStatesCleared) return NO_HELD_BUTTONS;')
    })
})

describe('the open tools take the bottom of the window from the sheet', () => {
    const COMPOSER = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8')

    it('lowers the sheet while the tools are open, without rewriting keyboardRaised', () => {
        //user addition 2026-08-22: the restore-on-close IS the derivation - `keyboardRaised`
        //stays whatever the user left it, so closing the tools hands the sheet back exactly as
        //it stood. A version that wrote keyboardRaised on open would need (and could corrupt) a
        //memory of its own.
        expect(COMPOSER).toContain(
            'const keyboardSheetRaised = $derived(keyboardRaised && !isToolsVisible);'
        )
    })

    it('makes the two raise controls inert while the tools are open, not silently effective', () => {
        //both write `keyboardRaised = ...` into a sheet the tools refuse to show, so both are
        //gated instead: a control that visibly does nothing must not spring its stored flip on
        //the user at the tools' close
        expect(COMPOSER).toContain("name === 'toggle_keyboard' && proView && !isToolsVisible")
        expect(COMPOSER).toContain('{#if !keyboardSheetRaised && !isToolsVisible}')
    })
})
