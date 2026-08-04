// old: src/lib/Songs/VisualSong.ts (245 lines) - minimal-diff port, import-path swaps only.
// `$config` -> `$core/legacyConfig` (APP_NAME/NoteNameType); `$lib/Songs/*` -> relative imports
// (`./ComposedSong`, `./RecordedSong`, `./SongClasses`) - matches this directory's own sibling-file
// convention (RecordedSong.ts/ComposedSong.ts both import their Songs/ siblings relatively, not via
// the `$core/Songs/*` alias); `$lib/audio/Instrument` -> `$lib/audio/Instrument.svelte`
// (Phase-4a Task 2's ObservableNote/Instrument port).
//
// FLAGGED FOR REVIEWER: getNoteText's `APP_NAME === 'Genshin' ? toLowerCase : toUpperCase` casing
// branch is kept via legacyConfig's direct APP_NAME (core-tier file, same precedent as
// ComposedSong.ts:360's `APP_NAME === 'Genshin' ? 21 : 15`). `game.notes.visualNameCasing`
// ('lowercase'/'uppercase', $lib/games/types.ts:124, both genshin/index.ts:123 and sky/index.ts:119
// already cite this exact old line as its source) is the UI-tier twin of this branch but has NO
// consumer anywhere - this core-tier model cannot read `$game` directly (two-tier rule), so the
// branch is intentionally left on APP_NAME instead of being unified with the game-data field.
//
// Deliberate dual-`Chunk`: this file's `Chunk` (bottom, `{notes: RecordedNote[], delay: number}`)
// is a DIFFERENT class from `$core/Songs/RecordedSong`'s `Chunk` (structurally similar, but a
// distinct constructor/identity). SheetFrame (Task 2) imports THIS Chunk as its prop type while
// being fed RecordedSong chunks at runtime by PlayerPagesRenderer (duck-typed - both shapes are
// `{notes, delay}`) - preserved exactly as old wired it, not unified.
import {APP_NAME, SUSTAIN_VISUAL_THRESHOLD_MS, type NoteNameType} from "$core/legacyConfig"
import {ComposedSong} from "./ComposedSong"
import {RecordedSong} from "./RecordedSong"
import {ColumnNote, type InstrumentData, NoteColumn, RecordedNote} from "./SongClasses"
import {displayButtonForId} from "./noteIds"
import {Instrument} from '$lib/audio/Instrument.svelte'
import {Song} from "./Song"

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}


const defaultInstrument = new Instrument()

function getNoteText(index: number, layout: NoteNameType) {
    const text = defaultInstrument.getNoteText(index, layout, "C")
    return APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
}

export class VisualSong {
    chunks: TempoChunk[] = []
    bpm

    constructor(bpm: number) {
        this.bpm = bpm
    }

    static from(song: Song | ComposedSong, flattenEmptyChunks: boolean) {
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
                    const chunk = new TempoChunk(0, [TempoChunkColumn.from(stack.splice(0, stack.length), song.instruments)])
                    vs.addChunk(chunk, delay)
                    stack.push(note)
                }
                lastNoteTimestamp = note.time
            }
            const delay = song.notes[song.notes.length - 1].time - lastNoteTimestamp
            const chunk = new TempoChunk(0, [TempoChunkColumn.from(stack, song.instruments)])
            vs.addChunk(chunk, delay)
            //make sure there is at least one column even in empty chunks
            vs.chunks = vs.chunks.map(chunk => {
                if (chunk.columns.length === 0) {
                    chunk.columns.push(new TempoChunkColumn([]))
                }
                return chunk
            })
        } else if (song instanceof ComposedSong) {
            const columns = song.columns
            const first = columns[0]
            if (!first) return vs
            const stack: NoteColumn[] = []
            let lastTempoChanger = first.tempoChanger
            for (const column of columns) {
                if (lastTempoChanger === 0 && column.tempoChanger === 0) {
                    vs.addChunk(TempoChunk.from([column], song.instruments), 0)
                } else if (lastTempoChanger > column.tempoChanger) {
                    stack.push(column)
                    const chunk = TempoChunk.from(stack.splice(0, stack.length), song.instruments)
                    chunk.endingTempoChanger = column.tempoChanger
                    vs.addChunk(chunk, 0)

                } else if (lastTempoChanger < column.tempoChanger) {
                    if (lastTempoChanger === 0) {
                        stack.push(column)
                    } else {
                        vs.addChunk(TempoChunk.from(stack.splice(0, stack.length), song.instruments), 0)
                        stack.push(column)
                    }
                } else {
                    stack.push(column)
                }
                lastTempoChanger = column.tempoChanger
            }
            if (stack.length) vs.addChunk(TempoChunk.from(stack.splice(0, stack.length), song.instruments), 0)
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
        if (flattenEmptyChunks) {
            let counter = 0
            let finalChunks = [] as TempoChunk[]
            for (const chunk of vs.chunks) {
                if (chunk.columns.every(c => c.notes.length === 0)) {
                    counter++
                } else {
                    const lastChunk = finalChunks[finalChunks.length - 1]
                    if (lastChunk) {
                        lastChunk.emptyAhead = counter
                        counter = 0
                    }
                    finalChunks.push(chunk)
                }
            }
            vs.chunks = finalChunks
        }
        return vs
    }

    toText(type: NoteNameType) {
        const chunks = this.chunks.map(chunk => chunk.toText(type))
        const tokens: string[] = []
        let empties = 0
        for (const chunk of chunks) {
            if (chunk === "") {
                empties++
            } else {
                if (empties) {
                    const voids = Math.round((60000 / (empties * this.bpm)) / THRESHOLDS.pause)
                    if (voids <= 2) tokens.push(Array.from({length: voids}, () => `-`).join(" "))
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
        const emptyChunks = Array.from({length: numberOfEmptyChunks}, () => new TempoChunk(0, []))
        this.chunks.push(chunk, ...emptyChunks)
    }
}


class TempoChunkNote {
    /** BUTTON row (display concern): the note's own track instrument's button — exactly the pre-v4 `note.index` — falling back to the canonical (default-instrument) position for stranded ids. */
    note: number
    /** Deliberately-held note (composed span > 1, recorded duration over the visual threshold) — grid display cue only; toText() ignores it (the shared text format is unchanged). */
    held: boolean

    constructor(note: number, held: boolean = false) {
        this.note = note
        this.held = held
    }

    static from(note: ColumnNote | RecordedNote, instruments: InstrumentData[]): TempoChunkNote | null {
        const button = displayButtonForId(instruments[note.trackIndex]?.name ?? '', note.id)
        if (button === -1) return null
        const held = note instanceof ColumnNote
            ? note.span > 1
            : note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS
        return new TempoChunkNote(button, held)
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

    static from(column: NoteColumn | RecordedNote[], instruments: InstrumentData[]) {
        const source = column instanceof NoteColumn ? column.notes : column
        //same id doubled on several tracks was ONE merged entry pre-v4 — dedupe by button
        //(a held contribution wins over a tap on the same button)
        const seen = new Map<number, TempoChunkNote>()
        const notes: TempoChunkNote[] = []
        for (const note of source) {
            const chunkNote = TempoChunkNote.from(note, instruments)
            if (chunkNote === null) continue
            const existing = seen.get(chunkNote.note)
            if (existing) {
                if (chunkNote.held) existing.held = true
                continue
            }
            seen.set(chunkNote.note, chunkNote)
            notes.push(chunkNote)
        }
        return new TempoChunkColumn(notes)
    }

    toText(type: NoteNameType) {
        return this.notes.map(note => note.toText(type)).join("")
    }
}

export class TempoChunk {
    tempoChanger: number
    columns: TempoChunkColumn[]
    endingTempoChanger: number
    emptyAhead: undefined | number

    constructor(tempoChanger: number, columns: TempoChunkColumn[]) {
        this.tempoChanger = tempoChanger
        this.endingTempoChanger = tempoChanger
        this.columns = columns
    }

    static from(columns: NoteColumn[], instruments: InstrumentData[], tempoChanger?: number) {
        tempoChanger = tempoChanger ?? columns[0]?.tempoChanger
        if (tempoChanger === undefined) console.warn("tempoChanger is undefined", columns, tempoChanger)
        return new TempoChunk(
            tempoChanger ?? 0,
            columns.map(column => TempoChunkColumn.from(column, instruments))
        )
    }

    toText(type: NoteNameType) {
        const [start, end] = TEMPO_CHANGER_2.get(this.tempoChanger) ?? ["", ""]
        const notes = this.columns.map(column => column.toText(type)).join(" ").trim()
        if (!notes) return ""
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
