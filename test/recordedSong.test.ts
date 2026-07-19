import {describe, it} from 'vitest'
import {RecordedSong} from './imports'
import {buildRecordedSong} from './builders'
import {expectGolden} from './golden'

describe('RecordedSong formats', () => {
    it('serialize / deserialize / legacy v1 / old-format export are stable', () => {
        const song = buildRecordedSong()
        const serialized = song.serialize()

        // v1 legacy: version omitted, notes as [index, time] pairs (layer defaults to 1)
        const v1Payload = {
            name: 'Legacy v1', bpm: 220, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: serialized.data.appName},
            notes: [[0, 100], [5, 400]],
        }

        expectGolden('recorded-song', {
            serialized,
            roundtrip: RecordedSong.deserialize(serialized).serialize(),
            deserializedV1: RecordedSong.deserialize(v1Payload as any).serialize(),
            oldFormatExport: song.toOldFormat(),
        })
    })
})
