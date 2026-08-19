import {Buffer} from 'node:buffer'
import {describe, expect, it} from 'vitest'
import {APP_NAME, ComposedSong, RecordedSong, songService, VsrgSong} from './imports'
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
        expectGolden('conversion-v5', {
            skyComposedToGenshin: parsed.serialize(),
        })
        const preV4Output = readFixture('conversion').skyComposedToGenshin
        expect(JSON.parse(JSON.stringify(ComposedSong.deserialize(preV4Output).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
        //ADR-0007: and the same against the PRE-FLIP v4 record of this conversion
        const preFlipOutput = readFixture('conversion-v4').skyComposedToGenshin
        expect(JSON.parse(JSON.stringify(ComposedSong.deserialize(preFlipOutput).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
    })

    it.runIf(APP_NAME === 'Genshin')('Sky vsrg song converts via parseSong', () => {
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD)))
        expectGolden('vsrg-conversion-v3', parsed.serialize())
        const preV2Output = readFixture('vsrg-conversion')
        expect(JSON.parse(JSON.stringify(VsrgSong.deserialize(preV2Output).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
        //ADR-0007: and the same against the PRE-FLIP v2 record of this conversion
        expect(JSON.parse(JSON.stringify(VsrgSong.deserialize(readFixture('vsrg-conversion-v2')).serialize())))
            .toEqual(JSON.parse(JSON.stringify(parsed.serialize())))
    })

    // NEW-format (v4/v3/vsrg-v2) cross-game path: toOtherGame — similar-instrument roster
    // swap + octave-fold + invariant re-enforcement. This is the branch the legacy payloads
    // above never reach.
    it.runIf(APP_NAME === 'Genshin')('Sky v4 composed song converts via toOtherGame (similarity roster, fold, span invariant)', () => {
        const skyInstrument = (name: string) => ({
            name, volume: 100, pitch: '', visible: true,
            icon: 'circle', alias: '', muted: false, reverbOverride: null,
        })
        const payload = {
            id: null, folderId: null, name: 'Sky v4 import', type: 'composed', version: 4,
            bpm: 220, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName: 'Sky'},
            reverb: false, breakpoints: [0],
            columnTempos: [0, 0, 0, 0, 0, 0],
            tracks: [
                //id 84 (Sky top C) held 5 columns + a plain id 72 at column 2: the fold
                //lands 84 on 72, and the span must truncate before the column-2 note
                {instrument: skyInstrument('Harp'), notes: [[0, 84, 5], [2, 72]]},
                {instrument: skyInstrument('Bells'), notes: [[1, 79]]},
            ],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as ComposedSong
        //similar-instrument roster swap (settings preserved, name swapped)
        expect(parsed.instruments[0].name).toBe('Lyre')
        expect(parsed.instruments[1].name).toBe('HarmonicKey')
        expect(parsed.data.appName).toBe('Genshin')
        //84 folded into Lyre's range → 72; collision-free here, span truncated at column 2
        const held = parsed.columns[0].findNote(0, 72)!
        expect(held.span).toBe(2)
        expect(parsed.columns[2].findNote(0, 72)).toBeTruthy()
        expectGolden('new-format-conversion', parsed.serialize())
    })

    it.runIf(APP_NAME === 'Genshin')('Sky v3 recorded fold collisions keep the longest duration', () => {
        const payload = {
            id: null, folderId: null, name: 'Sky v3 import', type: 'recorded', version: 3,
            bpm: 220, pitch: 'C', reverb: false,
            data: {isComposed: false, isComposedVersion: false, appName: 'Sky'},
            tracks: [{
                instrument: {
                    name: 'Harp', volume: 100, pitch: '', visible: true,
                    icon: 'circle', alias: '', muted: false, reverbOverride: null,
                },
                //same timestamp: a tap on 72 and a 2s hold on 84 (folds onto 72) —
                //the merged note must keep the hold, not become a tap
                notes: [[72, 1000], [84, 1000, 2000]],
            }],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as RecordedSong
        expect(parsed.instruments[0].name).toBe('Lyre')
        const notesAt1000 = parsed.notes.filter(n => n.time === 1000)
        expect(notesAt1000.length).toBe(1)
        expect(notesAt1000[0].id).toBe(72)
        expect(notesAt1000[0].duration).toBe(2000)
    })

    it.runIf(APP_NAME === 'Genshin')('Sky vsrg v2 converts via toOtherGame and rewrites appName', () => {
        const payload = {
            ...JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD)),
            version: 2,
        }
        //v2 hit objects hold ids already
        payload.tracks[0].instrument.name = 'Bells'
        payload.tracks[0].hitObjects = [[0, 500, 0, [60, 79]]]
        const parsed = songService.parseSong(payload) as VsrgSong
        expect(parsed.tracks[0].instrument.name).toBe('HarmonicKey')
        //unlike the legacy quirk, the new-format path rewrites appName (converts once)
        expect(parsed.data.appName).toBe('Genshin')
        expect(parsed.tracks[0].hitObjects[0].notes).toEqual([60, 79])
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
