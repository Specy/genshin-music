import {APP_NAME, INSTRUMENTS, INSTRUMENTS_DATA, PITCHES, TEMPO_CHANGERS} from "$core/legacyConfig"
import {
    ColumnNote,
    InstrumentData,
    NoteColumn,
    RecordedNote,
    type SerializedInstrumentData,
    type SerializedRecordedNoteV2,
    type SerializedRecordedTrack,
} from "./SongClasses"
import {ComposedSong, defaultInstrumentMap} from "./ComposedSong"
import {groupByNotes} from "../utils/Utilities"
import clonedeep from 'lodash.clonedeep'
import {NoteLayer} from "./Layer"
// P3 Task 7 fix: see the matching comment in $core/Services/FileService.ts - a value import of
// `Midi` breaks under Node's native ESM loader once this file is reachable from the root layout's
// SSR graph. Unlike FileService.ts/ComposedSong.ts, this file genuinely constructs `new Midi()`
// below (toMidi()), so the type can't be the only import - `TonejsMidiPkg` (default import) is the
// one CJS-interop shape every runtime here (Node native, Vite dev SSR, Vite prod SSR, Vite client)
// agrees on unconditionally: "default import of a CJS module = its whole module.exports". `Midi`
// stays imported as a type (erased) for the toMidi(): Midi return annotation, unchanged.
import type {Midi} from "@tonejs/midi"
import TonejsMidiPkg from "@tonejs/midi"
import type {InstrumentName} from "$core/types"
import {type SerializedSong, Song} from "./Song"
import type {OldFormat, OldNote} from "$core/types"
import {isLegacyAppName, LEGACY_NOTE_TABLES, legacyIndexToId} from "./legacyNoteTables"
import {type ConversionGame, findSimilarInstrument} from "./instrumentSimilarity"
import {foldIdIntoRange} from "./noteIds"

/** Legacy (≤v2): flat index+layer notes, top-level instruments. */
export type SerializedRecordedSongV2 = SerializedSong & {
    type: 'recorded'
    reverb: boolean
    notes: SerializedRecordedNoteV2[]
    instruments: SerializedInstrumentData[]
}
/** Current format (v3): per-track Note Id notes. */
export type SerializedRecordedSong = SerializedSong & {
    type: 'recorded'
    version: 3
    reverb: boolean
    tracks: SerializedRecordedTrack[]
}
/** Old-format export shape: the legacy V2 wire format plus the pre-versioned extras. */
export type OldFormatRecorded = SerializedRecordedSongV2 & OldFormat

export type UnknownSerializedRecordedSong = SerializedRecordedSongV2 | SerializedRecordedSong

export class RecordedSong extends Song<RecordedSong, SerializedRecordedSong> {
    instruments: InstrumentData[]
    /** Flat, time-sorted; each note is track-tagged (per-track model, column-free timeline). */
    notes: RecordedNote[]
    timestamp = 0
    reverb = false
    private lastPlayedNote = -1

    constructor(name: string, notes?: RecordedNote[], instruments: InstrumentName[] = []) {
        super(name, 3, 'recorded', {
            isComposed: false,
            isComposedVersion: false,
            appName: APP_NAME
        })
        this.notes = notes || []
        this.instruments = []
        instruments.forEach(instrument => this.addInstrument(instrument))
    }

    get isComposed(): false {
        return false
    }

    /** How many (time-grouped) notes toOldFormat() would drop — ids without a frozen default-table button. Download UIs surface this before exporting to the legacy ecosystem. */
    countOldFormatDroppedNotes(): number {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        const seen = new Set<string>()
        let dropped = 0
        this.notes.forEach(note => {
            if (defaultTable.indexOf(note.id) !== -1) return
            const key = `${note.time}-${note.id}`
            if (seen.has(key)) return
            seen.add(key)
            dropped++
        })
        return dropped
    }

    /**
     * Old-format export. Emits the legacy V2 wire shape (version 2, flat [index, time,
     * hexLayer] notes via the frozen default table, top-level instruments) so files keep
     * round-tripping through the well-tested v2 import path and stay byte-compatible with
     * what the pre-v3 exporter produced. Notes whose id has no frozen-default-table
     * button are dropped.
     */
    toOldFormat = () => {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        //regroup per-track notes into the legacy merged shape: one entry per (time, index)
        //with the track set as a NoteLayer bitmask
        const merged = new Map<string, { index: number, time: number, layer: NoteLayer }>()
        const legacyNotes: { index: number, time: number, layer: NoteLayer }[] = []
        this.notes.forEach(note => {
            const index = defaultTable.indexOf(note.id)
            if (index === -1) return
            const key = `${note.time}-${index}`
            const existing = merged.get(key)
            if (existing) {
                existing.layer.set(note.trackIndex, true)
            } else {
                const layer = new NoteLayer()
                layer.set(note.trackIndex, true)
                const entry = {index, time: note.time, layer}
                merged.set(key, entry)
                legacyNotes.push(entry)
            }
        })
        const song: OldFormatRecorded = {
            name: this.name,
            type: 'recorded',
            folderId: this.folderId,
            instruments: this.instruments.map(instrument => instrument.serialize()),
            //old-format consumers were built against the legacy version
            version: 2,
            pitch: this.pitch,
            bpm: this.bpm,
            reverb: this.reverb,
            data: {...this.data},
            notes: legacyNotes.map(note =>
                [note.index, note.time, note.layer.serializeHex()] satisfies SerializedRecordedNoteV2
            ),
            id: this.id,
            isComposed: false,
            pitchLevel: PITCHES.indexOf(this.pitch),
            bitsPerPage: 16,
            isEncrypted: false,
            songNotes: legacyNotes.map(note => ({
                time: note.time,
                key: "1Key" + note.index
            }))
        }
        return song
    }

    /**
     * `importInto`: legacy-cross-game target (see ComposedSong.deserialize). Reproduces
     * the historic deserialize-then-toGenshin pipeline: indices remapped through the
     * target's frozen importPositions; instruments deliberately left as the source
     * game's names (historic quirk — they fall back to the default instrument at
     * runtime, and the frozen tables replicate exactly that for id-ification).
     */
    static deserialize(obj: UnknownSerializedRecordedSong, importInto?: 'Genshin' | 'Sky'): RecordedSong {
        const {name} = obj
        const version = obj.version || 1
        const song = Song.deserializeTo(new RecordedSong(name || 'Untitled'), obj)
        song.reverb = obj.reverb ?? false
        if (version === 3) {
            const tracks = 'tracks' in obj && Array.isArray(obj.tracks) ? obj.tracks : []
            song.instruments = tracks.map(track => InstrumentData.deserialize(track.instrument))
            if (song.instruments.length === 0) song.instruments = [new InstrumentData()]
            const notes: RecordedNote[] = []
            tracks.forEach((track, trackIndex) => {
                //defensive: untrusted files — non-finite ids/times would poison sorting,
                //conversion and MIDI export; bad durations are coerced to one-shot
                (track.notes ?? []).forEach(note => {
                    const [id, time, duration] = note
                    if (!Number.isFinite(id) || !Number.isFinite(time)) return
                    const safeDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
                        ? duration
                        : 0
                    notes.push(new RecordedNote(id, time, safeDuration, trackIndex))
                })
            })
            //stable: equal times keep track order
            song.notes = notes.sort((a, b) => a.time - b.time)
            return song
        }
        //legacy (v1/v2) path: decode flat index+layer notes, expand per track
        if (song.instruments.length === 0) song.instruments = [new InstrumentData()]
        const legacyNotes = 'notes' in obj && Array.isArray(obj.notes) ? obj.notes : []
        const crossGame = importInto !== undefined && song.data.appName !== importInto
        if (crossGame) song.data.appName = importInto
        const appName = isLegacyAppName(song.data.appName) ? song.data.appName : APP_NAME
        const importPositions = crossGame ? LEGACY_NOTE_TABLES[importInto].importPositions : null
        // QUIRK: a v1 note's layer is a decimal number, but the legacy decoder fed it to
        // NoteLayer.deserializeHex - so a decimal layer is read as hex (10 becomes 16).
        // Harmless for the `|| 1` default; preserved so old saves keep decoding exactly
        // as they always have.
        const rawNotes: { index: number, time: number, layer: NoteLayer }[] = []
        if (version === 1) {
            const clonedNotes = clonedeep(legacyNotes)
            clonedNotes.forEach(note => {
                rawNotes.push({
                    index: note[0],
                    time: note[1],
                    layer: NoteLayer.deserializeHex(`${note[2] || 1}`)
                })
            })
        } else if (version === 2) {
            legacyNotes.forEach(note => {
                rawNotes.push({index: note[0], time: note[1], layer: NoteLayer.deserializeHex(note[2])})
            })
        }
        song.notes = []
        rawNotes.forEach(note => {
            const index = importPositions ? (importPositions[note.index] ?? -1) : note.index
            if (index === -1) return
            for (let trackIndex = 0; trackIndex < song.instruments.length; trackIndex++) {
                if (!note.layer.test(trackIndex)) continue
                const id = legacyIndexToId(appName, song.instruments[trackIndex].name, index)
                if (id === null) continue
                song.notes.push(new RecordedNote(id, note.time, 0, trackIndex))
            }
        })
        return song
    }

    static isSerializedType(obj: unknown): obj is UnknownSerializedRecordedSong {
        if (typeof obj !== 'object') return false
        if (obj === null) return false
        if ('type' in obj && obj.type === 'recorded') return true
        //legacy format
        if ('data' in obj && typeof obj.data === 'object' && obj.data !== null
            && 'isComposedVersion' in obj.data && obj.data.isComposedVersion === false) return true
        return false
    }

    static isOldFormatSerializedType(obj: unknown) {
        if (typeof obj !== 'object') return false
        if (obj === null) return false
        if ('type' in obj && obj.type) return false
        if ('songNotes' in obj && Array.isArray(obj.songNotes)
            && (!('composedSong' in obj) || !obj.composedSong)) return true
        return false
    }

    serialize = (): SerializedRecordedSong => {
        const tracks: SerializedRecordedTrack[] = this.instruments.map((instrument, trackIndex) => ({
            instrument: instrument.serialize(),
            notes: this.notes
                .filter(note => note.trackIndex === trackIndex)
                .map(note => note.serialize())
        }))
        return {
            name: this.name,
            type: 'recorded',
            folderId: this.folderId,
            version: 3,
            pitch: this.pitch,
            bpm: this.bpm,
            reverb: this.reverb,
            data: {...this.data},
            tracks,
            id: this.id
        }
    }

    startPlayback(timestamp: number) {
        this.lastPlayedNote = -1
        for (let i = 0; i < this.notes.length; i++) {
            if (this.notes[i].time >= timestamp) break
            this.lastPlayedNote = i
        }
    }

    tickPlayback(timestamp: number) {
        const surpassed = []
        for (let i = this.lastPlayedNote + 1; i < this.notes.length; i++) {
            if (this.notes[i].time <= timestamp) {
                surpassed.push(this.notes[i])
                this.lastPlayedNote = i
                continue
            }
            break
        }
        return surpassed
    }

    addInstrument = (name: InstrumentName) => {
        const newInstrument: InstrumentData = new InstrumentData({name})
        this.instruments = [...this.instruments, newInstrument]
    }

    toComposedSong = (precision = 4) => {
        const bpmToMs = 60000 / this.bpm
        const song = new ComposedSong(this.name, this.instruments.map(ins => ins.name))
        song.bpm = this.bpm
        song.pitch = this.pitch
        song.reverb = this.reverb
        const notes = this.notes.map(note => note.clone())
        // Column layout has to be known before a millisecond duration can become a
        // span: the conversion below may insert columns with different tempo changers.
        // Keep the source duration beside each provisional composed note for pass two.
        const sourceDurations = new Map<ColumnNote, number>()
        const toColumnNote = (note: RecordedNote) => {
            const composed = new ColumnNote(note.trackIndex, note.id)
            sourceDurations.set(composed, note.duration)
            return composed
        }
        //remove duplicates
        let converted = []
        if (precision === 1) {
            const groupedNotes: RecordedNote[][] = []
            let previousTime = notes[0].time
            while (notes.length > 0) {
                const row: RecordedNote[] = notes.length > 0 ? [notes.shift() as RecordedNote] : []
                let amount = 0
                if (row[0] !== undefined) {
                    for (let i = 0; i < notes.length; i++) {
                        if (row[0].time > notes[i].time - bpmToMs / 9) amount++
                    }
                }
                groupedNotes.push([...row, ...notes.splice(0, amount)])
            }
            const columns: NoteColumn[] = []
            groupedNotes.forEach(notes => {
                const note = notes[0]
                if (!note) return
                const elapsedTime = note.time - previousTime
                previousTime = note.time
                const emptyColumns = Math.floor((elapsedTime - bpmToMs) / bpmToMs)
                if (emptyColumns > -1) new Array(emptyColumns).fill(0).forEach(() => columns.push(new NoteColumn())) // adds empty columns
                const noteColumn = new NoteColumn()
                noteColumn.notes = notes.map(note => {
                    return toColumnNote(note)
                })
                columns.push(noteColumn)
            })
            converted = columns
        } else {
            const grouped = groupByNotes(notes, bpmToMs / 9)
            const combinations = [
                //uses lax flooring instead of rounding to merge columns together, as the original format is not precise and uses flooring
                Math.floor(bpmToMs),
                Math.floor(bpmToMs / 2),
                Math.floor(bpmToMs / 4),
                Math.floor(bpmToMs / 8)
            ]
            for (let i = 0; i < grouped.length; i++) {
                const column = new NoteColumn()
                column.notes = grouped[i].map(note => {
                    return toColumnNote(note)
                })
                const next = grouped[i + 1]
                const paddingColumns: number[] = []
                let difference = (next?.[0]?.time ?? 0) - grouped[i][0].time
                while (difference >= combinations[3]) {
                    if (difference / combinations[0] >= 1) {
                        difference -= combinations[0]
                        paddingColumns.push(0)
                    } else if (difference / combinations[1] >= 1) {
                        difference -= combinations[1]
                        if (precision <= 1) continue
                        paddingColumns.push(1)
                    } else if (difference / combinations[2] >= 1) {
                        difference -= combinations[2]
                        if (precision <= 2) continue
                        paddingColumns.push(2)
                    } else if (difference / combinations[3] >= 1) {
                        difference -= combinations[3]
                        if (precision <= 3) continue
                        paddingColumns.push(3)
                    }
                }
                column.tempoChanger = paddingColumns.shift() || 0
                const finalPadding = paddingColumns.map(col => {
                    const column = new NoteColumn()
                    column.tempoChanger = col
                    return column
                })
                converted.push(column, ...finalPadding)
            }
        }
        song.columns = converted
        //merge duplicate notes (same track + id in one column)
        for (const col of song.columns) {
            const seen = new Map<string, ColumnNote>()
            col.notes = col.notes.filter(note => {
                const key = `${note.trackIndex}-${note.id}`
                const existing = seen.get(key)
                if (existing) {
                    sourceDurations.set(existing, Math.max(
                        sourceDurations.get(existing) ?? 0,
                        sourceDurations.get(note) ?? 0
                    ))
                    return false
                }
                seen.set(key, note)
                return true
            })
        }
        // Pass two: use the completed tempo grid and fit the greatest number of whole
        // columns into each recorded duration. The no-overlap invariant also limits a
        // span at the next same-(track,id) note.
        const msPerBeat = 60000 / song.bpm
        song.columns.forEach((column, columnIndex) => {
            column.notes.forEach(note => {
                const duration = sourceDurations.get(note) ?? 0
                if (duration <= 0) return
                let nextSameNote = -1
                for (let i = columnIndex + 1; i < song.columns.length; i++) {
                    if (song.columns[i].findNote(note.trackIndex, note.id)) {
                        nextSameNote = i
                        break
                    }
                }
                let elapsed = 0
                let span = 0
                for (let offset = 0; nextSameNote === -1 || columnIndex + offset < nextSameNote; offset++) {
                    // A final held note may extend beyond the last note-on generated by
                    // pass one. Grow the shared timeline with ordinary-tempo columns so
                    // its complete duration can still be represented.
                    if (!song.columns[columnIndex + offset]) song.columns.push(new NoteColumn())
                    const candidate = song.columns[columnIndex + offset]
                    const columnMs = Song.roundTime(msPerBeat * TEMPO_CHANGERS[candidate.tempoChanger].changer)
                    //guard: at absurd bpm a column can round to 0ms — without this the
                    //`elapsed + 0 > duration` exit never fires and the loop grows forever
                    if (columnMs <= 0) break
                    if (elapsed + columnMs > duration) break
                    elapsed += columnMs
                    span++
                }
                note.span = Math.max(1, span)
            })
        })
        song.instruments = this.instruments.map(ins => ins.clone())
        if (song.instruments.length === 0) song.instruments = [new InstrumentData()]
        song.ensureInstruments()
        return song
    }

    static mergeNotesIntoChunks(notes: RecordedNote[]) {
        const chunks = []
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            const chunk = new Chunk(
                [notes.shift() as RecordedNote],
                0
            )
            const startTime = chunk.notes.length > 0 ? chunk.notes[0].time : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                const difference = notes[j].time - chunk.notes[0].time - 50 //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift() as RecordedNote)
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0].time - startTime : 0
            chunks.push(chunk)
        }
        return chunks
    }

    toRecordedSong = () => {
        return this.clone()
    }

    toMidi(): Midi {
        const midi = new TonejsMidiPkg.Midi()
        midi.header.setTempo(this.bpm / 4)
        midi.header.keySignatures.push({
            key: this.pitch,
            scale: "major",
            ticks: 0,
        })
        midi.name = this.name
        for (let trackIndex = 0; trackIndex < this.instruments.length; trackIndex++) {
            const notes = this.notes.filter(note => note.trackIndex === trackIndex)
            if (!notes.length) continue
            const track = midi.addTrack()
            track.name = `Layer ${trackIndex + 1}`
            notes.forEach(note => {
                track.addNote({
                    time: note.time / 1000,
                    //held notes export their real length; taps keep the historical 1s
                    duration: note.duration > 0 ? note.duration / 1000 : 1,
                    midi: note.toMidi() || 0,
                })
            })
        }
        if (midi.tracks.length === 1) midi.tracks[0].name = INSTRUMENTS_DATA[this.instruments[0].name]?.midiName
        return midi
    }

    static fromOldFormat = (song: any) => {
        try {
            const converted = new RecordedSong(song.name || "Untitled")
            const bpm = Number(song.bpm)
            converted.bpm = Number.isFinite(bpm) ? bpm : 220
            converted.pitch = (PITCHES[song.pitchLevel || 0]) || "C"
            const notes: OldNote[] = song.songNotes.filter((note: OldNote, index: number, self: any) =>
                    index === self.findIndex((n: OldNote) => {
                        return n.key.split('Key')[1] === note.key.split('Key')[1] && n.time === note.time
                    })
            )
            //old-sky files carry the OTHER game's index space; the frozen importPositions
            //of the RUNNING game receive it (identity on Sky, the historic remap on Genshin)
            const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
            const parsed: { index: number, time: number, layer: NoteLayer }[] = []
            notes.forEach((note) => {
                const data = note.key.split("Key")
                const layer = new NoteLayer((note.l ?? Number(data[0])) || 1)
                const index = legacyTables.importPositions[Number(data[1])] ?? -1
                if (index === -1) return
                parsed.push({index, time: note.time, layer})
            })
            const highestLayer = NoteLayer.maxLayer(parsed.map(note => note.layer))
            const numberOfInstruments = highestLayer.toString(2).length
            converted.instruments = new Array(numberOfInstruments).fill(0).map(_ => new InstrumentData())
            parsed.forEach(note => {
                for (let trackIndex = 0; trackIndex < converted.instruments.length; trackIndex++) {
                    if (!note.layer.test(trackIndex)) continue
                    const id = legacyIndexToId(APP_NAME, converted.instruments[trackIndex].name, note.index)
                    if (id === null) continue
                    converted.notes.push(new RecordedNote(id, note.time, 0, trackIndex))
                }
            })
            if ([true, "true"].includes(song.isComposed)) {
                return converted.toComposedSong()
            }
            return converted
        } catch (e) {
            console.error(e)
            return null
        }
    }
    /** NEW-format cross-game conversion (see ComposedSong.toOtherGame): tracks swap to the target game's most similar instruments (settings kept), ids fold into the mapped instrument's range, fold collisions merge keeping the longest duration. */
    toOtherGame = (target: ConversionGame) => {
        const clone = this.clone()
        if (target !== APP_NAME) throw new Error(`toOtherGame can only convert into the running game (${APP_NAME}), got ${target}`)
        if (clone.data.appName === target) {
            console.warn("Song already in " + target + " format")
            return clone
        }
        const sourceGame = clone.data.appName
        clone.data.appName = target
        clone.instruments = clone.instruments.map(ins => {
            const similar = findSimilarInstrument(sourceGame, ins.name, target)
            const swapped = ins.clone()
            swapped.name = INSTRUMENTS.find(name => name === similar) ?? INSTRUMENTS[0]
            return swapped
        })
        clone.notes = clone.notes.map(note => {
            note.id = foldIdIntoRange(clone.instruments[note.trackIndex]?.name ?? INSTRUMENTS[0], note.id)
            return note
        })
        //fold can collide (e.g. 84 folding onto an existing 72): same-track same-time
        //duplicates merge, keeping the longest duration (a folded hold must not become a tap)
        const seen = new Map<string, RecordedNote>()
        clone.notes = clone.notes.filter(note => {
            const key = `${note.time}-${note.trackIndex}-${note.id}`
            const existing = seen.get(key)
            if (existing) {
                existing.duration = Math.max(existing.duration, note.duration)
                return false
            }
            seen.set(key, note)
            return true
        })
        return clone
    }
    clone = () => {
        const clone = new RecordedSong(this.name)
        clone.id = this.id
        clone.folderId = this.folderId
        clone.version = this.version
        clone.bpm = this.bpm
        clone.pitch = this.pitch
        clone.instruments = this.instruments.map(ins => ins.clone())
        clone.data = {...this.data}
        clone.notes = this.notes.map(note => note.clone())
        return clone
    }
}


export class Chunk {
    notes: RecordedNote[]
    delay: number

    constructor(notes: RecordedNote[], delay: number) {
        this.notes = notes
        this.delay = delay
    }

    clone() {
        return new Chunk(this.notes.map(note => note.clone()), this.delay)
    }
}
