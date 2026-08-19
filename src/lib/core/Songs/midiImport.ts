// MIDI -> ComposedSong columns. Extracted from MidiParser.svelte's convertMidi() so the
// arithmetic is unit-testable: it used to read `$state` locals directly, which is why the
// timing defects below survived so long (test/midiParser.test.ts deliberately cannot import
// from the component, and test/conversion.test.ts only golden-checks export bytes).
//
// THREE THINGS THIS FIXES relative to the in-component version:
//
// 1. Placement is ABSOLUTE, not per-gap. The old code derived each gap's column count from
//    `Math.floor((elapsed - bpmToMs) / bpmToMs)` over times floored to whole ms. Whenever
//    60000/bpm is not an integer - and the app's default 220 is not (272.727...) - an exact
//    3-column gap of 818.18ms arrived as 818ms and scored (818-272.727)/272.727 = 1.9993,
//    floored to 1. Every gap lost up to a whole column and the song came back compressed;
//    measured, notes spaced 2 columns apart returned as 29 columns instead of 39. Rounding a
//    position measured from the FIRST note cannot compress or accumulate.
//
// 2. Columns can be sub-beat, so tempo changers survive. The old importer emitted only
//    full-beat columns, so any song using 1/2..1/8 columns returned rhythmically uniform.
//    Positions are quantized to the finest changer and the gap is then filled greedily with
//    the largest changers that fit - which means a song that only ever used whole columns
//    still comes back using only whole columns.
//
// 3. Durations become spans only where the target instrument can actually hold a note.
//    The composer already refuses to author a hold on a non-sustaining layer
//    (Composer.svelte handleNoteLongPress), so import was the only path producing spans
//    nothing could play. Capability is read from instrument config, never from the game id.
import {INSTRUMENTS_DATA, MIDI_MAP_TO_NOTE, type Pitch, TEMPO_CHANGERS} from '$core/legacyConfig'
import {MidiNote, NoteColumn, type ColumnNote} from './SongClasses'
import {basepointOffset, getNoteIdTable} from './noteIds'

/**
 * The NOMINAL ids an instrument can sound — the set suggestOffset scores against.
 *
 * Deliberately the nominal axis and not the sounding one: `suggestOffset` chooses a transposition
 * for the SNAPPING stage, which happens entirely in grid space before the Basepoint is applied, so
 * the two must speak the same axis or the suggestion optimises the wrong thing.
 */
export function playableIdsOf(instrumentName: string): ReadonlySet<number> {
    return new Set(getNoteIdTable(instrumentName))
}

/**
 * Pitch classes the game's map marks as accidental, derived from config rather than assumed
 * to be the black keys — a game whose instruments are not C-major would have a different set.
 */
function accidentalPitchClasses(): ReadonlySet<number> {
    const classes = new Set<number>()
    for (const [midi, entry] of MIDI_MAP_TO_NOTE) {
        if (entry[1]) classes.add(((Number(midi) % 12) + 12) % 12)
    }
    return classes
}

export type OffsetSuggestion = {
    offset: number
    /** Notes that would land on an accidental and be snapped to a neighbouring key. */
    accidentals: number
    /** Notes that would produce no sound: off the map, or absent from the instrument. */
    stranded: number
}

/**
 * Best transposition for a set of MIDI notes — the automation the Python lyre player calls
 * find_best_shift, which we had no equivalent of (offset is typed in by hand, and the only
 * feedback is a counter the user minimizes by trial and error).
 *
 * Two stages rather than one search, because the two costs depend on different things:
 * accidental-ness is a function of pitch class alone, while being stranded is a function of
 * absolute pitch. Picking the semitone first and the octave second is exact, where a single
 * combined scan trades one against the other arbitrarily.
 *
 * Deliberately scored against the TARGET INSTRUMENT's own ids, not just the game-wide map:
 * instruments with gapped layouts (Sky's 8-note Bells, its 6-note SFX sets) strand notes that
 * the game map calls perfectly playable, and nothing in the UI reports that today.
 *
 * Ties resolve to the smallest shift, and 0 always wins an outright tie — so running this over
 * a file the app itself exported can never transpose it away from where it started.
 */
export function suggestOffset(
    notes: readonly {midi: number}[],
    playableIds: ReadonlySet<number>
): OffsetSuggestion {
    const accidentals = accidentalPitchClasses()
    const score = (offset: number) => {
        let accidental = 0
        let stranded = 0
        for (const note of notes) {
            const shifted = note.midi - offset
            if (accidentals.has(((shifted % 12) + 12) % 12)) accidental++
            const mapped = MIDI_MAP_TO_NOTE.get(`${shifted}`)
            if (!mapped || !playableIds.has(mapped[0])) stranded++
        }
        return {accidental, stranded}
    }
    if (notes.length === 0) return {offset: 0, accidentals: 0, stranded: 0}

    // ---- stage 1: the semitone, judged only on how many notes turn accidental -------------
    let bestSemitone = 0
    let bestAccidentals = Infinity
    for (let semitone = -6; semitone <= 5; semitone++) {
        let count = 0
        for (const note of notes) {
            if (accidentals.has((((note.midi - semitone) % 12) + 12) % 12)) count++
        }
        //strictly less, and candidates are walked from the outside in ending at +5, so an
        //equal score never displaces a shift already found closer to zero
        if (count < bestAccidentals || (count === bestAccidentals && Math.abs(semitone) < Math.abs(bestSemitone))) {
            bestAccidentals = count
            bestSemitone = semitone
        }
    }

    // ---- stage 2: the octave, judged on how many notes fall off the instrument ------------
    let best = {offset: bestSemitone, ...score(bestSemitone)}
    for (let octave = -3; octave <= 3; octave++) {
        const offset = bestSemitone + octave * 12
        const result = score(offset)
        if (
            result.stranded < best.stranded ||
            (result.stranded === best.stranded && Math.abs(offset) < Math.abs(best.offset))
        ) {
            best = {offset, ...result}
        }
    }
    return {offset: best.offset, accidentals: best.accidental, stranded: best.stranded}
}

/** One MIDI track's notes, with the per-track import controls the UI exposes. */
export type MidiImportTrack = {
    /** Times and durations in SECONDS, as @tonejs/midi reports them. */
    notes: readonly {midi: number; time: number; duration: number}[]
    /** Index into the composer's instrument list. */
    layer: number
    /** Per-track transposition; `??` means a track offset of 0 overrides a nonzero global. */
    localOffset: number | null
    /** How many times an out-of-range note may be folded by an octave. */
    maxScaling: number
}

export type MidiImportOptions = {
    bpm: number
    offset: number
    includeAccidentals: boolean
    /**
     * The Basepoint the imported song will carry (MidiParser's pitch selector, seeded from the
     * file's key signature or our own metadata). Every emitted note is `snapped white-key nominal
     * + offset(pitch)` — the SNAPPING is unchanged from the id-storing generation (ADR-0007 keeps
     * import policy exactly as it was, upgradeable later), and this is only what lifts the result
     * onto the absolute axis so the composer draws it on the row the user picked.
     *
     * CONSEQUENCE, stated because it is a real one: re-importing our OWN export of a song whose
     * Basepoint is not C double-shifts it. The exporter is transposition-honest now (it writes the
     * stored numbers), while this importer still reads every midi number as a grid nominal and
     * lifts it again. Fixing that is auto-Basepoint detection, which ADR-0007 explicitly defers;
     * pinned in test/midiRoundTrip.test.ts so it is a known shape rather than a surprise.
     */
    pitch: Pitch
    /**
     * Sustain capability per composer layer, in layer order. Supplied by the caller rather
     * than looked up here so the UI can stay the single owner of the instrument list; use
     * instrumentSupportsSustain() to build it.
     */
    layerSustains: readonly boolean[]
}

export type MidiTrackStats = {
    accidentals: number
    outOfRangeLower: number
    outOfRangeUpper: number
}

export type MidiImportResult = {
    columns: NoteColumn[]
    totalNotes: number
    accidentals: number
    outOfRange: number
    /**
     * Notes that mapped fine but were absorbed by another: a re-strike of the same id landing
     * in the same column after quantization. Counted so the importer's totals can never claim
     * more notes than it actually placed.
     */
    merged: number
    /** Parallel to the input tracks. */
    perTrack: MidiTrackStats[]
}

/**
 * Whether an instrument responds to hold length. Mirrors Instrument.supportsSustain, which is
 * what playback and the composer already gate on — kept in step deliberately, since a note
 * imported as a hold that the engine plays as a tap is worse than no hold at all.
 */
export function instrumentSupportsSustain(instrumentName: string): boolean {
    const sustain = INSTRUMENTS_DATA[instrumentName as keyof typeof INSTRUMENTS_DATA]?.sustain
    return sustain !== undefined && sustain.loopMode !== 'one-shot'
}

/**
 * Column lengths expressed in whole units of the FINEST tempo changer, largest first.
 *
 * Derived from config rather than hardcoded to [8,4,2,1] so a game that ships a different
 * changer set still works. A changer whose ratio to the finest is not a whole number is
 * dropped: the gap filler below is a greedy coin walk, which needs integer denominations.
 */
function columnUnitTable(): {tempoChanger: number; units: number}[] {
    const changers = TEMPO_CHANGERS.map((t, index) => ({tempoChanger: index, changer: t.changer}))
        .filter(t => t.changer > 0)
    if (changers.length === 0) return [{tempoChanger: 0, units: 1}]
    const finest = Math.min(...changers.map(t => t.changer))
    return changers
        .map(t => ({tempoChanger: t.tempoChanger, units: Math.round(t.changer / finest)}))
        .filter(t => t.units >= 1)
        .sort((a, b) => b.units - a.units)
}

/** Greedy fill of `units` with the largest column lengths that fit. Exact: 1 is always a coin. */
function fillWithColumns(units: number, table: {tempoChanger: number; units: number}[]): number[] {
    const out: number[] = []
    let remaining = units
    for (const entry of table) {
        while (remaining >= entry.units) {
            out.push(entry.tempoChanger)
            remaining -= entry.units
        }
    }
    return out
}

export function importMidiTracks(
    tracks: readonly MidiImportTrack[],
    options: MidiImportOptions
): MidiImportResult {
    const {bpm, offset, includeAccidentals, layerSustains} = options
    const perTrack: MidiTrackStats[] = tracks.map(() => ({
        accidentals: 0,
        outOfRangeLower: 0,
        outOfRangeUpper: 0,
    }))
    const empty: MidiImportResult = {
        columns: [],
        totalNotes: 0,
        accidentals: 0,
        outOfRange: 0,
        merged: 0,
        perTrack,
    }
    //a non-finite or non-positive bpm would make every derived length NaN/Infinity and the
    //quantization below would loop forever on the greedy fill
    if (!Number.isFinite(bpm) || bpm <= 0) return empty

    const table = columnUnitTable()
    const beatMs = 60000 / bpm
    const unitsPerBeat = table[0].units
    const unitMs = beatMs / unitsPerBeat

    // ---- 1. map every selected note through the game's midi table -------------------------
    const notes: MidiNote[] = []
    let totalNotes = 0
    let accidentals = 0
    let outOfRange = 0
    tracks.forEach((track, trackIndex) => {
        const stats = perTrack[trackIndex]
        for (const midiNote of track.notes) {
            totalNotes++
            const note = MidiNote.fromMidi(
                track.layer,
                Math.round(midiNote.time * 1000),
                midiNote.midi - (track.localOffset ?? offset),
                track.maxScaling,
                Math.round(midiNote.duration * 1000)
            )
            if (note.data.isAccidental) {
                accidentals++
                stats.accidentals++
            }
            if (note.data.id !== -1) {
                if (includeAccidentals || !note.data.isAccidental) notes.push(note)
            } else {
                outOfRange++
                if (note.data.outOfRangeBound === -1) stats.outOfRangeLower++
                if (note.data.outOfRangeBound === 1) stats.outOfRangeUpper++
            }
        }
    })
    if (notes.length === 0) return {...empty, totalNotes, accidentals, outOfRange}

    notes.sort((a, b) => a.time - b.time)

    // ---- 2. gather simultaneous notes into chords ----------------------------------------
    //Tolerance is half the finest column rather than the old fixed beat/9: at bpm 220 that
    //old value (30ms) was nearly a whole 1/8 column (34ms), so once columns can be sub-beat
    //it would merge notes that are genuinely a 1/8 apart.
    const chordToleranceMs = unitMs / 2
    const groups: MidiNote[][] = []
    for (const note of notes) {
        const current = groups[groups.length - 1]
        //`sorted` is ascending, so only the open group can still accept a note - the old code
        //rescanned the whole remaining array for this, which made it quadratic
        if (current && note.time - current[0].time < chordToleranceMs) current.push(note)
        else groups.push([note])
    }

    // ---- 3. place each chord on an absolute grid ------------------------------------------
    const firstTime = groups[0][0].time
    const slots: {slot: number; notes: MidiNote[]}[] = []
    for (const group of groups) {
        const slot = Math.round((group[0].time - firstTime) / unitMs)
        const previous = slots[slots.length - 1]
        //two chords can still quantize onto the same slot; merging keeps slots strictly
        //increasing, which the column walk below relies on
        if (previous && previous.slot === slot) previous.notes.push(...group)
        else slots.push({slot, notes: group})
    }

    // ---- 4. lay out columns, filling each gap with the largest changers that fit ----------
    const columns: NoteColumn[] = []
    /** Start slot of each emitted column, so a note's span can be measured in real columns. */
    const columnStartSlots: number[] = []
    /** Index of the column holding each chord. */
    const chordColumnIndex: number[] = []
    let cursor = 0
    slots.forEach((entry, index) => {
        const next = slots[index + 1]
        //The final chord has no following chord to size its gap. A whole beat is the floor,
        //but a note still sounding past that needs columns to span across, or the last note
        //of a song silently loses its hold.
        const trailingUnits = Math.max(
            unitsPerBeat,
            ...entry.notes.map(note => Math.round(note.durationMs / unitMs))
        )
        const gapUnits = next ? next.slot - entry.slot : trailingUnits
        const lengths = fillWithColumns(Math.max(gapUnits, 1), table)
        chordColumnIndex.push(columns.length)
        //only the first column of a gap carries the chord; the rest are the rest
        for (const tempoChanger of lengths) {
            const column = new NoteColumn()
            column.tempoChanger = tempoChanger
            columns.push(column)
            columnStartSlots.push(cursor)
            cursor += table.find(t => t.tempoChanger === tempoChanger)?.units ?? 1
        }
    })
    //one past the end, so a span reaching the song's end has something to measure against
    columnStartSlots.push(cursor)

    // ---- 5. attach notes, turning duration into a span where the layer can hold ----------
    slots.forEach((entry, index) => {
        const columnIndex = chordColumnIndex[index]
        const column = columns[columnIndex]
        if (!column) return
        for (const note of entry.notes) {
            const canHold = layerSustains[note.layer] === true
            let span = 1
            if (canHold && note.durationMs > 0) {
                const endSlot = entry.slot + Math.round(note.durationMs / unitMs)
                //count the columns the sounding length actually covers
                let end = columnIndex + 1
                while (end < columnStartSlots.length - 1 && columnStartSlots[end] < endSlot) end++
                span = Math.max(1, end - columnIndex)
            }
            //`+ basepointOffset`: the snapped nominal lifted onto the absolute axis (see `pitch`)
            column.notes.push({
                trackIndex: note.layer,
                id: note.data.id + basepointOffset(options.pitch),
                span,
            } satisfies ColumnNote)
        }
    })

    // ---- 6. merge duplicates within a column, longest span wins ---------------------------
    let merged = 0
    for (const column of columns) {
        if (column.notes.length < 2) continue
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local dedupe map, never UI-observed
        const seen = new Map<string, ColumnNote>()
        column.notes = column.notes.filter(note => {
            const key = `${note.trackIndex}-${note.id}`
            const existing = seen.get(key)
            if (existing) {
                existing.span = Math.max(existing.span, note.span)
                merged++
                return false
            }
            seen.set(key, note)
            return true
        })
    }

    return {columns, totalNotes, accidentals, outOfRange, merged, perTrack}
}
