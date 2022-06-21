import { Midi } from "@tonejs/midi"
import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, INSTRUMENTS_DATA, Pitch } from "appConfig"
import { TEMPO_CHANGERS } from "appConfig"
import { InstrumentName } from "types/GeneralTypes"
import { OldFormat, _LegacySongInstruments } from "types/SongTypes"
import { NoteLayer } from "../Layer"
import { RecordedSong } from "./RecordedSong"
import { Column, ColumnNote, RecordedNote, SerializedColumn } from "./SongClasses"
import { SerializedSong, Song } from "./Song"

interface OldFormatNoteType {
    key: string,
    time: number
    l?: number
}
export type InstrumentNoteIcon = 'line' | 'circle' | 'border'
export interface ComposedSongInstrument{
    name: InstrumentName
    volume: number
    pitch: Pitch | ""
    visible: boolean
    icon: InstrumentNoteIcon
}

export type BaseSerializedComposedSong = SerializedSong & {
    type: "composed"
    breakpoints: number[]
    columns: SerializedColumn[]
}
export type SerializedComposedSongV1 = BaseSerializedComposedSong & {
    version: 1
    instruments: _LegacySongInstruments
}
export type SerializedComposedSongV2 = BaseSerializedComposedSong & {
    version: 2
    instruments: _LegacySongInstruments
}
export type SerializedComposedSong = BaseSerializedComposedSong & {
    version: 3
    instruments: ComposedSongInstrument[]
}

export type UnknownSerializedComposedSong = SerializedComposedSongV1 | SerializedComposedSongV2 | SerializedComposedSong


export type OldFormatComposed = BaseSerializedComposedSong & OldFormat

const baseInstrument: ComposedSongInstrument = {
    name: INSTRUMENTS[0],
    volume: 100,
    pitch: "",
    visible: true,
    icon: 'circle'
}


export class ComposedSong extends Song<ComposedSong, BaseSerializedComposedSong, 3>{
    notes: RecordedNote[] = []
    instruments: ComposedSongInstrument[]
    breakpoints: number[]
    columns: Column[]
    selected: number
    constructor(name: string, instruments: InstrumentName[] = []) {
        super(name, 3, 'composed', {
            appName: APP_NAME,
            isComposed: true,
            isComposedVersion: true
        })
        this.instruments = []
        this.breakpoints = [0]
        this.selected = 0
        this.columns = new Array(100).fill(0).map(_ => new Column())
        instruments.forEach(this.addInstrument)
    }
    static deserialize = (song: UnknownSerializedComposedSong): ComposedSong => {
        const { id, bpm, data, pitch } = song
        const parsed = new ComposedSong(song.name)
        //@ts-ignore
        if(song.version === undefined) song.version = 1
        const sanitizedBpm = Number(bpm)
        parsed.id = id || null
        parsed.data = { ...parsed.data, ...data }
        parsed.bpm = Number.isFinite(sanitizedBpm) ? sanitizedBpm : 220
        parsed.pitch = PITCHES.includes(pitch) ? pitch : song.pitch
        parsed.breakpoints = (song.breakpoints ?? []).filter(Number.isFinite)
        //parsing instruments
        if(song.version === 1 || song.version === 2){
            const instruments = Array.isArray(song.instruments) ? song.instruments : []
            parsed.instruments = instruments.map(name =>  {
                return {...baseInstrument, name}
            })
        } else if (song.version === 3){
            parsed.instruments = song.instruments.map(instrument => ({...baseInstrument, ...instrument}))
        }
        //parsing columns
        if (song.version === 1) {
            parsed.columns = song.columns.map(column => {
                const parsedColumn = new Column()
                parsedColumn.tempoChanger = column[0]
                column[1].forEach(note => {
                    const layer = note[1].split("").reverse().join("")
                    const deserializedNote = new ColumnNote(note[0], NoteLayer.deserializeBin(layer))
                    return parsedColumn.notes.push(deserializedNote)
                })
                return parsedColumn
            })
        }
        if (song.version === 2 || song.version === 3) {
            parsed.columns = song.columns.map(column => Column.deserialize(column))
        }
        return parsed
    }
    get isComposed(): true {
        return true
    }
    get lastInstrument(): ComposedSongInstrument {
        return this.instruments[this.instruments.length - 1]
    }
    toRecordedSong = () => {
        const recordedSong = new RecordedSong(this.name)
        recordedSong.bpm = this.bpm
        recordedSong.pitch = this.pitch
        const bpmPerMs = Math.floor(60000 / this.bpm)
        let totalTime = 100
        this.columns.forEach(column => {
            column.notes.forEach(note => {
                recordedSong.notes.push(new RecordedNote(note.index, totalTime, note.layer.clone()))
            })
            totalTime += Math.floor(bpmPerMs * TEMPO_CHANGERS[column.tempoChanger].changer)
        })
        return recordedSong
    }
    toComposedSong = () => {
        return this.clone()
    }
    addInstrument = (name: InstrumentName) => {
        const newInstrument:ComposedSongInstrument = {...baseInstrument, name}
        this.instruments = [...this.instruments, newInstrument]
    }
    removeInstrument = async (index: number) => {
        if(index === 0){
            this.switchLayer(this.columns.length, 0, 0, 1)
        }else{
            const toMove = this.instruments.slice(index)
            toMove.forEach((_, i) => {
                this.switchLayer(this.columns.length, 0, index + i, index + i - 1 )
            })
        }
        this.instruments.splice(index,1)

        this.instruments = [...this.instruments]
    }
    serialize = (): SerializedComposedSong => {
        const bpm = Number(this.bpm)
        return {
            name: this.name,
            type: 'composed',
            folderId: this.folderId,
            bpm: Number.isFinite(bpm) ? bpm : 220,
            pitch: this.pitch,
            version: this.version,
            data: {
                ...this.data,
                appName: APP_NAME
            },
            breakpoints: [...this.breakpoints],
            instruments: [...this.instruments],
            columns: this.columns.map(col => col.serialize()),
            id: this.id
        }
    }
    toOldFormat = (): OldFormatComposed => {
        const song: OldFormatComposed = {
            ...this.serialize(),
            pitchLevel: PITCHES.indexOf(this.pitch),
            isComposed: true,
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes: []
        }
        const convertedNotes: OldFormatNoteType[] = []
        const bpmPerMs = Math.floor(60000 / song.bpm)
        let totalTime = 100
        song.columns.forEach(column => {
            column[1].forEach(note => {
                //@ts-ignore
                const layer = LAYERS_MAP[note[1]]
                if (layer === 0) return
                const noteObj: OldFormatNoteType = {
                    key: (layer > 2 ? 2 : layer) + 'Key' + note[0],
                    time: totalTime,
                    ...layer > 2 ? { l: 3 } : {}
                }
                convertedNotes.push(noteObj)
            })
            totalTime += Math.floor(bpmPerMs * TEMPO_CHANGERS[column[0]].changer)
        })
        song.songNotes = convertedNotes
        return song
    }
    get selectedColumn() {
        return this.columns[this.selected]
    }
    addColumns = (amount: number, position: number | 'end') => {
        const columns = new Array(amount).fill(0).map(() => new Column())
        if (position === "end") {
            this.columns.push(...columns)
        } else {
            this.columns.splice(position + 1, 0, ...columns)
        }
    }
    removeColumns = (amount: number, position: number) => {
        this.columns.splice(position, amount)
        this.validateBreakpoints()
    }
    switchLayer(amount: number, position:number, from: number, to:number) {
        const columns = this.columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notes.forEach(note => {
                note.switchLayer(from, to)
            })
        })
    }
    swapLayer(amount: number, position:number, layer1: number, layer2:number) {
        const columns = this.columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notes.forEach(note => {
                note.swapLayer(layer1, layer2)
            })
        })
    }
    toggleBreakpoint = (override?: number) => {
        const index = typeof override === "number" ? override : this.selected
        const breakpointIndex = this.breakpoints.indexOf(index)
        if (breakpointIndex >= 0 && this.columns.length > index) {
            this.breakpoints.splice(breakpointIndex, 1)
        } else if (this.columns.length > index) {
            this.breakpoints.push(index)
        }
    }
    eraseColumns = (columns: number[], layer: number | 'all') => {
        if (layer === 'all') {
            columns.forEach(index => {
                const column = this.columns[index]
                if (column !== undefined) this.columns[index].notes = []
            })
        } else {
            columns.forEach(index => {
                const column = this.columns[index]
                if (column !== undefined) {
                    column.notes.forEach(note => {
                        note.setLayer(layer, false)
                    })
                    column.notes = column.notes.filter(note => !note.layer.isEmpty())
                }
            })
        }
        return this
    }
    pasteColumns = async (copiedColumns: Column[], insert: boolean) => {
        const cloned: Column[] = copiedColumns.map(column => column.clone())
        if (!insert) {
            this.columns.splice(this.selected, 0, ...cloned)
        } else {
            cloned.forEach((clonedColumn, i) => {
                const column = this.columns[this.selected + i]
                if (column === undefined) return
                clonedColumn.notes.forEach(clonedNote => {
                    const index = column.getNoteIndex(clonedNote.index)
                    if (index === null) {
                        column.addColumnNote(clonedNote)
                    } else {
                        for (let j = 0; j < this.instruments.length; j++) {
                            if (clonedNote.isLayerToggled(j)) {
                                column.notes[index].setLayer(j, true)
                            }
                        }
                    }
                })
            })
        }
        return this
    }
    copyColumns = (selectedColumns: number[], layer: number | 'all') => {
        let copiedColumns: Column[] = []
        selectedColumns.forEach((index) => {
            const column = this.columns[index]
            if (column !== undefined) copiedColumns.push(column.clone())
        })
        if (layer !== 'all') {
            copiedColumns = copiedColumns.map(column => {
                column.notes = column.notes.filter(e => e.isLayerToggled(layer))
                column.notes = column.notes.map(e => {
                    e.clearLayer()
                    e.setLayer(layer, true)
                    return e
                })
                return column
            })
        }
        return copiedColumns
    }
    deleteColumns = (selectedColumns: number[]) => {
        this.columns = this.columns.filter((e, i) => !selectedColumns.includes(i))
        if (this.selected > this.columns.length - 1) this.selected = this.columns.length - 1
        if (this.selected <= 0) this.selected = 0
        if (this.columns.length === 0) this.addColumns(12, 0)
        return this
    }

    validateBreakpoints = () => {
        this.breakpoints = this.breakpoints.filter(breakpoint => breakpoint < this.columns.length)
    }
    toGenshin = () => {
        const clone = this.clone()
        if (clone.data.appName === 'Genshin') {
            console.warn("Song already in Genshin format")
            return clone
        }
        clone.data.appName = 'Genshin'
        clone.instruments = []
        this.instruments.map(_ => clone.addInstrument(INSTRUMENTS[0]))
        clone.columns = clone.columns.map(column => {
            column.notes = column.notes.map(note => {
                note.index = IMPORT_NOTE_POSITIONS[note.index]
                return note
            })
            return column
        })
        return clone
    }
    toMidi = (): Midi => {
        const song = this.toRecordedSong()
        const midi = song.toMidi()
        this.instruments.forEach((ins, i) => {
            const instrument = INSTRUMENTS_DATA[ins.name]
            if (!instrument || !midi.tracks[i]) return
            midi.tracks[i].instrument.name = instrument.midiName
        })
        return midi
    }
    clone = () => {
        const clone = new ComposedSong(this.name)
        clone.id = this.id
        clone.data = { ...this.data }
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.instruments = this.instruments.map(ins => ({ ...ins }))
        clone.breakpoints = [...this.breakpoints]
        clone.selected = this.selected
        clone.columns = this.columns.map(column => column.clone())
        return clone
    }
}
const LAYERS_MAP = {
    '0000': 0,
    '0010': 2,
    '0110': 2,
    '0100': 2,
    '1010': 3,
    '1000': 1,
    '1110': 3,
    '1100': 3,
    '0001': 2,
    '0011': 2,
    '0111': 2,
    '0101': 2,
    '1011': 3,
    '1001': 1,
    '1111': 3,
    '1101': 3
}