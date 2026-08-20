// Guards for which instrument the PLAYER's on-screen keyboard is shaped like
// (src/lib/core/Songs/displayInstrument.ts).
//
// THE BUG THIS PINS: the player loaded a song's instruments, so the AUDIO switched, while the
// keyboard's grid stayed whatever it was - a 2x4 drum song played through a 3x5 piano keyboard.
// The cause was that Player.svelte held its display instrument in a plain `const`, built once from
// the game's first instrument and never reassigned.
//
// WHAT IS AND IS NOT COVERED HERE. This file covers the CHOICE - which instrument name the keyboard
// follows - the invariant that the grid and the button count come from that one instrument, and
// (last block) the CONSEQUENCE of that choice for song notes: the two display coordinates
// resolvePlayerNoteButtons gives every loaded note, one per surface that draws it.
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
import {
    basepointOffset, buttonToNumber, displayButtonForNumber, getNoteIdTable, getSoundingTable,
    gridRowForNumber, noteIdToButton, numberToButton, resolvePlayerNoteButtons, songGridSlotForId,
} from '../src/lib/core/Songs/noteIds'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {playerStore} from '../src/lib/stores/PlayerStore.svelte'
import {CANONICAL_NOTE_IDS, INSTRUMENTS, InstrumentData, RecordedNote} from './imports'
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
        expect(displayInstrumentNameFor([NARROW_INSTRUMENT], DEFAULT_INSTRUMENT)).toBe(
            NARROW_INSTRUMENT
        )
    })

    it('follows track 0 even when a later track is wider', () => {
        //the alternative design - the WIDEST track - would return the default here, which is the
        //very thing the user reported: a drum song showing a piano keyboard
        const chosen = displayInstrumentNameFor(
            [NARROW_INSTRUMENT, DEFAULT_INSTRUMENT],
            DEFAULT_INSTRUMENT
        )
        expect(chosen).toBe(NARROW_INSTRUMENT)
    })

    it("goes back to the user's own instrument when no song is loaded", () => {
        //what the stop-time restore passes, beside the pitch and reverb it puts back
        expect(displayInstrumentNameFor([], NARROW_INSTRUMENT)).toBe(NARROW_INSTRUMENT)
        expect(displayInstrumentNameFor([], DEFAULT_INSTRUMENT)).toBe(DEFAULT_INSTRUMENT)
    })

    it("keeps the user's own instrument when the song names one this game does not have", () => {
        //songs are shared between builds and imported from files. Instrument's constructor would
        //fall back to INSTRUMENTS[0], which is a DIFFERENT keyboard from the user's if they chose
        //another one - so the fallback is made here instead.
        const chosen = displayInstrumentNameFor(
            ['NotAnInstrument' as InstrumentName],
            NARROW_INSTRUMENT
        )
        expect(chosen).toBe(NARROW_INSTRUMENT)
    })
})

describe('the grid and the button count come from one instrument', () => {
    it('a 2x4 song gets a 2x4 grid AND that grid’s number of buttons', () => {
        //THE PAIR IS THE POINT. Fixing only the shape gives 15 piano buttons in 4 columns, which is
        //worse than the bug; fixing only the count gives 8 buttons in 5 columns. Both readings come
        //from the same Instrument, which is what makes that unrepresentable.
        const name = displayInstrumentNameFor([NARROW_INSTRUMENT], DEFAULT_INSTRUMENT)
        const instrument = new Instrument(name)
        expect(instrument.shape.columns).toBe(4)
        expect(instrument.notes.length).toBe(8)
        expect(instrument.notes.length).toBeLessThanOrEqual(instrument.shape.capacity)
        //the labels ride on the Shape too, so they cannot be a third source
        expect(instrument.layouts.keyboard.length).toBe(instrument.shape.labels.keyboard.length)
    })

    it("no song gets the user's own instrument's grid and count", () => {
        const name = displayInstrumentNameFor([], DEFAULT_INSTRUMENT)
        const instrument = new Instrument(name)
        const expected = new Instrument(DEFAULT_INSTRUMENT)
        expect(instrument.shape.columns).toBe(expected.shape.columns)
        expect(instrument.notes.length).toBe(expected.notes.length)
    })
})

// What PlayerKeyboard hands the Shape, and what it addresses per-note state with (ADR-0005).
// The rendering half still needs the component harness described at the top of this file; these
// cover the store-side contract underneath it, which is where the surface's assumptions live.
describe('the keyboard the player publishes to the Shape', () => {
    it('is the display instrument’s notes in authored Button order', () => {
        //ShapeKeyboard is handed exactly this array, and hands each element back with its
        //POSITION in it as the Button. That is the number getNoteText labels and the number the
        //approaching-note rows are keyed by, so it has to be the note's own Button.
        const instrument = new Instrument(NARROW_INSTRUMENT)
        playerStore.setKeyboardLayout(instrument.notes)
        expect(playerStore.keyboard.length).toBe(instrument.notes.length)
        instrument.notes.forEach((note, button) => {
            expect(playerStore.keyboard[button]).toBe(note)
            expect(playerStore.keyboard.indexOf(note)).toBe(button)
        })
    })

    it('leaves no note of the previous layout addressable once a narrower one is published', () => {
        //the two clocks PlayerKeyboard guards against: the surface resolves a clicked note's row
        //against the published array, so a note that is no longer on it must report NO row
        //(-1) rather than a stale one - that is what keeps a click from consuming a practice
        //note or an approaching circle belonging to a different button.
        const wide = new Instrument(DEFAULT_INSTRUMENT)
        const narrow = new Instrument(NARROW_INSTRUMENT)
        playerStore.setKeyboardLayout(wide.notes)
        playerStore.setKeyboardLayout(narrow.notes)
        expect(playerStore.keyboard.length).toBe(narrow.notes.length)
        expect(playerStore.keyboard.indexOf(wide.notes.at(-1)!)).toBe(-1)
    })

    it('addresses per-note state by the note itself, not by where it sits', () => {
        //setNoteState(note, ...) is the whole point: a status reset scheduled before a layout
        //switch lands on the note it was scheduled for, never on whoever holds that index now.
        const instrument = new Instrument(NARROW_INSTRUMENT)
        const note = instrument.notes[3]
        playerStore.setKeyboardLayout(instrument.notes)
        playerStore.setNoteState(note, {status: 'clicked'})
        expect(note.status).toBe('clicked')
        const other = new Instrument(DEFAULT_INSTRUMENT)
        playerStore.setKeyboardLayout(other.notes)
        playerStore.setNoteState(note, {status: ''})
        expect(note.status).toBe('')
        //the note that took its index is untouched
        expect(other.notes[3].status).toBe('')
    })
})

// THE TWO COORDINATES A LOADED NOTE CARRIES (resolvePlayerNoteButtons, RecordedNote's two fields).
// The player's keyboard follows TRACK 0 - that is the choice the rest of this file is about - so the
// note's own track's Button is NOT the keyboard's Button, and neither is the canonical Song-Grid
// slot a stranded id falls back to. Both used to be fed to `playerStore.keyboard` as if they were,
// which is the same coordinate-space bug ADR-0004 fixed on the composer canvas and the composer
// keyboard after it: lighting, queueing and clearing keys that play unrelated notes.
//
// Written game-agnostically like the sub-grid block in noteIds.test.ts: every id and every button
// below comes out of the live tables, so the same assertions run under both PUBLIC_GAMEs — measured,
// genshin picks the reported 14-key NightwindHorn against the 21-key Lyre, sky the 8-key HandPan
// against the 15-key Piano.
//
// EVERYTHING HERE SITS AT BASEPOINT C on instruments whose two axes coincide, so a grid Nominal Id
// doubles as the Note Number a song would store for it (ADR-0007). That is a property of the chosen
// fixtures, not a rule — so it is ASSERTED below rather than assumed, and every call still goes
// through the real Basepoint-aware resolution.
describe('the two display coordinates of a player-loaded note', () => {
    const subGridInstruments = INSTRUMENTS.filter((name: InstrumentName) =>
        CANONICAL_NOTE_IDS.some((id) => !getNoteIdTable(name).includes(id)))
    /**
     * How sharp a reproduction an instrument can make: ids it has NO key for whose old number -
     * the note's own-track button on a full-size track, or the canonical Song-Grid slot for an id
     * stranded on its own track - is nevertheless a real key of it, so the keyboard lit a key
     * playing something else. A kit whose keys simply ARE grid slots 0..n-1 (sky's drums, genshin's
     * DunDun) scores 0: its foreign numbers fall off the end and were merely skipped, so it cannot
     * show this bug at all. Widest wins ties. genshin lands on the reported 14-key NightwindHorn;
     * sky on the 8-key HandPan, whose keys are scattered across the 15-row grid.
     */
    const wrongKeyCollisions = (name: InstrumentName) => {
        const table = getNoteIdTable(name)
        const hitsAKey = (button: number) => button >= 0 && button < table.length
        return CANONICAL_NOTE_IDS.filter((id) => !table.includes(id)
            && (hitsAKey(songGridSlotForId(id)) || hitsAKey(noteIdToButton(DEFAULT_INSTRUMENT, id)))).length
    }
    const keyboardName = subGridInstruments.reduce((best, name) => {
        const difference = wrongKeyCollisions(name) - wrongKeyCollisions(best)
        if (difference !== 0) return difference > 0 ? name : best
        return getNoteIdTable(name).length > getNoteIdTable(best).length ? name : best
    }, subGridInstruments[0])
    const keyboardTable = keyboardName ? getNoteIdTable(keyboardName) : []
    const defaultTable = getNoteIdTable(DEFAULT_INSTRUMENT)

    //an id BOTH can play, preferring one they put on different buttons AND whose own-track button
    //is a real key of this keyboard - that pair is a wrong key lit, not a harmless out-of-range miss
    const sharedCandidates = keyboardTable.filter((id) => noteIdToButton(DEFAULT_INSTRUMENT, id) !== -1
        && noteIdToButton(DEFAULT_INSTRUMENT, id) !== noteIdToButton(keyboardName, id))
    const sharedId = sharedCandidates.find((id) =>
        noteIdToButton(DEFAULT_INSTRUMENT, id) < keyboardTable.length) ?? sharedCandidates[0]
    //an id the other track CAN play and this keyboard cannot, again preferring one whose own-track
    //button exists here (genshin: Lyre id 72 at Lyre button 0, where the horn's key 0 plays 60)
    const foreignCandidates = defaultTable.filter((id) => !keyboardTable.includes(id))
    const foreignId = foreignCandidates.find((id) =>
        noteIdToButton(DEFAULT_INSTRUMENT, id) < keyboardTable.length) ?? foreignCandidates[0]
    //...and an id STRANDED on the keyboard's own track, whose canonical grid slot is a real key
    //here: the second route to the same wrong key, through displayButtonForId's fallback
    const strandedCandidates = CANONICAL_NOTE_IDS.filter((id) => !keyboardTable.includes(id))
    const strandedId = strandedCandidates.find((id) =>
        songGridSlotForId(id) < keyboardTable.length) ?? strandedCandidates[0]

    const track = (name: InstrumentName) => new InstrumentData({name})
    const note = (trackIndex: number, id: number) => new RecordedNote(id, 0, 0, trackIndex)

    it('this game really does ship the shape of song this is about', () => {
        //if any of these stops holding, the rows below are vacuous rather than failing
        expect(keyboardName).toBeTruthy()
        //the block header's premise: on these two instruments a nominal IS the number stored at C
        for (const name of [keyboardName, DEFAULT_INSTRUMENT]) {
            expect(getSoundingTable(name)).toEqual(getNoteIdTable(name))
        }
        expect(keyboardTable.length).toBeLessThan(CANONICAL_NOTE_IDS.length)
        expect(wrongKeyCollisions(keyboardName)).toBeGreaterThan(0)
        expect(sharedId).toBeDefined()
        expect(foreignId).toBeDefined()
        expect(strandedId).toBeDefined()
        //and the keyboard the player would show for such a song IS that sub-grid instrument -
        //this block's whole premise, and the reason its Buttons are the ones on screen
        expect(displayInstrumentNameFor([keyboardName, DEFAULT_INSTRUMENT], DEFAULT_INSTRUMENT))
            .toBe(keyboardName)
    })

    describe('multi-instrument song on a sub-grid display instrument', () => {
        const instruments = [track(keyboardName), track(DEFAULT_INSTRUMENT)]

        it('gives a foreign track’s note the key THIS keyboard plays that id with', () => {
            const notes = [note(1, sharedId)]
            resolvePlayerNoteButtons(notes, instruments, keyboardName, 'C', 'C')
            //the keyboard coordinate is the displayed instrument's own Button, and the key at it
            //really does play the note the song asked for - the invariant the bug broke
            expect(notes[0].keyboardButton).toBe(noteIdToButton(keyboardName, sharedId))
            expect(keyboardTable[notes[0].keyboardButton]).toBe(sharedId)
            //THE BITE: the other track's own button is a real key of this keyboard, and it plays
            //something else. That number is what the keyboard/practice/approach paths used to index
            expect(notes[0].displayButton).not.toBe(notes[0].keyboardButton)
            expect(notes[0].displayButton).toBeLessThan(keyboardTable.length)
            expect(keyboardTable[notes[0].displayButton]).not.toBe(sharedId)
        })

        it('gives it NO key when this keyboard cannot play the id, though its own track can', () => {
            const notes = [note(1, foreignId)]
            resolvePlayerNoteButtons(notes, instruments, keyboardName, 'C', 'C')
            //-1 is what every keyboard path skips on; the note still sounds (playSong falls back to
            //playing it by id) and still draws in the sheet, which reads the other field
            expect(notes[0].keyboardButton).toBe(-1)
            expect(notes[0].displayButton).toBe(noteIdToButton(DEFAULT_INSTRUMENT, foreignId))
            expect(notes[0].displayButton).toBeGreaterThanOrEqual(0)
            //THE BITE: that own-track button is a key of this keyboard, playing an unrelated id
            expect(notes[0].displayButton).toBeLessThan(keyboardTable.length)
            expect(keyboardTable[notes[0].displayButton]).not.toBe(foreignId)
        })

        it('keeps the sheet’s coordinate identical whatever keyboard is on screen', () => {
            //ADR-0004 keeps the player's sheet frames on the note's OWN track's button. Resolving
            //the same song against two different display keyboards must move ONLY the keyboard
            //coordinate - that is the whole reason these are two fields and not one.
            const mixed = () => [note(0, keyboardTable[0]), note(0, strandedId), note(1, sharedId), note(1, foreignId)]
            const onSubGrid = mixed()
            const onDefault = mixed()
            resolvePlayerNoteButtons(onSubGrid, instruments, keyboardName, 'C', 'C')
            resolvePlayerNoteButtons(onDefault, instruments, DEFAULT_INSTRUMENT, 'C', 'C')
            onSubGrid.forEach((n, i) => {
                //byte-identical, and equal to the exact expression the pre-fix code computed
                expect(n.displayButton).toBe(displayButtonForNumber(instruments[n.trackIndex].name, 'C', n.id))
                expect(n.displayButton).toBe(onDefault[i].displayButton)
            })
            expect(onSubGrid.map((n) => n.keyboardButton))
                .not.toEqual(onDefault.map((n) => n.keyboardButton))
        })

        it('never hands the keyboard a key that plays a different note', () => {
            //the single invariant the keyboard/practice/approach paths rely on, over a whole
            //mixed song: whatever survives their `keyboardButton >= 0` filter is a key that plays
            //exactly that note. Under the old resolution the same walk over `displayButton` fails.
            const notes = [note(0, keyboardTable[0]), note(0, strandedId), note(1, sharedId), note(1, foreignId)]
            resolvePlayerNoteButtons(notes, instruments, keyboardName, 'C', 'C')
            const playable = notes.filter((n) => n.keyboardButton >= 0)
            expect(playable.length).toBeGreaterThan(0)
            playable.forEach((n) => expect(keyboardTable[n.keyboardButton]).toBe(n.id))
            //and the ones it skips are exactly the ids this keyboard has no key for
            notes.filter((n) => n.keyboardButton < 0)
                .forEach((n) => expect(keyboardTable).not.toContain(n.id))
        })
    })

    describe('a note stranded on the display instrument itself', () => {
        it('has no key here, while the sheet still places it on the canonical grid slot', () => {
            //single-track song: the note's own track IS the displayed instrument, and its id is one
            //that instrument has no key for (genshin: horn id 72 -> grid slot 0, a real horn key
            //that plays 60). The two fields reach that wrong key by different routes - own button
            //above, displayButtonForId's canonical fallback here - which is why one field cannot
            //serve both surfaces.
            const notes = [note(0, strandedId)]
            resolvePlayerNoteButtons(notes, [track(keyboardName)], keyboardName, 'C', 'C')
            expect(noteIdToButton(keyboardName, strandedId)).toBe(-1)
            expect(notes[0].keyboardButton).toBe(-1)
            //the sheet coordinate is unchanged: the grid row the Stranded Note draws on (ADR-0004)
            expect(notes[0].displayButton).toBe(songGridSlotForId(strandedId))
            expect(notes[0].displayButton).toBe(gridRowForNumber(keyboardName, 'C', strandedId).row)
            expect(notes[0].displayButton).toBeGreaterThanOrEqual(0)
            //THE BITE: that slot is a real key of this keyboard, and it plays another note
            expect(notes[0].displayButton).toBeLessThan(keyboardTable.length)
            expect(keyboardTable[notes[0].displayButton]).not.toBe(strandedId)
        })
    })
})

// A SONG SAVED AT A NON-C BASEPOINT — the case every block above is blind to (see that header: its
// fixtures sit at C, where the Basepoint adds zero and a slip cannot show). A stored Note Number is
// `sounding(button) + offset(songPitch)` (ADR-0007), so resolving it at any OTHER Basepoint does not
// transpose the note: the lookup asks for a sounding value shifted off the instrument's own, and
// answers -1 (stranded, silent) or lands on whichever button happens to hold the shifted value and
// sounds something else. That is why adopting the song's pitch is unconditional now — the setting
// that used to gate it turned every note of a D song into silence or a wrong key.
describe('a song saved at a non-C Basepoint', () => {
    const SONG_PITCH = 'D' as const
    //what the player kept when the adoption was gated off: its own default Basepoint
    const PLAYER_PITCH = 'C' as const
    const sounding = getSoundingTable(DEFAULT_INSTRUMENT)
    const track = (name: InstrumentName) => new InstrumentData({name})
    //the song as the recorder wrote it: every button of the instrument, entered at pitch D
    const songNotes = () =>
        sounding.map((_, button) =>
            new RecordedNote(buttonToNumber(DEFAULT_INSTRUMENT, SONG_PITCH, button)!, 0, 0, 0))

    it('really is a shifted axis, so the rows below are not vacuous', () => {
        expect(basepointOffset(SONG_PITCH)).toBeGreaterThan(basepointOffset(PLAYER_PITCH))
        expect(songNotes().every((note) => Number.isFinite(note.id))).toBe(true)
    })

    it('plays every note when the player adopts the song’s Basepoint', () => {
        const notes = songNotes()
        resolvePlayerNoteButtons(notes, [track(DEFAULT_INSTRUMENT)], DEFAULT_INSTRUMENT, SONG_PITCH, SONG_PITCH)
        notes.forEach((note, button) => {
            //a real key of the keyboard on screen, and one that sounds what was recorded (asked by
            //sounding value, since two buttons may legally share one and the first wins the lookup)
            expect(note.keyboardButton).toBeGreaterThanOrEqual(0)
            expect(sounding[note.keyboardButton]).toBe(sounding[button])
            //single-track song, so the sheet's own-track coordinate is the same key
            expect(note.displayButton).toBe(note.keyboardButton)
        })
    })

    it('loses every one of them when the player keeps its own Basepoint', () => {
        const notes = songNotes()
        resolvePlayerNoteButtons(notes, [track(DEFAULT_INSTRUMENT)], DEFAULT_INSTRUMENT, PLAYER_PITCH, PLAYER_PITCH)
        notes.forEach((note, button) => {
            expect(note.keyboardButton).not.toBe(button)
            //whatever key it does reach plays another note - a wrong key lit, not a transposition
            if (note.keyboardButton >= 0) {
                expect(sounding[note.keyboardButton]).not.toBe(sounding[button])
            }
        })
        //and the top of the instrument runs off its range entirely: silence, by design
        expect(notes.some((note) => note.keyboardButton === -1)).toBe(true)
    })

    it('resolves the same way in the engine, which is what makes the keys and the sound agree', () => {
        //the number the player hands `ins.play(number, pitch)` - the surface's -1 above is this
        //null, so a keyboard resolved at one Basepoint and audio at another disagree note for note
        const instrument = new Instrument(DEFAULT_INSTRUMENT)
        songNotes().forEach((note, button) => {
            expect(instrument.getNoteByNumber(note.id, SONG_PITCH)?.soundingNote).toBe(sounding[button])
            expect(instrument.getNoteByNumber(note.id, PLAYER_PITCH)?.soundingNote ?? null)
                .not.toBe(sounding[button])
            //the two agree on which button, too: the surface's answer IS the engine's
            expect(numberToButton(DEFAULT_INSTRUMENT, SONG_PITCH, note.id)).toBeGreaterThanOrEqual(0)
        })
    })
})

describe('what the player hands the engine (ADR-0005 §4 under ADR-0007)', () => {
    it('is a Note Number, which resolves back to the very note that was pressed', () => {
        //handleClick passes note.numberAt(pitch); the engine resolves it on whichever instrument
        //is sounding, at the same Basepoint
        const instrument = new Instrument(NARROW_INSTRUMENT)
        for (const pitch of ['C', 'Eb', 'B'] as const) {
            instrument.notes.forEach(note => {
                expect(instrument.getNoteByNumber(note.numberAt(pitch), pitch)).toBe(note)
            })
        }
    })

    it('keeps the pitch when the sounding instrument is not the one on screen', () => {
        //the player can show the song's instrument while the user's own is still the live one.
        //A Note Number names the same PITCH everywhere it can be voiced (and nothing where it
        //cannot), so this no longer sounds whatever the live instrument keeps at the same BUTTON.
        const shown = new Instrument(NARROW_INSTRUMENT)
        const sounding = new Instrument(DEFAULT_INSTRUMENT)
        shown.notes.forEach(note => {
            const sounded = sounding.getNoteByNumber(note.numberAt('C'), 'C')
            if (sounded === null) return //stranded on the live instrument: silent, by design
            expect(sounded.soundingNote).toBe(note.soundingNote)
        })
    })
})
