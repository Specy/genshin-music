import {describe, it} from 'vitest'
import {ComposedSong, INSTRUMENTS} from './imports'
import {buildComposedSong} from './builders'
import {expectGolden} from './golden'

describe('ComposedSong formats', () => {
    it('serialize v3 / roundtrip / legacy v1+v2 / old-format export are stable', () => {
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
        // v2: columns in current format, instruments still a name array
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

        expectGolden('composed-song', {
            serialized,
            roundtrip: ComposedSong.deserialize(serialized).serialize(),
            deserializedV1: ComposedSong.deserialize(v1Payload as any).serialize(),
            deserializedV2: ComposedSong.deserialize(v2Payload as any).serialize(),
            oldFormatExport: song.toOldFormat(),
            toRecorded: song.toRecordedSong().serialize(),
        })
    })
})
