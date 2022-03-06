import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, PitchesType } from "appConfig"
import { TEMPO_CHANGERS } from "appConfig"
import { CombinedLayer, LayerIndex, LayerType } from "types/GeneralTypes"
import { Song } from "./Song"
import { Column, ColumnNote, RecordedNote, SongDataType } from "./SongClasses"

interface OldFormatNoteType{
    key: string, 
    time: number
    l?: number
}
export type SerializedNote = [index: number, layer: CombinedLayer]
export type SerializedColumn = [tempoChanger: number, notes: SerializedNote[]]
export interface SerializedComposedSong {
    name: string
    data: SongDataType
    bpm: number
    pitch: PitchesType
    instruments: [typeof INSTRUMENTS[number], typeof INSTRUMENTS[number], typeof INSTRUMENTS[number]]
    breakpoints: number[]
    columns: SerializedColumn[]
}
type OldFormatComposed = SerializedComposedSong & {
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
    notes: RecordedNote[] 
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
    static deserialize = (song: SerializedComposedSong): ComposedSong => {
        const bpm = Number(song.bpm)
        const newSong = new ComposedSong(song.name)
        newSong.data = {...newSong.data, ...song.data} 
        newSong.bpm = isNaN(bpm) ? 220 : bpm
        newSong.pitch = song.pitch ?? "C"
        newSong.instruments = [...song.instruments] || [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]]
        newSong.breakpoints = [...song.breakpoints ?? []] 
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
    get isComposed(): true{
        return true
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
    serialize = (): SerializedComposedSong => {
        const bpm = Number(this.bpm)
        const obj: SerializedComposedSong = {
            data: this.data,
            name: this.name,
            bpm: isNaN(bpm) ? 220 : bpm,
            pitch: this.pitch,
            breakpoints: [...this.breakpoints],
            instruments: [...this.instruments],
            columns: []
        } 
        obj.data.appName = APP_NAME
        this.columns.forEach(column => {
            const notes = column.notes.map(note => {
                return [note.index, note.layer]
            })
            //@ts-ignore
            obj.columns.push([column.tempoChanger, notes])
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
    get selectedColumn(){
        return this.columns[this.selected]
    }
    addColumns(amount: number, position: number | 'end'){
        const columns = new Array(amount).fill(0).map(() => new Column())
        if (position === "end") {
            this.columns.push(...columns)
        } else {
            this.columns.splice(position + 1, 0, ...columns)
        }
    }
    removeColumns(amount: number, position: number){
        if (this.columns.length < 16) return
        const indexes = new Array(amount).fill(0).map((_, i) => position + i)
        indexes.forEach(index => {
            if (this.breakpoints.includes(index)) this.toggleBreakpoint(index)
        })
        this.columns.splice(position, amount)
    }
    toggleBreakpoint(override?: number){
        const index = typeof override === "number" ? override : this.selected
        const breakpointIndex = this.breakpoints.indexOf(index)
        if (breakpointIndex >= 0 && this.columns.length > index) {
            this.breakpoints.splice(breakpointIndex, 1)
        } else if (this.columns.length > index) {
            this.breakpoints.push(index)
        }
    }
    eraseColumns(columns: number[], layer: LayerType | 'all'){
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
                        note.setLayer(layer - 1 as LayerIndex, '0')
                    })
                    column.notes = column.notes.filter(note => !note.layer.match(/^0+$/g))
                }
            })
        }
    }
    validateBreakpoints(){
        this.breakpoints = this.breakpoints.filter(breakpoint => breakpoint < this.columns.length)
    }
    toGenshin = () => {
        const clone = this.clone()
        //@ts-ignore
        clone.instruments = this.instruments.map(_ => INSTRUMENTS[0])
        clone.columns = clone.columns.map(column => {
            column.notes = column.notes.map(note => {
                note.index = IMPORT_NOTE_POSITIONS[note.index]
                return note
            })
            return column
		})
        return clone
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
