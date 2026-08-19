// type-only (P3 Task 7 fix): see the matching comment in $core/Services/FileService.ts - a value
// import of `Midi` breaks under Node's native ESM loader once this file is reachable from the root
// layout's SSR graph; this file only uses `Midi` as toMidi()'s return-type annotation, never
// constructs one, so `import type` (fully erased) sidesteps the problem entirely.
import type {Midi} from "@tonejs/midi"
import {
    APP_NAME,
    CANONICAL_NOTE_IDS,
    COMPOSER_NOTE_POSITIONS,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    PITCHES,
    TEMPO_CHANGERS,
    type TempoChanger
} from "$core/legacyConfig"
import type {InstrumentName} from "$core/types"
import type {_LegacySongInstruments, OldFormat} from "$core/types"
import {NoteLayer} from "./Layer"
import {RecordedSong} from "./RecordedSong"
import {
    type ColumnNote,
    InstrumentData,
    NoteColumn,
    RecordedNote,
    type InstrumentNoteIcon,
    type SerializedColumnV3,
    type SerializedComposedTrack,
    type SerializedInstrumentData,
    type SerializedTrackNote,
} from "./SongClasses"
import {type SerializedSong, Song} from "./Song.svelte"
import {clamp} from "../utils/Utilities"
import {isLegacyAppName, LEGACY_NOTE_TABLES, legacyIndexToId} from "./legacyNoteTables"
import {type ConversionGame, findSimilarInstrument} from "./instrumentSimilarity"
import {foldNumberIntoRange, gridRowForNumber, nominalToNumber, numberToNominal} from "./noteIds"

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
/**
 * Legacy (v4): the SAME per-track tuple shape as v5, with the numbers meaning Nominal Ids
 * stored pre-Basepoint (ADR-0001). Only `version` tells the two apart — which is why a
 * third-party reader that ignores it misreads one as the other (ADR-0007 consequence).
 */
export type SerializedComposedSongV4 = SerializedSong & {
    type: "composed"
    version: 4
    breakpoints: number[]
    reverb: boolean
    columnTempos: number[]
    tracks: SerializedComposedTrack[]
}
/** Current format (v5): per-track absolute Note Numbers on a shared column-tempo timeline. */
export type SerializedComposedSong = Omit<SerializedComposedSongV4, 'version'> & {
    version: 5
}

export type UnknownSerializedComposedSong =
    SerializedComposedSongV1
    | SerializedComposedSongV2
    | SerializedComposedSongV3
    | SerializedComposedSongV4
    | SerializedComposedSong


export type OldFormatComposed = BaseSerializedComposedSong & OldFormat

export const defaultInstrumentMap: InstrumentNoteIcon[] = ['border', 'circle', 'line']

/**
 * `.svelte.ts` because of the signals below (2026-08-06 reactive-model plan, phase 1). Importers
 * spell the specifier '$core/Songs/ComposedSong.svelte'; see Song.svelte.ts's header.
 *
 * The reactive shape, in one place:
 * - `selected` and (on Song) `name`/`bpm`/`pitch`/`id`/`folderId` are ordinary `$state` fields.
 *   Different parts of the UI watch them independently and they change at different cadences, so
 *   each gets its own signal - and each keeps a public setter, which is what lets
 *   `song.selected = i`, `song[key] = value` and Song.deserializeTo keep working.
 * - `breakpoints` and (on Song) `instruments` are `$state.raw`: same whole-array signal, same
 *   public setter, but the array itself stays PLAIN because the composer's renderer indexes both
 *   per draw. Their mutators must ASSIGN, never splice/push - see each field's comment.
 * - the column/note graph gets ONE signal, `#structure`, read inside the `columns` getter. Columns
 *   and notes stay plain objects: the canvas repaints a whole window at a time, so per-note
 *   granularity would buy nothing that any consumer could use, at a cost of ~3 sources per note.
 * - `#columns` is PRIVATE, which is what keeps every mutator of the graph in this file, next to the
 *   bump. It is not airtight and the `columns` getter says so: the array is handed back live and
 *   mutable, so an outside push/splice edits the song and publishes nothing. What the private field
 *   does rule out is REPLACING the array from outside, and it makes reaching for a method here the
 *   path of least resistance - a missed bump goes stale silently, the same way a forgotten
 *   refreshSong() did.
 */
export class ComposedSong extends Song<ComposedSong, SerializedComposedSong, 5> {
    /**
     * `$state.raw`, not `$state`, for the same reason as Song.instruments: the composer's renderer
     * calls `breakpoints.includes(i)` once per visible column on every draw, and each element read
     * through a deep proxy is a trap plus a dependency registration. Raw keeps the whole-array
     * signal and drops the per-index sources.
     *
     * THE RULE THAT COMES WITH IT: every mutator ASSIGNS a new array (see toggleBreakpoint). An
     * in-place splice/push compiles and publishes nothing at all.
     */
    breakpoints: number[] = $state.raw([])
    /**
     * NOT a signal, stated rather than inferred because it shares handleSettingChange's dynamic
     * `song[key] = data.value` path with bpm and pitch, which are. Its readers do not need one: the
     * composer pushes it straight to AudioProvider on change, the player reads it at load, and
     * serialize() reads it on save.
     */
    reverb: boolean = false
    selected: number = $state(0)

    /**
     * Structure version. A mutation of the column/note graph bumps it, and the `columns` getter
     * reads it, so a consumer subscribes just by doing what it already did. Kept private alongside
     * #columns so the two cannot drift. (Which methods reach the graph WITHOUT bumping, and why:
     * see #bumpStructure.)
     */
    #structure = $state(0)
    #columns: NoteColumn[] = []

    constructor(name: string, instruments: InstrumentName[] = []) {
        super(name, 5, 'composed', {
            appName: APP_NAME,
            isComposed: true,
            isComposedVersion: true
        })
        this.instruments = []
        this.breakpoints = [0]
        this.selected = 0
        this.#columns = new Array(100).fill(0).map(_ => new NoteColumn())
        instruments.forEach(this.addInstrument)
    }

    /**
     * The live column array. Reading `#structure` first is the whole trick: it makes every
     * existing `song.columns` read - templates, deriveds, effects, the canvas prop - subscribe to
     * structural changes without one call site changing.
     *
     * The array itself is handed back live and mutable (typing it `readonly` would ripple through
     * ComposerRendererState, ComposerCanvas and calculateSongLength). What that costs: a
     * push/splice/sort/element write from outside compiles, edits the song and publishes nothing,
     * so consumers keep working from what they last read until something else publishes. Add a
     * mutator here instead.
     */
    get columns(): NoteColumn[] {
        this.#structure //intentional bare read: it is the subscription, the value is unused
        return this.#columns
    }

    /**
     * The structure version as a VALUE, for consumers that have to DIFF it rather than just
     * subscribe - ComposerRendererState snapshots it so `previous.structureVersion !==
     * next.structureVersion` is a comparison between two moments instead of a field compared
     * against itself. Reading it is a subscription too, exactly like reading `columns`.
     *
     * It is only comparable WITHIN one song: #structure starts at 0 on every instance, so two
     * different songs can both sit at 0. The composer renderer pairs it with the `columns` array
     * identity for that reason; VsrgSong's twin carries the same value with the same caveat.
     */
    get structureVersion(): number {
        return this.#structure
    }

    /**
     * Publish a change to the column/note graph. Most methods below end in one of these. The ones
     * that reach the graph without publishing say why at their own declaration:
     * initColumnsForConstruction and appendColumnsForConstruction work on a song nobody is watching
     * yet. Several of the rest skip the bump when the call turned out to change nothing.
     * test/reactivePublish.test.ts carries a row per callable, so which of the two a method belongs
     * to is written down there as well as here.
     *
     * The convention the rest of the class follows (same as VsrgSong's): a mutator of the LIVE
     * graph addresses `#columns` directly, since it has no reason to subscribe to its own signal,
     * while public READ methods (selectedColumn, maxSpanAt, getSpanCovering, serialize, ...) go
     * through the `columns` getter on purpose, so that a caller reading one from inside a
     * $derived/$effect subscribes to structural changes. The construction paths - a song being
     * deserialized, a fresh clone being converted - edit through whichever is convenient, since
     * nothing is watching those songs either way.
     */
    #bumpStructure() {
        this.#structure++
    }

    /**
     * Renderer-side marking (see NoteColumn.version): bump the plain per-column counters over
     * [from, to), clamped to the song. Callers pass the range a changed note COVERS, not the
     * column that owns it - a span is drawn on every column it crosses, and a shrink leaves stale
     * bars behind on the ones it used to.
     */
    #touchColumns(from: number, to: number) {
        const start = Math.max(0, from)
        const end = Math.min(this.#columns.length, to)
        for (let i = start; i < end; i++) this.#columns[i].version++
    }

    /**
     * Used by every bulk/structural mutator. Deliberately coarse: once column INDEXES shift, or a
     * pass can retouch any note's span (normalizeSpans), the changed set really is "all of them" -
     * and the renderer only repaints the visible window in any case, so the cost of the coarseness
     * is bounded by the window rather than by the song.
     */
    #touchAllColumns() {
        for (const column of this.#columns) column.version++
    }

    /**
     * CONSTRUCTION ONLY: install a column array on a song nothing observes yet - deserialize,
     * clone, MIDI import, RecordedSong.toComposedSong. Deliberately does NOT bump #structure:
     * there is no subscriber to notify, and a bumping "just set the columns" method is the shortcut
     * a live-song mutation would reach for instead of a real mutator.
     *
     * The name is deliberately not `initColumns`: that was one word away from restoreColumns and
     * gave no hint that calling it on the LIVE song silently freezes the canvas at whatever it last
     * painted. On a song someone is already watching, the method you want is restoreColumns() -
     * it bumps and re-clamps `selected`. It is not only the structure signal that is skipped here:
     * no per-column `version` moves either, and the renderer's narrowed repaint reads those, so a
     * live-song call leaves columns whose contents changed with nothing saying so.
     *
     * Copies the array it is given, for a WEAKER reason than restoreColumns' copy - stated
     * precisely because the two look identical. Its callers build a plain array and hand it over,
     * so there is no proxy to launder here; the copy buys OWNERSHIP - the argument becomes this
     * song's private graph, and a caller that kept it could otherwise push into #columns from
     * outside, which is the write the private field exists to prevent. restoreColumns' copy is the
     * load-bearing one: it IS handed a deep proxy.
     */
    initColumnsForConstruction(columns: NoteColumn[]) {
        this.#columns = [...columns]
    }

    /**
     * CONSTRUCTION ONLY, same contract as initColumnsForConstruction (silent, no version bump):
     * append `amount` empty columns to the end of a song nothing observes yet.
     *
     * It exists because the public addColumns() is O(columns) per call - it ends in
     * #touchAllColumns() plus a structure bump - and RecordedSong.toComposedSong grows the
     * timeline one column at a time from inside a triple-nested loop while fitting durations to
     * spans. Appending k columns to an n-column song through addColumns() is O(k*n) on the MIDI
     * and recording import paths; this is O(k), which is what a raw `#columns.push()` from
     * outside the class would have been - and that write is exactly what the private field exists
     * to prevent.
     */
    appendColumnsForConstruction(amount: number) {
        for (let i = 0; i < amount; i++) this.#columns.push(new NoteColumn())
    }

    /**
     * `importInto`: legacy-cross-game target. When set (parseSong, legacy file whose
     * appName ≠ the running game), the legacy path reproduces the historic
     * deserialize-then-toGenshin pipeline in one step: indices remapped through the
     * TARGET's frozen importPositions, roster reset to the target's default instrument
     * (icon cycle preserved), ids from the target's frozen default table. v4 songs
     * ignore it (their cross-game path is toOtherGame's similarity-swap + id-fold).
     */
    static deserialize(song: UnknownSerializedComposedSong, importInto?: 'Genshin' | 'Sky'): ComposedSong {
        //@ts-ignore
        if (song.version === undefined) song.version = 1
        const parsed = Song.deserializeTo(new ComposedSong(song.name), song)
        parsed.reverb = song.reverb ?? false
        //untrusted input, and only COPIED here: validateBreakpoints() at the end of both branches
        //below is what checks it, because "addresses a column" needs the columns to exist first
        parsed.breakpoints = [...(song.breakpoints ?? [])]
        if (song.version === 4 || song.version === 5) {
            //v4 stored Nominal Ids pre-Basepoint; v5 stores absolute Note Numbers. Same tuple
            //shape, so `version` is the ONLY thing that decides whether the migration below runs
            //(ADR-0007 §9: lazy upgrade in the deserializer, save writes v5).
            const migrating = song.version === 4
            parsed.instruments = (song.tracks ?? []).map(track => InstrumentData.deserialize(track.instrument))
            parsed.initColumnsForConstruction((song.columnTempos ?? []).map(tempo => {
                const column = new NoteColumn()
                //invalid tempo ids would dereference TEMPO_CHANGERS[undefined] at playback
                column.tempoChanger = Number.isInteger(tempo) && TEMPO_CHANGERS[tempo] !== undefined ? tempo : 0
                return column
            }))
            ;(song.tracks ?? []).forEach((track, trackIndex) => {
                //PER TRACK, because the migration formula reads the track's own instrument and
                //its EFFECTIVE Basepoint (its override, else the song's) — that is what the
                //file's playback used, so it is what keeps the audio identical
                const instrument = parsed.instruments[trackIndex]
                const toNumber = migrating
                    ? (id: number) => nominalToNumber(instrument?.name ?? '', instrument?.pitch || parsed.pitch, id)
                    : (id: number) => id
                //defensive: hand-edited/malformed files must import cleanly, not throw
                ;(track.notes ?? []).forEach(([columnIndex, stored, span]) => {
                    if (!Number.isInteger(columnIndex) || !Number.isFinite(stored)) return
                    const column = parsed.columns[columnIndex]
                    if (column === undefined) return
                    const number = toNumber(stored)
                    const safeSpan = typeof span === 'number' && Number.isFinite(span) ? span : 1
                    //duplicate (column, track, number) entries merge keeping the longest span
                    const existing = column.findNote(trackIndex, number)
                    if (existing) {
                        existing.span = Math.max(existing.span, safeSpan)
                        return
                    }
                    column.addNote(trackIndex, number, safeSpan)
                })
            })
            //file spans are untrusted input — sanitize + re-enforce the no-overlap invariant
            parsed.normalizeSpans()
            if (parsed.instruments.length > NoteLayer.MAX_LAYERS) throw new Error(`Sheet has ${parsed.instruments.length} instruments, but the max is ${NoteLayer.MAX_LAYERS}`)
            parsed.validateBreakpoints()
            return parsed
        }
        const legacy = ComposedSong.deserializeLegacy(song, parsed, importInto)
        legacy.validateBreakpoints()
        return legacy
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
        //parsing instruments. Both branches overwrite (and possibly extend) the roster built above
        //by index, then assign ONCE: `instruments` is a whole-array signal, so an in-place
        //`parsed.instruments[i] = ins` publishes nothing. Nothing observes a song mid-deserialize,
        //so either form works here - but leaving the in-place one is leaving a copy-paste template
        //for the exact bug the field's rule forbids.
        if (song.version === 1 || song.version === 2) {
            const legacyNames = (Array.isArray(song.instruments) ? song.instruments : []) as _LegacySongInstruments
            const instruments = [...parsed.instruments]
            legacyNames.forEach((name, i) => {
                const ins = new InstrumentData({name})
                ins.icon = defaultInstrumentMap[i % 3]
                instruments[i] = ins
            })
            parsed.instruments = instruments
        } else if (song.version === 3) {
            const instruments = [...parsed.instruments]
            song.instruments.forEach((ins, i) => {
                instruments[i] = InstrumentData.deserialize(ins)
            })
            parsed.instruments = instruments
        }
        if (parsed.instruments.length > NoteLayer.MAX_LAYERS) throw new Error(`Sheet has ${song.instruments.length} instruments, but the max is ${NoteLayer.MAX_LAYERS}`)
        const crossGame = importInto !== undefined && parsed.data.appName !== importInto
        if (crossGame) {
            //historic toGenshin(): roster reset to the target default with the icon cycle
            parsed.data.appName = importInto
            parsed.instruments = parsed.instruments.map((_, i) => {
                const name = INSTRUMENTS.find(
                    instrument => instrument === LEGACY_NOTE_TABLES[importInto].defaultInstrument
                ) ?? INSTRUMENTS[0]
                const ins = new InstrumentData({name})
                ins.icon = defaultInstrumentMap[i % 3]
                return ins
            })
        }
        //expand (index, mask) into per-track notes: the frozen tables decode to a NOMINAL id,
        //then ADR-0007's migration formula lifts it onto the absolute axis (spec §9 — the legacy
        //chain gains exactly one step, run per track at its effective Basepoint)
        const appName = isLegacyAppName(parsed.data.appName) ? parsed.data.appName : APP_NAME
        const importPositions = crossGame ? LEGACY_NOTE_TABLES[importInto].importPositions : null
        parsed.initColumnsForConstruction(legacyColumns.map(legacyColumn => {
            const column = new NoteColumn()
            column.tempoChanger = legacyColumn.tempoChanger
            legacyColumn.notes.forEach(note => {
                const index = importPositions ? (importPositions[note.index] ?? -1) : note.index
                if (index === -1) return
                for (let trackIndex = 0; trackIndex < parsed.instruments.length; trackIndex++) {
                    if (!note.layer.test(trackIndex)) continue
                    const instrument = parsed.instruments[trackIndex]
                    const id = legacyIndexToId(appName, instrument.name, index)
                    if (id === null) continue
                    const number = nominalToNumber(instrument.name, instrument.pitch || parsed.pitch, id)
                    if (column.findNote(trackIndex, number) === null) column.addNote(trackIndex, number)
                }
            })
            return column
        }))
        return parsed
    }

    static isSerializedType(obj: unknown): obj is UnknownSerializedComposedSong {
        if (typeof obj !== 'object') return false
        if (obj === null) return false
        if ('type' in obj && obj.type === 'composed') return true
        //legacy format
        if ('data' in obj && typeof obj.data === 'object' && obj.data !== null
            && 'isComposedVersion' in obj.data && obj.data.isComposedVersion === true) return true

        return false
    }

    static isOldFormatSerializedType(obj: unknown) {
        if (typeof obj !== 'object') return false
        if (obj === null) return false
        if ('type' in obj && obj.type) return false
        if ('songNotes' in obj && Array.isArray(obj.songNotes) && 'composedSong' in obj && obj.composedSong) return true
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
        //`reverb` used to be dropped here, the same data loss clone() had (see clone() below).
        //This conversion is what the player loads a composed song through and what the midi/
        //sheet exports are built from, so dropping it meant a song saved with reverb ON played
        //and exported without it. The golden fixture captured that bug and was corrected with it.
        recordedSong.reverb = this.reverb
        const msPerBeat = 60000 / this.bpm
        //Per-column real durations, needed to turn spans into ms. Kept EXACT and rounded only
        //where a time is emitted: accumulating rounded ones drifts. At bpm 220 a column is
        //272.727ms, which rounded to 273 gains 0.273ms per column, and by column 63 the song
        //has slid a whole 1/8 of a beat — enough that a midi export re-imported onto an exact
        //grid places every later note one column late and sprouts spurious sub-beat columns.
        const columnDurations = this.columns.map(
            column => msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer
        )
        let exactTime = offset
        this.columns.forEach((column, columnIndex) => {
            const time = Song.roundTime(exactTime)
            column.notes.forEach(note => {
                //span 1 = the pre-sustain one-shot behavior = no duration
                let duration = 0
                if (note.span > 1) {
                    let exactEnd = exactTime
                    for (let i = columnIndex; i < columnIndex + note.span; i++) {
                        exactEnd += columnDurations[i] ?? 0
                    }
                    //measured between the two rounded endpoints, so a held note always ends
                    //exactly where the column it reaches begins
                    duration = Song.roundTime(exactEnd) - time
                }
                recordedSong.notes.push(new RecordedNote(note.id, time, duration, note.trackIndex))
            })
            exactTime += columnDurations[columnIndex]
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
        //every instruments mutator REPLACES the array rather than mutating it, because assigning
        //the field is what publishes the roster signal (`$state.raw` on Song - see the field's
        //comment). An in-place push would leave the layer panel, the keyboard and the canvas
        //showing the previous roster until some unrelated edit forced a re-read.
        this.instruments = [...this.instruments, newInstrument]
    }

    /**
     * Replace one layer's instrument (the layer panel's edit). Clones on the way in so the stored
     * entry is not aliased to the panel's working copy, and assigns a new array - see
     * addInstrument for why in-place is not an option.
     */
    setInstrument(index: number, instrument: InstrumentData) {
        if (this.instruments[index] === undefined) return
        const instruments = [...this.instruments]
        instruments[index] = instrument.clone()
        this.instruments = instruments
    }

    /** Swap two layers' instruments. Pair it with swapLayer(), which moves the notes to match. */
    swapInstruments(a: number, b: number) {
        if (this.instruments[a] === undefined || this.instruments[b] === undefined) return
        const instruments = [...this.instruments]
        const tmp = instruments[a]
        instruments[a] = instruments[b]
        instruments[b] = tmp
        this.instruments = instruments
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

    //(the static `selection(start, end)` helper lived here and built an index list for
    //removeInstrument's eraseColumns() call. Its last caller went away when removeInstrument
    //stopped double-publishing, and it was only ever correct for start = 0 - it mapped
    //`i - start`, not `i + start` - so it is deleted rather than left as a trap.)

    //mutates BOTH families: the pass below clears the layer's notes and rewrites every remaining
    //note's trackIndex (structure), then the roster shrinks (instruments)
    removeInstrument = async (index: number) => {
        //deliberately NOT eraseColumns(): that ends in its own touch-all + bump, so calling it
        //here and then bumping again for the retagging pass would advance every column's plain
        //`version` by 2 for one logical edit - and phase 4 repaints off those counters. Same
        //clearing rule, inlined, one publish for the whole method.
        this.#columns.forEach(column => {
            column.notes = column.notes.filter(note => note.trackIndex !== index)
            column.notes.forEach(note => {
                if (note.trackIndex > index) note.trackIndex--
            })
        })
        this.#touchAllColumns()
        this.#bumpStructure()
        const instruments = [...this.instruments]
        instruments.splice(index, 1)
        this.instruments = instruments
    }
    //serialize() must return PLAIN, UNALIASED data: its result is handed straight to IndexedDB.
    //Two distinct reasons to spread or .map() every array out rather than `return this.someArray`.
    //(1) Aliasing: a returned live reference means a later edit mutates a snapshot someone is
    //still holding (the download path, the autosave payload), and a mutation of that snapshot
    //writes back into the song. Guarded by test/noAliasing.ts. (2) Proxies: a deep `$state` array
    //IS a Svelte Proxy, which structuredClone refuses outright at the IndexedDB boundary. Guarded
    //by test/noProxies.ts. Only (1) can actually bite on today's model - `breakpoints` and
    //`instruments` are `$state.raw` and `#columns` is plain, so no proxy exists to leak - but (2)
    //is one deep-`$state` field away from mattering, and the rule is one rule.
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
                return [index, layer.serializeHex()] satisfies [number, string]
            })
            return [column.tempoChanger, notes] satisfies SerializedColumnV3
        })
    }

    /**
     * The NOMINAL Id a note names on its own track — the only axis the legacy/old wire formats
     * and the frozen tables speak. Exactly inverts the number the note was entered/migrated as
     * (noteIds.numberToNominal), so every nominal-space export below stayed byte-identical
     * across the ADR-0007 flip, tuned instruments included.
     */
    private nominalOf(note: ColumnNote): number {
        const instrument = this.instruments[note.trackIndex]
        return numberToNominal(instrument?.name ?? '', instrument?.pitch || this.pitch, note.id)
    }

    /** How many (column-grouped) notes toOldFormat() would drop — nominals without a frozen default-table button. Download UIs surface this before exporting to the legacy ecosystem. */
    countOldFormatDroppedNotes(): number {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        let dropped = 0
        this.columns.forEach(column => {
            const seen = new Set<number>()
            column.notes.forEach(note => {
                const nominal = this.nominalOf(note)
                if (defaultTable.indexOf(nominal) !== -1) return
                if (seen.has(nominal)) return
                seen.add(nominal)
                dropped++
            })
        })
        return dropped
    }

    /** Group a column's notes by legacy index (frozen default-table position of their nominal), merging tracks — the shape the pre-v4 formats stored. Stranded nominals are dropped. */
    private groupColumnNotesById(column: NoteColumn): { index: number, trackIndices: number[] }[] {
        const legacyTables = LEGACY_NOTE_TABLES[APP_NAME]
        const defaultTable = legacyTables.tables[legacyTables.defaultInstrument]
        const grouped = new Map<number, { index: number, trackIndices: number[] }>()
        column.notes.forEach(note => {
            const index = defaultTable.indexOf(this.nominalOf(note))
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

    // -----------------------------------------------------------------------
    // Leaf-graph entry points. The composer used to reach through `selectedColumn` /
    // `columns[i]` and mutate a NoteColumn itself; every edit now goes through the song
    // so that the reactive rewrite (2026-08-06 plan, phase 1) has one place to bump its
    // structure version from. Reads from the page stay direct (findNote, notesOfTrack,
    // getTempoChanger) - they change nothing, so there is nothing to publish.
    // Out-of-range indexes are not normalized to one behaviour here: each form kept whatever
    // the call site it replaced did - subscripting `#columns` directly, so a bad index throws
    // (as `selectedColumn.addNote` did), optional-chaining to a null result, or skipping an
    // index that addresses no column.
    // (Which of these addresses #columns and which goes through the getter, and why:
    // see #bumpStructure.)
    // -----------------------------------------------------------------------

    /** Add a note to `columnIndex`; returns the created note. Does NOT dedupe - callers pre-check with findNote. */
    addNoteAt(columnIndex: number, trackIndex: number, id: number, span: number = 1): ColumnNote {
        const note = this.#columns[columnIndex].addNote(trackIndex, id, span)
        this.#touchColumns(columnIndex, columnIndex + note.span)
        this.#bumpStructure()
        return note
    }

    /** Remove a note from `columnIndex`. A note that isn't there is a no-op, as in NoteColumn.removeNote. */
    removeNoteAt(columnIndex: number, trackIndex: number, id: number) {
        const column = this.#columns[columnIndex]
        //read the span BEFORE the note goes: it decides which columns had a tail drawn on them
        const note = column.findNote(trackIndex, id)
        //nothing there = nothing changed = nothing to publish (same rule as setNoteSpan's early
        //return): a bump with no edit behind it re-runs every consumer for nothing
        if (!note) return
        this.#touchColumns(columnIndex, columnIndex + note.span)
        column.removeNote(trackIndex, id)
        this.#bumpStructure()
    }

    /**
     * Apply a tempo changer to one column, or to a whole tools selection (missing indexes
     * skipped). Columns already carrying that changer are skipped, and a call that changes
     * nothing publishes nothing - a tools selection re-applying the same changer is a normal
     * thing for the panel to do.
     */
    setTempoChangerAt(columnIndexes: number | number[], changer: TempoChanger) {
        if (typeof columnIndexes === 'number') {
            //bad index still throws here, as `selectedColumn.setTempoChanger` did
            if (this.#columns[columnIndexes].tempoChanger === changer.id) return
            this.#columns[columnIndexes].setTempoChanger(changer)
            this.#touchColumns(columnIndexes, columnIndexes + 1)
            this.#bumpStructure()
            return
        }
        let changed = false
        columnIndexes.forEach(index => {
            const column = this.#columns[index]
            if (column === undefined || column.tempoChanger === changer.id) return
            column.setTempoChanger(changer)
            this.#touchColumns(index, index + 1)
            changed = true
        })
        if (changed) this.#bumpStructure()
    }

    /**
     * Undo/history restore: swap in a previously cloned column set, re-clamp `selected` and drop
     * breakpoints the shorter snapshot no longer has columns for. Deliberately no normalizeSpans()
     * - the snapshot is a clone of an already-valid graph, and normalizing here would make undo
     * produce something the user never had.
     *
     * The breakpoint pass is not decoration: undo is a column-array SHRINK like removeColumns, and
     * skipping it leaves a breakpoint addressing a column that no longer exists, which serialize()
     * then writes to IndexedDB (addColumns(3, 'end') -> toggleBreakpoint on one of the new columns
     * -> undo, before the fix).
     *
     * NOT the construction path (that is initColumnsForConstruction): this one bumps, because the song it lands
     * on is the live one the canvas is watching.
     */
    restoreColumns(columns: NoteColumn[]) {
        //defensive copy. The composer's undo history is a `$state` array, so reading an entry back
        //out yields a Svelte deep PROXY of the column array. Installing that as the live graph
        //would make every columns[i] read for the rest of the session allocate/look up a per-index
        //source - the clone used to launder it away, and nothing does now. NoteColumn instances
        //are not themselves proxied (only plain objects/arrays are), so a shallow copy suffices.
        this.#columns = [...columns]
        this.selected = this.#columns.length > this.selected ? this.selected : this.#columns.length - 1
        this.validateBreakpoints()
        this.#touchAllColumns()
        this.#bumpStructure()
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

    /**
     * Set a note's Duration (column span), clamped to [1, maxSpanAt]. Returns the applied span,
     * or null when no such note exists.
     *
     * The single easiest bump to forget: the body contains nothing that LOOKS like a mutation of
     * the song - just a field write on a plain note. Miss it and the slider moves, the model
     * changes, and the canvas tails, heldButtons, songLength and the keyboard all keep showing
     * the old span until some unrelated edit forces a redraw.
     */
    setNoteSpan(startColumn: number, trackIndex: number, id: number, span: number): number | null {
        const note = this.#columns[startColumn]?.findNote(trackIndex, id)
        if (!note) return null
        const previousSpan = note.span
        note.span = clamp(Math.round(span), 1, this.maxSpanAt(startColumn, trackIndex, id))
        //union of the old and new range: a shrink has to repaint the columns it abandoned
        this.#touchColumns(startColumn, startColumn + Math.max(previousSpan, note.span))
        this.#bumpStructure()
        return note.span
    }

    /**
     * Re-enforce the no-overlap invariant after bulk edits (paste, move, column removal):
     * spans reaching the next same-(track, id) note truncate to just before it; spans
     * overhanging the song end clamp to it. Spans are also sanitized to finite integers
     * ≥ 1 first (untrusted/hand-edited files can carry NaN/fractional/zero values that
     * the overlap pass alone would miss). One ascending walk per call.
     */
    normalizeSpans() {
        const open = new Map<string, { note: ColumnNote, startColumn: number }>()
        this.#columns.forEach((column, columnIndex) => {
            column.notes.forEach(note => {
                note.span = Number.isFinite(note.span) ? Math.max(1, Math.round(note.span)) : 1
                const key = `${note.trackIndex}-${note.id}`
                const previous = open.get(key)
                if (previous && previous.startColumn + previous.note.span > columnIndex) {
                    previous.note.span = columnIndex - previous.startColumn
                }
                open.set(key, {note, startColumn: columnIndex})
            })
        })
        open.forEach(({note, startColumn}) => {
            if (startColumn + note.span > this.#columns.length) {
                note.span = Math.max(1, this.#columns.length - startColumn)
            }
        })
        //this pass can retouch any note in the song, so the changed set really is all of them
        this.#touchAllColumns()
        this.#bumpStructure()
    }

    /**
     * Insert columns after `position`. A sustained note whose span the insertion point
     * falls strictly INSIDE stretches by the inserted amount (its musical end stays on
     * the same column content); inserting exactly where a note ends — or anywhere
     * outside its span — leaves it unchanged (decided 2026-08-04).
     */
    addColumns = (amount: number, position: number | 'end') => {
        const columns = new Array(amount).fill(0).map(() => new NoteColumn())
        if (position === "end") {
            this.#columns.push(...columns)
        } else {
            const insertionIndex = position + 1
            this.adjustSpansForInsertedColumns(insertionIndex, amount)
            this.#columns.splice(insertionIndex, 0, ...columns)
        }
        this.#touchAllColumns()
        this.#bumpStructure()
    }

    private adjustSpansForInsertedColumns(insertionIndex: number, amount: number) {
        this.#columns.forEach((column, startColumn) => {
            column.notes.forEach(note => {
                if (startColumn < insertionIndex && insertionIndex < startColumn + note.span) {
                    note.span += amount
                }
            })
        })
    }
    /**
     * Remove `amount` columns from `position`. A sustained note loses one span per
     * removed TAIL column (its start column being removed removes the note itself);
     * normalizeSpans then handles any remaining overlap/end clamping.
     */
    removeColumns = (amount: number, position: number) => {
        this.adjustSpansForRemovedColumns(new Set(new Array(amount).fill(0).map((_, i) => position + i)))
        this.#columns.splice(position, amount)
        //two signal families in one call: breakpoints here, structure via normalizeSpans below
        this.validateBreakpoints()
        //removing columns shrinks distances — spans may now overlap a following note
        this.normalizeSpans()
    }

    /** Shrink every span by the number of its covered TAIL columns present in `removed` (decided 2026-08-04). Notes whose start column is removed die with it and are skipped. */
    private adjustSpansForRemovedColumns(removed: Set<number>) {
        this.#columns.forEach((column, startColumn) => {
            if (removed.has(startColumn)) return
            column.notes.forEach(note => {
                if (note.span <= 1) return
                let removedTails = 0
                for (let i = startColumn + 1; i <= startColumn + note.span - 1; i++) {
                    if (removed.has(i)) removedTails++
                }
                if (removedTails > 0) note.span = Math.max(1, note.span - removedTails)
            })
        })
    }

    /** Move every note of track `from` onto track `to` (ids kept — a note is a pitch identity, not a button), merging with existing notes. */
    switchLayer(amount: number, position: number, from: number, to: number) {
        const columns = this.#columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notesOfTrack(from).forEach(note => {
                const existing = column.findNote(to, note.id)
                if (existing) {
                    existing.span = Math.max(existing.span, note.span)
                    column.removeNote(from, note.id)
                } else {
                    note.trackIndex = to
                }
            })
        })
        //normalizeSpans() below is what publishes this - it touches every column and bumps
        this.normalizeSpans()
    }

    /** Rewrites note.trackIndex only - the second-easiest bump to miss, for the same reason as setNoteSpan. */
    swapLayer(amount: number, position: number, layer1: number, layer2: number) {
        const columns = this.#columns.slice(position, position + amount)
        columns.forEach(column => {
            column.notes.forEach(note => {
                if (note.trackIndex === layer1) note.trackIndex = layer2
                else if (note.trackIndex === layer2) note.trackIndex = layer1
            })
        })
        this.#touchAllColumns()
        this.#bumpStructure()
    }

    /**
     * Toggle a breakpoint on `override` (default: the selected column). Publishes through the
     * `breakpoints` signal alone - the column graph is untouched, so no structure bump.
     *
     * It ASSIGNS a new array rather than splicing/pushing, which is what publishing means for a
     * `$state.raw` field. It used to mutate in place and rely on callers chaining
     * validateBreakpoints() to reassign; that made the publish invisible at the call site, and
     * under raw it would not have published at all.
     *
     * An index that is not a real column is a no-op - the SAME predicate validateBreakpoints
     * filters by, which is the point: two different notions of "a valid breakpoint" in one class
     * is how one of them ends up writing what the other exists to remove. The guard used to test
     * the upper end only, so `toggleBreakpoint(-1)` added -1 to the array.
     */
    toggleBreakpoint = (override?: number) => {
        const index = typeof override === "number" ? override : this.selected
        if (!this.#addressesColumn(index)) return
        const breakpointIndex = this.breakpoints.indexOf(index)
        this.breakpoints = breakpointIndex >= 0
            ? this.breakpoints.filter((_, i) => i !== breakpointIndex)
            : [...this.breakpoints, index]
    }
    eraseColumns = (columns: number[], layer: number | 'all') => {
        if (layer === 'all') {
            columns.forEach(index => {
                const column = this.#columns[index]
                if (column !== undefined) column.notes = []
            })
        } else {
            columns.forEach(index => {
                const column = this.#columns[index]
                if (column !== undefined) {
                    column.notes = column.notes.filter(note => note.trackIndex !== layer)
                }
            })
        }
        //erased notes may have had spans reaching well past the selection
        this.#touchAllColumns()
        this.#bumpStructure()
        return this
    }

    pasteLayer(copiedColumns: NoteColumn[], insert: boolean, layer: number) {
        const layerColumns = copiedColumns.map(col => {
            const clone = col.clone()
            const seen = new Map<number, ColumnNote>()
            clone.notes = clone.notes.filter(note => {
                const existing = seen.get(note.id)
                if (existing) {
                    existing.span = Math.max(existing.span, note.span)
                    return false
                }
                seen.set(note.id, note)
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
            this.adjustSpansForInsertedColumns(this.selected, cloned.length)
            this.#columns.splice(this.selected, 0, ...cloned)
        } else {
            cloned.forEach((clonedColumn, i) => {
                const column = this.#columns[this.selected + i]
                if (column === undefined) return
                clonedColumn.notes.forEach(clonedNote => {
                    const existing = column.findNote(clonedNote.trackIndex, clonedNote.id)
                    if (existing === null) {
                        //spread stands in for the old clonedNote.clone(): the pasted note has
                        //to belong to the target column alone, not stay aliased to the scratch
                        //column it was read from
                        column.addNote({...clonedNote})
                    } else {
                        existing.span = Math.max(existing.span, clonedNote.span)
                    }
                })
            })
        }
        //ensureInstruments can APPEND to the roster, so this mutates instruments as well as
        //structure; normalizeSpans below is what publishes the structural half
        this.ensureInstruments()
        this.normalizeSpans()
        return this
    }

    /**
     * Shift notes vertically on the Song Grid, one grid row per unit of `amount`
     * (positive = up). A note's row is `gridRowForNumber`'s — the SAME rule the canvas
     * draws by (ADR-0004/ADR-0007), so the tool moves notes exactly where the user sees
     * them, off-scale strands included. The landing row's new Note Number is that row's
     * canonical nominal carried onto the axis by the track's own instrument and
     * Basepoint (nominalToNumber): the note lands sounding what that button sounds, and
     * on a row its instrument cannot play it simply becomes stranded there — canonical
     * row, dimmed — which is how the canvas already renders stranded notes.
     *
     * Before ADR-0004 this read the own-instrument `displayButtonForId`, which put the
     * tool in each note's OWN track Button space (nobody's rows: not the canvas's, not
     * the keyboard's) and made a sub-grid track's notes (NightwindHorn, the drums) jump
     * bands or vanish off a row that visibly had space above it. Notes pushed off the
     * top or bottom of the grid are dropped.
     */
    moveNotesBy(selectedColumns: number[], amount: number, layer: number | 'all') {
        //inverse of COMPOSER_NOTE_POSITIONS (slot -> row), built over GRID slots only:
        //sky's positions array carries trailing rows past the last Song-Grid row (see the
        //registry's canonicalNoteIds check), and a note must never land on one.
        const slotAtRow = new Map(CANONICAL_NOTE_IDS.map((_, slot) => [COMPOSER_NOTE_POSITIONS[slot], slot]))
        const moveId = (note: ColumnNote): number | null => {
            const instrument = this.instruments[note.trackIndex]
            const name = instrument?.name ?? ''
            const pitch = instrument?.pitch || this.pitch
            const slot = gridRowForNumber(name, pitch, note.id).row
            if (slot === -1) return null
            //rows count downward on the canvas, so moving UP is a smaller row
            const toSlot = slotAtRow.get(COMPOSER_NOTE_POSITIONS[slot] - amount)
            if (toSlot === undefined) return null
            return nominalToNumber(name, pitch, CANONICAL_NOTE_IDS[toSlot])
        }
        if (layer === 'all') {
            selectedColumns.forEach(index => {
                const column = this.#columns[index]
                if (!column) return
                column.notes = column.notes.flatMap(note => {
                    const newId = moveId(note)
                    if (newId === null) return []
                    note.id = newId
                    return [note]
                })
                //merge collisions created by the shift
                const seen = new Map<string, ColumnNote>()
                column.notes = column.notes.filter(note => {
                    const key = `${note.trackIndex}-${note.id}`
                    const existing = seen.get(key)
                    if (existing) {
                        existing.span = Math.max(existing.span, note.span)
                        return false
                    }
                    seen.set(key, note)
                    return true
                })
            })
        } else {
            selectedColumns.forEach(index => {
                const column = this.#columns[index]
                if (!column) return
                const trackNotes = column.notesOfTrack(layer)
                    .sort((a, b) => amount < 0 ? a.id - b.id : b.id - a.id)
                trackNotes.forEach(note => {
                    const newId = moveId(note)
                    if (newId === null) {
                        column.removeNote(layer, note.id)
                        return
                    }
                    const existing = column.findNote(layer, newId)
                    if (existing) {
                        existing.span = Math.max(existing.span, note.span)
                        column.removeNote(layer, note.id)
                    } else {
                        note.id = newId
                    }
                })
            })
        }
        //shifted notes can land inside another same-id note's span - and normalizeSpans() is
        //also what publishes this whole method
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
        //same rule as removeColumns: spans shrink by their removed tail columns
        this.adjustSpansForRemovedColumns(new Set(selectedColumns))
        this.#columns = this.#columns.filter((e, i) => !selectedColumns.includes(i))
        let min = Math.min(...selectedColumns)
        //structure AND selected; breakpoints too, when the pass below drops one
        this.selected = clamp(min, 0, this.#columns.length - 1)
        if (this.#columns.length === 0) this.addColumns(12, 0)
        //the other column-array shrink, so the same breakpoint pass removeColumns runs. It used to
        //be the CALLER's job (Composer.svelte chained it) - one caller away from a stale breakpoint
        //reaching serialize()
        this.validateBreakpoints()
        //normalizeSpans() publishes the structural half; `selected` published itself above
        this.normalizeSpans()
        return this
    }

    /**
     * A real column index. toggleBreakpoint and validateBreakpoints both decide through this, so
     * what a `breakpoints` entry may be is defined here rather than in each of them.
     */
    #addressesColumn(index: number): boolean {
        return Number.isInteger(index) && index >= 0 && index < this.#columns.length
    }

    /**
     * Drop every breakpoint that no longer addresses a column: the array holds column INDEXES, so
     * shrinking the song strands them, and serialize() would write one pointing past the end.
     *
     * Called from the paths that SHRINK the live column array (removeColumns, deleteColumns,
     * restoreColumns) and from deserialize, whose input is a file anyone may have hand-edited -
     * that is what the integer/negative half of #addressesColumn is for. The in-app path,
     * toggleBreakpoint, refuses an index this would filter rather than adding one.
     *
     * initColumnsForConstruction deliberately does NOT run this - it publishes nothing, by
     * contract - and its callers either bring a valid song's breakpoints (clone) or are validated
     * afterwards (both deserializers). A gap that leaves: a MIDI import or a recording conversion
     * with no notes at all installs ZERO columns while the constructor's breakpoint [0] is still in
     * place. Nothing can draw a marker for a column that does not exist, and the next deserialize
     * filters it out, so it is written down here rather than papered over.
     *
     * Publishes through the `breakpoints` signal only - the column graph is untouched - and only
     * when something was actually filtered: an unchanged array reassigned is a wasted invalidation.
     * Where the same guard is worth having elsewhere it is there too, see setNoteSpan's and
     * setTempoChangerAt's early returns.
     */
    validateBreakpoints = () => {
        const valid = this.breakpoints.filter(breakpoint => this.#addressesColumn(breakpoint))
        if (valid.length !== this.breakpoints.length) this.breakpoints = valid
    }
    /**
     * NEW-format cross-game conversion (v5/v4 songs imported into another game's build,
     * many-to-many by design): each track's instrument swaps to the target game's most
     * similar instrument (instrumentSimilarity map; target default when unmapped),
     * keeping the track's volume/pitch/icon/alias; Note Numbers octave-fold into the
     * mapped instrument's range IN SOUNDING SPACE (ADR-0007 keeps this conversion
     * sound-preserving; numbers landing on scale gaps stay as stranded notes — never
     * rewritten further); fold collisions merge keeping the longest span; the Duration
     * no-overlap invariant is re-enforced. Legacy (≤v3) files never reach this: their
     * cross-game path remaps indices inside deserialization via the frozen tables,
     * reproducing the historic converter byte-for-byte.
     *
     * Numbers can only fold against the RUNNING game's live tables, so `target` must
     * be it — the parameter exists so call sites already express the many-to-many
     * intent (game #3 needs no signature change).
     */
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
        clone.columns.forEach(column => {
            column.notes.forEach(note => {
                const instrument = clone.instruments[note.trackIndex]
                note.id = foldNumberIntoRange(
                    instrument?.name ?? INSTRUMENTS[0],
                    instrument?.pitch || clone.pitch,
                    note.id
                )
            })
            //fold collisions merge, keeping the longest span
            const seen = new Map<string, ColumnNote>()
            column.notes = column.notes.filter(note => {
                const key = `${note.trackIndex}-${note.id}`
                const existing = seen.get(key)
                if (existing) {
                    existing.span = Math.max(existing.span, note.span)
                    return false
                }
                seen.set(key, note)
                return true
            })
        })
        //folding can land a held note onto a later same-id note — re-enforce the invariant
        clone.normalizeSpans()
        return clone
    }
    toMidi = (): Midi => {
        const song = this.toRecordedSong()
        //A tap carries no length of its own, so the export has to invent one — and it must not
        //exceed the column the tap sits in, or it overlaps the columns after it and re-imports
        //as a sustain. RecordedNote has nowhere to record which column it came from, so this is
        //the shortest NOTE-BEARING column: conservative but always safe. The cost is that one
        //sub-beat column shortens every tap in the file; that reads a little staccato in a DAW,
        //which is the cheaper mistake of the two.
        const msPerBeat = 60000 / this.bpm
        const shortestColumnMs = this.columns.reduce(
            (shortest, column) =>
                column.notes.length === 0
                    ? shortest
                    : Math.min(shortest, msPerBeat * TEMPO_CHANGERS[column.tempoChanger].changer),
            msPerBeat
        )
        const midi = song.toMidi(shortestColumnMs)
        const midiNames = [...new Set(this.instruments.map(i => INSTRUMENTS_DATA[i.name].midiName))]
        this.instruments.forEach((ins, i) => {
            const instrument = INSTRUMENTS_DATA[ins.name]
            if (!instrument || !midi.tracks[i]) return
            midi.tracks[i].instrument.name = instrument.midiName
            //this avoids duplicates if there are more than 16 instruments, which is the max for midi
            midi.tracks[i].channel = this.instruments.length < 16 ? i : midiNames.indexOf(instrument.midiName)
            //`||`, not `??`: alias defaults to the empty string rather than undefined, so `??`
            //kept it and every default layer used to export as the literal " | ". pitch is
            //likewise "" unless the layer overrides it, so it only earns its separator.
            const label = ins.alias || ins.name
            midi.tracks[i].name = ins.pitch ? `${ins.pitch} | ${label}` : label
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
        //`reverb` used to be dropped here, which was real data loss rather than a style point.
        //clone() is what toOtherGame() converts through (the cross-game import path), what the
        //library row's "duplicate song" saves, and what LibrarySearchedSong re-imports a cached
        //song with - all three stored the song with reverb OFF after the user had turned it on.
        clone.reverb = this.reverb
        clone.instruments = this.instruments.map(ins => ins.clone())
        clone.breakpoints = [...this.breakpoints]
        clone.selected = this.selected
        //initColumnsForConstruction, NOT restoreColumns: restore re-clamps `selected` against the array it is
        //given, and doing that here would clamp against the constructor's 100 placeholder columns
        //on any song longer than that. Still a deep copy (NoteColumn.clone spreads every note),
        //which is what the composer's undo history depends on.
        clone.initColumnsForConstruction(this.columns.map(column => column.clone()))
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
