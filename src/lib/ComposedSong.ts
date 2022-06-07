import { IMPORT_NOTE_POSITIONS, APP_NAME, INSTRUMENTS, PITCHES, Pitch } from "appConfig"
import { TEMPO_CHANGERS } from "appConfig"
import { InstrumentName, LayerIndex, LayerType } from "types/GeneralTypes"
import { SongInstruments } from "types/SongTypes"
import { NoteLayer } from "./Layer"
import { Song } from "./Song"
import { Column, ColumnNote, RecordedNote, SongData } from "./SongClasses"

interface OldFormatNoteType {
    key: string,
    time: number
    l?: number
}
export type ComposedSongInstruments = [InstrumentName, InstrumentName, InstrumentName, InstrumentName]
export type SerializedNote = [index: number, layer: string]
export type SerializedColumn = [tempoChanger: number, notes: SerializedNote[]]
export interface SerializedComposedSong {
    id: string | null
    version: number
    name: string
    data: SongData
    bpm: number
    pitch: Pitch
    instruments: SongInstruments
    breakpoints: number[]
    columns: SerializedColumn[]
}
type OldFormatComposed = SerializedComposedSong & {
    isComposed: boolean,
    pitchLevel: number,
    songNotes: {
        key: string
        time: number
        l?: number
    }[],
    bitsPerPage: number,
    isEncrypted: boolean
}
export class ComposedSong {
    id: string | null
    name: string
    data: SongData
    version: number
    bpm: number
    pitch: Pitch
    notes: RecordedNote[]
    instruments: ComposedSongInstruments
    breakpoints: number[]
    columns: Column[]
    selected: number
    constructor(name: string, notes: RecordedNote[] = []) {
        this.version = 2
        this.data = {
            appName: APP_NAME,
            isComposed: true,
            isComposedVersion: true
        }
        this.id = null
        this.name = name
        this.bpm = 220
        this.pitch = "C"
        this.notes = notes
        this.instruments = [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]]
        this.breakpoints = [0]
        this.selected = 0
        this.columns = new Array(100).fill(0).map(_ => new Column())
    }
    static deserialize = (song: SerializedComposedSong): ComposedSong => {
        const bpm = Number(song.bpm)
        const parsed = new ComposedSong(song.name)
        parsed.id = song.id
        parsed.data = { ...parsed.data, ...song.data }
        parsed.bpm = isNaN(bpm) ? 220 : bpm
        parsed.pitch = song.pitch ?? "C"
        song.instruments = song.instruments ?? []
       
        parsed.instruments.map((_, i) => {
            const toParse = song?.instruments[i] as any
            return INSTRUMENTS.includes(toParse) ? toParse : INSTRUMENTS[0]
        })
        parsed.breakpoints = [...(song.breakpoints ?? [])]
        parsed.columns = song.columns.map(column => {
            const parsedColumn = new Column()
            parsedColumn.tempoChanger = column[0]
            column[1].forEach(note => {
                if(song.version === undefined) song.version = 1
                if(song.version !== 2){
                    const layer = note[1].split("").reverse().join("")
                    const deserializedNote = new ColumnNote(note[0], NoteLayer.deserializeBin(layer))
                    return parsedColumn.notes.push(deserializedNote)
                }
                const layer = NoteLayer.deserializeHex(note[1])
                if (layer.isEmpty()) return
                parsedColumn.notes.push(new ColumnNote(note[0], layer))
            })
            return parsedColumn
        })
        return parsed
    }
    get isComposed(): true {
        return true
    }
    toSong = () => {
        const recordedSong = new Song(this.name)
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
    serialize = (): SerializedComposedSong => {

        const bpm = Number(this.bpm)
        const serialized: SerializedComposedSong = {
            name: this.name,
            bpm: isNaN(bpm) ? 220 : bpm,
            pitch: this.pitch,
            version: this.version,
            data: {
                ...this.data,
                appName: APP_NAME
            },
            breakpoints: [...this.breakpoints],
            instruments: [...this.instruments],
            columns: [],
            id: this.id
        }
        this.columns.forEach(column => {
            const notes = column.notes.map(note => {
                return [note.index, note.layer.serializeHex()] as SerializedNote
            })
            serialized.columns.push([column.tempoChanger, notes])
        })
        return serialized
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
    toggleBreakpoint = (override?: number) => {
        const index = typeof override === "number" ? override : this.selected
        const breakpointIndex = this.breakpoints.indexOf(index)
        if (breakpointIndex >= 0 && this.columns.length > index) {
            this.breakpoints.splice(breakpointIndex, 1)
        } else if (this.columns.length > index) {
            this.breakpoints.push(index)
        }
    }
    eraseColumns = (columns: number[], layer: LayerType | 'all') => {
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
                        note.setLayer(layer - 1 as LayerIndex, false)
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
                            if (clonedNote.isLayerToggled(j as LayerIndex)) {
                                column.notes[index].setLayer(j as LayerIndex, true)
                            }
                        }
                    }
                })
            })
        }
        return this
    }
    copyColumns = (selectedColumns: number[], layer: LayerType | 'all') => {
        let copiedColumns: Column[] = []
        selectedColumns.forEach((index) => {
            const column = this.columns[index]
            if (column !== undefined) copiedColumns.push(column.clone())
        })
        if (layer !== 'all') {
            copiedColumns = copiedColumns.map(column => {
                column.notes = column.notes.filter(e => e.isLayerToggled(layer - 1 as LayerIndex))
                column.notes = column.notes.map(e => {
                    e.clearLayer()
                    e.setLayer(layer - 1 as LayerIndex, true)
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
        clone.instruments = this.instruments.map(_ => INSTRUMENTS[0]) as ComposedSongInstruments
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
        clone.data = { ...this.data }
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