import {Buffer} from 'node:buffer'
import {describe, it} from 'vitest'
import {APP_NAME, songService} from './imports'
import {buildComposedSong, buildRecordedSong} from './builders'
import {expectGolden} from './golden'

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

describe('cross-game import conversion (Genshin build only)', () => {
    it.runIf(APP_NAME === 'Genshin')('Sky composed song converts via parseSong', () => {
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD)))
        expectGolden('conversion', {
            skyComposedToGenshin: parsed.serialize(),
        })
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
