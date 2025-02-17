import {APP_NAME, IMPORT_NOTE_POSITIONS, INSTRUMENTS_DATA, PITCHES} from "$config"
import {ColumnNote, InstrumentData, NoteColumn, RecordedNote, SerializedRecordedNote} from "./SongClasses"
import {ComposedSong, defaultInstrumentMap} from "./ComposedSong"
import {groupByNotes, groupNotesByIndex, mergeLayers} from "$lib/utils/Utilities";
import clonedeep from 'lodash.clonedeep'
import {NoteLayer} from "./Layer"
import {Midi} from "@tonejs/midi"
import {InstrumentName} from "$types/GeneralTypes"
import {SerializedSong, Song} from "./Song"
import {OldFormat, OldNote} from "$types/SongTypes"


export type SerializedRecordedSong = SerializedSong & {
    type: 'recorded'
    reverb: boolean
    notes: SerializedRecordedNote[]
}
export type OldFormatRecorded = SerializedRecordedSong & OldFormat

export type UnknownSerializedRecordedSong = SerializedRecordedSong

export class RecordedSong extends Song<RecordedSong, SerializedRecordedSong> {
    instruments: InstrumentData[]
    notes: RecordedNote[]
    timestamp = 0
    reverb = false
    private lastPlayedNote = -1

    constructor(name: string, notes?: RecordedNote[], instruments: InstrumentName[] = []) {
        super(name, 2, 'recorded', {
            isComposed: false,
            isComposedVersion: false,
            appName: APP_NAME
        })
        this.notes = notes || []
        this.instruments = []
        instruments.forEach(instrument => this.addInstrument(instrument))
    }

    get isComposed(): false {
        return false
    }

    toOldFormat = () => {
        const song: OldFormatRecorded = {
            ...this.serialize(),
            isComposed: false,
            pitchLevel: PITCHES.indexOf(this.pitch),
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes: this.notes.map(note => {
                return {
                    time: note.time,
                    key: "1Key" + note.index
                }
            })
        }
        return song
    }

    static deserialize(obj: SerializedRecordedSong): RecordedSong {
        const {notes, name} = obj
        const version = obj.version || 1
        const song = Song.deserializeTo(new RecordedSong(name || 'Untitled'), obj)
        song.reverb = obj.reverb ?? false
        if (song.instruments.length === 0) song.instruments = [new InstrumentData()]
        if (version === 1) {
            const clonedNotes = Array.isArray(notes) ? clonedeep(notes) : []
            song.notes = clonedNotes.map(note => {
                return RecordedNote.deserialize([note[0], note[1], note[2] || 1] as SerializedRecordedNote)
            })
        } else if (version === 2) {
            song.notes = notes.map(note => RecordedNote.deserialize(note))
        }
        return song
    }

    static isSerializedType(obj: any) {
        if (typeof obj !== 'object') return false
        if (obj.type === 'recorded') return true
        //legacy format
        if (obj?.data?.isComposedVersion === false) return true
        return false
    }

    static isOldFormatSerializedType(obj: any) {
        if (typeof obj !== 'object') return false
        if (obj.type) return false
        if (Array.isArray(obj.songNotes) && !obj.composedSong) return true
        return false
    }

    serialize = (): SerializedRecordedSong => {
        return {
            name: this.name,
            type: 'recorded',
            folderId: this.folderId,
            instruments: this.instruments.map(instrument => instrument.serialize()),
            version: this.version,
            pitch: this.pitch,
            bpm: this.bpm,
            reverb: this.reverb,
            data: {...this.data},
            notes: this.notes.map(note => note.serialize()),
            id: this.id
        }
    }

    startPlayback(timestamp: number) {
        this.lastPlayedNote = -1
        for (let i = 0; i < this.notes.length; i++) {
            if (this.notes[i].time >= timestamp) break
            this.lastPlayedNote = i
        }
    }

    tickPlayback(timestamp: number) {
        const surpassed = []
        for (let i = this.lastPlayedNote + 1; i < this.notes.length; i++) {
            if (this.notes[i].time <= timestamp) {
                surpassed.push(this.notes[i])
                this.lastPlayedNote = i
                continue
            }
            break
        }
        return surpassed
    }

    addInstrument = (name: InstrumentName) => {
        const newInstrument: InstrumentData = new InstrumentData({name})
        this.instruments = [...this.instruments, newInstrument]
    }

    toComposedSong = (precision = 4) => {
        const bpmToMs = 60000 / this.bpm
        const song = new ComposedSong(this.name, this.instruments.map(ins => ins.name))
        song.bpm = this.bpm
        song.pitch = this.pitch
        song.reverb = this.reverb
        const notes = this.notes.map(note => note.clone())
        //remove duplicates
        let converted = []
        if (precision === 1) {
            const groupedNotes: RecordedNote[][] = []
            let previousTime = notes[0].time
            while (notes.length > 0) {
                const row: RecordedNote[] = notes.length > 0 ? [notes.shift() as RecordedNote] : []
                let amount = 0
                if (row[0] !== undefined) {
                    for (let i = 0; i < notes.length; i++) {
                        if (row[0].time > notes[i].time - bpmToMs / 9) amount++
                    }
                }
                groupedNotes.push([...row, ...notes.splice(0, amount)])
            }
            const columns: NoteColumn[] = []
            groupedNotes.forEach(notes => {
                const note = notes[0]
                if (!note) return
                const elapsedTime = note.time - previousTime
                previousTime = note.time
                const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new NoteColumn())) // adds empty columns
                const noteColumn = new NoteColumn()
                noteColumn.notes = notes.map(note => {
                    return new ColumnNote(note.index, note.layer.clone())
                })
                columns.push(noteColumn)
            })
            columns.forEach(column => { //merges notes of different layer
                const groupedNotes = groupNotesByIndex(column)
                column.notes = groupedNotes.map(group => {
                    group[0].layer = mergeLayers(group)
                    return group[0]
                })
            })
            converted = columns
        } else {
            const grouped = groupByNotes(notes, bpmToMs / 9)
            const combinations = [
                //uses lax flooring instead of rounding to merge columns together, as the original format is not precise and uses flooring
                Math.floor(bpmToMs),
                Math.floor(bpmToMs / 2),
                Math.floor(bpmToMs / 4),
                Math.floor(bpmToMs / 8)
            ]
            for (let i = 0; i < grouped.length; i++) {
                const column = new NoteColumn()
                column.notes = grouped[i].map(note => {
                    return new ColumnNote(note.index, note.layer.clone())
                })
                const next = grouped[i + 1] || [[0, 0, 0]]
                const paddingColumns = [] as number[]
                let difference = next[0].time - grouped[i][0].time
                while (difference >= combinations[3]) {
                    if (difference / combinations[0] >= 1) {
                        difference -= combinations[0]
                        paddingColumns.push(0)
                    } else if (difference / combinations[1] >= 1) {
                        difference -= combinations[1]
                        if (precision <= 1) continue
                        paddingColumns.push(1)
                    } else if (difference / combinations[2] >= 1) {
                        difference -= combinations[2]
                        if (precision <= 2) continue
                        paddingColumns.push(2)
                    } else if (difference / combinations[3] >= 1) {
                        difference -= combinations[3]
                        if (precision <= 3) continue
                        paddingColumns.push(3)
                    }
                }
                column.tempoChanger = paddingColumns.shift() || 0
                const finalPadding = paddingColumns.map((col, i) => {
                    const column = new NoteColumn()
                    column.tempoChanger = col
                    return column
                })
                converted.push(column, ...finalPadding)
            }
        }
        song.columns = converted
        //merge duplicates notes
        for (const col of song.columns) {
            const grouped = {} as { [key: number]: ColumnNote }
            for (const notes of col.notes) {
                if (grouped[notes.index]) {
                    grouped[notes.index].layer.merge(notes.layer)
                } else {
                    grouped[notes.index] = notes
                }
            }
            col.notes = Object.values(grouped)
        }

        const highestLayer = NoteLayer.maxLayer(song.columns.flatMap(column => column.notes.map(note => note.layer)))
        song.instruments = highestLayer.toString(2).split("").map((_, i) => {
            const ins = new InstrumentData()
            ins.icon = defaultInstrumentMap[i % 3]
            return ins
        })
        this.instruments.forEach((ins, i) => {
            song.instruments[i] = ins
        })
        return song
    }

    static mergeNotesIntoChunks(notes: RecordedNote[]) {
        const chunks = []
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            const chunk = new Chunk(
                [notes.shift() as RecordedNote],
                0
            )
            const startTime = chunk.notes.length > 0 ? chunk.notes[0].time : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                const difference = notes[j].time - chunk.notes[0].time - 50 //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift() as RecordedNote)
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0].time - startTime : 0
            chunks.push(chunk)
        }
        return chunks
    }

    toRecordedSong = () => {
        return this.clone()
    }

    toMidi(): Midi {
        const midi = new Midi()
        midi.header.setTempo(this.bpm / 4)
        midi.header.keySignatures.push({
            key: this.pitch,
            scale: "major",
            ticks: 0,
        })
        midi.name = this.name
        const highestLayer = NoteLayer.maxLayer(this.notes.map(note => note.layer))
        const numberOfTracks = highestLayer.toString(2).length
        for (let i = 0; i < numberOfTracks; i++) {
            const notes = this.notes.filter(note => note.layer.test(i))
            if (!notes.length) continue
            const track = midi.addTrack()
            track.name = `Layer ${i + 1}`
            notes.forEach(note => {
                track.addNote({
                    time: note.time / 1000,
                    duration: 1,
                    midi: note.toMidi() || 0,
                })
            })
        }
        if (midi.tracks.length === 1) midi.tracks[0].name = INSTRUMENTS_DATA[this.instruments[0].name]?.midiName
        return midi
    }

    static fromOldFormat = (song: any) => {
        try {
            const converted = new RecordedSong(song.name || "Untitled")
            const bpm = Number(song.bpm)
            converted.bpm = Number.isFinite(bpm) ? bpm : 220
            converted.pitch = (PITCHES[song.pitchLevel || 0]) || "C"
            const notes: OldNote[] = song.songNotes.filter((note: OldNote, index: number, self: any) =>
                    index === self.findIndex((n: OldNote) => {
                        return n.key.split('Key')[1] === note.key.split('Key')[1] && n.time === note.time
                    })
            )
            notes.forEach((note) => {
                const data = note.key.split("Key")
                const layer = new NoteLayer((note.l ?? Number(data[0])) || 1)
                const recordedNote = new RecordedNote(IMPORT_NOTE_POSITIONS[Number(data[1])], note.time, layer)
                converted.notes.push(recordedNote)
            })
            const highestLayer = NoteLayer.maxLayer(converted.notes.map(note => note.layer))
            const numberOfInstruments = highestLayer.toString(2).length
            converted.instruments = new Array(numberOfInstruments).fill(0).map(_ => new InstrumentData())
            if ([true, "true"].includes(song.isComposed)) {
                return converted.toComposedSong()
            }
            return converted
        } catch (e) {
            console.error(e)
            return null
        }
    }
    toGenshin = () => {
        const clone = this.clone()
        if (clone.data.appName === 'Genshin') {
            console.warn("Song already in Genshin format")
            return clone
        }
        clone.data.appName = "Genshin"
        clone.notes = clone.notes.map(note => {
            note.index = IMPORT_NOTE_POSITIONS[note.index]
            return note
        })
        return clone
    }
    clone = () => {
        const clone = new RecordedSong(this.name)
        clone.id = this.id
        clone.folderId = this.folderId
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.instruments = this.instruments.map(ins => ins.clone())
        clone.data = {...this.data}
        clone.notes = this.notes.map(note => note.clone())
        return clone
    }
}


export class Chunk {
    notes: RecordedNote[]
    delay: number

    constructor(notes: RecordedNote[], delay: number) {
        this.notes = notes
        this.delay = delay
    }

    clone() {
        return new Chunk(this.notes.map(note => note.clone()), this.delay)
    }
}