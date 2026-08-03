import {describe, expect, it} from 'vitest'
import {RecordedSong} from './imports'
import {buildRecordedSong} from './builders'
import {expectGolden, readFixture} from './golden'

// Format-v3 rewrite (2026-08-03): `recorded-song.json` is the frozen pre-v3 fixture —
// its `serialized` member is a real v2 file and now serves as the LEGACY INPUT; the
// v3 outputs live in `recorded-song-v3.json`. The old fixture is never regenerated.
describe('RecordedSong formats', () => {
    it('v3 serialize / roundtrip / legacy v1+v2 conversion / old-format export are stable', () => {
        const legacy = readFixture('recorded-song')
        const song = buildRecordedSong()
        const serialized = song.serialize()

        // v1 legacy: version omitted, notes as [index, time] pairs (layer defaults to 1)
        const v1Payload = {
            name: 'Legacy v1', bpm: 220, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: serialized.data.appName},
            notes: [[0, 100], [5, 400]],
        }

        expectGolden('recorded-song-v3', {
            serialized,
            roundtrip: RecordedSong.deserialize(serialized).serialize(),
            fromLegacyV1: RecordedSong.deserialize(v1Payload as any).serialize(),
            fromLegacyV2: RecordedSong.deserialize(legacy.serialized).serialize(),
            oldFormatExport: song.toOldFormat(),
        })
    })

    it('a converted legacy v2 song reproduces the pre-v3 old-format export byte-for-byte', () => {
        const legacy = readFixture('recorded-song')
        const converted = RecordedSong.deserialize(legacy.serialized)
        expect(JSON.parse(JSON.stringify(converted.toOldFormat())))
            .toEqual(legacy.oldFormatExport)
    })
})
