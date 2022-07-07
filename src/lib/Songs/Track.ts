import { APP_NAME, INSTRUMENTS, Pitch } from "appConfig"
import { InstrumentName } from "types/GeneralTypes"
import { InstrumentNoteIcon } from "./ComposedSong"

export interface SerializedTrack{
    name: string
    instrument: InstrumentName
    columns: SerializedTrackColumn[]
    icon: InstrumentNoteIcon
    pitch: Pitch | ""
    volume: number
    visible: boolean
}
const instrumentNoteMap = new Map([['border', 1], ['circle', 2], ['line', 3]])
export class Track{
    instrument: InstrumentName = INSTRUMENTS[0]
    volume: number = APP_NAME === 'Genshin' ? 90 : 100
    pitch: Pitch | "" = ""
    visible: boolean = true
    icon: InstrumentNoteIcon = 'circle'
	name = ''
    columns: TrackColumn[] = []
	constructor(data: Partial<Track> = {}) {
		Object.assign(this, data)
	}
	serialize(): SerializedTrack{
		return {
			name: this.name,
			instrument: this.instrument,
			volume: this.volume,
			pitch: this.pitch,
			visible: this.visible,
			icon: this.icon,
            columns: this.columns.map(c => c.serialize())
		}
	}
	static deserialize(data: SerializedTrack): Track{
        const columns = data.columns.map(c => TrackColumn.deserialize(c))
		return new Track({...data, columns})
	}
	set(data: Partial<SerializedTrack>){
		Object.assign(this, data)
		return this
	}
    setNoteInColumn(column:number, note: Note | number){
        this.ensureColumnSize(column)
        return this.columns[column].addNote(note)
    }
    toggleNoteInColumn(column:number, note: Note | number){
        this.ensureColumnSize(column)
        return this.columns[column].toggleNote(note)
    }



    ensureColumnSize(size: number){
        if(this.columns.length < size){
            const columns = new Array(size - this.columns.length).fill(null).map(() => new TrackColumn())
            this.columns.push(...columns)
        }
    }
	toNoteIcon(){
		return instrumentNoteMap.get(this.icon) || 0
	}

	clone(): Track{
        const columns = this.columns.map(c => c.clone())
		return new Track({...this, columns})
	}
}

export type SerializedTrackColumn = [notes: SerializedNote[]]
export class TrackColumn{
    notes:Note [] = []
    constructor(data: Partial<TrackColumn> = {}) {
        Object.assign(this, data)
    }
	addNote(indexOrNote: number | Note): Note {
		if (indexOrNote instanceof Note) {
            if(this.getNoteIndex(indexOrNote.index) !== null) return indexOrNote
			this.notes.push(indexOrNote.clone())
			return indexOrNote
		}
        const existingNote = this.getNoteIndex(indexOrNote)
        if(existingNote !== null) return this.notes[existingNote] 
		const note = new Note(indexOrNote)
		this.notes.push(note)
		return note
	}
    toggleNote(indexOrNote: number | Note): Note | null{
        if(indexOrNote instanceof Note){
            return this.toggleNote(indexOrNote.index)
        }
        const note = this.getNoteIndex(indexOrNote)
        if(note === null) return this.addNote(indexOrNote)
        this.removeAtIndex(note)
        return null
    }

    getNoteIndex(index: number): number | null{
		const result = this.notes.findIndex((n) => index === n.index)
		return result === -1 ? null : result
	}
	removeAtIndex(index: number) {
		this.notes.splice(index, 1)
	}
    serialize(): SerializedTrackColumn{
        return [this.notes.map(n => n.serialize())]
    }
    static deserialize(data: SerializedTrackColumn){
        return new TrackColumn({notes: data[0].map(n => Note.deserialize(n))})
    }
    clone(){
        return new TrackColumn({notes: this.notes.map(n => n.clone())})
    }
}

export type SerializedNote = [index: number]
export class Note{
    index: number
    constructor(index?: number) {
        this.index = index ?? -1
    }
    static deserialize(data: SerializedNote): Note{
        return new Note(data[0])
    }
    serialize(): SerializedNote{
        return [this.index]
    }
    clone(){
        return new Note(this.index)
    }
}



/*
import { Midi } from "@tonejs/midi"
import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, INSTRUMENTS_DATA, COMPOSER_NOTE_POSITIONS } from "appConfig"
import { TEMPO_CHANGERS } from "appConfig"
import { InstrumentName } from "types/GeneralTypes"
import { OldFormat, _LegacySongInstruments } from "types/SongTypes"
import { NoteLayer } from "../Layer"
import { RecordedSong } from "./RecordedSong"
import { Column, ColumnNote, InstrumentData, RecordedNote, SerializedColumn, SerializedInstrumentData } from "./SongClasses"
import { SerializedSong, Song } from "./Song"
import { Note, SerializedTrack, Track } from "./Track"

interface OldFormatNoteType {
    key: string,
    time: number
    l?: number
}
export type InstrumentNoteIcon = 'line' | 'circle' | 'border'


export type BaseSerializedComposedSong = SerializedSong & {
    type: "composed"
    breakpoints: number[]
}
export type SerializedComposedSongV1 = BaseSerializedComposedSong & {
    version: 1
    instruments: _LegacySongInstruments
    columns: SerializedColumn[]
}
export type SerializedComposedSongV2 = BaseSerializedComposedSong & {
    version: 2
    instruments: _LegacySongInstruments
    columns: SerializedColumn[]

}
export type SerializedComposedSongV3 = BaseSerializedComposedSong & {
    version: 3
    instruments: SerializedInstrumentData[]
    columns: SerializedColumn[]
}
export type SerializedComposedSong = BaseSerializedComposedSong & {
    version: 4
    tracks: SerializedTrack[]
}
export type UnknownSerializedComposedSong = SerializedComposedSongV1 | SerializedComposedSongV2 | SerializedComposedSongV3 | SerializedComposedSong


export type OldFormatComposed = BaseSerializedComposedSong & OldFormat

export const defaultInstrumentMap: InstrumentNoteIcon[] = ['border', 'circle', 'line']
export class ComposedSong extends Song<ComposedSong, SerializedComposedSong, 4>{
    notes: RecordedNote[] = []
    tempoChangers: number[] = []
    tracks: Track[] = []
    breakpoints: number[]
    selected: number
    constructor(name: string, instruments: InstrumentName[] = []) {
        super(name, 4, 'composed', {
            appName: APP_NAME,
            isComposed: true,
            isComposedVersion: true
        })
        this.breakpoints = [0]
        this.selected = 0
        this.tracks = [new Track()]
        instruments.forEach(ins => this.addTrack(ins))
    }
    static deserialize = (song: UnknownSerializedComposedSong): ComposedSong => {
        const { id, bpm, data, pitch } = song
        const parsed = new ComposedSong(song.name)
        //@ts-ignore
        if (song.version === undefined) song.version = 1
        const sanitizedBpm = Number(bpm)
        parsed.id = id || null
        parsed.data = { ...parsed.data, ...data }
        parsed.bpm = Number.isFinite(sanitizedBpm) ? sanitizedBpm : 220
        parsed.pitch = PITCHES.includes(pitch) ? pitch : song.pitch
        parsed.breakpoints = (song.breakpoints ?? []).filter(Number.isFinite)
        //parsing instruments
        parsed.tracks = []
        if (song.version === 1 || song.version === 2) {
            song.instruments.forEach(ins => parsed.addTrack(ins))
        }
        if (song.version === 3) {
            song.instruments.forEach(ins => {
                const track = parsed.addTrack(ins.name)
                track.set({
                    icon: ins.icon,
                    name: ins.alias,
                    volume: ins.volume,
                    visible: ins.visible,
                    pitch: ins.pitch
                })
            })
        }
        //parse notes
        if (song.version === 1 || song.version === 2 || song.version === 3) {
            song.columns.forEach((column, columnIndex) => {
                parsed.setTempoChanger(columnIndex, column[0])
                column[1].forEach(note => {
                    if (song.version === 1) {
                        note[1].split("").forEach((l, layerIndex) => {
                            if (l === "0") return
                            parsed.setNoteInTrack(columnIndex, layerIndex, note[0])
                        })
                    } else {
                        const layer = NoteLayer.deserializeHex(note[1])
                        layer.toArray().forEach((l, layerIndex) => {
                            if (l === 0) return
                            parsed.setNoteInTrack(columnIndex, layerIndex, note[0])
                        })
                    }
                })
            })
        }

        if (song.version === 4) {
            parsed.tracks = song.tracks.map(track => Track.deserialize(track))
        }
        return parsed
    }
    get isComposed(): true {
        return true
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
        recordedSong.instruments = this.instruments.map(ins => ins.clone())
        return recordedSong
    }

    addTrack(instrumentName: InstrumentName): Track {
        const newTrack = new Track({
            name: instrumentName,
            icon: defaultInstrumentMap[this.tracks.length % 3]
        })
        this.tracks = [...this.tracks, newTrack]
        return newTrack
    }
    setTempoChanger(column: number, tempoChanger: number) {
        this.ensureTempoChangersSize(column)
        this.tempoChangers[column] = tempoChanger
    }
    ensureTempoChangersSize(size: number) {
        if (this.tempoChangers.length < size) {
            const tempoChangers = new Array(size - this.tempoChangers.length).fill(1)
            this.tempoChangers.push(...tempoChangers)
        }
    }
    setNoteInTrack(track: number, column: number, note: Note | number) {
        this.ensureTempoChangersSize(column)
        this.tracks[track].setNoteInColumn(column, note)
    }
    removeTrack(index: number) {
        const track = this.tracks[index]
        const nextTrack = index === 0 ? this.tracks[1] : this.tracks[index - 1]
        track.columns.forEach((column, columnIndex) => {
            column.notes.forEach(note => {
                nextTrack.setNoteInColumn(columnIndex, note)
            })
        })

        this.tracks.splice(index, 1)
        this.tracks = [...this.tracks]
    }
    toComposedSong = () => {
        return this.clone()
    }
    serialize = (): SerializedComposedSong => {
        let bpm = parseInt(this.bpm as any)
        return {
            name: this.name,
            type: 'composed',
            bpm: Number.isFinite(bpm) ? bpm : 220,
            pitch: this.pitch,
            version: this.version,
            folderId: this.folderId,
            data: {
                ...this.data,
                appName: APP_NAME
            },
            breakpoints: [...this.breakpoints],
            tracks: this.tracks.map(track => track.serialize()),
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
    getNotesOfPosition(position: number){
        const set = new Set<Note>()
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
    switchLayer(amount: number, position: number, from: number, to: number) {
        const columns = this.columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notes.forEach(note => {
                note.switchLayer(from, to)
            })
        })
    }
    swapLayer(amount: number, position: number, layer1: number, layer2: number) {
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
    pasteLayer(copiedColumns: Column[], insert: boolean, layer: number) {
        const layerColumns = copiedColumns.map(col => {
            const clone = col.clone()
            clone.notes = clone.notes.map(note => {
                note.layer.setData(0)
                note.layer.set(layer, true)
                return note
            }).filter(note => !note.layer.isEmpty())
            return clone
        })
        this.pasteColumns(layerColumns, insert)
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
    moveNotesBy(selectedColumns: number[], amount: number, layer: number | 'all') {
        const layoutMax = APP_NAME === 'Genshin' ? 21 : 15
        const fromNotePosition = new Map([...COMPOSER_NOTE_POSITIONS].reverse().map((n, i) => [n, i]))
        const toNotePosition = new Map([...COMPOSER_NOTE_POSITIONS].reverse().map((n, i) => [i, n]))
        if (layer === 'all') {
            selectedColumns.forEach(index => {
                const column = this.columns[index]
                if (!column) return
                column.notes.forEach(note => {
                    const fromPosition = fromNotePosition.get(note.index)
                    const toPosition = toNotePosition.get(fromPosition! + amount)
                    note.index = toPosition ?? -1
                })
                column.notes = column.notes.filter(note => note.index >= 0 && note.index < layoutMax)
            })
        } else {
            selectedColumns.forEach(index => {
                const column = this.columns[index]
                column.notes.sort((a, b) => amount < 0 ? a.index - b.index : b.index - a.index)
                if (!column) return
                column.notes.forEach(note => {
                    note = column.notes.find(n => n.index === note.index)!
                    if (!note.layer.test(layer)) return
                    const fromPosition = fromNotePosition.get(note.index)
                    const newPosition = toNotePosition.get(fromPosition! + amount)
                    const noteAtPosition = column.notes.find(n => n.index === newPosition)
                    if (noteAtPosition) {
                        noteAtPosition.setLayer(layer, true)
                        note.setLayer(layer, false)
                    } else {
                        if (!note.layer.test(layer)) return
                        note.setLayer(layer, false)
                        const newNote = new ColumnNote(newPosition ?? -1, new NoteLayer())
                        newNote.setLayer(layer, true)
                        column.notes.push(newNote)
                    }
                })
                column.notes = column.notes.filter(n => n.index >= 0 && n.index < layoutMax && !n.layer.isEmpty())
            })
        }
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
        clone.instruments = this.instruments.map(ins => ins.clone())
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





*/