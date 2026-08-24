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
import {INSTRUMENTS, INSTRUMENTS_DATA, type Pitch, TEMPO_CHANGERS} from '$core/legacyConfig'
import {MidiNote, NoteColumn, type ColumnNote} from './SongClasses'
import {
    addressableSpan,
    basepointOffset,
    effectiveTrackPitch,
    foldNumberIntoRange,
    getSoundingTable,
    nominalToNumber,
    numberToButton,
    snapMidiToGridPeriodically,
} from './noteIds'

export type OffsetSuggestion = {
    offset: number
    /** Notes that would land on an accidental and be snapped to a neighbouring key. */
    accidentals: number
    /** Notes the selected instrument cannot voice, including Addressable Span violations. */
    stranded: number
}

/** One selected track's complete context for scoring a global offset. */
export type MidiOffsetSuggestionGroup = {
    notes: readonly {midi: number}[]
    instrumentName: string
    /** The track's effective Basepoint (its override, otherwise the song's). */
    pitch: Pitch
    /** A fixed local offset ignores every global candidate, but still contributes its cost. */
    localOffset: number | null
    maxScaling: number
}

type MidiNumberTransform = {
    /** Final absolute Note Number, or NaN when the input could not be transformed. */
    number: number
    isAccidental: boolean
    voiceable: boolean
    addressable: boolean
    /** Instrument-relative direction; gaps and non-finite inputs deliberately have no direction. */
    outOfRangeBound: -1 | 0 | 1
}

/**
 * The single per-number policy used by both conversion and offset scoring.
 *
 * The fold helper speaks the absolute sounding axis and removes/reapplies the Basepoint itself.
 * At this point the policy has already moved into grid space, so temporarily restoring the same
 * Basepoint around the call is the coordinate adapter that avoids removing it twice.
 */
function transformMidiNumber(
    midi: number,
    group: Omit<MidiOffsetSuggestionGroup, 'notes'>,
    globalOffset: number
): MidiNumberTransform {
    const pitchOffset = basepointOffset(group.pitch)
    const gridNumber = midi - (group.localOffset ?? globalOffset) - pitchOffset
    const foldedGridNumber = foldNumberIntoRange(
        group.instrumentName,
        group.pitch,
        gridNumber + pitchOffset,
        group.maxScaling
    ) - pitchOffset
    const snapped = snapMidiToGridPeriodically(foldedGridNumber)

    // `-1` can be a legitimate periodic nominal (MIDI -1 is B-2), so invalidity comes from the
    // pre-snap number, not the bounded helper's historical sentinel. Never lift a non-finite input:
    // nominalToNumber(-1) would otherwise turn NaN into a plausible finite low note.
    if (!Number.isFinite(foldedGridNumber)) {
        return {
            number: NaN,
            isAccidental: snapped.isAccidental,
            voiceable: false,
            addressable: false,
            outOfRangeBound: 0,
        }
    }

    const number = nominalToNumber(group.instrumentName, group.pitch, snapped.id)
    const voiceable = numberToButton(group.instrumentName, group.pitch, number) !== -1
    const sounding = getSoundingTable(group.instrumentName)
    const min = Math.min(...sounding) + pitchOffset
    const max = Math.max(...sounding) + pitchOffset
    const outOfRangeBound = number < min ? -1 : number > max ? 1 : 0
    const span = addressableSpan()

    return {
        number,
        isAccidental: snapped.isAccidental,
        voiceable,
        addressable: Number.isFinite(number) && number >= span.min && number <= span.max,
        // A missing button between the extrema is a gap, not an invented direction.
        outOfRangeBound: voiceable ? 0 : outOfRangeBound,
    }
}

/**
 * Best global transposition for selected MIDI tracks — the automation the Python lyre player calls
 * find_best_shift, which we had no equivalent of (offset is typed in by hand, and the only
 * feedback is a counter the user minimizes by trial and error).
 *
 * Two stages rather than one search, because the two costs depend on different things:
 * accidental-ness is a function of pitch class alone, while being stranded is a function of
 * absolute pitch. Picking the semitone first and the octave second is exact, where a single
 * combined scan trades one against the other arbitrarily.
 *
 * Deliberately scored against every TARGET INSTRUMENT, not just the game-wide grid: instruments
 * with gapped layouts (Sky's 8-note Bells, its 6-note SFX sets) strand notes that the Song Grid
 * calls perfectly playable, and those gaps are real losses for the suggestion to minimize.
 *
 * Ties resolve to the smallest shift, and 0 always wins an outright tie — so running this over
 * a file the app itself exported can never transpose it away from where it started.
 */
export function suggestOffset(groups: readonly MidiOffsetSuggestionGroup[]): OffsetSuggestion {
    const score = (offset: number) => {
        let accidental = 0
        let stranded = 0
        for (const group of groups) {
            for (const note of group.notes) {
                const transformed = transformMidiNumber(note.midi, group, offset)
                if (transformed.isAccidental) accidental++
                if (!transformed.voiceable || !transformed.addressable) stranded++
            }
        }
        return {accidental, stranded}
    }
    if (!groups.some(group => group.notes.length > 0)) {
        return {offset: 0, accidentals: 0, stranded: 0}
    }

    // ---- stage 1: the semitone, judged only on how many notes turn accidental -------------
    let bestSemitone = 0
    let bestAccidentals = Infinity
    for (let semitone = -6; semitone <= 5; semitone++) {
        const count = score(semitone).accidental
        // Equal costs prefer the smallest absolute shift. The negative candidate is visited first
        // for a ±n tie, preserving the original search's final tie rule; an outright tie picks 0.
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
    /** Index within the selected-track set, and therefore the generated roster. */
    layer: number
    /** Per-track transposition; `??` means a track offset of 0 overrides a nonzero global. */
    localOffset: number | null
    /** Maximum number of octave moves the best-effort fold may make. */
    maxScaling: number
}

/** One generated-roster layer — the identity that decides what a snapped nominal becomes. */
export type MidiImportLayer = {
    /** Instrument name; an unknown one resolves like `new Instrument(name)` does (default instrument). */
    name: string
    /** The layer's own Basepoint override, `''` when it follows the song's (InstrumentData.pitch). */
    pitch: Pitch | ''
    /**
     * Whether this layer may hold a note. Defaults to what the instrument's own config says
     * (instrumentSupportsSustain), so the app never has to keep a second copy of that answer;
     * passed explicitly only by a caller that knows better than the roster does — a test
     * exercising span layout in a game that ships no sustaining instrument, say.
     */
    sustains?: boolean
}

export type MidiImportOptions = {
    bpm: number
    offset: number
    includeAccidentals: boolean
    /** Keep instrument-unvoiceable notes as strands. Omitted means the safe sounding default. */
    includeOutOfRange?: boolean
    /**
     * The Basepoint the imported song will carry (MidiParser's pitch selector, seeded from the
     * file's key signature or our own metadata), per layer through `effectiveTrackPitch`.
     *
     * It is read on BOTH sides of the snap, which is what makes import the inverse of export: a
     * file's midi number is an ABSOLUTE sounding pitch (what `toMidi` writes, and what a DAW means
     * by it), while the snap speaks the grid's NOMINAL axis — so the layer's Basepoint comes off
     * before the number is snapped, and `nominalToNumber` carries the snapped nominal back onto the
     * absolute axis through that layer's own instrument. The snap remains white-key as ADR-0007
     * requires, but repeats periodically now; Song Grid display bounds are no longer a discard rule.
     *
     * Two consequences, both intended:
     *  - our own export re-imports to the same notes at ANY Basepoint on an untuned instrument. It
     *    used to come back lifted twice — and, worse, with distinct notes colliding: at Db the
     *    exported 65 and 66 both snapped to 65 and both lifted to 66, so one of them was merged
     *    away (or dropped outright with accidentals off).
     *  - a foreign file in D major, whose key signature seeds this selector with D, is heard as D
     *    major: it is transposed into grid space, snapped there, and the Basepoint puts it back.
     *    The selector used to only relabel the song, so it came back a whole tone sharp.
     *
     * On a TUNED instrument (genshin's Vintage-Lyre) the trip stays BEST-EFFORT, and cannot not be:
     * its buttons sound between the grid's rows, and the snap has only grid rows to land on — a
     * Db that was exported at 73 snaps to the C row and returns as 72. What ADR-0007 still defers
     * is auto-Basepoint DETECTION: a file that names no key signature and carries no metadata of
     * ours is imported at whatever Basepoint the user picked, not at one inferred from its notes.
     */
    pitch: Pitch
    /**
     * The selected tracks' generated roster, in layer order — what each layer's instrument IS. It
     * decides what a snapped nominal sounds (a tuned button's own Sounding Pitch), the Basepoint
     * that instrument is read at, and whether a note's length may become a span. Capability is
     * read from instrument config, never from a game id, so a game gains sustained imports the
     * moment it gains a sustaining instrument.
     */
    layers: readonly MidiImportLayer[]
}

export type MidiTrackStats = {
    accidentals: number
    /** Non-accidental-gated notes this track's chosen instrument cannot voice. */
    outOfRange: number
    outOfRangeLower: number
    outOfRangeUpper: number
}

export type MidiImportResult = {
    columns: NoteColumn[]
    totalNotes: number
    accidentals: number
    /** Instrument-unvoiceable notes, whether the out-of-range toggle kept or dropped them. */
    outOfRange: number
    /** Notes rejected at the accidental gate, before voiceability and Addressable Span policy. */
    droppedAccidentals: number
    /**
     * Notes that mapped fine but were absorbed by another: a re-strike of the same number landing
     * in the same column after quantization. Counted so the importer's totals can never claim
     * more notes than it actually placed. Keyed on the LIFTED number rather than the snapped
     * nominal, so two grid rows a layer's instrument voices with one button collapse here too.
     */
    merged: number
    /** Parallel to the input tracks. */
    perTrack: MidiTrackStats[]
}

/**
 * Whether an instrument responds to hold length. Mirrors Instrument.supportsSustain, which is
 * what playback and the composer already gate on — kept in step deliberately, since a note
 * imported as a hold that the engine plays as a tap is worse than no hold at all. Unknown names
 * use the default instrument, matching note lifting and the runtime Instrument constructor.
 */
export function instrumentSupportsSustain(instrumentName: string): boolean {
    const data = INSTRUMENTS_DATA[instrumentName as keyof typeof INSTRUMENTS_DATA]
        ?? INSTRUMENTS_DATA[INSTRUMENTS[0]]
    const sustain = data.sustain
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
    const {bpm, offset, includeAccidentals, includeOutOfRange = false, layers} = options
    const perTrack: MidiTrackStats[] = tracks.map(() => ({
        accidentals: 0,
        outOfRange: 0,
        outOfRangeLower: 0,
        outOfRangeUpper: 0,
    }))
    const empty: MidiImportResult = {
        columns: [],
        totalNotes: 0,
        accidentals: 0,
        outOfRange: 0,
        droppedAccidentals: 0,
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

    //Per-layer identity, resolved once. The Basepoint here comes off every incoming number
    //(step 1) and goes back on every emitted one (step 5): the same value on both sides, or the
    //round trip through grid space would move the note. A layer the roster has no entry for
    //(a track pointing past it) falls back to the song's Basepoint and the default instrument.
    const layerPitches = layers.map(layer => effectiveTrackPitch(layer, options.pitch))
    const pitchOf = (layer: number) => layerPitches[layer] ?? options.pitch
    const nameOf = (layer: number) => layers[layer]?.name ?? ''
    const canHoldOn = layers.map(layer => layer.sustains ?? instrumentSupportsSustain(layer.name))

    // ---- 1. apply the complete per-note policy before timing layout --------------------------
    const notes: MidiNote[] = []
    let totalNotes = 0
    let accidentals = 0
    let outOfRange = 0
    let droppedAccidentals = 0
    tracks.forEach((track, trackIndex) => {
        const stats = perTrack[trackIndex]
        const instrumentName = nameOf(track.layer)
        const pitch = pitchOf(track.layer)
        for (const midiNote of track.notes) {
            totalNotes++
            const transformed = transformMidiNumber(midiNote.midi, {
                instrumentName,
                pitch,
                localOffset: track.localOffset,
                maxScaling: track.maxScaling,
            }, offset)
            if (transformed.isAccidental) {
                accidentals++
                stats.accidentals++
            }

            // The accidental gate is first. Besides matching the visible pipeline, this keeps
            // droppedAccidentals and outOfRange disjoint so the placed-note accounting is exact.
            if (!includeAccidentals && transformed.isAccidental) {
                droppedAccidentals++
                continue
            }

            if (!transformed.voiceable) {
                outOfRange++
                stats.outOfRange++
                if (transformed.outOfRangeBound === -1) stats.outOfRangeLower++
                if (transformed.outOfRangeBound === 1) stats.outOfRangeUpper++
                if (!includeOutOfRange) continue
            }

            // No toggle can rescue a Note Number outside the game's Addressable Span.
            if (!transformed.addressable) continue

            notes.push(new MidiNote(
                Math.round(midiNote.time * 1000),
                track.layer,
                {
                    id: transformed.number,
                    isAccidental: transformed.isAccidental,
                    outOfRangeBound: transformed.outOfRangeBound,
                },
                Math.round(midiNote.duration * 1000)
            ))
        }
    })
    if (notes.length === 0) {
        return {...empty, totalNotes, accidentals, outOfRange, droppedAccidentals}
    }

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
            const canHold = canHoldOn[note.layer] === true
            let span = 1
            if (canHold && note.durationMs > 0) {
                const endSlot = entry.slot + Math.round(note.durationMs / unitMs)
                //count the columns the sounding length actually covers
                let end = columnIndex + 1
                while (end < columnStartSlots.length - 1 && columnStartSlots[end] < endSlot) end++
                span = Math.max(1, end - columnIndex)
            }
            //The policy pass already lifted this through the layer's instrument before deciding
            //whether it was voiceable and addressable. Keeping that exact number here prevents the
            //conversion and its counters from asking subtly different questions.
            column.notes.push({
                trackIndex: note.layer,
                id: note.data.id,
                span,
            } satisfies ColumnNote)
        }
    })

    // ---- 6. merge duplicates within a column, longest span wins ---------------------------
    //AFTER the lift, deliberately: what a column may not hold twice is one (layer, NUMBER), and
    //the lift is what turns a nominal into that number.
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

    return {columns, totalNotes, accidentals, outOfRange, droppedAccidentals, merged, perTrack}
}
