// The app metadata carried in an exported .mid.
//
// The load-bearing test in here is "carries nothing musical". The scope rule is not a style
// preference: re-importing our own export has to run the same derivation a foreign MIDI runs,
// because that is the only regular exercise the foreign-file importer gets. The moment tempo,
// placement or note lengths can be read out of the blob instead, that path stops being tested
// by real use and is free to rot. So the assertion below is a guard on the design, not on the
// serializer.
import {describe, expect, it} from 'vitest'
import {APP_NAME, INSTRUMENTS} from './imports'
import {ComposedSong} from '../src/lib/core/Songs/ComposedSong.svelte'
import {InstrumentData, NoteColumn} from '../src/lib/core/Songs/SongClasses'
import {Midi} from '../src/lib/core/Songs/midiConstructor'
import {decodeMidiMetadata, encodeMidiMetadata} from '../src/lib/core/Songs/midiMetadata'

function songWithLayers(): ComposedSong {
    const song = new ComposedSong('meta', [INSTRUMENTS[0], INSTRUMENTS[1] ?? INSTRUMENTS[0]])
    song.bpm = 220
    song.reverb = true
    song.pitch = 'D'
    song.instruments[0].volume = 42
    song.instruments[0].alias = 'lead'
    song.instruments[1].muted = true
    const column = new NoteColumn()
    column.notes = [{trackIndex: 0, id: 60, span: 1}]
    const second = new NoteColumn()
    second.notes = [{trackIndex: 1, id: 64, span: 1}]
    song.initColumnsForConstruction([column, second])
    return song
}

/** Metadata as it survives a real serialize / re-parse. */
function throughFile(song: ComposedSong) {
    const midi = new Midi(new Uint8Array(song.toMidi().toArray()).buffer as ArrayBuffer)
    return {midi, metadata: decodeMidiMetadata(midi.header.meta ?? [])}
}

describe('midi metadata', () => {
    it('survives a real file round trip', () => {
        const {metadata} = throughFile(songWithLayers())
        expect(metadata).not.toBeNull()
        expect(metadata!.instruments.map(i => i.name)).toEqual([
            INSTRUMENTS[0],
            INSTRUMENTS[1] ?? INSTRUMENTS[0],
        ])
        expect(metadata!.instruments[0].volume).toBe(42)
        expect(metadata!.instruments[0].alias).toBe('lead')
        expect(metadata!.instruments[1].muted).toBe(true)
        expect(metadata!.reverb).toBe(true)
        expect(metadata!.pitch).toBe('D')
    })

    it('carries nothing musical', () => {
        //THE scope rule. Notes, timing, note lengths, tempo and tempo changers are MIDI's job;
        //if any of them appear here, re-importing our own export stops exercising the code a
        //foreign file goes through.
        //`kind` is the one label beside the instruments: which song MODEL to rebuild, nothing it plays
        const song = songWithLayers()
        const text = encodeMidiMetadata({instruments: song.instruments, pitch: song.pitch, reverb: song.reverb, kind: 'composed'})
        const payload = JSON.parse(text.slice(text.indexOf(':') + 1))
        expect(Object.keys(payload).sort()).toEqual(['app', 'instruments', 'kind', 'pitch', 'reverb', 'v'])
        for (const forbidden of ['bpm', 'tempo', 'tempoChangers', 'columns', 'notes', 'spans', 'duration']) {
            expect(JSON.stringify(payload)).not.toContain(forbidden)
        }
    })

    it('leaves the musical content of the file untouched', () => {
        //adding a text event must not disturb a single note or time
        const song = songWithLayers()
        const {midi} = throughFile(song)
        const notes = midi.tracks.flatMap(t => t.notes.map(n => `${n.midi}@${n.time.toFixed(3)}`))
        expect(notes.sort()).toEqual(['60@0.100', '64@0.373'])
        expect(Math.round((midi.header.tempos[0]?.bpm ?? 0) * 4)).toBe(220)
    })

    it('names the song model the export came from', () => {
        expect(throughFile(songWithLayers()).metadata!.kind).toBe('composed')
        const recorded = songWithLayers().toRecordedSong()
        const midi = new Midi(new Uint8Array(recorded.toMidi().toArray()).buffer as ArrayBuffer)
        expect(decodeMidiMetadata(midi.header.meta ?? [])!.kind).toBe('recorded')
    })

    it('reads an export from before the kind existed, or a kind it does not know, as composed', () => {
        //no version bump came with the field, so an older build still reads the instruments of a
        //newer export, and a newer build has to read the older exports that have no kind at all
        const instruments = [new InstrumentData({name: INSTRUMENTS[0]})]
        const old = encodeMidiMetadata({instruments, pitch: 'C', reverb: false})
        expect(old).not.toContain('kind')
        expect(decodeMidiMetadata([{type: 'text', text: old}])!.kind).toBe('composed')
        const unknown = encodeMidiMetadata({instruments, pitch: 'C', reverb: false, kind: 'composed'})
            .replace('"kind":"composed"', '"kind":"vsrg"')
        expect(decodeMidiMetadata([{type: 'text', text: unknown}])!.kind).toBe('composed')
    })

    it('ignores a file that is not ours', () => {
        expect(decodeMidiMetadata([])).toBeNull()
        expect(decodeMidiMetadata([{type: 'text', text: 'some other tool wrote this'}])).toBeNull()
        //a foreign MIDI with no meta events at all is the normal case, not an error
        expect(decodeMidiMetadata([{type: 'marker', text: 'chorus'}])).toBeNull()
    })

    it('refuses the other game\'s metadata rather than adopting instruments that do not exist', () => {
        const foreign = encodeMidiMetadata({
            instruments: [new InstrumentData({name: INSTRUMENTS[0]})],
            pitch: 'C',
            reverb: false,
        }).replace(`"app":"${APP_NAME}"`, '"app":"SomeOtherGame"')
        expect(decodeMidiMetadata([{type: 'text', text: foreign}])).toBeNull()
    })

    it('treats a damaged blob exactly like an absent one', () => {
        //an editor that truncates the text event must degrade to a plain foreign import,
        //never throw in the middle of a file the user is trying to open
        const good = encodeMidiMetadata({
            instruments: [new InstrumentData({name: INSTRUMENTS[0]})],
            pitch: 'C',
            reverb: false,
        })
        expect(() => decodeMidiMetadata([{type: 'text', text: good.slice(0, good.length - 12)}])).not.toThrow()
        expect(decodeMidiMetadata([{type: 'text', text: good.slice(0, good.length - 12)}])).toBeNull()
        expect(decodeMidiMetadata([{type: 'text', text: 'genshin-music-meta:{}'}])).toBeNull()
        expect(decodeMidiMetadata([{type: 'text', text: 'genshin-music-meta:not json'}])).toBeNull()
    })
})
