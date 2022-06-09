import { IMPORT_NOTE_POSITIONS, APP_NAME, PITCHES, Pitch, INSTRUMENTS, INSTRUMENTS_DATA } from "appConfig"
import { Column, ColumnNote, RecordedNote, SerializedRecordedNote, SongData } from "./SongClasses"
import { ComposedSong } from "./ComposedSong"
import { groupNotesByIndex, mergeLayers, groupByNotes } from 'lib/Tools'
import clonedeep from 'lodash.clonedeep'
import { NoteLayer } from "./Layer"
import { Midi } from "@tonejs/midi"
import { InstrumentName } from "types/GeneralTypes"
import { SerializedSong, Song } from "./Song"
import { OldFormat, OldNote } from "types/SongTypes"


export type SerializedRecordedSong = SerializedSong & {
    notes: SerializedRecordedNote[]
    instrument: InstrumentName
}

export type OldFormatRecorded = SerializedRecordedSong & OldFormat

export class RecordedSong extends Song<RecordedSong, SerializedRecordedSong> {
    instrument: InstrumentName
    notes: RecordedNote[]
    timestamp: number
    constructor(name: string, notes?: RecordedNote[]) {
        super(name, 2, {
            isComposed: false,
            isComposedVersion: false,
            appName: APP_NAME
        })
        this.notes = notes || []
        this.instrument = INSTRUMENTS[0]
        this.timestamp = 0
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
        const { data, pitch, bpm, notes, name, id } = obj
        const version = obj.version || 1
        const song = new RecordedSong(name || 'Untitled')
        song.instrument = INSTRUMENTS.includes(obj.instrument as any) ?  obj.instrument : INSTRUMENTS[0]
        song.data = { ...song.data, ...data }
        song.pitch = PITCHES.includes(pitch) ? pitch : pitch
        song.bpm = Number.isFinite(bpm) ? bpm : song.bpm
        song.id = id
        if (version === 1) {
            const clonedNotes: [] = Array.isArray(notes) ? clonedeep(notes) : []
            song.notes = clonedNotes.map(note => {
                return RecordedNote.deserialize([note[0], note[1], note[2] || 1] as SerializedRecordedNote)
            })
        } else if (version === 2) {
            song.notes = notes.map(note => RecordedNote.deserialize(note))
        }
        return song
    }
    serialize = () => {
        const data: SerializedRecordedSong = {
            name: this.name,
            instrument: this.instrument,
            version: this.version,
            pitch: this.pitch,
            bpm: this.bpm,
            data: { ...this.data },
            notes: this.notes.map(note => note.serialize()),
            id: this.id
        }
        return data
    }
    toComposedSong = (precision = 4) => {
        const bpmToMs = Math.floor(60000 / this.bpm)
        const song = new ComposedSong(this.name)
        song.bpm = this.bpm
        song.pitch = this.pitch
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
            const columns: Column[] = []
            groupedNotes.forEach(notes => {
                const note = notes[0]
                if (!note) return
                const elapsedTime = note.time - previousTime
                previousTime = note.time
                const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new Column())) // adds empty columns
                const noteColumn = new Column()
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
            const combinations = [bpmToMs, Math.floor(bpmToMs / 2), Math.floor(bpmToMs / 4), Math.floor(bpmToMs / 8)]
            for (let i = 0; i < grouped.length; i++) {
                const column = new Column()
                column.notes = grouped[i].map(note => {
                    return new ColumnNote(note.index, note.layer.clone())
                })
                const next = grouped[i + 1] || [[0, 0, 0]]
                const paddingColumns = []
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
                    const column = new Column()
                    column.tempoChanger = col
                    return column
                })
                converted.push(column, ...finalPadding)
            }
        }
        song.columns = converted
        return song
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
        const highestLayer = Math.max(...this.notes.map(note => note.layer.asNumber()))
        const numberOfTracks = highestLayer.toString(2).length
        for (let i = 0; i < numberOfTracks; i++) {
            const notes = this.notes.filter(note => note.layer.test(i))
            if(!notes.length) continue
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
        if(midi.tracks.length === 1) midi.tracks[1].name = INSTRUMENTS_DATA[this.instrument].midiName
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
                const layer = new NoteLayer((note.l ?? Number(data[0])))
                const recordedNote = new RecordedNote(IMPORT_NOTE_POSITIONS[Number(data[1])], note.time, layer)
                converted.notes.push(recordedNote)
            })

            if ([true, "true"].includes(song.isComposed)) {
                return converted.toComposedSong()
            }
            return converted
        } catch (e) {
            console.log(e)
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
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.instrument = this.instrument
        clone.data = { ...this.data }
        clone.notes = this.notes.map(note => note.clone())
        return clone
    }
}
