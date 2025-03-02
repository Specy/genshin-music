import {Midi} from "@tonejs/midi"
import {
    APP_NAME,
    COMPOSER_NOTE_POSITIONS,
    IMPORT_NOTE_POSITIONS,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    PITCHES,
    TEMPO_CHANGERS
} from "$config"
import {InstrumentName} from "$types/GeneralTypes"
import {_LegacySongInstruments, OldFormat} from "$types/SongTypes"
import {NoteLayer} from "./Layer"
import {RecordedSong} from "./RecordedSong"
import {ColumnNote, InstrumentData, NoteColumn, RecordedNote, SerializedColumn} from "./SongClasses"
import {SerializedSong, Song} from "./Song"
import {clamp} from "../utils/Utilities";

interface OldFormatNoteType {
    key: string,
    time: number
    l?: number
}

export type InstrumentNoteIcon = 'line' | 'circle' | 'border'


export type BaseSerializedComposedSong = SerializedSong & {
    type: "composed"
    breakpoints: number[]
    columns: SerializedColumn[]
    reverb: boolean
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
}

export type UnknownSerializedComposedSong = SerializedComposedSongV1 | SerializedComposedSongV2 | SerializedComposedSong


export type OldFormatComposed = BaseSerializedComposedSong & OldFormat

export const defaultInstrumentMap: InstrumentNoteIcon[] = ['border', 'circle', 'line']

export class ComposedSong extends Song<ComposedSong, SerializedComposedSong, 3> {
    notes: RecordedNote[] = []
    breakpoints: number[]
    columns: NoteColumn[]
    reverb: boolean = false
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
        this.columns = new Array(100).fill(0).map(_ => new NoteColumn())
        instruments.forEach(this.addInstrument)
    }

    static deserialize(song: UnknownSerializedComposedSong): ComposedSong {
        //@ts-ignore
        if (song.version === undefined) song.version = 1
        const parsed = Song.deserializeTo(new ComposedSong(song.name), song)
        parsed.reverb = song.reverb ?? false
        parsed.breakpoints = (song.breakpoints ?? []).filter(Number.isFinite)
        //parsing columns
        if (song.version === 1) {
            parsed.columns = song.columns.map(column => {
                const parsedColumn = new NoteColumn()
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
            parsed.columns = song.columns.map(column => NoteColumn.deserialize(column))
        }
        const highestLayer = NoteLayer.maxLayer(parsed.columns.flatMap(column => column.notes.map(note => note.layer)))
        //make sure there are enough instruments for all layers
        parsed.instruments = highestLayer.toString(2).split("").map((_, i) => {
            const ins = new InstrumentData()
            ins.icon = defaultInstrumentMap[i % 3]
            return ins
        })
        //parsing instruments
        if (song.version === 1 || song.version === 2) {
            const instruments = (Array.isArray(song.instruments) ? song.instruments : []) as _LegacySongInstruments
            instruments.forEach((name, i) => {
                const ins = new InstrumentData({name})
                ins.icon = defaultInstrumentMap[i % 3]
                parsed.instruments[i] = ins
            })
        } else if (song.version === 3) {
            song.instruments.forEach((ins, i) => {
                parsed.instruments[i] = InstrumentData.deserialize(ins)
            })
        }
        if (parsed.instruments.length > NoteLayer.MAX_LAYERS) throw new Error(`Sheet has ${song.instruments.length} instruments, but the max is ${NoteLayer.MAX_LAYERS}`)

        return parsed
    }

    static isSerializedType(obj: any) {
        if (typeof obj !== 'object') return false
        if (obj.type === 'composed') return true
        //legacy format
        if (obj?.data?.isComposedVersion === true) return true

        return false
    }

    static isOldFormatSerializedType(obj: any) {
        if (typeof obj !== 'object') return false
        if (obj.type) return false
        if (Array.isArray(obj.songNotes) && obj.composedSong) return true
        return false
    }

    get isComposed(): true {
        return true
    }

    get lastInstrument(): InstrumentData {
        return this.instruments[this.instruments.length - 1]
    }

    toRecordedSong = (offset: number = 100) => {
        const recordedSong = new RecordedSong(this.name)
        recordedSong.bpm = this.bpm
        recordedSong.pitch = this.pitch
        const msPerBeat = 60000 / this.bpm
        let totalTime = offset
        this.columns.forEach(column => {
            column.notes.forEach(note => {
                recordedSong.notes.push(new RecordedNote(note.index, totalTime, note.layer.clone()))
            })
            totalTime += Song.roundTime(msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer)
        })
        recordedSong.instruments = this.instruments.map(ins => ins.clone())

        return recordedSong
    }

    toComposedSong = () => {
        return this.clone()
    }
    addInstrument = (name: InstrumentName) => {
        const newInstrument: InstrumentData = new InstrumentData({name})
        newInstrument.icon = defaultInstrumentMap[this.instruments.length % 3]
        this.instruments = [...this.instruments, newInstrument]
    }

    ensureInstruments() {
        const {columns, instruments} = this
        const highestLayer = NoteLayer.maxLayer(columns.flatMap(column => column.notes.map(note => note.layer)))
        const numberOfInstruments = highestLayer.toString(2).split("").length
        if (numberOfInstruments > instruments.length) {
            const newInstruments = new Array(numberOfInstruments - instruments.length).fill(0).map(_ => new InstrumentData())
            this.instruments = [...instruments, ...newInstruments]
        }

    }

    static selection(start: number, end: number) {
        return new Array(end - start).fill(0).map((_, i) => i - start)
    }

    removeInstrument = async (index: number) => {
        this.eraseColumns(ComposedSong.selection(0, this.columns.length), index)

        if (index !== this.instruments.length - 1) {
            const toMove = this.instruments.slice(index)
            toMove.forEach((_, i) => {
                this.switchLayer(this.columns.length, 0, index + i, index + i - 1)
            })
        }
        this.instruments.splice(index, 1)

        this.instruments = [...this.instruments]
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
            reverb: this.reverb,
            breakpoints: [...this.breakpoints],
            instruments: this.instruments.map(instrument => instrument.serialize()),
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
        const msPerBeat = 60000 / song.bpm
        let totalTime = 100
        song.columns.forEach(column => {
            column[1].forEach(note => {
                const parsedLayer = NoteLayer.deserializeHex(note[1])
                const stringifiedLayer = parsedLayer.toArray().join("").padEnd(4, "0").substring(0, 4)
                const layer = LAYERS_MAP[stringifiedLayer] ?? 1
                if (layer === 0) return
                const noteObj: OldFormatNoteType = {
                    key: (layer > 2 ? 2 : layer) + 'Key' + note[0],
                    time: totalTime,
                    ...layer > 2 ? {l: 3} : {}
                }
                convertedNotes.push(noteObj)
            })
            //old format uses floor instead of rounding
            totalTime += Math.floor(msPerBeat * TEMPO_CHANGERS[column[0]].changer)
        })
        song.songNotes = convertedNotes
        return song
    }

    get selectedColumn() {
        return this.columns[this.selected]
    }

    addColumns = (amount: number, position: number | 'end') => {
        const columns = new Array(amount).fill(0).map(() => new NoteColumn())
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

    pasteLayer(copiedColumns: NoteColumn[], insert: boolean, layer: number) {
        const layerColumns = copiedColumns.map(col => {
            const clone = col.clone()
            clone.notes = clone.notes.map(note => {
                note.layer.clear()
                note.layer.set(layer, true)
                return note
            }).filter(note => !note.layer.isEmpty())
            return clone
        })
        this.ensureInstruments()
        this.pasteColumns(layerColumns, insert)
    }

    pasteColumns = async (copiedColumns: NoteColumn[], insert: boolean) => {
        const cloned: NoteColumn[] = copiedColumns.map(column => column.clone())
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
        this.ensureInstruments()
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
        let copiedColumns: NoteColumn[] = []
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
        let min = Math.min(...selectedColumns)
        this.selected = clamp(min, 0, this.columns.length - 1)
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
        const midiNames = [...new Set(this.instruments.map(i => INSTRUMENTS_DATA[i.name].midiName))]
        this.instruments.forEach((ins, i) => {
            const instrument = INSTRUMENTS_DATA[ins.name]
            if (!instrument || !midi.tracks[i]) return
            midi.tracks[i].instrument.name = instrument.midiName
            //this avoids duplicates if there are more than 16 instruments, which is the max for midi
            midi.tracks[i].channel = this.instruments.length < 16 ? i : midiNames.indexOf(instrument.midiName)
            midi.tracks[i].name = `${ins.pitch} | ${ins.alias ?? ins.name}`
        })
        return midi
    }
    clone = () => {
        const clone = new ComposedSong(this.name)
        clone.id = this.id
        clone.folderId = this.folderId
        clone.bpm = this.bpm
        clone.data = {...this.data}
        clone.version = this.version
        clone.pitch = this.pitch
        clone.instruments = this.instruments.map(ins => ins.clone())
        clone.breakpoints = [...this.breakpoints]
        clone.selected = this.selected
        clone.columns = this.columns.map(column => column.clone())
        return clone
    }
}

const LAYERS_MAP: { [key in string]: number } = {
    '0000': 1, //out of range
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
