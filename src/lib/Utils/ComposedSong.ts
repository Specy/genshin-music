import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, NOTE_NAMES, LAYOUT_DATA, PitchesType } from "appConfig"
import { TEMPO_CHANGERS } from "appConfig"
import { Song } from "./Song"
import clonedeep from 'lodash.clonedeep'
import { Column, ColumnNote } from "./SongClasses"

interface SongDataType {
    isComposed: boolean
    isComposedVersion: boolean,
    appName: string
}
interface OldFormatNoteType{
    key: string, 
    time: number
    l?: number
}
//TODO add layer type
type SerializedNote = [index: number, layer: string]
type SerializedColumn = [tempoChanger: number, notes: SerializedNote[]]
interface SerializedSong {
    //TODO add tempo changer type
    name: string
    data: SongDataType
    bpm: number
    pitch: PitchesType
    instruments: [typeof INSTRUMENTS[number], typeof INSTRUMENTS[number], typeof INSTRUMENTS[number]]
    breakpoints: number[]
    columns: SerializedColumn[]
}
type OldFormatComposed = SerializedSong & {
    isComposed: boolean,
    pitchLevel: number,
    songNotes: any,
    bitsPerPage: number,
    isEncrypted: boolean
}
export class ComposedSong {
    name: string
    data: SongDataType
    version: number
    bpm: number
    pitch: PitchesType
    notes: any //TODO idk what is here
    instruments: [typeof INSTRUMENTS[number], typeof INSTRUMENTS[number], typeof INSTRUMENTS[number]]
    breakpoints: number[]
    columns: Column[]
    selected: number
    constructor(name: string, notes = []) {
        this.version = 1
        this.data = {
            appName: APP_NAME,
            isComposed: true,
            isComposedVersion: true
        }
        this.name = name
        this.bpm = 220
        this.pitch =
            this.pitch = "C"
        this.notes = notes
        this.instruments = [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]]
        this.breakpoints = [0]
        this.columns = []
        this.selected = 0
        new Array(100).fill(0).forEach(_ => {
            const column = new Column()
            column.tempoChanger = 0
            this.columns.push(column)
        })
    }
    static deserialize = (song: SerializedSong) => {
        const bpm = Number(song.bpm)
        const newSong = new ComposedSong(song.name)
        newSong.data = song.data || 'Untitled'
        newSong.bpm = isNaN(bpm) ? 220 : bpm
        newSong.pitch = song.pitch ?? "C"
        newSong.instruments = song.instruments || [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]]
        newSong.breakpoints = song.breakpoints ?? []
        newSong.columns = song.columns.map(column => {
            const columnObj = new Column()
            columnObj.tempoChanger = column[0]
            column[1].forEach(note => {
                columnObj.notes.push(new ColumnNote(note[0], note[1]))
            })
            return columnObj
        })

        return newSong
    }
    toSong = () => {
        const recordedSong = new Song(this.name)
        const bpmPerMs = Math.floor(60000 / this.bpm)
        let totalTime = 100
        this.columns.forEach(column => {
            column.notes.forEach(note => {
                recordedSong.notes.push([note.index, totalTime, 0]) //TODO can add layer data here
            })
            totalTime += Math.floor(bpmPerMs * TEMPO_CHANGERS[column.tempoChanger].changer)
        })
        return recordedSong
    }
    serialize = (): SerializedSong => {
        const bpm = Number(this.bpm)
        const obj: SerializedSong = {
            data: this.data,
            name: this.name,
            bpm: isNaN(bpm) ? 220 : bpm,
            pitch: this.pitch,
            breakpoints: this.breakpoints,
            instruments: this.instruments,
            columns: []
        } 
        obj.data.appName = APP_NAME
        this.columns.forEach(column => {
            const notes = column.notes.map(note => {
                return [note.index, note.layer] 
            })
            const columnArr = [column.tempoChanger, notes]
            //@ts-ignore
            obj.columns.push(columnArr)
        })
        return obj
    }
    toOldFormat = () => {
        const song: OldFormatComposed = {
            ...this.serialize(),
            pitchLevel: PITCHES.indexOf(this.pitch),
            isComposed: this.data.isComposedVersion,
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes: []
        }
        const convertedNotes: OldFormatNoteType[] = []
        const bpmPerMs = Math.floor(60000 / song.bpm)
        let totalTime = 100
        song.columns.forEach(column => {
            column[1].forEach(note => {
                let layer = 1
                if (note[1] === '111') layer = 3
                if (note[1] === '011') layer = 2
                if (note[1] === '101') layer = 3
                if (note[1] === '001') layer = 2
                if (note[1] === '110') layer = 3
                if (note[1] === '010') layer = 2
                if (note[1] === '100') layer = 1
                const noteObj:OldFormatNoteType = {
                    key: (layer > 2 ? 2 : layer) + 'Key' + note[0],
                    time: totalTime,
                    ...layer > 2 ? { l : 3} : {}

                }
                convertedNotes.push(noteObj)
            })
            totalTime += Math.floor(bpmPerMs * TEMPO_CHANGERS[column[0]].changer)
        })
        return convertedNotes
    }
    clone = () => {
        const clone = new ComposedSong(this.name)
        clone.data = {...this.data}
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.instruments = [...this.instruments]
        clone.breakpoints = [...this.breakpoints]
        clone.selected = this.selected
        clone.columns = this.columns.map(column => column.clone())
        return clone
    }
}
