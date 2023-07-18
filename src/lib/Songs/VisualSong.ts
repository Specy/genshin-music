import { APP_NAME, NoteNameType } from "$config"
import { ComposedSong } from "$lib/Songs/ComposedSong"
import { RecordedSong } from "$lib/Songs/RecordedSong"
import { Column, ColumnNote, RecordedNote } from "$lib/Songs/SongClasses"
import Instrument from "../Instrument"
import { Song } from "./Song"

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}


const defaultInstrument = new Instrument()

function getNoteText(index: number, layout: NoteNameType){
    const text = defaultInstrument.getNoteText(index, layout, "C")
    return APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
}
export class VisualSong {
    chunks: TempoChunk[] = []
    bpm

    constructor(bpm: number) {
        this.bpm = bpm
    }
    static from(song: Song | ComposedSong) {
        song = song.clone()
        const vs = new VisualSong(song.bpm)
        if (song instanceof RecordedSong) {
            const first = song.notes.shift()
            if (!first) return vs
            const stack = [first]
            let lastNoteTimestamp = first.time
            for (const note of song.notes) {
                const difference = note.time - (stack[0]?.time ?? 0)
                if (difference <= THRESHOLDS.joined) {
                    stack.push(note)
                } else {
                    const delay = note.time - lastNoteTimestamp
                    const chunk = new TempoChunk(0, [TempoChunkColumn.from(stack.splice(0, stack.length))])
                    vs.addChunk(chunk, delay)
                    stack.push(note)
                }
                lastNoteTimestamp = note.time
            }
            const delay = song.notes[song.notes.length - 1].time - lastNoteTimestamp
            const chunk = new TempoChunk(0, [TempoChunkColumn.from(stack)])
            vs.addChunk(chunk, delay)
        } else if (song instanceof ComposedSong) {
            const columns = song.columns
            const first = columns[0]
            if (!first) return vs
            const stack: Column[] = []
            let lastTempoChanger = first.tempoChanger
            for (const column of columns) {
                if (lastTempoChanger === 0 && column.tempoChanger === 0) {
                    vs.addChunk(TempoChunk.from([column]), 0)
                } else if (lastTempoChanger > column.tempoChanger) {
                    stack.push(column)
                    const chunk = TempoChunk.from(stack.splice(0, stack.length))
                    chunk.endingTempoChanger = column.tempoChanger
                    vs.addChunk(chunk, 0)

                } else if (lastTempoChanger < column.tempoChanger) {
                    if (lastTempoChanger === 0) {
                        stack.push(column)
                    } else {
                        vs.addChunk(TempoChunk.from(stack.splice(0, stack.length)), 0)
                        stack.push(column)
                    }
                } else {
                    stack.push(column)
                }
                lastTempoChanger = column.tempoChanger
            }
            if (stack.length) vs.addChunk(TempoChunk.from(stack.splice(0, stack.length)), 0)
            //remove padding from start and end
            let lastChunkWithNotes = -1
            for (let i = 0; i < vs.chunks.length; i++) {
                const chunk = vs.chunks[i]
                if (chunk.columns.some(column => column.notes.length > 0)) {
                    if (lastChunkWithNotes === -1) {
                        vs.chunks.splice(0, i)
                        i = 0
                    }
                    lastChunkWithNotes = i
                }
            }
            vs.chunks.splice(lastChunkWithNotes + 1)

        } else {
            console.error("Song type not supported")
        }
        return vs
    }

    toText(type: NoteNameType) {
        const chunks = this.chunks.map(chunk => chunk.toText(type))
        const tokens: string[] = []
        let empties = 0
        for(const chunk of chunks){
            if(chunk === ""){
                empties++
            }else{
                if(empties){
                    const voids = Math.round((60000 / (empties * this.bpm)) / THRESHOLDS.pause)
                    if(voids <= 2) tokens.push(Array.from({length: voids}, () => `-`).join(" "))
                    else tokens.push(`\n\n`.repeat(Math.round(voids / 2)))
                    empties = 0
                }
                tokens.push(chunk)
            }
        }
        return tokens.join(" ").trim()
    }
    addChunk(chunk: TempoChunk, delay: number) {
        const numberOfEmptyChunks = Math.floor(delay / THRESHOLDS.pause)
        const emptyChunks = Array.from({ length: numberOfEmptyChunks }, () => new TempoChunk(0, []))
        this.chunks.push(chunk, ...emptyChunks)
    }
}


class TempoChunkNote {
    note: number
    constructor(note: number) {
        this.note = note
    }
    static from(note: ColumnNote | RecordedNote) {
        return new TempoChunkNote(
            note.index
        )
    }
    toText(type: NoteNameType) {
        return `${getNoteText(this.note, type)}`
    }

}

const TEMPO_CHANGERS = new Map<number, string>([
    [0, ""],
    [1, "*"],
    [2, "~"],
    [3, "^"],
])
const TEMPO_CHANGER_2 = new Map<number, string[]>([
    [0, ["", ""]],
    [1, ["(", ")"]],
    [2, ["[", "]"]],
    [3, ["{", "}"]],
])

class TempoChunkColumn {
    notes: TempoChunkNote[]
    constructor(notes: TempoChunkNote[]) {
        this.notes = notes
    }
    static from(column: Column | RecordedNote[]) {
        if (column instanceof Column) {
            return new TempoChunkColumn(
                column.notes.map(note => TempoChunkNote.from(note))
            )
        } else {
            return new TempoChunkColumn(
                column.map(note => TempoChunkNote.from(note))
            )
        }
    }
    toText(type: NoteNameType) {
        return this.notes.map(note => note.toText(type)).join("")
    }
}
export class TempoChunk {
    tempoChanger: number
    columns: TempoChunkColumn[]
    endingTempoChanger: number
    constructor(tempoChanger: number, columns: TempoChunkColumn[]) {
        this.tempoChanger = tempoChanger
        this.endingTempoChanger = tempoChanger
        this.columns = columns
    }

    static from(columns: Column[], tempoChanger?: number) {
        tempoChanger = tempoChanger ?? columns[0]?.tempoChanger
        if(tempoChanger === undefined) console.log( "tempoChanger is undefined", columns, tempoChanger)
        return new TempoChunk(
            tempoChanger ?? 0,
            columns.map(column => TempoChunkColumn.from(column))
        )
    }
    toText(type: NoteNameType) {
        const [start, end] = TEMPO_CHANGER_2.get(this.tempoChanger) ?? ["", ""]
        const notes = this.columns.map(column => column.toText(type)).join(" ").trim()
        if(!notes) return ""
        return `${start}${notes}${end}`
    }
}





export class Chunk {
    notes: RecordedNote[] = []
    delay = 0
    constructor(notes: RecordedNote[] = [], delay: number = 0) {
        this.notes = notes
        this.delay = delay
    }
}