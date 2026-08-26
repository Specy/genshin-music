import {Buffer} from 'node:buffer'
import {describe, expect, it} from 'vitest'
import {
    APP_NAME, ComposedSong, convertedSongLostNotes, INSTRUMENTS, INSTRUMENTS_DATA,
    LEGACY_NOTE_TABLES, RecordedSong, songService, VsrgSong,
} from './imports'
import {numberToButton} from '../src/lib/core/Songs/noteIds'
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

describe('cross-game import conversion', () => {
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

    // NEW-format (v4/v3/vsrg-v2) cross-game path: toOtherGame — the similar-instrument roster
    // swap and NOTHING else since ADR-0011. This is the branch the legacy payloads above never
    // reach.
    //
    // FIXTURE NOTE: `new-format-conversion.json` was regenerated with ADR-0011. It is a living
    // fixture (it pins what the current build produces from this conversion) and the decision
    // that moved it is the ADR itself: the fold that used to rewrite id 84 to 72 and truncate
    // its span is gone, so the recorded output now holds the file's own numbers.
    it.runIf(APP_NAME === 'Genshin')('Sky v4 composed song converts via toOtherGame (similarity roster, numbers untouched)', () => {
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
                //id 84 (Sky top C) held 5 columns + a plain id 72 at column 2. Genshin's Lyre
                //has no 84: the note used to fold onto 72 and truncate its span before the
                //column-2 note — now it keeps both its number and its span, and strands.
                {instrument: skyInstrument('Harp'), notes: [[0, 84, 5], [2, 72]]},
                {instrument: skyInstrument('Bells'), notes: [[1, 79]]},
            ],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as ComposedSong
        //similar-instrument roster swap (settings preserved, name swapped)
        expect(parsed.instruments[0].name).toBe('Lyre')
        expect(parsed.instruments[1].name).toBe('HarmonicKey')
        expect(parsed.data.appName).toBe('Genshin')
        //no fold: 84 is still 84, still held over all 5 columns, and 72 is untouched beneath it
        const held = parsed.columns[0].findNote(0, 84)!
        expect(held.span).toBe(5)
        expect(parsed.columns[0].findNote(0, 72)).toBe(null)
        expect(parsed.columns[2].findNote(0, 72)).toBeTruthy()
        //...and 84 is exactly the note the import warning is about
        expect(numberToButton('Lyre', 'C', 84)).toBe(-1)
        expect(parsed.countStrandedNotes()).toBe(1)
        expectGolden('new-format-conversion', parsed.serialize())
    })

    it.runIf(APP_NAME === 'Genshin')('Sky v3 recorded conversion keeps both notes where the fold used to merge them', () => {
        const payload = {
            id: null, folderId: null, name: 'Sky v3 import', type: 'recorded', version: 3,
            bpm: 220, pitch: 'C', reverb: false,
            data: {isComposed: false, isComposedVersion: false, appName: 'Sky'},
            tracks: [{
                instrument: {
                    name: 'Harp', volume: 100, pitch: '', visible: true,
                    icon: 'circle', alias: '', muted: false, reverbOverride: null,
                },
                //same timestamp: a tap on 72 and a 2s hold on 84. 84 used to fold onto 72 and
                //the two used to merge into one note; both now survive as themselves.
                notes: [[72, 1000], [84, 1000, 2000]],
            }],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as RecordedSong
        expect(parsed.instruments[0].name).toBe('Lyre')
        const notesAt1000 = parsed.notes.filter(n => n.time === 1000)
        expect(notesAt1000.map(n => [n.id, n.duration]).sort((a, b) => a[0] - b[0]))
            .toEqual([[72, 0], [84, 2000]])
        //the hold is the stranded one — Lyre tops out at 83
        expect(parsed.countStrandedNotes()).toBe(1)
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

    // ─── The other direction, unreachable before ADR-0011 (the Sky build used to throw
    // "it's not a Sky song" at the door). These run only in the Sky build for the same reason
    // the ones above run only in Genshin's: toOtherGame converts into the RUNNING game.

    it.runIf(APP_NAME === 'Sky')('Genshin v5 composed song converts via toOtherGame (similarity roster, numbers untouched)', () => {
        const genshinInstrument = (name: string) => ({
            name, volume: 100, pitch: '', visible: true,
            icon: 'circle', alias: '', muted: false, reverbOverride: null,
        })
        const payload = {
            id: null, folderId: null, name: 'Genshin v5 import', type: 'composed', version: 5,
            bpm: 220, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName: 'Genshin'},
            reverb: false, breakpoints: [0],
            columnTempos: [0, 0, 0],
            tracks: [
                //48 is Lyre's bottom C — and since Harp registers at "C3" (meta.json `register`)
                //it is Harp's OWN bottom C, so the untouched number simply plays where the pre-shift
                //config stranded it. 79, Lyre's top G, sits above Harp's C5 ceiling and strands.
                {instrument: genshinInstrument('Lyre'), notes: [[0, 48, 3], [1, 72], [2, 79]]},
                {instrument: genshinInstrument('HarmonicKey'), notes: [[2, 79]]},
            ],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as ComposedSong
        //SIMILAR_INSTRUMENTS.Genshin: Lyre → Harp, HarmonicKey → Piano
        expect(parsed.instruments[0].name).toBe('Harp')
        expect(parsed.instruments[1].name).toBe('Piano')
        expect(parsed.data.appName).toBe('Sky')
        //numbers and spans pass through untouched
        expect(parsed.columns[0].findNote(0, 48)!.span).toBe(3)
        expect(parsed.columns[1].findNote(0, 72)).toBeTruthy()
        expect(parsed.columns[2].findNote(0, 79)).toBeTruthy()
        expect(parsed.columns[2].findNote(1, 79)).toBeTruthy()
        //79 is stranded on Harp but voiced on Piano in the same column; 48/72 land on Harp's
        //real register — the count is what raises the import warning
        expect(numberToButton('Harp', 'C', 48)).not.toBe(-1)
        expect(numberToButton('Harp', 'C', 79)).toBe(-1)
        expect(numberToButton('Piano', 'C', 79)).not.toBe(-1)
        expect(parsed.countStrandedNotes()).toBe(1)
    })

    it.runIf(APP_NAME === 'Sky')('Genshin legacy composed song converts through the frozen tables', () => {
        //v3 legacy: notes are Genshin BUTTON INDICES, so they cannot pass through — they are
        //remapped by Sky's frozen Genshin column, the exact inverse of the historic -12 that
        //Sky → Genshin has always applied. Genshin index 7 is id 60 → Sky index 7 → id 72,
        //index 14 is id 48 → Sky index 0 → id 60; index 1 (id 74) has no Sky slot and drops.
        const payload = {
            id: null, folderId: null, name: 'Genshin legacy import', type: 'composed', version: 3,
            bpm: 240, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName: 'Genshin'},
            reverb: false, breakpoints: [0],
            instruments: [{
                name: 'Lyre', volume: 100, pitch: '', visible: true,
                icon: 'border', alias: '', muted: false, reverbOverride: null,
            }],
            columns: [[0, [[7, '1'], [14, '1']]], [1, [[1, '1']]]],
        }
        const parsed = songService.parseSong(JSON.parse(JSON.stringify(payload))) as ComposedSong
        expect(parsed.data.appName).toBe('Sky')
        //the legacy path resets the roster to the target's default instrument
        expect(parsed.instruments[0].name).toBe('Piano')
        expect(parsed.columns[0].notes.map(n => n.id).sort((a, b) => a - b)).toEqual([60, 72])
        expect(parsed.columns[1].notes).toEqual([])
        //everything that SURVIVED the remap landed on a button of the target instrument — the
        //dropped note is not stranded, it is gone, which is why the import warning cannot read
        //countStrandedNotes alone
        expect(parsed.countStrandedNotes()).toBe(0)
        expect(parsed.legacyDroppedNotes).toBe(1)
        expect(convertedSongLostNotes(parsed)).toBe(true)
    })

    it.runIf(APP_NAME === 'Sky')('a Genshin legacy song losing its top octave trips the import warning', () => {
        //Genshin's legacy indices 1-6 (ids 74..83) have no Sky button at all: all six drop, and
        //nothing about the resulting song says so except legacyDroppedNotes.
        const track = {
            name: 'Lyre', volume: 100, pitch: '', visible: true,
            icon: 'border', alias: '', muted: false, reverbOverride: null,
        }
        const columns = [[0, [[1, '1'], [2, '1'], [3, '1'], [4, '1'], [5, '1'], [6, '1']]]]
        const composed = songService.parseSong({
            id: null, folderId: null, name: 'Genshin top octave', type: 'composed', version: 3,
            bpm: 240, pitch: 'C',
            data: {isComposed: true, isComposedVersion: true, appName: 'Genshin'},
            reverb: false, breakpoints: [0], instruments: [track], columns,
        }) as ComposedSong
        expect(composed.columns[0].notes).toEqual([])
        expect(composed.countStrandedNotes()).toBe(0)
        expect(composed.legacyDroppedNotes).toBe(6)
        expect(convertedSongLostNotes(composed)).toBe(true)

        //same for the recorded decoder, whose drop site is its own
        const recorded = songService.parseSong({
            id: null, folderId: null, name: 'Genshin top octave rec', type: 'recorded', version: 2,
            bpm: 240, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: 'Genshin'},
            instruments: [track],
            notes: [[1, 0, '1'], [7, 100, '1']],
        }) as RecordedSong
        expect(recorded.notes.length).toBe(1)
        expect(recorded.legacyDroppedNotes).toBe(1)
        expect(convertedSongLostNotes(recorded)).toBe(true)
    })

    it.runIf(APP_NAME === 'Sky')('a legacy index the TARGET instrument has no button for counts as lost too', () => {
        //the second legacy drop site: the index survives importPositions but falls off the end of
        //the decoding table. The recorded decoder keeps the SOURCE game's instrument names, so a
        //Genshin DunDun track decodes against SKY's 8-button DunDun: Genshin indices 8 and 9 remap
        //to Sky 8 and 9, past that table's end, and are gone with nothing left to strand.
        const recorded = songService.parseSong({
            id: null, folderId: null, name: 'Genshin drums rec', type: 'recorded', version: 2,
            bpm: 240, pitch: 'C',
            data: {isComposed: false, isComposedVersion: false, appName: 'Genshin'},
            instruments: [{
                name: 'DunDun', volume: 100, pitch: '', visible: true,
                icon: 'border', alias: '', muted: false, reverbOverride: null,
            }],
            notes: [[7, 0, '1'], [8, 100, '1'], [9, 200, '1'], [14, 300, '1']],
        }) as RecordedSong
        expect(recorded.notes.map(n => n.id)).toEqual([72, 60])
        expect(recorded.countStrandedNotes()).toBe(0)
        expect(recorded.legacyDroppedNotes).toBe(2)
        expect(convertedSongLostNotes(recorded)).toBe(true)

        //the vsrg decoder reaches the same site by forcing every track onto DunDun
        const vsrg = songService.parseSong({
            ...JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD)),
            name: 'Genshin vsrg legacy',
            version: 1,
            data: {isComposed: false, isComposedVersion: false, appName: 'Genshin'},
            tracks: [{
                ...JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD.tracks[0])),
                hitObjects: [[0, 500, 0, [7, 8, 14]]],
            }],
        }) as VsrgSong
        expect(vsrg.tracks[0].instrument.name).toBe('DunDun')
        expect(vsrg.tracks[0].hitObjects[0].notes).toEqual([72, 60])
        expect(vsrg.countStrandedNotes()).toBe(0)
        expect(vsrg.legacyDroppedNotes).toBe(1)
        expect(convertedSongLostNotes(vsrg)).toBe(true)
    })

    it.runIf(APP_NAME === 'Sky')('Genshin vsrg v2 converts via toOtherGame and leaves its notes alone', () => {
        const payload = {
            ...JSON.parse(JSON.stringify(SKY_VSRG_PAYLOAD)),
            name: 'Genshin vsrg import',
            version: 2,
        }
        payload.data.appName = 'Genshin'
        payload.tracks[0].instrument.name = 'Lyre'
        //48 lands on Harp's register-shifted bottom C; 79 sits above its C5 ceiling and strands
        payload.tracks[0].hitObjects = [[0, 500, 0, [48, 79]]]
        const parsed = songService.parseSong(payload) as VsrgSong
        expect(parsed.tracks[0].instrument.name).toBe('Harp')
        expect(parsed.data.appName).toBe('Sky')
        expect(parsed.tracks[0].hitObjects[0].notes).toEqual([48, 79])
        expect(parsed.countStrandedNotes()).toBe(1)
    })

    // Build-agnostic: the rule itself, not either direction of it.
    it('a song with no appName, or an unrecognised one, is read as the running game', () => {
        //`data.appName` comes off an untrusted file. Treating "absent" or "unknown" as foreign
        //would convert a same-game song: findSimilarInstrument answers null for an unknown
        //source and every track would collapse onto the first instrument of the roster.
        const base = JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD))
        base.data.appName = APP_NAME
        base.version = 5
        base.columnTempos = [0, 0]
        base.tracks = [{instrument: base.instruments[0], notes: [[0, 72]]}]
        base.instruments[0].name = LEGACY_NOTE_TABLES[APP_NAME].defaultInstrument
        delete base.columns

        for (const appName of [undefined, 'SomeOtherGame']) {
            const payload = JSON.parse(JSON.stringify(base))
            if (appName === undefined) delete payload.data.appName
            else payload.data.appName = appName
            const parsed = songService.parseSong(payload) as ComposedSong
            expect(parsed.instruments[0].name).toBe(base.instruments[0].name)
            expect(parsed.columns[0].findNote(0, 72)).toBeTruthy()
        }
    })
})

describe('MIDI export', () => {
    it('.mid binary output is stable', () => {
        const composed = buildComposedSong()
        const recorded = buildRecordedSong()
        // These are exactly the Phase-C configs whose former midiName was not in General MIDI,
        // selected by roster membership rather than game id. Give every one its own track so both
        // per-game byte goldens actually cover the corrected program-change events.
        const correctedNames = [
            'HarmonicKey',
            'LeapingSpiritPiano',
            'SFX_BassSynth',
            'SFX_ChimeSynth',
            'SFX_SineSynth',
            'SFX_TR-909',
        ].filter((name) => INSTRUMENTS.includes(name))
        expect(correctedNames.length).toBeGreaterThan(0)
        const correctedPrograms = new ComposedSong('Corrected MIDI programs', correctedNames)
        correctedNames.forEach((name, trackIndex) => {
            const instrument = INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA]
            correctedPrograms.columns[0].addNote(trackIndex, instrument.notes[0].sounding)
        })
        const correctedProgramsMidi = correctedPrograms.toMidi()
        expect(correctedProgramsMidi.tracks.map((track) => track.instrument.name)).toEqual(
            correctedNames.map(
                (name) => INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA].midiName
            )
        )
        expectGolden('midi-export', {
            composedMidiBase64: Buffer.from(composed.toMidi().toArray()).toString('base64'),
            recordedMidiBase64: Buffer.from(recorded.toMidi().toArray()).toString('base64'),
            correctedProgramsMidiBase64: Buffer.from(correctedProgramsMidi.toArray()).toString(
                'base64'
            ),
        })
    })
})
