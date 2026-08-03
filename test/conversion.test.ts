import {Buffer} from 'node:buffer'
import {describe, expect, it} from 'vitest'
import {APP_NAME, ComposedSong, songService, VsrgSong} from './imports'
import {buildComposedSong, buildRecordedSong} from './builders'
import {expectGolden, readFixture} from './golden'

// A serialized Sky composed song, crafted as the SKY build would emit it.
// Kept inline (not built via classes) so the Genshin run has a Sky payload to import.
const SKY_COMPOSED_PAYLOAD = {
    id: null, folderId: null, name: 'Sky import', type: 'composed', version: 3,
    bpm: 240, pitch: 'C',
    data: {isComposed: true, isComposedVersion: true, appName: 'Sky'},
    reverb: false, breakpoints: [0],
    instruments: [{
        name: 'Piano', volume: 100, pitch: '', visible: true,
        icon: 'border', alias: '', muted: false, reverbOverride: null,
    }],
    columns: [[0, [[0, '1'], [7, '1']]], [1, [[14, '1']]]],
}

// A serialized Sky vsrg song, crafted to match SerializedVsrgSong / VsrgSong.deserialize
// (src/lib/Songs/VsrgSong.ts). Two hitObjects ([index, timestamp, holdDuration, notes])
// carry notes arrays with values that VsrgSong.toGenshin() (VsrgSong.ts:85-94) remaps
// through IMPORT_NOTE_POSITIONS; toGenshin also forces every track's instrument to "DunDun".
const SKY_VSRG_PAYLOAD = {
    id: null, folderId: null, name: 'Sky vsrg import', type: 'vsrg', version: 1,
    bpm: 140, pitch: 'C',
    data: {isComposed: false, isComposedVersion: false, appName: 'Sky'},
    instruments: [],
    keys: 4,
    duration: 5000,
    audioSongId: null,
    breakpoints: [],
    difficulty: 5,
    snapPoint: 1,
    trackModifiers: [],
    tracks: [
        {
            instrument: {
                name: 'Piano', volume: 100, pitch: '', visible: true,
                icon: 'border', alias: '', muted: false, reverbOverride: null,
            },
            color: '#FFFFFF',
            hitObjects: [
                [0, 500, 0, [0, 5]],
                [2, 1200, 300, [10]],
            ],
        },
    ],
}

describe('cross-game import conversion (Genshin build only)', () => {
    // Format-v4 rewrite (2026-08-03): `conversion.json` / `vsrg-conversion.json` hold the
    // PRE-v4 converter's output (legacy Genshin serializations) and now serve as parity
    // references: converting them through the new deserializers must equal converting the
    // original Sky payloads directly — proof the historic cross-game remap is reproduced.
    it.runIf(APP_NAME === 'Genshin')('Sky composed song converts via parseSong', () => {
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD)))
        expectGolden('conversion-v4', {
            skyComposedToGenshin: parsed.serialize(),
        })
        const preV4Output = readFixture('conversion').skyComposedToGenshin
        expect(JSON.parse(JSON.stringify(ComposedSong.deserialize(preV4Output).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
    })

    it.runIf(APP_NAME === 'Genshin')('Sky vsrg song converts via parseSong', () => {
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD)))
        expectGolden('vsrg-conversion-v2', parsed.serialize())
        const preV2Output = readFixture('vsrg-conversion')
        expect(JSON.parse(JSON.stringify(VsrgSong.deserialize(preV2Output).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
    })

    it.runIf(APP_NAME === 'Sky')('Genshin song is rejected by the Sky build', () => {
        const genshinPayload = JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD))
        genshinPayload.data.appName = 'Genshin'
        let threw = false
        try {
            songService.parseSong(genshinPayload)
        } catch {
            threw = true
        }
        if (!threw) throw new Error('Expected Sky build to reject a Genshin song')
    })
})

describe('MIDI export', () => {
    it('.mid binary output is stable', () => {
        const composed = buildComposedSong()
        const recorded = buildRecordedSong()
        expectGolden('midi-export', {
            composedMidiBase64: Buffer.from(composed.toMidi().toArray()).toString('base64'),
            recordedMidiBase64: Buffer.from(recorded.toMidi().toArray()).toString('base64'),
        })
    })
})
