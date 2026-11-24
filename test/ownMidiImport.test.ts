// One of our own MIDI exports, imported straight into the library (ownMidiImport.ts).
//
// The oracle everywhere is the SOURCE song: what went out as a .mid has to come back as the same
// song, because nothing shows the user the result before it is saved. Every trip goes through
// real bytes (toArray + re-parse), since the tick grid is where timing defects live.
import {describe, expect, it} from 'vitest'
import {APP_NAME, INSTRUMENTS, PITCHES, TEMPO_CHANGERS} from './imports'
import {ComposedSong} from '../src/lib/core/Songs/ComposedSong.svelte'
import {RecordedSong} from '../src/lib/core/Songs/RecordedSong'
import {InstrumentData, NoteColumn, RecordedNote} from '../src/lib/core/Songs/SongClasses'
import {Midi} from '../src/lib/core/Songs/midiConstructor'
import {encodeMidiMetadata} from '../src/lib/core/Songs/midiMetadata'
import {instrumentSupportsSustain} from '../src/lib/core/Songs/midiImport'
import {basepointOffset, getSoundingTable, isAccidentalMidi} from '../src/lib/core/Songs/noteIds'
import {songFromOwnMidi} from '../src/lib/core/Songs/ownMidiImport'
import type {Pitch} from '../src/lib/core/legacyConfig'

function throughBytes(midi: Midi): Midi {
    return new Midi(new Uint8Array(midi.toArray()).buffer as ArrayBuffer)
}

function columnOf(notes: {trackIndex: number; id: number; span?: number}[], tempoChanger = 0) {
    const column = new NoteColumn()
    column.tempoChanger = tempoChanger
    column.notes = notes.map(note => ({trackIndex: note.trackIndex, id: note.id, span: note.span ?? 1}))
    return column
}

/** Column index -> sorted "track:id:span", empties skipped. */
function shape(columns: readonly NoteColumn[]) {
    const out: Record<number, string[]> = {}
    columns.forEach((column, index) => {
        if (column.notes.length === 0) return
        out[index] = column.notes.map(n => `${n.trackIndex}:${n.id}:${n.span}`).sort()
    })
    return out
}

/** The columns up to and including the last one holding a note: the trailing rest is the export's. */
function noteBearingPrefix(columns: readonly NoteColumn[]) {
    let last = -1
    columns.forEach((column, index) => {
        if (column.notes.length > 0) last = index
    })
    return columns.slice(0, last + 1)
}

const SUB_BEAT = TEMPO_CHANGERS.findIndex(t => t.changer === 0.5)

function composedSource(): ComposedSong {
    const second = INSTRUMENTS[1] ?? INSTRUMENTS[0]
    const song = new ComposedSong('Round trip', [INSTRUMENTS[0], second, INSTRUMENTS[0]])
    song.bpm = 220
    song.pitch = 'D'
    song.reverb = true
    song.instruments[0].alias = 'lead'
    song.instruments[0].volume = 42
    song.instruments[2].muted = true
    const d = basepointOffset('D')
    //layer 1 stays SILENT: export still writes its track, and the import must keep the layer
    const columns = [
        columnOf([{trackIndex: 0, id: 60 + d}, {trackIndex: 2, id: 64 + d}]),
        columnOf([]),
        columnOf([{trackIndex: 0, id: 62 + d}], SUB_BEAT >= 0 ? SUB_BEAT : 0),
        columnOf([{trackIndex: 2, id: 67 + d}], SUB_BEAT >= 0 ? SUB_BEAT : 0),
        columnOf([{trackIndex: 0, id: 72 + d}]),
    ]
    song.initColumnsForConstruction(columns)
    return song
}

describe('a composed export, imported back', () => {
    it('comes back as the same song', () => {
        const source = composedSource()
        const result = songFromOwnMidi(throughBytes(source.toMidi()), 'Round trip.mid')
        expect(result).not.toBeNull()
        expect(result!.kind).toBe('composed')
        const song = result!.song as ComposedSong
        expect(song).toBeInstanceOf(ComposedSong)
        expect(song.name).toBe('Round trip')
        expect(song.bpm).toBe(220)
        expect(song.pitch).toBe('D')
        expect(song.reverb).toBe(true)
        expect(shape(noteBearingPrefix(song.columns))).toEqual(shape(source.columns))
        expect(noteBearingPrefix(song.columns).map(c => c.tempoChanger))
            .toEqual(source.columns.map(c => c.tempoChanger))
    })

    it('keeps every layer, the silent ones included, with its settings', () => {
        const source = composedSource()
        const song = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')!.song
        expect(song.instruments.map(i => i.name)).toEqual(source.instruments.map(i => i.name))
        expect(song.instruments[0].alias).toBe('lead')
        expect(song.instruments[0].volume).toBe(42)
        expect(song.instruments[2].muted).toBe(true)
    })

    it('brings back every key of every instrument, at every Basepoint', () => {
        //THE guard for importing without a screen: one note per key the instrument has, so a
        //tuned or registered instrument whose keys the importer cannot place shows up here
        for (const name of INSTRUMENTS) {
            for (const pitch of PITCHES as readonly Pitch[]) {
                const numbers = getSoundingTable(name).map(sounding => sounding + basepointOffset(pitch))
                const source = new ComposedSong('every key', [name])
                source.bpm = 220
                source.pitch = pitch
                source.initColumnsForConstruction(numbers.map(id => columnOf([{trackIndex: 0, id}])))
                const result = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')
                expect(result, `${name} at ${pitch}`).not.toBeNull()
                expect(
                    shape(noteBearingPrefix((result!.song as ComposedSong).columns)),
                    `${name} at ${pitch}`
                ).toEqual(shape(source.columns))
            }
        }
    })

    it('keeps the rest before the first note', () => {
        //export puts column 0 at a known time, so the empty columns a song starts with are measured
        //from there instead of being dropped - which used to send every such song to the importer
        const source = new ComposedSong('late start', [INSTRUMENTS[0]])
        source.initColumnsForConstruction([
            columnOf([]),
            columnOf([]),
            columnOf([{trackIndex: 0, id: 60}]),
            columnOf([{trackIndex: 0, id: 62}]),
        ])
        const song = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')!.song as ComposedSong
        expect(shape(noteBearingPrefix(song.columns))).toEqual({2: ['0:60:1'], 3: ['0:62:1']})
    })

    it.runIf(SUB_BEAT >= 0)('keeps a sub-beat rest before the first note', () => {
        const source = new ComposedSong('half beat late', [INSTRUMENTS[0]])
        source.initColumnsForConstruction([
            columnOf([], SUB_BEAT),
            columnOf([{trackIndex: 0, id: 60}], SUB_BEAT),
            columnOf([{trackIndex: 0, id: 62}]),
        ])
        const song = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')!.song as ComposedSong
        const kept = noteBearingPrefix(song.columns)
        expect(shape(kept)).toEqual(shape(source.columns))
        expect(kept.map(c => c.tempoChanger)).toEqual(source.columns.map(c => c.tempoChanger))
    })

    it('falls back to the song name from the file name when the export wrote none', () => {
        const midi = composedSource().toMidi()
        midi.name = ''
        expect(songFromOwnMidi(throughBytes(midi), 'My song.mid')!.song.name).toBe('My song')
    })
})

describe('a composed export the import cannot rebuild exactly goes to the importer screen', () => {
    //nothing shows the user a direct import before it is saved, so a song the importer would change
    //must not be saved silently: each case below is one the shared importer is lossy on
    const SUSTAINING = INSTRUMENTS.find((name: string) => instrumentSupportsSustain(name))

    it('a strand between the rows, which the import would snap onto a key', () => {
        const name = INSTRUMENTS[0]
        const keys = new Set(getSoundingTable(name))
        const strand = [...Array(128).keys()].find(n => isAccidentalMidi(n) && !keys.has(n)
            && n > Math.min(...keys) && n < Math.max(...keys))
        expect(strand).toBeDefined()
        const source = new ComposedSong('strand', [name])
        source.initColumnsForConstruction([columnOf([{trackIndex: 0, id: 60}]), columnOf([{trackIndex: 0, id: strand!}])])
        expect(songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')).toBeNull()
    })

    it.runIf(SUSTAINING !== undefined && SUB_BEAT >= 0)('a hold across a sub-beat rest, which the import would shorten', () => {
        const source = new ComposedSong('held', [SUSTAINING!])
        const id = getSoundingTable(SUSTAINING!)[0]
        source.initColumnsForConstruction([
            columnOf([{trackIndex: 0, id, span: 2}], SUB_BEAT),
            columnOf([], SUB_BEAT),
            columnOf([{trackIndex: 0, id}]),
        ])
        expect(songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')).toBeNull()
    })
})

describe('a recorded export, imported back', () => {
    const SUSTAINING = INSTRUMENTS.find((name: string) => instrumentSupportsSustain(name))

    function recordedSource(instrument: string): RecordedSong {
        const song = new RecordedSong('Performance', [], [instrument as never])
        song.bpm = 137
        song.pitch = 'C'
        song.notes = [
            new RecordedNote(60, 0, 0, 0),
            new RecordedNote(64, 333, 0, 0),
            new RecordedNote(67, 341, 0, 0),
            new RecordedNote(72, 1207, 0, 0),
        ]
        return song
    }

    it('comes back recorded, at its own times rather than on a grid', () => {
        const source = recordedSource(INSTRUMENTS[0])
        const result = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')
        expect(result!.kind).toBe('recorded')
        const song = result!.song as RecordedSong
        expect(song).toBeInstanceOf(RecordedSong)
        expect(song.name).toBe('Performance')
        expect(song.bpm).toBe(137)
        //the tick grid moves a time by at most a tick (60000 / (137 / 4) / 480 = 3.6ms)
        song.notes.forEach((note, index) => {
            expect(note.id).toBe(source.notes[index].id)
            expect(Math.abs(note.time - source.notes[index].time)).toBeLessThanOrEqual(4)
            expect(note.duration).toBe(0)
        })
    })

    it.runIf(SUSTAINING !== undefined)('keeps a hold on a layer that can hold, and a tap a tap', () => {
        const source = recordedSource(SUSTAINING!)
        source.notes[1].duration = 900
        const song = songFromOwnMidi(throughBytes(source.toMidi()), 'x.mid')!.song as RecordedSong
        expect(song.notes.map(n => n.duration === 0)).toEqual([true, false, true, true])
        expect(Math.abs(song.notes[1].duration - 900)).toBeLessThanOrEqual(8)
    })
})

describe('a file that is not one of ours, as far as this import is concerned', () => {
    it('a foreign file', () => {
        const midi = new Midi()
        midi.addTrack().addNote({midi: 60, time: 0, duration: 0.5})
        expect(songFromOwnMidi(throughBytes(midi), 'x.mid')).toBeNull()
    })

    it("the other game's export", () => {
        const midi = composedSource().toMidi()
        midi.header.meta = midi.header.meta.map(event => ({
            ...event,
            text: event.text.replace(`"app":"${APP_NAME}"`, '"app":"SomeOtherGame"'),
        }))
        expect(songFromOwnMidi(throughBytes(midi), 'x.mid')).toBeNull()
    })

    it('an export a DAW has since added a track to', () => {
        const midi = composedSource().toMidi()
        midi.addTrack().addNote({midi: 60, time: 0, duration: 0.5})
        expect(songFromOwnMidi(throughBytes(midi), 'x.mid')).toBeNull()
    })

    it('an export a DAW has since dropped an empty track from', () => {
        //the silent middle layer's track goes, and every later track would shift onto the layer
        //before it - its notes played by that layer's instrument
        const midi = composedSource().toMidi()
        expect(midi.tracks[1].notes).toHaveLength(0)
        midi.tracks.splice(1, 1)
        expect(songFromOwnMidi(throughBytes(midi), 'x.mid')).toBeNull()
    })

    it('an export a DAW has since put a conductor track in front of, keeping the count', () => {
        //the conductor goes first and the silent last layer's track is dropped: as many tracks as
        //layers, and every note one track later than the layer it was written for
        const source = new ComposedSong('conductor', [INSTRUMENTS[0], INSTRUMENTS[1] ?? INSTRUMENTS[0]])
        source.initColumnsForConstruction([columnOf([{trackIndex: 0, id: 60}])])
        const midi = source.toMidi()
        const conductor = midi.addTrack()
        midi.tracks.pop()
        midi.tracks.unshift(conductor)
        midi.tracks.pop()
        expect(midi.tracks).toHaveLength(2)
        expect(songFromOwnMidi(throughBytes(midi), 'x.mid')).toBeNull()
    })
})

describe('an export written before the song kind existed', () => {
    it('comes back composed, which is what the importer always made of it', () => {
        const source = new ComposedSong('old', [INSTRUMENTS[0]])
        source.initColumnsForConstruction([columnOf([{trackIndex: 0, id: 60}]), columnOf([{trackIndex: 0, id: 62}])])
        const midi = source.toMidi()
        const old = encodeMidiMetadata({instruments: [new InstrumentData({name: INSTRUMENTS[0]})], pitch: 'C', reverb: false})
        expect(old).not.toContain('kind')
        midi.header.meta = [{ticks: 0, type: 'text', text: old}]
        const result = songFromOwnMidi(throughBytes(midi), 'old.mid')
        expect(result!.kind).toBe('composed')
        expect(shape((result!.song as ComposedSong).columns)).toEqual({0: ['0:60:1'], 1: ['0:62:1']})
    })
})
