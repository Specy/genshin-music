import {APP_NAME, INSTRUMENTS, INSTRUMENTS_DATA, PITCHES, TEMPO_CHANGERS} from "$core/legacyConfig"
import {
    type ColumnNote,
    InstrumentData,
    NoteColumn,
    RecordedNote,
    type SerializedInstrumentData,
    type SerializedRecordedNoteV2,
    type SerializedRecordedTrack,
} from "./SongClasses"
import {ComposedSong, defaultInstrumentMap} from "./ComposedSong.svelte"
import {clamp, groupByNotes} from "../utils/Utilities"
import {encodeMidiMetadata} from "./midiMetadata"
import clonedeep from 'lodash.clonedeep'
import {NoteLayer} from "./Layer"
// This file genuinely CONSTRUCTS a Midi below (toMidi()), so the type cannot be the only import.
// The constructor comes from $core/Songs/midiConstructor, which explains why neither a named nor a
// default import of '@tonejs/midi' works across all four runtimes - the default import this used to
// use is what shipped the "Cannot read properties of undefined (reading 'Midi')" break to users.
// `Midi` stays imported as a TYPE (erased) for the toMidi(): Midi return annotation.
import type {Midi} from "@tonejs/midi"
import {Midi as MidiConstructor} from "./midiConstructor"
import type {InstrumentName} from "$core/types"
import {assertKnownSongVersion, type SerializedSong, Song} from "./Song.svelte"
import type {OldFormat, OldNote} from "$core/types"
import {isLegacyAppName, LEGACY_NOTE_TABLES, legacyIndexToId} from "./legacyNoteTables"
import {type ConversionGame, findSimilarInstrument} from "./instrumentSimilarity"
import {foldNumberIntoRange, nominalToNumber} from "./noteIds"

/** Legacy (≤v2): flat index+layer notes, top-level instruments. */
/**
 * Slowest tempo midi can represent. Tempo is stored as microseconds-per-quarter in three
 * bytes, so anything under this overflows the field and decodes as a different tempo (bpm 3
 * comes back as 18) — and the composer's bpm setting permits values well below it.
 */
export const MIN_MIDI_BPM = 15

export type SerializedRecordedSongV2 = SerializedSong & {
    type: 'recorded'
    reverb: boolean
    notes: SerializedRecordedNoteV2[]
    instruments: SerializedInstrumentData[]
}
/**
 * Legacy (v3): the SAME per-track tuple shape as v4, with the numbers meaning Nominal Ids
 * stored pre-Basepoint (ADR-0001). Only `version` tells the two apart.
 */
export type SerializedRecordedSongV3 = SerializedSong & {
    type: 'recorded'
    version: 3
    reverb: boolean
    tracks: SerializedRecordedTrack[]
}
/** Current format (v4): per-track absolute Note Numbers. */
export type SerializedRecordedSong = Omit<SerializedRecordedSongV3, 'version'> & {
    version: 4
}
/** Old-format export shape: the legacy V2 wire format plus the pre-versioned extras. */
export type OldFormatRecorded = SerializedRecordedSongV2 & OldFormat

export type UnknownSerializedRecordedSong =
    SerializedRecordedSongV2
    | SerializedRecordedSongV3
    | SerializedRecordedSong

export class RecordedSong extends Song<RecordedSong, SerializedRecordedSong> {
    //`instruments` is NOT re-declared here on purpose: it is a `$state` field on Song, and with
    //useDefineForClassFields a bare subclass re-declaration would define an own property that
    //shadows the prototype accessor and silently kills the signal (see Song.svelte.ts's header).
    /** Flat, time-sorted; each note is track-tagged (per-track model, column-free timeline). */
    notes: RecordedNote[]
    timestamp = 0
    reverb = false
    private lastPlayedNote = -1

    constructor(name: string, notes?: RecordedNote[], instruments: InstrumentName[] = []) {
        super(name, 4, 'recorded', {
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

    // ─── RETIRED: the old-format EXPORT (ADR-0007 phase E) ───────────────────────────────
    // Kept COMMENTED for the same reason and on the same terms as ComposedSong's block (see its
    // header for the full why): the old wire format names a note by its POSITION in a frozen
    // default-instrument table, which cannot state a Note Number, so exporting one now would
    // silently re-nominalize and drop notes. IMPORT of these files is untouched — `fromOldFormat`
    // below still reads every one of them.
    //
    // Restoring this needs `noteIds.numberToNominal`, commented out there for the same reason.
    //
    // /**
    //  * The NOMINAL Id a note names on its own track — the axis the legacy/old wire formats and
    //  * the frozen tables speak, exactly inverting the number the note carries (see
    //  * ComposedSong.nominalOf, same rule, same reason).
    //  */
    // private nominalOf(note: RecordedNote): number {
    //     const instrument = this.instruments[note.trackIndex]
    //     return numberToNominal(instrument?.name ?? '', instrument?.pitch || this.pitch, note.id)
    // }
    //
    // /** How many (time-grouped) notes toOldFormat() would drop — nominals without a frozen default-table button. Download UIs surface this before exporting to the legacy ecosystem. */
    // countOldFormatDroppedNotes(): number {
    //     const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
    //     const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
    //     const seen = new Set<string>()
    //     let dropped = 0
    //     this.notes.forEach(note => {
    //         const nominal = this.nominalOf(note)
    //         if (defaultTable.indexOf(nominal) !== -1) return
    //         const key = `${note.time}-${nominal}`
    //         if (seen.has(key)) return
    //         seen.add(key)
    //         dropped++
    //     })
    //     return dropped
    // }
    //
    // /**
    //  * Old-format export. Emits the legacy V2 wire shape (version 2, flat [index, time,
    //  * hexLayer] notes via the frozen default table, top-level instruments) so files keep
    //  * round-tripping through the well-tested v2 import path and stay byte-compatible with
    //  * what the pre-v3 exporter produced. Notes whose id has no frozen-default-table
    //  * button are dropped. Byte-identical across the ADR-0007 flip: `nominalOf` inverts the
    //  * migration, so the same notes reach the same frozen-table indices.
    //  */
    // toOldFormat = () => {
    //     const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
    //     const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
    //     //regroup per-track notes into the legacy merged shape: one entry per (time, index)
    //     //with the track set as a NoteLayer bitmask
    //     const merged = new Map<string, { index: number, time: number, layer: NoteLayer }>()
    //     const legacyNotes: { index: number, time: number, layer: NoteLayer }[] = []
    //     this.notes.forEach(note => {
    //         const index = defaultTable.indexOf(this.nominalOf(note))
    //         if (index === -1) return
    //         const key = `${note.time}-${index}`
    //         const existing = merged.get(key)
    //         if (existing) {
    //             existing.layer.set(note.trackIndex, true)
    //         } else {
    //             const layer = new NoteLayer()
    //             layer.set(note.trackIndex, true)
    //             const entry = {index, time: note.time, layer}
    //             merged.set(key, entry)
    //             legacyNotes.push(entry)
    //         }
    //     })
    //     const song: OldFormatRecorded = {
    //         name: this.name,
    //         type: 'recorded',
    //         folderId: this.folderId,
    //         instruments: this.instruments.map(instrument => instrument.serialize()),
    //         //old-format consumers were built against the legacy version
    //         version: 2,
    //         pitch: this.pitch,
    //         bpm: this.bpm,
    //         reverb: this.reverb,
    //         data: {...this.data},
    //         notes: legacyNotes.map(note =>
    //             [note.index, note.time, note.layer.serializeHex()] satisfies SerializedRecordedNoteV2
    //         ),
    //         id: this.id,
    //         isComposed: false,
    //         pitchLevel: PITCHES.indexOf(this.pitch),
    //         bitsPerPage: 16,
    //         isEncrypted: false,
    //         songNotes: legacyNotes.map(note => ({
    //             time: note.time,
    //             key: "1Key" + note.index
    //         }))
    //     }
    //     return song
    // }

    /** The newest recorded format this build writes and reads. Above it is a file from a newer app. */
    static readonly LATEST_VERSION = 4

    /**
     * The PER-TRACK versions (v3 Nominal Ids, v4 absolute Note Numbers): the ones deserialize
     * decodes directly rather than through the frozen legacy tables, and the ones a cross-game
     * import converts with toOtherGame instead of the legacy index remap. Owned here so that
     * SongService's dispatch and this deserializer cannot drift apart on a version bump.
     */
    static isNewFormat(obj: { version?: number }): obj is SerializedRecordedSongV3 | SerializedRecordedSong {
        return obj.version === 3 || obj.version === 4
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
        //before anything is decoded: an unrecognised HIGHER version would fall through to the
        //legacy branch below and return a song with no notes at all
        assertKnownSongVersion('recorded', obj.version, RecordedSong.LATEST_VERSION)
        const version = obj.version || 1
        const song = Song.deserializeTo(new RecordedSong(name || 'Untitled'), obj)
        song.reverb = obj.reverb ?? false
        if (RecordedSong.isNewFormat(obj)) {
            //v3 stored Nominal Ids pre-Basepoint; v4 stores absolute Note Numbers. Same tuple
            //shape, so `version` alone decides whether the per-track migration runs (ADR-0007 §9).
            const migrating = version === 3
            const tracks = 'tracks' in obj && Array.isArray(obj.tracks) ? obj.tracks : []
            song.instruments = tracks.map(track => InstrumentData.deserialize(track.instrument))
            if (song.instruments.length === 0) song.instruments = [new InstrumentData()]
            const notes: RecordedNote[] = []
            tracks.forEach((track, trackIndex) => {
                //PER TRACK, at its EFFECTIVE Basepoint (own override, else the song's) — what
                //the file's playback used, so migrated audio is identical
                const instrument = song.instruments[trackIndex]
                const toNumber = migrating
                    ? (id: number) => nominalToNumber(instrument?.name ?? '', instrument?.pitch || song.pitch, id)
                    : (id: number) => id
                //defensive: untrusted files — non-finite ids/times would poison sorting,
                //conversion and MIDI export; bad durations are coerced to one-shot
                ;(track.notes ?? []).forEach(note => {
                    const [stored, time, duration] = note
                    if (!Number.isFinite(stored) || !Number.isFinite(time)) return
                    const safeDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0
                        ? duration
                        : 0
                    notes.push(new RecordedNote(toNumber(stored), time, safeDuration, trackIndex))
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
                const instrument = song.instruments[trackIndex]
                const id = legacyIndexToId(appName, instrument.name, index)
                if (id === null) continue
                //frozen-table decode lands on a NOMINAL; ADR-0007's one extra step lifts it
                //onto the absolute axis at this track's effective Basepoint (spec §9)
                const number = nominalToNumber(instrument.name, instrument.pitch || song.pitch, id)
                song.notes.push(new RecordedNote(number, note.time, 0, trackIndex))
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
            version: 4,
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
            //span 1 has to be stated: it used to come from ColumnNote's constructor default,
            //and pass two only overwrites it for notes that carry a duration
            const composed: ColumnNote = {trackIndex: note.trackIndex, id: note.id, span: 1}
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
        //construction entry point (the song is built here and handed back; nothing observes it
        //yet), so deliberately not a version-bumping mutator - see ComposedSong.initColumnsForConstruction
        song.initColumnsForConstruction(converted)
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
                    //appendColumnsForConstruction, NOT addColumns: this is inside a triple-nested
                    //loop, and addColumns ends in a touch-every-column pass plus a structure bump,
                    //which would make growing the timeline O(columns) per appended column on the
                    //MIDI/recording import path. The song is still under construction here (it is
                    //returned below; nothing observes it), so the silent construction entry point
                    //is the right one - and it keeps the raw `columns.push()` that the getter would
                    //happily accept out of this file
                    if (!song.columns[columnIndex + offset]) song.appendColumnsForConstruction(1)
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

    /**
     * @param tapDurationMs Length to give a note that has no duration of its own. Defaults to
     * one beat; ComposedSong passes its SHORTEST column instead, because a tap sitting in a
     * 1/8 column would otherwise be written a full beat long, overlap the columns after it,
     * and re-import as a multi-column sustain.
     */
    toMidi(tapDurationMs?: number): Midi {
        const midi = new MidiConstructor()
        //below ~15bpm the 3-byte microseconds-per-quarter field overflows and the tempo comes
        //back as something else entirely (bpm 3 returns as 18)
        const safeBpm = Number.isFinite(this.bpm) && this.bpm >= MIN_MIDI_BPM ? this.bpm : MIN_MIDI_BPM
        midi.header.setTempo(safeBpm / 4)
        midi.header.keySignatures.push({
            key: this.pitch,
            scale: "major",
            ticks: 0,
        })
        //Which app instrument each layer plays, and its audio settings — the only things MIDI
        //cannot say. Everything musical stays in the file proper, so re-importing our own
        //export runs the same derivation a foreign MIDI does. See midiMetadata.ts.
        midi.header.meta.push({
            ticks: 0,
            type: "text",
            text: encodeMidiMetadata({instruments: this.instruments, pitch: this.pitch, reverb: this.reverb}),
        })
        midi.name = this.name
        /**
         * A tap is exported as exactly one column.
         *
         * It used to be a hard-coded 1 second, which re-imported as a SUSTAIN at any tempo
         * where a column is shorter than 2/3s: import reads a span as round(ms / column), so
         * at the default bpm 220 (272.7ms per column) every tap came back as span 4. One
         * column is the only length that round-trips to span 1 at every tempo, and it is
         * also what the note musically occupies, so the file reads correctly in a DAW.
         */
        const tapMs =
            tapDurationMs !== undefined && Number.isFinite(tapDurationMs) && tapDurationMs > 0
                ? tapDurationMs
                : 60000 / safeBpm
        for (let trackIndex = 0; trackIndex < this.instruments.length; trackIndex++) {
            const notes = this.notes.filter(note => note.trackIndex === trackIndex)
            //an empty layer still gets a track: ComposedSong.toMidi assigns instrument, channel
            //and name by index, so skipping one used to shift every later layer's metadata onto
            //the wrong track
            const track = midi.addTrack()
            track.name = `Layer ${trackIndex + 1}`
            notes.forEach(note => {
                track.addNote({
                    time: note.time / 1000,
                    duration: note.duration > 0 ? note.duration / 1000 : tapMs / 1000,
                    //THE STORED NUMBER, unshifted — which since ADR-0007 makes the export
                    //transposition-honest for the first time: a song at Basepoint D now says D
                    //in a DAW instead of writing the untransposed grid nominals it used to.
                    //Unshifted is also SOUNDING: the number already is the pitch the listener
                    //hears (the engine resolves it to a button at the track's Basepoint and
                    //plays that sample at the Basepoint's rate), so subtracting anything here
                    //would write a file that disagrees with the song. midiImport reads a file's
                    //numbers back as exactly that, which is what makes the trip an inverse.
                    //Nothing upstream guarantees the number fits midi's 0..127 (a Basepoint can
                    //push it past the top), and an out-of-range value used to be written verbatim
                    //and produce a malformed file.
                    midi: clamp(Math.round(note.toMidi()) || 0, 0, 127),
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
                    const instrument = converted.instruments[trackIndex]
                    const id = legacyIndexToId(APP_NAME, instrument.name, note.index)
                    if (id === null) continue
                    //same one extra step the other legacy chains gained (spec §9): frozen-table
                    //nominal, then onto the absolute axis at this track's effective Basepoint
                    const number = nominalToNumber(instrument.name, instrument.pitch || converted.pitch, id)
                    converted.notes.push(new RecordedNote(number, note.time, 0, trackIndex))
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
    /** NEW-format cross-game conversion (see ComposedSong.toOtherGame): tracks swap to the target game's most similar instruments (settings kept), Note Numbers fold into the mapped instrument's range in SOUNDING space, fold collisions merge keeping the longest duration. */
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
            const instrument = clone.instruments[note.trackIndex]
            note.id = foldNumberIntoRange(
                instrument?.name ?? INSTRUMENTS[0],
                instrument?.pitch || clone.pitch,
                note.id
            )
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
        //`reverb` and `timestamp` used to be dropped here. reverb is real data loss: clone() is
        //what toOtherGame() converts through, what the library row's "duplicate song" saves and
        //what LibrarySearchedSong re-imports a cached song with, so a song saved with reverb on
        //came back out with it off (see ComposedSong.clone, same bug). `timestamp` is never
        //serialized, but a clone claiming a different recording start than the song it copied is a
        //trap for the next reader of this method, not a saving.
        clone.reverb = this.reverb
        clone.timestamp = this.timestamp
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
