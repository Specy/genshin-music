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
        // equals flattening pre-v4 (the committed v2 recorded) then converting
        expect(JSON.parse(JSON.stringify(converted.toRecordedSong().serialize())))
            .toEqual(JSON.parse(JSON.stringify(RecordedSong.deserialize(legacy.toRecorded).serialize())))
    })
})
