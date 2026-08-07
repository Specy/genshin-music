// Guards for which instrument the PLAYER's on-screen keyboard is shaped like
// (src/lib/core/Songs/displayInstrument.ts).
//
// THE BUG THIS PINS: the player loaded a song's instruments, so the AUDIO switched, while the
// keyboard's grid stayed whatever it was - a 2x4 drum song played through a 3x5 piano keyboard.
// The cause was that Player.svelte held its display instrument in a plain `const`, built once from
// the game's first instrument and never reassigned.
//
// WHAT IS AND IS NOT COVERED HERE. This file covers the CHOICE - which instrument name the keyboard
// follows - and the invariant that the grid and the button count come from that one instrument.
// It does NOT cover Player.svelte's wiring (that the $effect calls it, and that the field it
// assigns is `$state` so PlayerKeyboard's `$derived` re-runs): there is no Svelte component harness
// in test/ - no @testing-library, and the `mount()` helpers in the renderer tests are local pixi
// fakes - so that half is covered by review only. Both halves have to be right for the bug to be
// fixed; a passing run here is not on its own evidence that it is.
//
// MEASURED, so the next person does not have to rediscover it: reverting either half leaves this
// file and the whole suite green. The two reverts are `syncDisplayInstrument` no longer reassigning
// `songDisplayInstrument` (Player.svelte) and PlayerKeyboard reading its grid from the live
// instrument again - the first reproduces the reported symptom exactly.
//
// CLOSING IT IS A KNOWN PATH, not an open question. vite.config.ts already carries the one thing
// that was missing, `resolve: {conditions: ['browser']}`, and Svelte 5's own `mount()` from 'svelte'
// does initialise a component under this jsdom setup - verified by mounting ShapeKeyboard, which got
// as far as Svelte's own snippet validation. What is left is the scope: PlayerKeyboard takes a wide
// `data`/`functions` prop pair, and Player.svelte pulls in audio, stores and analytics. That is a
// harness, not a test, and it was judged too large to add alongside three bug fixes.
//
// Written game-independently, since the suite runs under PUBLIC_GAME=sky and =genshin: `DunDun` is
// a 2x4 instrument in both, and the default instrument is 3x5 (sky) / 3x7 (genshin).
import {describe, expect, it} from 'vitest'
import {displayInstrumentNameFor} from '../src/lib/core/Songs/displayInstrument'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {INSTRUMENTS} from './imports'
import type {InstrumentName} from '../src/lib/core/types'

const DEFAULT_INSTRUMENT = INSTRUMENTS[0]
//present in both games' registries, and 2x4 in both - the reproduction the user reported
const NARROW_INSTRUMENT = 'DunDun' as InstrumentName

describe('the reproduction this fix is about', () => {
    it('the default instrument and a 2x4 one really do have different grids', () => {
        const wide = new Instrument(DEFAULT_INSTRUMENT)
        const narrow = new Instrument(NARROW_INSTRUMENT)
        //if this ever stops holding, every row below is vacuous rather than failing
        expect(INSTRUMENTS).toContain(NARROW_INSTRUMENT)
        expect(narrow.name).toBe(NARROW_INSTRUMENT)
        expect(narrow.shape.columns).not.toBe(wide.shape.columns)
        expect(narrow.notes.length).not.toBe(wide.notes.length)
        expect(narrow.shape.columns).toBe(4)
        expect(narrow.notes.length).toBe(8)
    })
})

describe('displayInstrumentNameFor', () => {
    it('follows the song track 0, which is the track the audio follows', () => {
        expect(displayInstrumentNameFor([NARROW_INSTRUMENT], DEFAULT_INSTRUMENT, true)).toBe(
            NARROW_INSTRUMENT
        )
    })

    it('follows track 0 even when a later track is wider', () => {
        //the alternative design - the WIDEST track - would return the default here, which is the
        //very thing the user reported: a drum song showing a piano keyboard
        const chosen = displayInstrumentNameFor(
            [NARROW_INSTRUMENT, DEFAULT_INSTRUMENT],
            DEFAULT_INSTRUMENT,
            true
        )
        expect(chosen).toBe(NARROW_INSTRUMENT)
    })

    it("goes back to the user's own instrument when no song is loaded", () => {
        //what the stop-time restore passes, beside the pitch and reverb it puts back
        expect(displayInstrumentNameFor([], NARROW_INSTRUMENT, true)).toBe(NARROW_INSTRUMENT)
        expect(displayInstrumentNameFor([], DEFAULT_INSTRUMENT, true)).toBe(DEFAULT_INSTRUMENT)
    })

    it('does not switch the layout when song-data sync is off', () => {
        //with the setting off Player.svelte never loads the song's instruments, so the SOUND does
        //not switch - and a layout that switched anyway would be worse than the original bug
        expect(displayInstrumentNameFor([NARROW_INSTRUMENT], DEFAULT_INSTRUMENT, false)).toBe(
            DEFAULT_INSTRUMENT
        )
    })

    it("keeps the user's own instrument when the song names one this game does not have", () => {
        //songs are shared between builds and imported from files. Instrument's constructor would
        //fall back to INSTRUMENTS[0], which is a DIFFERENT keyboard from the user's if they chose
        //another one - so the fallback is made here instead.
        const chosen = displayInstrumentNameFor(
            ['NotAnInstrument' as InstrumentName],
            NARROW_INSTRUMENT,
            true
        )
        expect(chosen).toBe(NARROW_INSTRUMENT)
    })
})

describe('the grid and the button count come from one instrument', () => {
    it('a 2x4 song gets a 2x4 grid AND that grid’s number of buttons', () => {
        //THE PAIR IS THE POINT. Fixing only the shape gives 15 piano buttons in 4 columns, which is
        //worse than the bug; fixing only the count gives 8 buttons in 5 columns. Both readings come
        //from the same Instrument, which is what makes that unrepresentable.
        const name = displayInstrumentNameFor([NARROW_INSTRUMENT], DEFAULT_INSTRUMENT, true)
        const instrument = new Instrument(name)
        expect(instrument.shape.columns).toBe(4)
        expect(instrument.notes.length).toBe(8)
        expect(instrument.notes.length).toBeLessThanOrEqual(instrument.shape.capacity)
        //the labels ride on the Shape too, so they cannot be a third source
        expect(instrument.layouts.keyboard.length).toBe(instrument.shape.labels.keyboard.length)
    })

    it("no song gets the user's own instrument's grid and count", () => {
        const name = displayInstrumentNameFor([], DEFAULT_INSTRUMENT, true)
        const instrument = new Instrument(name)
        const expected = new Instrument(DEFAULT_INSTRUMENT)
        expect(instrument.shape.columns).toBe(expected.shape.columns)
        expect(instrument.notes.length).toBe(expected.notes.length)
    })
})
