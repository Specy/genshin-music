import { APP_NAME, INSTRUMENT_NOTE_LAYOUT_KINDS } from "$config"
import { ComposedSong } from "$lib/Songs/ComposedSong"
import { RecordedSong } from "$lib/Songs/RecordedSong"
import { Column, ColumnNote, InstrumentData, RecordedNote } from "$lib/Songs/SongClasses"
import Instrument from "../Instrument"
import { NoteLayer } from "../Layer"
import { Song } from "./Song"

class VisualSong{
    chunks: TempoChunk[] = []
    static from(song: Song | ComposedSong) {
        const vs = new VisualSong()
        
    }
}

const map = new Map<number, string>([
    [0, ""],
    [1, "*"],
    [2, "~"],
    [3, "^"],
])

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
}

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

}
class TempoChunk {
    tempoChanger: number
    delay: number
    columns: TempoChunkColumn[]
    constructor(tempoChanger: number, delay: number, columns: TempoChunkColumn[]) {
        this.tempoChanger = tempoChanger
        this.delay = delay
        this.columns = columns
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