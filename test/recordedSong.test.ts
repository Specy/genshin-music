import {describe, expect, it} from 'vitest'
import {INSTRUMENTS, RecordedNote, RecordedSong} from './imports'
import {buildRecordedSong} from './builders'
import {expectGolden, readFixture} from './golden'

// Format-v3 rewrite (2026-08-03): `recorded-song.json` is the frozen pre-v3 fixture —
// its `serialized` member is a real v2 file and now serves as the LEGACY INPUT.
// ADR-0007 (2026-08-19) froze `recorded-song-v3.json` the same way: its `serialized`
// member is a real v3 file (Nominal Ids, pre-Basepoint) and is now the MIGRATION INPUT;
// v4 outputs (absolute Note Numbers) live in `recorded-song-v4.json`. Neither old fixture
// is ever regenerated.
describe('RecordedSong formats', () => {
    // No `oldFormatExport` member any more: that export was retired at ADR-0007 phase E (kept
    // commented in RecordedSong), so the golden lost the key with its producer. Old-format
    // IMPORT is unaffected — the legacy v1/v2 rows below and test/oldFormatImport.test.ts.
    it('v4 serialize / roundtrip / v3 migration / legacy v1+v2 conversion are stable', () => {
        const legacy = readFixture('recorded-song')
        const song = buildRecordedSong()
        const serialized = song.serialize()

        // v1 legacy: version omitted, notes as [index, time] pairs (layer defaults to 1)
        const v1Payload = {
            name: 'Legacy v1', bpm: 220, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: serialized.data.appName},
            notes: [[0, 100], [5, 400]],
        }

        expectGolden('recorded-song-v4', {
            serialized,
            roundtrip: RecordedSong.deserialize(serialized).serialize(),
            fromV3: RecordedSong.deserialize(readFixture('recorded-song-v3').serialized).serialize(),
            fromLegacyV1: RecordedSong.deserialize(v1Payload as any).serialize(),
            fromLegacyV2: RecordedSong.deserialize(legacy.serialized).serialize(),
        })
    })

    /** See the composed twin: the builders describe a song as the migration of the committed v3 one. */
    it('a v3 file migrates to exactly the song the builder describes', () => {
        const migrated = RecordedSong.deserialize(readFixture('recorded-song-v3').serialized)
        expect(JSON.parse(JSON.stringify(migrated.serialize())))
            .toEqual(JSON.parse(JSON.stringify(buildRecordedSong().serialize())))
    })

    it('converts durations to spans only after laying out the composed tempo grid', () => {
        const recorded = new RecordedSong('held', [
            new RecordedNote(60, 0, 1900, 0),
            new RecordedNote(62, 2000, 3000, 0),
        ], [INSTRUMENTS[0]])
        recorded.bpm = 60
        const composed = recorded.toComposedSong(4)
        const first = composed.columns.flatMap(column => column.notes).find(note => note.id === 60)!
        const second = composed.columns.flatMap(column => column.notes).find(note => note.id === 62)!
        expect(first.span).toBe(1) // only one complete 1000ms column fits in 1900ms
        expect(second.span).toBe(3)
    })

    // The pre-v3 old-format export round-trip that used to close this file went with the
    // exporter itself (ADR-0007 phase E). `recorded-song.json`'s `oldFormatExport` member stays
    // in the frozen fixture as the record of what that exporter emitted; nothing reads it.
})
