// type-only (P3 Task 7 fix): see the matching comment in $core/Services/FileService.ts - a value
// import of `Midi` breaks under Node's native ESM loader once this file is reachable from the root
// layout's SSR graph; this file only uses `Midi` as toMidi()'s return-type annotation, never
// constructs one, so `import type` (fully erased) sidesteps the problem entirely.
import type {Midi} from "@tonejs/midi"
import {
    APP_NAME,
    COMPOSER_NOTE_POSITIONS,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    PITCHES,
    TEMPO_CHANGERS
} from "$core/legacyConfig"
import type {InstrumentName} from "$core/types"
import type {_LegacySongInstruments, OldFormat} from "$core/types"
import {NoteLayer} from "./Layer"
import {RecordedSong} from "./RecordedSong"
import {
    ColumnNote,
    InstrumentData,
    NoteColumn,
    RecordedNote,
    type InstrumentNoteIcon,
    type SerializedColumnV3,
    type SerializedComposedTrack,
    type SerializedInstrumentData,
    type SerializedTrackNote,
} from "./SongClasses"
import {type SerializedSong, Song} from "./Song"
import {clamp} from "../utils/Utilities"
import {isLegacyAppName, LEGACY_NOTE_TABLES, legacyIndexToId} from "./legacyNoteTables"
import {buttonToNoteId, displayButtonForId, foldIdIntoRange, getNoteIdTable} from "./noteIds"

interface OldFormatNoteType {
    key: string,
    time: number
    l?: number
}

/** Shared shape of the LEGACY serialized versions (≤v3): index+layer columns, top-level instruments. */
export type BaseSerializedComposedSong = SerializedSong & {
    type: "composed"
    breakpoints: number[]
    columns: SerializedColumnV3[]
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
export type SerializedComposedSongV3 = BaseSerializedComposedSong & {
    version: 3
    instruments: SerializedInstrumentData[]
}
/** Current format (v4): per-track Note Id notes on a shared column-tempo timeline. */
export type SerializedComposedSong = SerializedSong & {
    type: "composed"
    version: 4
    breakpoints: number[]
    reverb: boolean
    columnTempos: number[]
    tracks: SerializedComposedTrack[]
}

export type UnknownSerializedComposedSong =
    SerializedComposedSongV1
    | SerializedComposedSongV2
    | SerializedComposedSongV3
    | SerializedComposedSong


export type OldFormatComposed = BaseSerializedComposedSong & OldFormat

export const defaultInstrumentMap: InstrumentNoteIcon[] = ['border', 'circle', 'line']

export class ComposedSong extends Song<ComposedSong, SerializedComposedSong, 4> {
    breakpoints: number[]
    columns: NoteColumn[]
    reverb: boolean = false
    selected: number

    constructor(name: string, instruments: InstrumentName[] = []) {
        super(name, 4, 'composed', {
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

    /**
     * `importInto`: legacy-cross-game target. When set (parseSong, legacy file whose
     * appName ≠ the running game), the legacy path reproduces the historic
     * deserialize-then-toGenshin pipeline in one step: indices remapped through the
     * TARGET's frozen importPositions, roster reset to the target's default instrument
     * (icon cycle preserved), ids from the target's frozen default table. v4 songs
     * ignore it (their cross-game path is toGenshin()'s id-fold).
     */
    static deserialize(song: UnknownSerializedComposedSong, importInto?: 'Genshin' | 'Sky'): ComposedSong {
        //@ts-ignore
        if (song.version === undefined) song.version = 1
        const parsed = Song.deserializeTo(new ComposedSong(song.name), song)
        parsed.reverb = song.reverb ?? false
        parsed.breakpoints = (song.breakpoints ?? []).filter(Number.isFinite)
        if (song.version === 4) {
            parsed.instruments = (song.tracks ?? []).map(track => InstrumentData.deserialize(track.instrument))
            parsed.columns = (song.columnTempos ?? []).map(tempo => {
                const column = new NoteColumn()
                column.tempoChanger = tempo
                return column
            })
            ;(song.tracks ?? []).forEach((track, trackIndex) => {
                track.notes.forEach(([columnIndex, id, span]) => {
                    const column = parsed.columns[columnIndex]
                    if (column === undefined) return
                    column.addNote(trackIndex, id, span ?? 1)
                })
            })
            if (parsed.instruments.length > NoteLayer.MAX_LAYERS) throw new Error(`Sheet has ${parsed.instruments.length} instruments, but the max is ${NoteLayer.MAX_LAYERS}`)
            return parsed
        }
        return ComposedSong.deserializeLegacy(song, parsed, importInto)
    }

    /**
     * v1-v3 path: decode the index+NoteLayer columns exactly as the legacy code did
     * (v1 bin-string reversal quirk included), then expand every (index, layer bitmask)
     * note into per-track Note Id notes via the FROZEN legacy tables of the song's own
     * game. Out-of-table indices (silent ghost notes in the legacy runtime) are
     * dropped — see legacyNoteTables.legacyIndexToId.
     */
    private static deserializeLegacy(song: SerializedComposedSongV1 | SerializedComposedSongV2 | SerializedComposedSongV3, parsed: ComposedSong, importInto?: 'Genshin' | 'Sky'): ComposedSong {
        type LegacyNote = { index: number, layer: NoteLayer }
        //parsing columns (legacy decode, byte-faithful)
        const legacyColumns: { tempoChanger: number, notes: LegacyNote[] }[] = []
        if (song.version === 1) {
            song.columns.forEach(column => {
                const notes: LegacyNote[] = []
                column[1].forEach(note => {
                    const layer = note[1].split("").reverse().join("")
                    notes.push({index: note[0], layer: NoteLayer.deserializeBin(layer)})
                })
                legacyColumns.push({tempoChanger: column[0], notes})
            })
        } else {
            song.columns.forEach(column => {
                const notes = column[1]
                    .map(note => ({index: note[0], layer: NoteLayer.deserializeHex(note[1])}))
                    .filter(note => !note.layer.isEmpty())
                legacyColumns.push({tempoChanger: column[0], notes})
            })
        }
        const highestLayer = NoteLayer.maxLayer(legacyColumns.flatMap(column => column.notes.map(note => note.layer)))
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
        const crossGame = importInto !== undefined && parsed.data.appName !== importInto
        if (crossGame) {
            //historic toGenshin(): roster reset to the target default with the icon cycle
            parsed.data.appName = importInto
            parsed.instruments = parsed.instruments.map((_, i) => {
                const ins = new InstrumentData({name: LEGACY_NOTE_TABLES[importInto].defaultInstrument as InstrumentName})
                ins.icon = defaultInstrumentMap[i % 3]
                return ins
            })
        }
        //expand (index, mask) into per-track Note Id notes
        const appName = isLegacyAppName(parsed.data.appName) ? parsed.data.appName : (APP_NAME as 'Genshin' | 'Sky')
        const importPositions = crossGame ? LEGACY_NOTE_TABLES[importInto].importPositions : null
        parsed.columns = legacyColumns.map(legacyColumn => {
            const column = new NoteColumn()
            column.tempoChanger = legacyColumn.tempoChanger
            legacyColumn.notes.forEach(note => {
                const index = importPositions ? (importPositions[note.index] ?? -1) : note.index
                if (index === -1) return
                for (let trackIndex = 0; trackIndex < parsed.instruments.length; trackIndex++) {
                    if (!note.layer.test(trackIndex)) continue
                    const id = legacyIndexToId(appName, parsed.instruments[trackIndex].name, index)
                    if (id === null) continue
                    if (column.findNote(trackIndex, id) === null) column.addNote(trackIndex, id)
                }
            })
            return column
        })
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
        //per-column real durations, needed to turn spans into ms
        const columnDurations = this.columns.map(column =>
            Song.roundTime(msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer)
        )
        let totalTime = offset
        this.columns.forEach((column, columnIndex) => {
            column.notes.forEach(note => {
                //span 1 = the pre-sustain one-shot behavior = no duration
                let duration = 0
                if (note.span > 1) {
                    for (let i = columnIndex; i < columnIndex + note.span; i++) {
                        duration += columnDurations[i] ?? 0
                    }
                }
                recordedSong.notes.push(new RecordedNote(note.id, totalTime, duration, note.trackIndex))
            })
            totalTime += columnDurations[columnIndex]
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
        let highestTrack = -1
        columns.forEach(column => column.notes.forEach(note => {
            if (note.trackIndex > highestTrack) highestTrack = note.trackIndex
        }))
        const numberOfInstruments = highestTrack + 1
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
        this.columns.forEach(column => {
            column.notes.forEach(note => {
                if (note.trackIndex > index) note.trackIndex--
            })
        })
        this.instruments.splice(index, 1)
        this.instruments = [...this.instruments]
    }
    serialize = (): SerializedComposedSong => {
        let bpm = parseInt(this.bpm as any)
        const tracks: SerializedComposedTrack[] = this.instruments.map((instrument, trackIndex) => {
            const notes: SerializedTrackNote[] = []
            this.columns.forEach((column, columnIndex) => {
                column.notesOfTrack(trackIndex)
                    .slice()
                    .sort((a, b) => a.id - b.id)
                    .forEach(note => {
                        notes.push(note.span > 1 ? [columnIndex, note.id, note.span] : [columnIndex, note.id])
                    })
            })
            return {
                instrument: instrument.serialize(),
                notes
            }
        })
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
            columnTempos: this.columns.map(column => column.tempoChanger),
            tracks,
            id: this.id
        }
    }
    toOldFormat = (): OldFormatComposed => {
        const serialized = this.serialize()
        const song: OldFormatComposed = {
            name: serialized.name,
            type: 'composed',
            bpm: serialized.bpm,
            pitch: serialized.pitch,
            //old format consumers never read `version`; keep the legacy value they were built against
            version: 3,
            folderId: serialized.folderId,
            data: serialized.data,
            reverb: serialized.reverb,
            breakpoints: serialized.breakpoints,
            instruments: this.instruments.map(instrument => instrument.serialize()),
            columns: this.legacyColumnsView(),
            id: serialized.id,
            pitchLevel: PITCHES.indexOf(this.pitch),
            isComposed: true,
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes: []
        }
        const convertedNotes: OldFormatNoteType[] = []
        const msPerBeat = 60000 / song.bpm
        let totalTime = 100
        this.columns.forEach(column => {
            const grouped = this.groupColumnNotesById(column)
            grouped.forEach(({index, trackIndices}) => {
                const stringifiedLayer = new Array(4).fill(0).map((_, i) => trackIndices.includes(i) ? '1' : '0').join('')
                const layer = LAYERS_MAP[stringifiedLayer] ?? 1
                if (layer === 0) return
                const noteObj: OldFormatNoteType = {
                    key: (layer > 2 ? 2 : layer) + 'Key' + index,
                    time: totalTime,
                    ...layer > 2 ? {l: 3} : {}
                }
                convertedNotes.push(noteObj)
            })
            //old format uses floor instead of rounding
            totalTime += Math.floor(msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer)
        })
        song.songNotes = convertedNotes
        return song
    }

    /** Old-format export view: columns re-expressed as legacy [tempo, [index, hexLayer][]] via the frozen tables. Notes whose id has no button in the frozen default table are dropped. */
    private legacyColumnsView(): SerializedColumnV3[] {
        return this.columns.map(column => {
            const notes = this.groupColumnNotesById(column).map(({index, trackIndices}) => {
                const layer = new NoteLayer()
                trackIndices.forEach(t => layer.set(t, true))
                return [index, layer.serializeHex()] as [number, string]
            })
            return [column.tempoChanger, notes] as SerializedColumnV3
        })
    }

    /** How many (column-grouped) notes toOldFormat() would drop — ids without a frozen default-table button. Download UIs surface this before exporting to the legacy ecosystem. */
    countOldFormatDroppedNotes(): number {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        let dropped = 0
        this.columns.forEach(column => {
            const seen = new Set<number>()
            column.notes.forEach(note => {
                if (defaultTable.indexOf(note.id) !== -1) return
                if (seen.has(note.id)) return
                seen.add(note.id)
                dropped++
            })
        })
        return dropped
    }

    /** Group a column's notes by legacy index (frozen default-table position of their id), merging tracks — the shape the pre-v4 formats stored. Stranded ids are dropped. */
    private groupColumnNotesById(column: NoteColumn): { index: number, trackIndices: number[] }[] {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        const grouped = new Map<number, { index: number, trackIndices: number[] }>()
        column.notes.forEach(note => {
            const index = defaultTable.indexOf(note.id)
            if (index === -1) return
            const existing = grouped.get(index)
            if (existing) {
                if (!existing.trackIndices.includes(note.trackIndex)) existing.trackIndices.push(note.trackIndex)
            } else {
                grouped.set(index, {index, trackIndices: [note.trackIndex]})
            }
        })
        return [...grouped.values()]
    }

    get selectedColumn() {
        return this.columns[this.selected]
    }

    /**
     * The note whose span covers `columnIndex` from an EARLIER column, or null. Under
     * the no-overlap invariant the nearest same-(track, id) note going backwards is the
     * only possible candidate, so the scan stops at the first one found.
     */
    getSpanCovering(columnIndex: number, trackIndex: number, id: number): { note: ColumnNote, startColumn: number } | null {
        for (let start = columnIndex - 1; start >= 0; start--) {
            const note = this.columns[start]?.findNote(trackIndex, id)
            if (note) {
                return start + note.span > columnIndex ? {note, startColumn: start} : null
            }
        }
        return null
    }

    /** Longest span a note at `startColumn` may have: up to the next same-(track, id) note or the end of the song. */
    maxSpanAt(startColumn: number, trackIndex: number, id: number): number {
        for (let i = startColumn + 1; i < this.columns.length; i++) {
            if (this.columns[i].findNote(trackIndex, id)) return i - startColumn
        }
        return this.columns.length - startColumn
    }

    /** Set a note's Duration (column span), clamped to [1, maxSpanAt]. Returns the applied span, or null when no such note exists. */
    setNoteSpan(startColumn: number, trackIndex: number, id: number, span: number): number | null {
        const note = this.columns[startColumn]?.findNote(trackIndex, id)
        if (!note) return null
        note.span = clamp(Math.round(span), 1, this.maxSpanAt(startColumn, trackIndex, id))
        return note.span
    }

    /**
     * Re-enforce the no-overlap invariant after bulk edits (paste, move, column removal):
     * spans reaching the next same-(track, id) note truncate to just before it; spans
     * overhanging the song end clamp to it. One ascending walk per call.
     */
    normalizeSpans() {
        const open = new Map<string, { note: ColumnNote, startColumn: number }>()
        this.columns.forEach((column, columnIndex) => {
            column.notes.forEach(note => {
                const key = `${note.trackIndex}-${note.id}`
                const previous = open.get(key)
                if (previous && previous.startColumn + previous.note.span > columnIndex) {
                    previous.note.span = columnIndex - previous.startColumn
                }
                open.set(key, {note, startColumn: columnIndex})
            })
        })
        open.forEach(({note, startColumn}) => {
            if (startColumn + note.span > this.columns.length) {
                note.span = Math.max(1, this.columns.length - startColumn)
            }
        })
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
        //removing columns shrinks distances — spans may now overlap a following note
        this.normalizeSpans()
    }

    /** Move every note of track `from` onto track `to` (ids kept — a note is a pitch identity, not a button), merging with existing notes. */
    switchLayer(amount: number, position: number, from: number, to: number) {
        const columns = this.columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notesOfTrack(from).forEach(note => {
                if (column.findNote(to, note.id)) {
                    column.removeNote(from, note.id)
                } else {
                    note.trackIndex = to
                }
            })
        })
        this.normalizeSpans()
    }

    swapLayer(amount: number, position: number, layer1: number, layer2: number) {
        const columns = this.columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notes.forEach(note => {
                if (note.trackIndex === layer1) note.trackIndex = layer2
                else if (note.trackIndex === layer2) note.trackIndex = layer1
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
                    column.notes = column.notes.filter(note => note.trackIndex !== layer)
                }
            })
        }
        return this
    }

    pasteLayer(copiedColumns: NoteColumn[], insert: boolean, layer: number) {
        const layerColumns = copiedColumns.map(col => {
            const clone = col.clone()
            const seen = new Set<number>()
            clone.notes = clone.notes.filter(note => {
                if (seen.has(note.id)) return false
                seen.add(note.id)
                note.trackIndex = layer
                return true
            })
            return clone
        })
        this.pasteColumns(layerColumns, insert)
        this.ensureInstruments()
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
                    if (column.findNote(clonedNote.trackIndex, clonedNote.id) === null) {
                        column.addNote(clonedNote.clone())
                    }
                })
            })
        }
        this.ensureInstruments()
        this.normalizeSpans()
        return this
    }

    /**
     * Shift notes vertically on the shared button grid. Each note moves through the
     * composer's visual row order from its DISPLAY button (own instrument's button,
     * canonical fallback for stranded notes); the landing row's id comes from the
     * note's own instrument, falling back to the canonical id (note strands but keeps
     * its row) when the instrument has no button there.
     */
    moveNotesBy(selectedColumns: number[], amount: number, layer: number | 'all') {
        const fromNotePosition = new Map([...COMPOSER_NOTE_POSITIONS].reverse().map((n, i) => [n, i]))
        const toNotePosition = new Map([...COMPOSER_NOTE_POSITIONS].reverse().map((n, i) => [i, n]))
        const moveId = (note: ColumnNote): number | null => {
            const instrumentName = this.instruments[note.trackIndex]?.name
            const button = displayButtonForId(instrumentName, note.id)
            if (button === -1) return null
            const fromPosition = fromNotePosition.get(button)
            if (fromPosition === undefined) return null
            const toButton = toNotePosition.get(fromPosition + amount)
            if (toButton === undefined) return null
            return buttonToNoteId(instrumentName, toButton)
                ?? buttonToNoteId(INSTRUMENTS[0], toButton)
        }
        if (layer === 'all') {
            selectedColumns.forEach(index => {
                const column = this.columns[index]
                if (!column) return
                column.notes = column.notes.flatMap(note => {
                    const newId = moveId(note)
                    if (newId === null) return []
                    note.id = newId
                    return [note]
                })
                //merge collisions created by the shift
                const seen = new Set<string>()
                column.notes = column.notes.filter(note => {
                    const key = `${note.trackIndex}-${note.id}`
                    if (seen.has(key)) return false
                    seen.add(key)
                    return true
                })
            })
        } else {
            selectedColumns.forEach(index => {
                const column = this.columns[index]
                if (!column) return
                const trackNotes = column.notesOfTrack(layer)
                    .sort((a, b) => amount < 0 ? a.id - b.id : b.id - a.id)
                trackNotes.forEach(note => {
                    const newId = moveId(note)
                    if (newId === null) {
                        column.removeNote(layer, note.id)
                        return
                    }
                    if (column.findNote(layer, newId)) {
                        column.removeNote(layer, note.id)
                    } else {
                        note.id = newId
                    }
                })
            })
        }
        //shifted notes can land inside another same-id note's span
        this.normalizeSpans()
    }

    copyColumns = (selectedColumns: number[], layer: number | 'all') => {
        let copiedColumns: NoteColumn[] = []
        selectedColumns.forEach((index) => {
            const column = this.columns[index]
            if (column !== undefined) copiedColumns.push(column.clone())
        })
        if (layer !== 'all') {
            copiedColumns = copiedColumns.map(column => {
                column.notes = column.notes.filter(e => e.trackIndex === layer)
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
        this.normalizeSpans()
        return this
    }

    validateBreakpoints = () => {
        this.breakpoints = this.breakpoints.filter(breakpoint => breakpoint < this.columns.length)
    }
    /**
     * NEW-format cross-game conversion (v4 songs imported into the other game's build):
     * swap every track's instrument to this build's default and octave-fold ids into
     * its range (ids landing on scale gaps stay as stranded notes — never rewritten
     * further). Legacy (≤v3) files never reach this: their cross-game path remaps
     * indices inside deserialization via the frozen tables, reproducing the historic
     * converter byte-for-byte.
     */
    toGenshin = () => {
        const clone = this.clone()
        if (clone.data.appName === APP_NAME) {
            console.warn("Song already in " + APP_NAME + " format")
            return clone
        }
        clone.data.appName = APP_NAME
        clone.instruments = clone.instruments.map((_, i) => {
            const ins = new InstrumentData({name: INSTRUMENTS[0]})
            ins.icon = defaultInstrumentMap[i % 3]
            return ins
        })
        clone.columns.forEach(column => {
            column.notes.forEach(note => {
                note.id = foldIdIntoRange(INSTRUMENTS[0], note.id)
            })
            const seen = new Set<string>()
            column.notes = column.notes.filter(note => {
                const key = `${note.trackIndex}-${note.id}`
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
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
