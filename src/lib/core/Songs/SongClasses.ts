import {APP_NAME, INSTRUMENTS, MIDI_BOUNDS, MIDI_MAP_TO_NOTE, type Pitch, TEMPO_CHANGERS, type TempoChanger} from "$core/legacyConfig"
import type {InstrumentName} from "$core/types"
// InstrumentNoteIcon used to live in Songs/ComposedSong.svelte.ts (old SongClasses.ts imported it
// FROM there). Task 5 relocated the canonical definition here instead (needed for
// InstrumentData/SerializedInstrumentData before ComposedSong was ported). Task 7's
// ComposedSong.svelte.ts now imports it from here, reversing the old direction for good - this is
// the single source; do not duplicate the declaration.
export type InstrumentNoteIcon = 'line' | 'circle' | 'border'

// ---------------------------------------------------------------------------
// Serialized shapes.
// V3-and-earlier COMPOSED columns and V2-and-earlier RECORDED notes stored a
// layout index + NoteLayer bitmask; they survive only as deserialization inputs
// (format spec 2026-08-03, ADR-0002). The current formats are per-track:
// every note belongs to exactly one track and stores a Note Id (ADR-0001).
// ---------------------------------------------------------------------------

/** Legacy (composed ≤v3): [index, hex-or-bin layer bitmask]. */
export type SerializedColumnNoteV3 = [index: number, layer: string]
/** Legacy (composed ≤v3): [tempoChanger, notes]. */
export type SerializedColumnV3 = [tempoChanger: number, notes: SerializedColumnNoteV3[]]

/** Composed v4: [column, noteId] or [column, noteId, span] (span omitted when 1). */
export type SerializedTrackNote = [column: number, id: number, span?: number]
export type SerializedComposedTrack = {
    instrument: SerializedInstrumentData
    notes: SerializedTrackNote[]
}

/** Legacy (recorded ≤v2): [index, timeMs, hex layer bitmask]. */
export type SerializedRecordedNoteV2 = [index: number, time: number, layer: string]

/** Recorded v3: [noteId, timeMs] or [noteId, timeMs, durationMs] (duration omitted when 0). */
export type SerializedRecordedTrackNote = [id: number, time: number, duration?: number]
export type SerializedRecordedTrack = {
    instrument: SerializedInstrumentData
    notes: SerializedRecordedTrackNote[]
}

// ---------------------------------------------------------------------------
// Composed-song column model (in-memory). Column-major for editing/rendering:
// each column holds track-tagged notes; serialization groups them per track.
// ---------------------------------------------------------------------------

/**
 * Plain data on purpose (2026-08-06 reactive-model plan, phase 0): a note had no logic
 * left beyond clone(), and staying a class would have cost a `$state` proxy exemption
 * nothing else needs.
 *
 * The standing invariant: the accessors hand back the note, they do not copy it.
 * findNote/notesOfTrack/addNote and ComposedSong.getSpanCovering all return the live object still
 * sitting in `column.notes`, and normalizeSpans/moveNotesBy/pasteColumns/toOtherGame plus
 * RecordedSong.toComposedSong's span pass all mutate through those references — a defensive copy in
 * an accessor would turn them into silent no-ops. Where a copy IS wanted it is written as a spread
 * at the call site (NoteColumn.clone, ComposedSong.pasteColumns), so it reads as a decision.
 */
export type ColumnNote = {
    trackIndex: number
    id: number
    /** Duration in columns, ≥1. 1 = the pre-sustain behavior. */
    span: number
}

export class NoteColumn {
    notes: ColumnNote[]
    tempoChanger: number //TODO put the keys of the tempo changers here
    /**
     * Plain monotonic render counter - deliberately NOT a `$state` (2026-08-06 reactive-model
     * plan, phase 1 step 2). The Svelte signal on ComposedSong tells the UI that *something*
     * changed; this tells the RENDERER *what* changed, so it can repaint one column instead of
     * the whole window. Two consumers, two mechanisms: a signal per column would mean thousands
     * of sources and a proxy per column for a value no template ever reads.
     *
     * ComposedSong's mutators are what bump it, through the two marking passes there:
     * #touchColumns marks the range a changed note's span COVERS, not just the column that owns the
     * note - a tail is drawn on every column it crosses - and #touchAllColumns marks the whole song
     * for the bulk/structural passes, where indexes shift or any span may be retouched.
     *
     * ITS ONE CONSUMER is ComposerRenderer's narrowed repaint (phase 4): a pooled column view
     * records the column it painted and that column's counter, and a structural edit repaints only
     * the drawn columns whose pair no longer matches. Which is where the two rules below bite.
     *
     * CONSUMER CONTRACT, RULE 1: the counter alone identifies nothing. "Monotonic" is true only PER
     * INSTANCE - clone() deliberately does not copy it (see below), and two unrelated columns
     * routinely sit at the same number - while addColumns/removeColumns/pasteColumns splice the live
     * array IN PLACE, moving column objects to new INDEXES without the array's identity moving. So a
     * consumer keyed by index must hold the column OBJECT beside the number and compare both. See
     * ComposerRenderer's ColumnPaintKey, which states the same pair from the other side.
     *
     * RULE 2: compare the number with `!==`, never `>`. clone() drops the counter, so a restored
     * column (undo) is observable at 1 - restoreColumns' own #touchAllColumns bumps it on the way
     * in - as is a freshly inserted one, both BELOW live columns edited more often, so `>`
     * is the comparison that never repaints exactly the columns whose contents are newest. Holding
     * the object as rule 1 requires happens to make the two forms coincide - a given instance's
     * counter only increments - which is why this is written as a rule rather than left implicit:
     * it is what keeps a consumer correct if it ever stops holding the object.
     */
    version: number = 0

    constructor() {
        this.notes = []
        this.tempoChanger = 0
    }

    clone() {
        const clone = new NoteColumn()
        clone.tempoChanger = this.tempoChanger
        clone.notes = this.notes.map(note => ({...note}))
        //deliberately NOT copied: a clone is a different painted object, and undo history
        //snapshots must not carry a version that makes a restored column look unchanged
        return clone
    }

    addNote(note: ColumnNote): ColumnNote
    addNote(trackIndex: number, id: number, span?: number): ColumnNote
    addNote(trackIndexOrNote: number | ColumnNote, id: number = 0, span: number = 1) {
        //ColumnNote is plain data, so the overloads discriminate on the primitive form
        //rather than `instanceof`. The object branch stores (and returns) the CALLER's
        //object by reference — RecordedSong.toComposedSong keys a Map by note identity
        //across the whole conversion, so a copy here would silently drop every duration.
        if (typeof trackIndexOrNote !== 'number') {
            this.notes.push(trackIndexOrNote)
            return trackIndexOrNote
        }
        const note: ColumnNote = {trackIndex: trackIndexOrNote, id, span}
        this.notes.push(note)
        return note
    }

    findNote(trackIndex: number, id: number): ColumnNote | null {
        return this.notes.find(n => n.trackIndex === trackIndex && n.id === id) ?? null
    }

    notesOfTrack(trackIndex: number): ColumnNote[] {
        return this.notes.filter(n => n.trackIndex === trackIndex)
    }

    removeNote(trackIndex: number, id: number) {
        const index = this.notes.findIndex(n => n.trackIndex === trackIndex && n.id === id)
        if (index !== -1) this.notes.splice(index, 1)
    }

    removeAtIndex(index: number) {
        this.notes.splice(index, 1)
    }

    setTempoChanger(changer: TempoChanger) {
        this.tempoChanger = changer.id
    }

    getTempoChanger() {
        return TEMPO_CHANGERS[this.tempoChanger]
    }
}

const instrumentNoteMap = new Map<InstrumentNoteIcon, number>([['border', 1], ['circle', 2], ['line', 3]])

export interface SerializedInstrumentData {
    name: InstrumentName
    volume: number
    pitch: Pitch | ""
    visible: boolean
    icon: InstrumentNoteIcon
    alias: string
    muted: boolean
    reverbOverride: boolean | null
}

/**
 * Must stay free of `$state` (2026-08-06 reactive-model plan): the whole roster is covered by
 * ComposedSong's single `instruments` signal, and both the constructor and set() below are
 * `Object.assign(this, data)` with an INSTANCE as the source (clone() is `new InstrumentData(this)`).
 * `$state` fields are non-enumerable prototype accessors, so a single reactive field here would
 * make clone() silently return an object with default values for it - no error, no type error,
 * just every instrument edit appearing to reset the layer.
 */
export class InstrumentData {
    name: InstrumentName = INSTRUMENTS[0]
    volume: number = APP_NAME === 'Genshin' ? 90 : 100
    pitch: Pitch | "" = ""
    visible: boolean = true
    icon: InstrumentNoteIcon = 'circle'
    reverbOverride: boolean | null = null
    alias = ''
    muted = false

    constructor(data: Partial<InstrumentData> = {}) {
        Object.assign(this, data)
    }

    serialize(): SerializedInstrumentData {
        return {
            name: this.name,
            volume: this.volume,
            pitch: this.pitch,
            visible: this.visible,
            icon: this.icon,
            alias: this.alias,
            muted: this.muted,
            reverbOverride: this.reverbOverride
        }
    }

    static deserialize(data: SerializedInstrumentData): InstrumentData {
        return new InstrumentData().set({
            name: data.name ?? INSTRUMENTS[0],
            volume: data.volume ?? 100,
            pitch: data.pitch ?? "C",
            visible: data.visible ?? true,
            icon: data.icon ?? 'circle',
            alias: data.alias ?? "",
            muted: data.muted ?? false,
            reverbOverride: data.reverbOverride ?? null
        })
    }

    set(data: Partial<InstrumentData>) {
        Object.assign(this, data)
        return this
    }

    toNoteIcon() {
        return instrumentNoteMap.get(this.icon) || 0
    }

    clone() {
        return new InstrumentData(this)
    }
}

interface ApproachingNoteProps {
    time: number
    index: number
    clicked?: boolean
    id?: number
    duration?: number
}

/** Player practice-mode runtime object; `index` is a BUTTON on the player's instrument, resolved from the song note's id at queue-build time. Never serialized. */
export class ApproachingNote {
    time: number
    index: number
    clicked: boolean
    id: number
    /** Song note's sustain duration in ms (0 = tap) — display cue only. */
    duration: number

    constructor({time, index, clicked = false, id = 0, duration = 0}: ApproachingNoteProps) {
        this.time = time
        this.index = index
        this.clicked = clicked
        this.id = id
        this.duration = duration
    }
}

export class RecordedNote {
    /** Note Id (nominal MIDI number) — not a button. */
    id: number
    time: number
    /** Sustain duration in ms; 0 = one-shot (the pre-sustain behavior). */
    duration: number
    trackIndex: number
    /**
     * TWO DISPLAY COORDINATES, TWO DIFFERENT SPACES. Both are runtime only (never
     * serialized) and both are filled in one pass at player queue-build by
     * `resolvePlayerNoteButtons` (noteIds.ts); they agree ONLY when the note's own track
     * instrument is also the one the on-screen keyboard is drawn from.
     *
     * `displayButton` — the note's row on a surface whose rows are its OWN TRACK
     * instrument's Buttons (displayButtonForId: that instrument's button, else the id's
     * canonical Song-Grid slot when it is stranded there, else -1). Its consumer is the
     * player's sheet frames (PlayerPagesRenderer -> SheetFrame), which ADR-0004 leaves
     * deliberately own-button. Nothing that indexes the keyboard may read it.
     */
    displayButton: number = -1
    /**
     * `keyboardButton` — the SAME note's key on the keyboard ACTUALLY ON SCREEN: its Button
     * on the display instrument (noteIdToButton), -1 when that instrument has no key for the
     * id. This is the only coordinate the keyboard/practice/approach paths may use, because
     * `playerStore.keyboard` holds exactly that instrument's notes; a -1 note is skipped by
     * all of them (it still sounds, and still draws in the sheet through the field above).
     *
     * Kept separate rather than re-pointing `displayButton`: the sheet needs the own-track
     * answer, the keyboard needs this one, and collapsing them is what lit, queued and
     * cleared keys that play unrelated notes on every multi-instrument song.
     */
    keyboardButton: number = -1

    constructor(id?: number, time?: number, duration?: number, trackIndex?: number) {
        this.id = id || 0
        this.time = time || 0
        this.duration = duration || 0
        this.trackIndex = trackIndex || 0
    }

    toMidi() {
        return this.id
    }

    serialize(): SerializedRecordedTrackNote {
        return this.duration > 0 ? [this.id, this.time, this.duration] : [this.id, this.time]
    }

    clone() {
        const clone = new RecordedNote(this.id, this.time, this.duration, this.trackIndex)
        clone.displayButton = this.displayButton
        //both resolved coordinates travel with the note: the player clones its notes AFTER
        //resolving them (playSong's sheet pages, practiceSong's chunks), and a chunk note that
        //lost its keyboardButton would stop matching the key that clears it
        clone.keyboardButton = this.keyboardButton
        return clone
    }
}

export class Recording {
    startTimestamp: number
    notes: RecordedNote[]
    /**
     * When false (recording on a non-sustaining instrument — user decision 2026-08-04)
     * notes never receive durations: releases, retrigger-closes and closeAllOpenNotes
     * are no-ops, so every note serializes as a plain tap.
     */
    captureDurations = true

    constructor() {
        this.startTimestamp = Date.now()
        this.notes = []
    }

    start = () => {
        this.startTimestamp = Date.now() - 100
        console.log("Started new recording")
    }
    /**
     * A re-press of a still-open id closes the previous press first (exact
     * press↔release pairing, mirroring the audio engine's one-voice-per-button
     * retrigger) — at most one note per id is ever open, so releases are unambiguous
     * even with concurrent keyboard/pointer/MIDI input on the same button.
     */
    addNote = (id: number) => {
        if (this.notes.length === 0) this.start()
        if (this.captureDurations) this.releaseNote(id)
        const currentTime = Date.now()
        const note: RecordedNote = new RecordedNote(id, currentTime - this.startTimestamp)
        this.notes.push(note)
    }
    /**
     * Close the still-open note of this id, stamping its press→release duration
     * (floored to 1ms so a closed instant tap is distinguishable from an open note).
     * Captured on EVERY instrument, sustaining or not (spec 2026-08-03) —
     * re-instrumenting a recording onto a sustaining instrument then just works.
     */
    releaseNote = (id: number) => {
        if (!this.captureDurations) return
        for (let i = this.notes.length - 1; i >= 0; i--) {
            const note = this.notes[i]
            if (note.id !== id || note.duration !== 0) continue
            note.duration = Math.max(1, Date.now() - this.startTimestamp - note.time)
            return
        }
    }
    /**
     * Close every still-open note at the current time — a physical release will never
     * arrive for them (recording stopped, or the window lost focus mid-hold; audio
     * playback itself continues in the background, but held KEYS can't be trusted
     * past a blur since their key-up is delivered elsewhere).
     */
    closeAllOpenNotes = () => {
        if (!this.captureDurations) return
        const now = Date.now()
        this.notes.forEach(note => {
            if (note.duration !== 0) return
            note.duration = Math.max(1, now - this.startTimestamp - note.time)
        })
    }
}

export type SongData = {
    isComposed: boolean
    isComposedVersion: boolean,
    appName: string
}
export type ParsedMidiNote = {
    id: number
    isAccidental: boolean
    outOfRangeBound: 1 | -1 | 0
}

export class MidiNote {
    time: number
    data: ParsedMidiNote
    layer: number
    /** Real note length from the MIDI file, in ms (0 when unknown) — becomes a column span at import. */
    durationMs: number

    constructor(time: number, layer: number, data?: ParsedMidiNote, durationMs: number = 0) {
        this.time = time
        this.data = data || {
            id: -1,
            isAccidental: false,
            outOfRangeBound: 0
        }
        this.layer = layer
        this.durationMs = durationMs
    }

    static fromMidi(layer: number, time: number, midiNote: number, octavesScale: number, durationMs: number = 0) {
        const toReturn = new MidiNote(time, layer, undefined, durationMs)
        for (let i = 0; i < octavesScale; i++) {
            //±12 = a real octave. The pre-v4 code shifted by ±8 (a long-preserved bug that
            //transposed out-of-range notes off-key); fixed deliberately with the format
            //rewrite — import is lossy authoring, not a serialization-compat surface
            //(spec 2026-08-03 §7).
            if (midiNote < MIDI_BOUNDS.lower) {
                midiNote += 12
            }
            if (midiNote > MIDI_BOUNDS.upper) {
                midiNote -= 12
            }
        }
        const note = MIDI_MAP_TO_NOTE.get(`${midiNote}`) ?? ([-1, false] satisfies [number, boolean])
        toReturn.data = {
            id: note[0],
            isAccidental: note[1],
            outOfRangeBound: 0
        }
        if (midiNote > MIDI_BOUNDS.upper) toReturn.data.outOfRangeBound = 1
        if (midiNote < MIDI_BOUNDS.lower) toReturn.data.outOfRangeBound = -1
        return toReturn
    }
}
