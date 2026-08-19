import {describe, expect, it} from 'vitest'
import {
    CANONICAL_NOTE_IDS,
    COMPOSER_NOTE_POSITIONS,
    ComposedSong,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    RecordedSong,
} from './imports'
import {buildComposedSong} from './builders'
import {expectGolden, readFixture} from './golden'
import {noteIdToButton} from '$core/Songs/noteIds'

// Format-v4 rewrite (2026-08-03): `composed-song.json` is the frozen pre-v4 fixture —
// its `serialized` member is a real v3 file and now serves as the LEGACY INPUT.
// ADR-0007 (2026-08-19) froze `composed-song-v4.json` the same way: its `serialized`
// member is a real v4 file (Nominal Ids, pre-Basepoint) and is now the MIGRATION INPUT
// below; v5 outputs (absolute Note Numbers) live in `composed-song-v5.json`. Neither old
// fixture is ever regenerated.
describe('ComposedSong formats', () => {
    it('v5 serialize / roundtrip / v4 migration / legacy v1+v2+v3 conversion / old-format export are stable', () => {
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
            oldFormatExport: song.toOldFormat(),
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

    it('a converted legacy v3 song reproduces the pre-v4 exports byte-for-byte', () => {
        const legacy = readFixture('composed-song')
        const converted = ComposedSong.deserialize(legacy.serialized)
        // old-format export of the converted song == what the pre-v4 code exported
        expect(JSON.parse(JSON.stringify(converted.toOldFormat())))
            .toEqual(legacy.oldFormatExport)
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
 * `breakpoints` holds column INDEXES, so it goes stale the moment the column array shrinks under
 * it. serialize() writes whatever is in the array, and the composer's UI simply never draws a
 * marker it cannot place - so a stale entry is invisible until it is already in IndexedDB, which
 * is why these are model-level tests rather than something the composer is trusted to clean up.
 */
describe('breakpoints only ever address columns that exist', () => {
    it('undo drops the breakpoints the restored (shorter) song has no columns for', () => {
        // the exact reviewer repro: a breakpoint set on a column that only exists in the newer
        // state, then undone back to the snapshot that predates it
        const song = new ComposedSong('undo')
        const snapshot = song.columns.map((column) => column.clone()) // the 100 constructor columns
        song.addColumns(3, 'end')
        song.toggleBreakpoint(101)
        expect(song.breakpoints).toContain(101)

        song.restoreColumns(snapshot)

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
