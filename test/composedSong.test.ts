import {describe, expect, it} from 'vitest'
import {
    CANONICAL_NOTE_IDS,
    COMPOSER_NOTE_POSITIONS,
    ComposedSong,
    InstrumentData,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    RecordedSong,
} from './imports'
import {buildComposedSong} from './builders'
import {expectGolden, readFixture} from './golden'
import {basepointOffset, gridRowForNumber, noteIdToButton} from '$core/Songs/noteIds'
import {rewriteForSwap} from '$core/Songs/noteNumberTransforms'
import {isFixedBreakpoint, withFixedBreakpoints} from '$core/Songs/breakpoints'

// Format-v4 rewrite (2026-08-03): `composed-song.json` is the frozen pre-v4 fixture —
// its `serialized` member is a real v3 file and now serves as the LEGACY INPUT.
// ADR-0007 (2026-08-19) froze `composed-song-v4.json` the same way: its `serialized`
// member is a real v4 file (Nominal Ids, pre-Basepoint) and is now the MIGRATION INPUT
// below; v5 outputs (absolute Note Numbers) live in `composed-song-v5.json`. Neither old
// fixture is ever regenerated.
describe('ComposedSong formats', () => {
    // No `oldFormatExport` member any more: that export was retired at ADR-0007 phase E (kept
    // commented in ComposedSong), so the golden lost the key with its producer. Old-format
    // IMPORT is unaffected and still covered — here by the legacy v1/v2/v3 rows, and in full by
    // test/oldFormatImport.test.ts.
    it('v5 serialize / roundtrip / v4 migration / legacy v1+v2+v3 conversion are stable', () => {
        const legacy = readFixture('composed-song')
        const song = buildComposedSong()
        const serialized = song.serialize()
        const appName = serialized.data.appName

        // v1: columns [[tempoChanger, [[index, REVERSED-bin-layer], ...]], instruments as name array
        const v1Payload = {
            version: 1, name: 'Legacy v1', bpm: 220, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName},
            breakpoints: [0],
            instruments: [INSTRUMENTS[0], INSTRUMENTS[0]],
            columns: [
                [0, [[0, '1']]],       // bit 0 (single char, reverse = itself)
                [1, [[3, '01']]],      // reversed -> '10' -> bit 1
            ],
        }
        // v2: columns in legacy format, instruments still a name array
        const v2Payload = {
            version: 2, name: 'Legacy v2', bpm: 200, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName},
            breakpoints: [],
            instruments: [INSTRUMENTS[0]],
            columns: [
                [0, [[0, '1']]],       // hex layer '1' -> bit 0
                [2, [[5, '3']]],       // hex '3' -> bits 0+1
            ],
        }

        expectGolden('composed-song-v5', {
            serialized,
            roundtrip: ComposedSong.deserialize(serialized).serialize(),
            fromV4: ComposedSong.deserialize(readFixture('composed-song-v4').serialized).serialize(),
            fromLegacyV1: ComposedSong.deserialize(v1Payload as any).serialize(),
            fromLegacyV2: ComposedSong.deserialize(v2Payload as any).serialize(),
            fromLegacyV3: ComposedSong.deserialize(legacy.serialized).serialize(),
            toRecorded: song.toRecordedSong().serialize(),
        })
    })

    // The builders express their content as "the Note Number a v4 file's nominal migrates to"
    // (see test/builders.ts), so this is not a tautology in either direction: it says the
    // in-memory model and the on-disk upgrade path agree about what the committed pre-flip
    // song means, and it fails if either one drifts.
    it('a v4 file migrates to exactly the song the builder describes', () => {
        const migrated = ComposedSong.deserialize(readFixture('composed-song-v4').serialized)
        expect(JSON.parse(JSON.stringify(migrated.serialize())))
            .toEqual(JSON.parse(JSON.stringify(buildComposedSong().serialize())))
    })

    // Every stored number moves by the Basepoint interval, stranded notes included, and the
    // nominal-space view of the song is unchanged — which is what makes a Basepoint a view
    // offset rather than a re-voicing (ADR-0007).
    it('the same song saved at two Basepoints differs by exactly the interval', () => {
        const payload = buildComposedSong().serialize()
        const atE = ComposedSong.deserialize(payload)
        const raised = {...payload, pitch: 'F' as const}
        const atF = ComposedSong.deserialize(raised)
        const numbersOf = (song: ComposedSong) =>
            song.columns.flatMap((column) => column.notes.map((note) => note.id))
        expect(numbersOf(atE)).toEqual(numbersOf(atF))
        //...and a v4 file read at the two Basepoints does move, by one semitone
        const v4 = readFixture('composed-song-v4').serialized
        const migratedAtE = ComposedSong.deserialize({...v4, pitch: 'E'})
        const migratedAtF = ComposedSong.deserialize({...v4, pitch: 'F'})
        expect(numbersOf(migratedAtF)).toEqual(numbersOf(migratedAtE).map((n) => n + 1))
    })

    // The frozen fixture's `oldFormatExport` member is no longer read by anything: the export
    // that produced it was retired at ADR-0007 phase E. It stays in the file (frozen fixtures
    // are never rewritten) as the record of what the pre-v4 exporter emitted.
    it('a converted legacy v3 song reproduces the pre-v4 recorded conversion byte-for-byte', () => {
        const legacy = readFixture('composed-song')
        const converted = ComposedSong.deserialize(legacy.serialized)
        // conversion commutes with toRecordedSong: converting the legacy v3 then flattening
        // equals flattening pre-v4 (the committed v2 recorded) then converting.
        //
        // EXCEPT `reverb`, deliberately (2026-08-06, user-approved). Pre-v4's toRecordedSong
        // dropped the flag - it copied bpm/pitch/instruments and nothing else - so a song saved
        // with reverb ON played and exported without it. `composed-song.json` is the historical
        // record of what that older code produced, so it keeps the buggy `false` rather than
        // being rewritten; the divergence is asserted below instead of being hidden by relaxing
        // the comparison. (`composed-song-v4.json`, which records what TODAY's code produces,
        // was corrected to `true` in the same change, and carried into composed-song-v5.json.)
        const {reverb: pre, ...preV4Rest} = JSON.parse(JSON.stringify(RecordedSong.deserialize(legacy.toRecorded).serialize()))
        const {reverb: now, ...currentRest} = JSON.parse(JSON.stringify(converted.toRecordedSong().serialize()))
        expect(currentRest).toEqual(preV4Rest)
        expect(legacy.serialized.reverb).toBe(true) //the source song really does have it on
        expect(pre).toBe(false)                     //pre-v4 dropped it
        expect(now).toBe(true)                      //and we no longer do
    })

    // `reverb` was dropped by FOUR different conversions before 2026-08-06 (ComposedSong.clone,
    // RecordedSong.clone, and through clone() by toOtherGame and toRecordedSong) and one of them
    // sat in a golden fixture for months, because nothing asserted the general rule: a conversion
    // carries the song's playback settings across. Each was fixed one at a time as it was noticed.
    // This pins the rule itself, so the next conversion that forgets one fails here rather than
    // being found by a user whose reverb turned itself off.
    //
    // Scope is deliberately the PLAYBACK settings, not every field: `id`/`folderId` identify a
    // stored row (a conversion produces a new song, so dropping them is correct), and
    // toOtherGame rewrites `appName` by definition.
    it('every conversion carries the song playback settings across', () => {
        const settings = (song: {name: string, bpm: number, pitch: string, reverb: boolean}) =>
            ({name: song.name, bpm: song.bpm, pitch: song.pitch, reverb: song.reverb})

        const composed = buildComposedSong()
        composed.bpm = 190
        composed.pitch = 'D'
        composed.reverb = true
        const expected = settings(composed)

        expect(settings(composed.clone())).toEqual(expected)
        expect(settings(composed.toComposedSong())).toEqual(expected)
        expect(settings(composed.toRecordedSong())).toEqual(expected)

        //and back the other way, so the round trip cannot lose one either
        const recorded = composed.toRecordedSong()
        expect(settings(recorded.clone())).toEqual(expected)
        expect(settings(recorded.toComposedSong())).toEqual(expected)
    })
})

/**
 * ADR-0007's two whole-track rewrites, from the SONG's side: the pure transforms are pinned in
 * noteNumberTransforms.test.ts, so what these rows are about is which notes each mutator picks and
 * what it leaves alone — the half a pure-function test cannot see.
 */
describe('a Basepoint change is a real edit of the notes', () => {
    /** Every note of one track, in column order. */
    const numbersOf = (song: ComposedSong, trackIndex: number) =>
        song.columns.flatMap((column) => column.notesOfTrack(trackIndex).map((note) => note.id))

    function twoTrackSong(): ComposedSong {
        const song = new ComposedSong('basepoint', [INSTRUMENTS[0], INSTRUMENTS[0]])
        song.pitch = 'C'
        INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.slice(0, 5).forEach((note, column) => {
            song.addNoteAt(column, 0, note.sounding)
            song.addNoteAt(column, 1, note.sounding)
        })
        return song
    }

    it('moves every note of every track that FOLLOWS the song, by the interval', () => {
        const song = twoTrackSong()
        const before = [numbersOf(song, 0), numbersOf(song, 1)]
        song.changeBasepoint('song', 'D')
        expect(numbersOf(song, 0)).toEqual(before[0].map((n) => n + 2))
        expect(numbersOf(song, 1)).toEqual(before[1].map((n) => n + 2))
    })

    it('leaves a track with its OWN Basepoint exactly where it was', () => {
        //its effective Basepoint did not change, so moving its notes would transpose it against
        //everything else in the song — the one case a blanket rewrite gets wrong
        const song = twoTrackSong()
        song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[0], pitch: 'F'}))
        const before = [numbersOf(song, 0), numbersOf(song, 1)]
        song.changeBasepoint('song', 'D')
        expect(numbersOf(song, 0)).toEqual(before[0].map((n) => n + 2))
        expect(numbersOf(song, 1)).toEqual(before[1])
    })

    it('goes DOWN eleven semitones from B to C, never up one', () => {
        //the interval is raw, not folded into an octave: folding it would silently octave-jump
        //a whole track (see basepointDelta)
        const song = twoTrackSong()
        song.changeBasepoint('song', 'B')
        const raised = numbersOf(song, 0)
        song.changeBasepoint('song', 'C')
        expect(numbersOf(song, 0)).toEqual(raised.map((n) => n - 11))
    })

    it('round-trips: a change and its inverse leave the song byte-identical', () => {
        const song = twoTrackSong()
        const before = JSON.parse(JSON.stringify(song.serialize()))
        song.changeBasepoint('song', 'Ab')
        song.changeBasepoint('song', 'C')
        expect(JSON.parse(JSON.stringify(song.serialize()))).toEqual(before)
    })

    /**
     * WHAT A BASEPOINT CHANGE DOES TO WHERE NOTES DRAW: nothing, and that is the point (ADR-0007
     * phase D). The rewrite moves every affected note by the same interval the view moved, so the
     * VIRTUAL NOMINAL every placement question is asked of — `number − offset(effective Basepoint)`
     * — comes out identical on both sides of the change. Nothing strands, nothing un-strands, and
     * an off-scale note keeps its row AND its ♯/♭ sign.
     *
     * Stated as its own row because it is the property that makes the rewrite and the grid-row rule
     * ONE decision rather than two that happen to agree: a placement that moved under a Basepoint
     * change would mean the two disagree about what a stored number means, and the user would watch
     * their notes crawl up the canvas as they transposed.
     *
     * (It is also why the phase-D brief's "a Basepoint change un-strands a note" is unconstructible
     * on this model — see the swap rows below for the rewrite that genuinely does un-strand.)
     */
    it('moves a STRANDED note with the view: same row, same accidental, still stranded', () => {
        const instrument = INSTRUMENTS[0]
        const song = new ComposedSong('strand under basepoint', [instrument])
        song.pitch = 'C'
        //an on-scale strand (a grid row this instrument has no button for, if it has one) and an
        //off-scale one (a semitone past the top of the grid, which every instrument leaves off it)
        const onScale = CANONICAL_NOTE_IDS.find(id => noteIdToButton(instrument, id) === -1)
        const offScale = Math.max(...CANONICAL_NOTE_IDS) + 1
        const numbers = onScale === undefined ? [offScale] : [onScale, offScale]
        numbers.forEach((number, column) => song.addNoteAt(column, 0, number))
        const before = numbers.map(number => gridRowForNumber(instrument, 'C', number))
        //non-vacuous: the off-scale note really is between two rows on this build
        expect(before.at(-1)!.stranded).toBe(true)
        expect(before.at(-1)!.accidental).not.toBe(0)

        song.changeBasepoint('song', 'Eb')

        expect(numbersOf(song, 0)).toEqual(numbers.map(number => number + 3))
        numbersOf(song, 0).forEach((number, i) => {
            expect(gridRowForNumber(instrument, 'Eb', number)).toEqual(before[i])
        })
    })

    it('leaves a VOICED note voiced, on the row it was already on', () => {
        const song = twoTrackSong()
        const number = numbersOf(song, 0)[0]
        const before = gridRowForNumber(INSTRUMENTS[0], 'C', number)
        expect(before.stranded).toBe(false)
        song.changeBasepoint('song', 'B')
        expect(gridRowForNumber(INSTRUMENTS[0], 'B', numbersOf(song, 0)[0])).toEqual(before)
    })
})

describe('an instrument swap rewrites the track button-preservingly', () => {
    /** A second instrument that shares at least one nominal with the default one. */
    const other = INSTRUMENTS.find((name) =>
        name !== INSTRUMENTS[0]
        && INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.some(
            (note) => noteIdToButton(name, note.midi) !== -1
        ))!

    it('keeps the BUTTON, so the shape of what was played survives the swap', () => {
        const song = new ComposedSong('swap', [INSTRUMENTS[0]])
        const shared = INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.filter(
            (note) => noteIdToButton(other, note.midi) !== -1
        )
        shared.forEach((note, column) => song.addNoteAt(column, 0, note.sounding))
        song.setInstrument(0, new InstrumentData({name: other}))
        //each note now sounds what the SAME nominal's button sounds on the new instrument
        shared.forEach((note, column) => {
            const expected = INSTRUMENTS_DATA[other].notes[noteIdToButton(other, note.midi)].sounding
            expect(song.columns[column].notesOfTrack(0)[0].id).toBe(expected)
        })
    })

    it('applies the swap at the OLD Basepoint when the same edit also moves the override', () => {
        //a swap is not a transposition: doing the interval first would ask the old instrument to
        //voice numbers that are already at the new Basepoint
        const shared = INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.find(
            (note) => noteIdToButton(other, note.midi) !== -1
        )!
        const together = new ComposedSong('together', [INSTRUMENTS[0]])
        together.addNoteAt(0, 0, shared.sounding)
        together.setInstrument(0, new InstrumentData({name: other, pitch: 'E'}))

        const inTwoSteps = new ComposedSong('two steps', [INSTRUMENTS[0]])
        inTwoSteps.addNoteAt(0, 0, shared.sounding)
        inTwoSteps.setInstrument(0, new InstrumentData({name: other}))
        inTwoSteps.setInstrument(0, new InstrumentData({name: other, pitch: 'E'}))

        expect(together.columns[0].notesOfTrack(0)[0].id)
            .toBe(inTwoSteps.columns[0].notesOfTrack(0)[0].id)
    })

    /**
     * THE UN-STRAND FLOW, end to end on the song (ADR-0007 phase D). A number the OLD instrument
     * cannot voice has no button to correspond from, so the swap passes it through UNCHANGED — and
     * the new instrument may well have a button for it, which is the whole reason pass-through beats
     * approximating it onto some neighbouring key.
     *
     * Both halves are asserted, because either alone is satisfiable by a bug: the NUMBER survives
     * (nothing rewrote it on the way through) and the PLACEMENT flips stranded → voiced (the canvas
     * stops dimming it, and the composer stops skipping it at playback).
     */
    it('a strand passes through a swap UNCHANGED and un-strands on an instrument that has it', () => {
        //by capability, never by game id: an instrument missing a grid row another one carries
        const narrow = INSTRUMENTS.find((name) =>
            CANONICAL_NOTE_IDS.some((id) => noteIdToButton(name, id) === -1))!
        const stranded = CANONICAL_NOTE_IDS.find((id) =>
            noteIdToButton(narrow, id) === -1
            && INSTRUMENTS.some((name) => noteIdToButton(name, id) !== -1))!
        const wide = INSTRUMENTS.find((name) => noteIdToButton(name, stranded) !== -1)!
        const song = new ComposedSong('un-strand by swap', [narrow])
        song.addNoteAt(0, 0, stranded)
        expect(gridRowForNumber(narrow, 'C', stranded).stranded).toBe(true)

        song.setInstrument(0, new InstrumentData({name: wide}))

        expect(song.columns[0].notesOfTrack(0)[0].id).toBe(stranded)
        const after = gridRowForNumber(wide, 'C', stranded)
        expect(after.stranded).toBe(false)
        expect(after.accidental).toBe(0)
    })

    it.runIf(INSTRUMENTS.some((name) =>
        INSTRUMENTS_DATA[name].notes.some((note) => note.pitched && note.sounding !== note.midi)
    ))('an OFF-SCALE strand un-strands onto the tuned button that sounds it, moving to its row', () => {
        //the Lyre -> Vintage-Lyre case the composer smoke pass walks through: a tuned instrument's
        //Sounding Pitch, stored on an untuned track, is not a grid id at all — it draws on the
        //nearest row with a ♯/♭ hint. Swapping the track to the instrument that OWNS that pitch
        //gives it a button, and the note moves to the row that button's nominal id prints.
        const tuned = INSTRUMENTS.find((name) =>
            INSTRUMENTS_DATA[name].notes.some((note) => note.pitched && note.sounding !== note.midi))!
        const reflavored = INSTRUMENTS_DATA[tuned].notes.find(
            (note) => note.pitched && note.sounding !== note.midi
            && !CANONICAL_NOTE_IDS.includes(note.sounding))
        if (!reflavored) return
        const host = INSTRUMENTS.find((name) => noteIdToButton(name, reflavored.sounding) === -1)!
        const before = gridRowForNumber(host, 'C', reflavored.sounding)
        expect(before.stranded).toBe(true)
        expect(before.accidental).not.toBe(0)

        const song = new ComposedSong('off-scale un-strand', [host])
        song.addNoteAt(0, 0, reflavored.sounding)
        song.setInstrument(0, new InstrumentData({name: tuned}))

        //the number is the pitch the file claimed all along, and it survives the swap untouched
        expect(song.columns[0].notesOfTrack(0)[0].id).toBe(reflavored.sounding)
        const after = gridRowForNumber(tuned, 'C', reflavored.sounding)
        expect(after).toEqual({
            row: CANONICAL_NOTE_IDS.indexOf(reflavored.midi),
            stranded: false,
            accidental: 0,
        })
        //...and it left the row it was merely NEAREST to
        expect(after.row).not.toBe(before.row)
    })

    /**
     * NEITHER whole-track rewrite is injective, and setInstrument runs both — so a swap can carry
     * two of a column's notes onto ONE number, and did, silently: the strand pass-through above
     * lands on exactly the numbers the swap moves other notes TO. On genshin it is
     * rewriteForSwap([73, 74], 'Vintage-Lyre', 'Lyre', 'C') === [74, 74].
     *
     * What a surviving duplicate costs: the note double-triggers at playback, findNote/removeNote
     * only ever reach the FIRST of the pair (so the second cannot be selected, deleted or
     * re-spanned), normalizeSpans truncates one of them to a span of 0 against the other — below
     * the span ≥ 1 invariant SongClasses states — and a save/reload merges them away without
     * saying so, which makes the file and the open editor disagree.
     *
     * AT A NON-C BASEPOINT deliberately: the suite's C-only coverage of these rewrites is why this
     * shipped, and the merge must key on the numbers as the song actually stores them.
     */
    describe('and merges the duplicates it creates', () => {
        const BASEPOINT = 'F' as const
        /**
         * Two numbers one track can hold that a swap collapses onto one, derived rather than
         * named: every number any instrument of this build can voice at BASEPOINT, run through
         * every ordered pair of instruments, looking for two inputs with one output. Null on a
         * build whose instruments are all in nominal correspondence (nothing to collide).
         */
        const collision = (() => {
            const offset = basepointOffset(BASEPOINT)
            const numbers = [...new Set(INSTRUMENTS.flatMap((name) =>
                INSTRUMENTS_DATA[name].notes.map((note) => note.sounding + offset)))]
            for (const from of INSTRUMENTS) {
                for (const to of INSTRUMENTS) {
                    if (from === to) continue
                    const after = rewriteForSwap(numbers, from, to, BASEPOINT)
                    for (let i = 0; i < after.length; i++) {
                        for (let j = i + 1; j < after.length; j++) {
                            if (after[i] !== after[j]) continue
                            return {from, to, kept: after[i], numbers: [numbers[i], numbers[j]]}
                        }
                    }
                }
            }
            return null
        })()

        it.runIf(collision !== null)('leaves ONE note where the swap collapsed two', () => {
            const {from, to, kept, numbers} = collision!
            const song = new ComposedSong('swap collision', [from])
            song.pitch = BASEPOINT
            //the longer span goes on the note that is NOT kept as the survivor's identity, so a
            //merge that dropped the wrong one would still be visible
            song.addNoteAt(0, 0, numbers[0], 1)
            song.addNoteAt(0, 0, numbers[1], 3)

            song.setInstrument(0, new InstrumentData({name: to}))

            const notes = song.columns[0].notesOfTrack(0)
            expect(notes).toHaveLength(1)
            expect(notes[0].id).toBe(kept)
            //the merge keeps the longest span, like every other one in this class
            expect(notes[0].span).toBe(3)
            //...and the survivor is the note the editor can reach: with a duplicate behind it,
            //removeNote would take the first and leave the second sounding
            song.removeNoteAt(0, 0, kept)
            expect(song.columns[0].notes).toEqual([])
        })

        it.runIf(collision !== null)('never leaves a span below the invariant behind', () => {
            //normalizeSpans truncates a note's span to the distance to the NEXT same-(track,
            //number) note, so two of them in ONE column used to produce a span of 0 (SongClasses:
            //span ≥ 1). It is the same corruption seen from the pass that would hide it.
            const {from, to, numbers} = collision!
            const song = new ComposedSong('swap collision spans', [from])
            song.pitch = BASEPOINT
            song.addNoteAt(0, 0, numbers[0], 2)
            song.addNoteAt(0, 0, numbers[1], 2)
            song.setInstrument(0, new InstrumentData({name: to}))
            //the pass any later bulk edit (and every reload) runs over the song anyway
            song.normalizeSpans()
            song.columns.forEach((column) => column.notes.forEach((note) => {
                expect(note.span).toBeGreaterThanOrEqual(1)
            }))
        })
    })
})

/**
 * The layer-settings panel's Merge up / Merge down. One logical edit with two halves that have to
 * agree: the notes move onto the destination track, and the emptied slot leaves the roster - so
 * every track above it renumbers, or the survivors address the wrong instrument.
 */
describe('merging a layer folds its notes into another and retires its slot', () => {
    /** The absolute Note Number a button of the default instrument enters at Basepoint C. */
    const numberOf = (button: number) => INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].sounding

    /** Three layers, so there is always a track ABOVE the merged slot left to renumber. */
    const threeLayers = () =>
        new ComposedSong('merge', [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]])

    it('carries the notes over with their Note Numbers untouched', () => {
        const song = threeLayers()
        song.addNoteAt(0, 1, numberOf(3), 2)

        song.mergeTrackInto(1, 0)

        const notes = song.columns[0].notesOfTrack(0)
        expect(notes).toHaveLength(1)
        //ADR-0007: a number is absolute, so the note goes on SOUNDING what it sounded. Remapping it
        //onto the destination's buttons would re-pitch the track behind a prompt that only offered
        //to move it.
        expect(notes[0].id).toBe(numberOf(3))
        expect(notes[0].span).toBe(2)
        //...and the source layer is gone, notes and roster slot together
        expect(song.instruments).toHaveLength(2)
        expect(song.columns[0].notesOfTrack(1)).toEqual([])
    })

    it('a number the destination cannot voice arrives as a Stranded Note, not a rewrite', () => {
        //by capability, never by game id: a layer holding a number no instrument of this build can
        //voice is exactly the case a swap already passes through untouched
        const stranded = Math.max(...INSTRUMENTS.flatMap((name) =>
            INSTRUMENTS_DATA[name].notes.map((note) => note.sounding))) + 1
        const song = new ComposedSong('strand by merge', [INSTRUMENTS[0], INSTRUMENTS[0]])
        song.addNoteAt(0, 1, stranded)

        song.mergeTrackInto(1, 0)

        expect(song.columns[0].notesOfTrack(0)[0].id).toBe(stranded)
        expect(gridRowForNumber(INSTRUMENTS[0], 'C', stranded).stranded).toBe(true)
    })

    it('two notes landing on one (column, number) merge keeping the longest span', () => {
        const song = threeLayers()
        //the longer span is on the INCOMING note, so a merge that kept the wrong one is visible
        song.addNoteAt(0, 0, numberOf(2), 1)
        song.addNoteAt(0, 1, numberOf(2), 4)

        song.mergeTrackInto(1, 0)

        const notes = song.columns[0].notesOfTrack(0)
        expect(notes).toHaveLength(1)
        expect(notes[0].span).toBe(4)
        //...and the survivor is the note the editor can reach: behind a duplicate, removeNote takes
        //the first and leaves the second sounding
        song.removeNoteAt(0, 0, numberOf(2))
        expect(song.columns[0].notes).toEqual([])
    })

    it('a span kept by the merge is truncated where it now runs into a later note', () => {
        const song = new ComposedSong('merge spans', [INSTRUMENTS[0], INSTRUMENTS[0]])
        const number = numberOf(2)
        song.addNoteAt(0, 0, number, 1)
        song.addNoteAt(3, 0, number, 1)
        //longest-span-wins hands column 0 a span of 6, which reaches straight through column 3 -
        //same-number spans on one track never overlap, so the pass has to re-enforce that
        song.addNoteAt(0, 1, number, 6)

        song.mergeTrackInto(1, 0)

        expect(song.columns[0].notesOfTrack(0)[0].span).toBe(3)
        expect(song.columns[3].notesOfTrack(0)).toHaveLength(1)
    })

    it('every track above the removed slot renumbers, roster and notes together', () => {
        const song = threeLayers()
        //the destination is the MIDDLE layer, so the merge leaves a track above it to move down
        song.setInstrument(1, new InstrumentData({name: INSTRUMENTS[0], alias: 'destination'}))
        song.setInstrument(2, new InstrumentData({name: INSTRUMENTS[0], alias: 'above'}))
        song.addNoteAt(0, 0, numberOf(1))
        song.addNoteAt(1, 2, numberOf(5))

        song.mergeTrackInto(0, 1)

        expect(song.instruments.map((instrument) => instrument.alias)).toEqual(['destination', 'above'])
        //the merged notes followed the destination down into slot 0...
        expect(song.columns[0].notesOfTrack(0)[0].id).toBe(numberOf(1))
        //...and the layer that sat above the removed slot came down with its own notes
        expect(song.columns[1].notesOfTrack(1)[0].id).toBe(numberOf(5))
    })

    it('the destination keeps every one of its own settings', () => {
        const song = new ComposedSong('merge settings', [INSTRUMENTS[0], INSTRUMENTS[0]])
        const destination = new InstrumentData({
            name: INSTRUMENTS[0],
            alias: 'keep me',
            volume: 42,
            pitch: 'D',
            icon: 'line',
            muted: true,
            solo: true,
            reverbOverride: true,
            visible: false,
        })
        song.setInstrument(0, destination)
        song.addNoteAt(0, 1, numberOf(4))

        song.mergeTrackInto(1, 0)

        //nothing of the source survives except its notes - not its instrument, and not one of the
        //per-layer settings the panel writes
        expect(song.instruments[0].serialize()).toEqual(destination.serialize())
    })

    it('refuses an index that addresses no layer, and a layer merged into itself', () => {
        const song = threeLayers()
        song.addNoteAt(0, 1, numberOf(2))
        const before = song.serialize()

        song.mergeTrackInto(1, 1)
        song.mergeTrackInto(1, 9)
        song.mergeTrackInto(-1, 0)

        //a merge into itself would otherwise retarget nothing and still delete the layer
        expect(song.serialize()).toEqual(before)
    })
})

/**
 * `breakpoints` holds column INDEXES, so it goes stale the moment the column array shrinks under
 * it. serialize() writes whatever is in the array, and the composer's UI simply never draws a
 * marker it cannot place - so a stale entry is invisible until it is already in IndexedDB, which
 * is why these are model-level tests rather than something the composer is trusted to clean up.
 */
describe('breakpoints only ever address columns that exist', () => {
    it('undo drops the breakpoints the undone (shorter) song has no columns for', () => {
        // the exact reviewer repro: a breakpoint set on a column that only exists in the newer
        // state, then undone back past the columns that carried it. The delta history walks the two
        // Steps in LIFO order (the toggle, then the columns), so the breakpoint array it restores is
        // the one that was live before either
        const song = new ComposedSong('undo')
        song.attachHistory()
        song.addColumns(3, 'end')
        song.toggleBreakpoint(101)
        expect(song.breakpoints).toContain(101)

        song.undo()
        song.undo()

        expect(song.columns.length).toBe(100)
        expect(song.breakpoints).not.toContain(101)
        expect(song.serialize().breakpoints).not.toContain(101)
        // and a later unrelated toggle does not clean it either, which is what made this survive
        song.toggleBreakpoint(5)
        expect(song.serialize().breakpoints.every((breakpoint) => breakpoint < 100)).toBe(true)
    })

    it('deleteColumns cleans up after itself, with no help from the caller', () => {
        // Composer.svelte used to chain validateBreakpoints() onto this call site; every other
        // caller (there are none today, but that is not a guarantee) would have kept the stale one
        const song = new ComposedSong('delete')
        song.toggleBreakpoint(98)
        song.deleteColumns([0, 1, 2])
        expect(song.columns.length).toBe(97)
        expect(song.breakpoints).not.toContain(98)
    })

    it('a hand-edited file cannot import a breakpoint that addresses nothing', () => {
        const song = buildComposedSong()
        const payload = song.serialize()
        // out of range, negative, fractional and non-numeric - none of which any in-app edit can
        // produce, all of which a text editor can
        payload.breakpoints = [0, 3, 500, -1, 2.5, Number.NaN]
        const parsed = ComposedSong.deserialize(payload)
        expect(parsed.breakpoints).toEqual([0, 3])
    })
})

/**
 * THE FIXED BREAKPOINTS - the song's first and last columns - are derived rather than stored, so
 * there is nothing in `breakpoints` for a toggle to add or take away at either index. The model's
 * refusal is what the composer's disabled button reflects; these are the model half.
 */
describe('the first and last columns carry a breakpoint nobody can toggle', () => {
    it('isFixedBreakpoint names the two ends, and only when there is a column to name', () => {
        expect(isFixedBreakpoint(0, 100)).toBe(true)
        expect(isFixedBreakpoint(99, 100)).toBe(true)
        expect(isFixedBreakpoint(50, 100)).toBe(false)
        //a one-column song has ONE of them, not two
        expect(isFixedBreakpoint(0, 1)).toBe(true)
        //...and a song with no columns has none, the same rule the stored ones follow
        expect(isFixedBreakpoint(0, 0)).toBe(false)
    })

    it('withFixedBreakpoints unions, dedupes and sorts', () => {
        expect(withFixedBreakpoints([42, 7], 100)).toEqual([0, 7, 42, 99])
        //the `[0]` every constructor writes coincides with the fixed first one rather than doubling it
        expect(withFixedBreakpoints([0], 100)).toEqual([0, 99])
        expect(withFixedBreakpoints([], 0)).toEqual([])
    })

    it('toggling the first or the last column does nothing at all', () => {
        const song = new ComposedSong('fixed')
        const before = song.breakpoints
        song.toggleBreakpoint(0)
        song.toggleBreakpoint(song.columns.length - 1)
        //the same ARRAY, not merely an equal one: a refused toggle must not publish either
        expect(song.breakpoints).toBe(before)
    })

    it('a stored breakpoint at what becomes the last column can no longer be removed there', () => {
        const song = new ComposedSong('grown')
        song.toggleBreakpoint(42)
        expect(song.breakpoints).toContain(42)
        //shrink the song so 42 IS the last column: the stored entry is now covered by the fixed one
        song.removeColumns(57, 43)
        expect(song.columns.length).toBe(43)
        song.toggleBreakpoint(42)
        expect(song.breakpoints).toContain(42)
        //...and it is removable again the moment the song grows past it
        song.addColumns(10, 'end')
        song.toggleBreakpoint(42)
        expect(song.breakpoints).not.toContain(42)
    })

    it('nothing about them reaches the serialized song', () => {
        const song = new ComposedSong('serialize')
        //exactly the constructor's `[0]`, which is a STORED breakpoint that happens to coincide -
        //the fixed last column at 99 is nowhere in the payload
        expect(song.serialize().breakpoints).toEqual([0])
    })
})

/**
 * The Song Grid row a Note Id renders on, restated from game.json's positional pairing (ADR-0004)
 * rather than read out of songGridSlotForId - the production mapping is half of what is under
 * test here, so the oracle must not be the same function.
 */
function gridRow(id: number): number {
    const slot = CANONICAL_NOTE_IDS.indexOf(id)
    return slot === -1 ? -1 : COMPOSER_NOTE_POSITIONS[slot]
}

/** gridRow's inverse: the Note Id of a Song Grid row, or undefined past either end of the grid. */
function idAtRow(row: number): number | undefined {
    return CANONICAL_NOTE_IDS.find((_, slot) => COMPOSER_NOTE_POSITIONS[slot] === row)
}

/**
 * The game's widest SUB-GRID instrument - one whose own table is narrower than the Song Grid, so
 * its buttons pack against 0 instead of lining up with the grid's rows (genshin's 14-note
 * NightwindHorn, sky's Bells). A SEARCH rather than a name because this file carries no per-game
 * instrument list; widest so it lands on the melodic instrument ADR-0004 was written from rather
 * than on the 8-note drums. Mirrors composerRenderer.test.ts's subGridPair - the two files pin the
 * same defect from the two ends (what the canvas draws, and what this tool moves).
 */
function subGridInstrument(): (typeof INSTRUMENTS)[number] {
    const best = INSTRUMENTS.map((instrument) => ({
        instrument,
        //an id it CAN play whose own button is NOT its canonical slot: the whole disagreement
        misplaced: CANONICAL_NOTE_IDS.some(
            (id, slot) => ![-1, slot].includes(noteIdToButton(instrument, id))
        ),
        width: INSTRUMENTS_DATA[instrument].notes.length,
    }))
        .filter((candidate) => candidate.misplaced)
        //stable, so instruments of equal width keep INSTRUMENTS order and the pick is deterministic
        .sort((a, b) => b.width - a.width)[0]
    if (!best) throw new Error('no instrument in this game has a sub-grid table')
    return best.instrument
}

/**
 * ComposerTools' move-notes-up/down buttons (its `e` and `g` slots) call straight through to
 * moveNotesBy, so the rows it steps through have to be the rows the CANVAS drew - which since
 * ADR-0004 are Song Grid rows: a note's row is its Note Id's canonical slot, its instrument never
 * consulted. While this resolved rows from the note's OWN instrument button instead, it agreed
 * with the canvas only for full-size instruments; on a sub-grid track the packed button index is
 * not the id's grid row, so a note the user could see sitting mid-canvas with empty rows above it
 * either jumped a whole octave band or was deleted as though it were already at the top.
 */
describe('moveNotesBy steps through the Song Grid rows the canvas draws', () => {
    it('moves every note exactly one grid row, identically on a sub-grid and a full-size track', () => {
        const song = new ComposedSong('move all', [INSTRUMENTS[0], subGridInstrument()])
        // one Note Id per grid row, in its own column, doubled onto both tracks - so every row of
        // the grid is exercised and each column's two notes can only differ by their instrument
        CANONICAL_NOTE_IDS.forEach((id, slot) => {
            song.columns[slot].addNote(0, id)
            song.columns[slot].addNote(1, id)
        })

        song.moveNotesBy(CANONICAL_NOTE_IDS.map((_, slot) => slot), 1, 'all')

        CANONICAL_NOTE_IDS.forEach((id, slot) => {
            const landed = idAtRow(gridRow(id) - 1)
            const ids = song.columns[slot].notes.map((note) => note.id)
            //only the top row has nowhere to go; every other note keeps its column, on both tracks
            expect(ids).toEqual(landed === undefined ? [] : [landed, landed])
        })
    })

    it('moves an OFF-SCALE note from the row it draws on, exactly like any other strand', () => {
        //ADR-0007 phase D: an off-scale note is drawn on its NEAREST row, so the tool has to step
        //from that row and not from wherever its raw number would sit. It lands on the target row's
        //own Note Number, which is what un-strands it — the same landing every stranded note gets.
        const instrument = INSTRUMENTS[0]
        const offScale = Math.max(...CANONICAL_NOTE_IDS) + 1
        const placement = gridRowForNumber(instrument, 'C', offScale)
        expect(placement.stranded).toBe(true)
        expect(placement.accidental).not.toBe(0)
        const song = new ComposedSong('move off-scale', [instrument])
        song.columns[0].addNote(0, offScale)

        //DOWN one row: the nearest row is the grid's top, which has nothing above it
        song.moveNotesBy([0], -1, 'all')

        const landed = idAtRow(COMPOSER_NOTE_POSITIONS[placement.row] + 1)!
        expect(song.columns[0].notes.map((note) => note.id)).toEqual([landed])
        expect(gridRowForNumber(instrument, 'C', song.columns[0].notes[0].id))
            .toEqual({row: CANONICAL_NOTE_IDS.indexOf(landed), stranded: false, accidental: 0})
    })

    it('moves a single track without disturbing the others', () => {
        const song = new ComposedSong('move layer', [INSTRUMENTS[0], subGridInstrument()])
        //two notes one row apart, mid-grid: adjacent enough that the per-layer branch's collision
        //merge would fire if they ever landed on the same row
        const middleRow = Math.floor(CANONICAL_NOTE_IDS.length / 2)
        const upper = idAtRow(middleRow - 1)!
        const lower = idAtRow(middleRow)!
        song.columns[0].addNote(1, upper)
        song.columns[0].addNote(1, lower)
        song.columns[0].addNote(0, lower)

        song.moveNotesBy([0], 1, 1)

        expect(song.columns[0].notesOfTrack(1).map((note) => note.id))
            .toEqual([idAtRow(middleRow - 2)!, upper])
        expect(song.columns[0].notesOfTrack(0).map((note) => note.id)).toEqual([lower])
    })
})
