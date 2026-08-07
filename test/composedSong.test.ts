import {describe, expect, it} from 'vitest'
import {ComposedSong, INSTRUMENTS, RecordedSong} from './imports'
import {buildComposedSong} from './builders'
import {expectGolden, readFixture} from './golden'

// Format-v4 rewrite (2026-08-03): `composed-song.json` is the frozen pre-v4 fixture —
// its `serialized` member is a real v3 file and now serves as the LEGACY INPUT; the
// v4 outputs live in `composed-song-v4.json`. The old fixture is never regenerated.
describe('ComposedSong formats', () => {
    it('v4 serialize / roundtrip / legacy v1+v2+v3 conversion / old-format export are stable', () => {
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

        expectGolden('composed-song-v4', {
            serialized,
            roundtrip: ComposedSong.deserialize(serialized).serialize(),
            fromLegacyV1: ComposedSong.deserialize(v1Payload as any).serialize(),
            fromLegacyV2: ComposedSong.deserialize(v2Payload as any).serialize(),
            fromLegacyV3: ComposedSong.deserialize(legacy.serialized).serialize(),
            oldFormatExport: song.toOldFormat(),
            toRecorded: song.toRecordedSong().serialize(),
        })
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
        // was corrected to `true` in the same change.)
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
