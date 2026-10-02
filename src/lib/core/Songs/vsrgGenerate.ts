// Beatmap generation: a composed or recorded song in, a new vsrg song out (ADR-0016 and the
// 2026-08-30 generation design, sections 5 and 6). Data in, data out - the caller registers the
// song it gets back, and nothing here is reactive or touches the DOM.
//
// WHAT THE WHOLE THING IS BUILT AROUND: a background track is muted only when the chart covers
// every one of its notes. That is why coverage is counted per source note rather than assumed
// from the mode, why a part the reduction pass thinned is never a Performed Track (the press it
// dropped is a note nothing else carries), and why the Chart Level picks WHICH part to take
// responsibility for instead of thinning a part that was fixed first. A generator that thinned and muted anyway would not
// produce an easier chart - it would produce a song with holes in it, silently, at the difficulty
// aimed at beginners.
//
// THE ONE HARD INVARIANT: no two Hit Objects may share a (Lane, timestamp) across all tracks. A
// keypress resolves through the first renderable object in its Lane, so one press consumes exactly
// one object and a second at that instant is auto-missed however well it was played. Lanes are
// therefore assigned in ONE merged time-ordered pass over every charted track, which makes the
// invariant hold by construction; findLaneCollision below is the assertion that it did.
//
// EVERYTHING RANDOM IS SEEDED. Same source, level, lane count and seed give a byte-identical
// chart, which is what lets golden fixtures pin this the way every other conversion in the repo is
// pinned. Date.now/Math.random/new Date must never appear in here.
import {
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    type Pitch,
    SUSTAIN_VISUAL_THRESHOLD_MS,
    VSRG_TRACK_COLORS,
} from '$core/legacyConfig'
import type {SnapPoint, VsrgSongKeys} from '$core/types'
import {instrumentSupportsSustain} from './midiImport'
import type {RecordedSong} from './RecordedSong'
import type {Song} from './Song.svelte'
import {InstrumentData, type RecordedNote} from './SongClasses'
import {VsrgHitObject, VsrgSong, VsrgTrack} from './VsrgSong.svelte'
import {
    CHART_LEVEL_BANDS,
    type ChartLevel,
    isRatingInBand,
    MAX_GENERATED_RATING,
    rateChart,
} from './vsrgRating'

export type {ChartLevel}

/** Every Chart Level, read off the band table so a level cannot exist without a band to hit. */
export const CHART_LEVELS = Object.keys(CHART_LEVEL_BANDS) as ChartLevel[]

/**
 * Notes this close together are one press. A recorded performance's "simultaneous" notes land
 * 10-20ms apart, and without the window each of them would become its own Hit Object - a chord no
 * hand can play, and a stream of near-simultaneous presses the Lane invariant then has to spread
 * over Lanes nobody asked for. A chord is a set on one Hit Object, so merging costs nothing.
 */
const SIMULTANEITY_MS = 30

/**
 * How long a note has to be before it becomes a hold. Deliberately the app's existing "this note
 * reads as sustained" threshold rather than a number of this module's own: the player draws and
 * sounds holds by that same measure, so anything shorter would be a hold nobody can see or hear.
 */
const HOLD_MIN_MS = SUSTAIN_VISUAL_THRESHOLD_MS

/**
 * Semitones per Lane of contour step. A third moves one Lane, a fifth two, an octave three - so a
 * melody's shape survives into the Lanes while a passing semitone does not spend the whole
 * keyboard. It is a step SIZE and never an absolute mapping: pitch bands were rejected in the
 * design because a narrow melody would then use two Lanes all song and every repeated note would
 * be an unavoidable jack.
 */
const STEP_SEMITONES = 3

/** Accent tiers for the reduction pass: what a press is worth keeping, by where it sits on the beat. */
const ACCENT_ON_BEAT = 1
const ACCENT_ON_HALF = 0.6
const ACCENT_OFF_GRID = 0.2

/**
 * A gap this long ends a phrase. The first and last press of a phrase are never dropped: they are
 * what makes a reduced part still read as an entrance and an ending rather than as a fade.
 */
const PHRASE_GAP_MS = 1200

/** The trailing window hand balance counts presses in - about a bar at a walking tempo. */
const HAND_WINDOW_MS = 2000

/** Press rate is measured as a count inside a sliding window of this length. */
const DENSITY_WINDOW_MS = 1000

/**
 * Prominence weights (design section 6.2). `isPitched` is a GATE as much as a term: an instrument
 * whose buttons are all Assigned Buttons - percussion, SFX - scores zero and can never out-rank a
 * pitched part, which is what stops a busy drum track from being proposed as the melody.
 */
const W_PITCHED = 0.3
const W_HEIGHT = 0.25
const W_VARIED = 0.25
const W_PRESENT = 0.2

/** Presence at or above this reads as "plays through the song" for the dialog's reason line. */
const PRESENT_FLAG = 0.75

/** One press: a cluster of source notes the chart sounds together. */
type PressEvent = {
    /** ms, the cluster's earliest note. */
    time: number
    /** Note Numbers, ascending, deduplicated - a Hit Object's notes are a set. */
    notes: number[]
    /** ms, 0 = a tap. */
    hold: number
    /** Which background track these notes came from. */
    sourceTrack: number
    /** Highest Note Number: the contour's representative pitch. */
    top: number
    /** How many source notes this press accounts for - the coverage ledger's unit. */
    covers: number
}

/**
 * Which terms put a candidate where it is. Flags rather than a sentence: the dialog assembles the
 * reason from translated fragments, so no English ever gets built in here.
 */
export type ProminenceReason = {
    /** Sits highest of the pitched parts. */
    topVoice: boolean
    /** Uses the most distinct pitches. */
    varied: boolean
    /** Plays through most of the song. */
    present: boolean
    /** Strikes most often. */
    dense: boolean
}

export type TrackCandidate = {
    trackIndex: number
    score: number
    reason: ProminenceReason
    /** Whether the level can chart this part with NOTHING dropped, i.e. whether it can be muted. */
    affordableAt: Record<ChartLevel, boolean>
}

/** Everything the analysis knows about one source track, whether or not it will ever be charted. */
export type TrackStats = {
    trackIndex: number
    noteCount: number
    distinctNumbers: number
    meanNumber: number
    /** Fraction of the song's span between this track's first and last note. */
    presence: number
    /** Peak presses per second over a sliding window. */
    peakPressRate: number
    /** Whether the track's instrument has any Pitched Button at all (config, never a name list). */
    pitched: boolean
    presses: PressEvent[]
}

export type SourceAnalysis = {
    /** Index-aligned with the source roster, so an empty track keeps its slot. */
    tracks: TrackStats[]
    /** Every track with notes, best first. Ties break on track index, never on chance. */
    candidates: TrackCandidate[]
    beatMs: number
    /**
     * Accent weight per onset time, taken over EVERY track - muted or not. What the beat is is a
     * property of the whole song, so a part that plays off the beat is not made "on-beat" by being
     * the only thing the chart looks at.
     */
    accents: Map<number, number>
}

export type GenerationRequest = {
    /** The source's notes, flat and track-tagged: a ComposedSong arrives via toRecordedSong(0). */
    source: RecordedSong
    /**
     * The library song the chart is laid over. setAudioSong reads its `id` (into `audioSongId`)
     * and its `instruments` (one modifier each), which is why this is the ORIGINAL song rather
     * than `source`: flattening a ComposedSong builds a new RecordedSong that carries no id, and
     * setAudioSong early-returns on an id equal to the one already set - null included.
     */
    audioSong: Song
    /** The roster `source.notes[].trackIndex` addresses; a charted track's instrument is cloned from it. */
    sourceInstruments: readonly InstrumentData[]
    sourceBpm: number
    sourcePitch: Pitch
    keys: VsrgSongKeys
    level: ChartLevel
    seed: number
    /** null = take the proposal. Otherwise the source track indices the user ticked. */
    selection: number[] | null
    /** The composer's current snap point, so the generated grid matches the one it will be edited on. */
    snapPoint?: SnapPoint
}

export type GenerationResult = {
    /** id-less: the caller registers it (songsStore.addSong writes the id onto the payload only). */
    song: VsrgSong
    rating: number
    /** Source track indices muted, because the chart covers every one of their notes. */
    performed: number[]
    /** Source track indices charted but still sounding in the Backing. */
    doubled: number[]
    attempts: number
    /** Whether the measured Rating landed inside the level's band. */
    converged: boolean
}

/**
 * The per-level budget. One object rather than four constants because the convergence loop retunes
 * these a step at a time, and because affordability (section 6.3) and reduction (section 6.6) have
 * to be asking the same question for "affordable" to mean "mutable".
 */
export type GeneratorKnobs = {
    /** Most Lanes one press may occupy. Notes past it merge onto the outer Lanes, never drop. */
    chordCap: number
    /** How close two consecutive presses may be, in either mode. */
    minPressGapMs: number
    /** How long a Lane stays hot: a press inside this window of its last use is a jack. */
    jackGapMs: number
    /** Ceiling on the peak of the sliding-window press rate. */
    maxPressesPerSecond: number
}

/**
 * The design's anchor table read as budgets: Easy's "<= ~2.5 presses/s sustained, chords <= 2, no
 * jacks under 250ms", Normal's "~4 presses/s, occasional 3-wide chords", Hard's "~6-7 presses/s,
 * regular chords and holds".
 *
 * The rate ceilings sit ABOVE each row's headline rate because they are measured as a peak over a
 * one-second window while the anchors describe a sustained rate - a chart that averages 4/s has
 * seconds with five presses in them, and refusing those would push nearly every song into Doubling
 * (the failure mode the design calls out) for a bar it could comfortably play.
 */
const LEVEL_KNOBS = {
    easy: {chordCap: 2, minPressGapMs: 220, jackGapMs: 250, maxPressesPerSecond: 3.5},
    normal: {chordCap: 3, minPressGapMs: 130, jackGapMs: 170, maxPressesPerSecond: 5.5},
    hard: {chordCap: 4, minPressGapMs: 80, jackGapMs: 110, maxPressesPerSecond: 8},
} as const satisfies Record<ChartLevel, GeneratorKnobs>

export function knobsForLevel(level: ChartLevel): GeneratorKnobs {
    return {...LEVEL_KNOBS[level]}
}

/**
 * How many charts the convergence loop may lay before it settles for the closest one it found
 * (design section 6.10). Eight is enough to walk either knob from any level's setting to its bound
 * and back past the band, and small enough that the whole search is still one synchronous call the
 * dialog can make in a click handler.
 */
export const MAX_ATTEMPTS = 8

/**
 * How far each knob may be retuned, and by how much per step.
 *
 * The chord cap stops at 4 because the Rating stops charging past four Lanes at once (a wider chord
 * is a slam either way), and at 1 because a press has to land somewhere. The gap and rate walk far
 * enough either side of every level's setting to reach the next level's, so a chart that rates two
 * bands off its target can still be brought back rather than being retuned into an identical one.
 */
const CHORD_CAP_RANGE = {min: 1, max: 4}
const MIN_GAP_RANGE = {min: 60, max: 400}
const MIN_GAP_STEP_MS = 40
const PRESS_RATE_RANGE = {min: 1.5, max: 10}
const PRESS_RATE_STEP = 0.75

/**
 * One retune step, or null when every knob is already against the bound it would move toward.
 *
 * `direction` is +1 to make the next chart harder (the last one rated below the band) and -1 to
 * make it easier.
 *
 * The rate ceiling moves on EVERY step, the design's "Doubling mode only" (section 6.10) included.
 * Gating it on "the pass was already thinning something" makes it unreachable exactly where it is
 * needed: a part inside the level's budget is never thinned, so the search is left with the chord
 * cap (nothing to do on single-note presses) and the minimum gap, and a stream that fits Hard's
 * budget and rates 8.1 has no lever to come down at all - the 8-10 band the ADR reserves for hand
 * authoring, reached by generation. Lowering the ceiling below what a part plays is what CREATES
 * something to thin, and the mute it costs is the honest price: coverage decides the mute
 * afterwards, so a thinned part comes back as a Doubling rather than as a muted track with holes.
 *
 * `jackGapMs` is deliberately not a knob at all: it moves presses between Lanes rather than adding
 * or removing any, so it is the one setting here whose effect on a Rating has no fixed sign.
 */
function stepKnobs(knobs: GeneratorKnobs, direction: number): GeneratorKnobs | null {
    const stepped: GeneratorKnobs = {
        chordCap: clamp(knobs.chordCap + direction, CHORD_CAP_RANGE.min, CHORD_CAP_RANGE.max),
        minPressGapMs: clamp(
            knobs.minPressGapMs - direction * MIN_GAP_STEP_MS,
            MIN_GAP_RANGE.min,
            MIN_GAP_RANGE.max
        ),
        jackGapMs: knobs.jackGapMs,
        maxPressesPerSecond: clamp(
            knobs.maxPressesPerSecond + direction * PRESS_RATE_STEP,
            PRESS_RATE_RANGE.min,
            PRESS_RATE_RANGE.max
        ),
    }
    const moved = stepped.chordCap !== knobs.chordCap
        || stepped.minPressGapMs !== knobs.minPressGapMs
        || stepped.maxPressesPerSecond !== knobs.maxPressesPerSecond
    return moved ? stepped : null
}

/** How far a Rating is from a level's band, 0 inside it. What "closest attempt" is measured on. */
function distanceFromBand(rating: number, level: ChartLevel): number {
    const band = CHART_LEVEL_BANDS[level]
    if (rating < band.min) return band.min - rating
    if (rating > band.max) return rating - band.max
    return 0
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value
}

/**
 * mulberry32: the ONLY source of randomness in here, and it decides nothing but ties - which side
 * a repeated pitch steps to, and which of two equally good Lane windows a press lands in. Patterns
 * come from the music; if this ever picked one, two different melodies over one rhythm could chart
 * the same, which is the failure that got pattern-vocabulary fitting rejected.
 */
function mulberry32(seed: number): () => number {
    let state = seed >>> 0
    return () => {
        state = (state + 0x6d2b79f5) | 0
        let t = Math.imul(state ^ (state >>> 15), 1 | state)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

/** Bounce off the ends instead of piling up on them - see the contour walk for why. */
function reflect(value: number, min: number, max: number): number {
    const span = max - min
    if (span <= 0) return min
    const period = 2 * span
    let offset = (value - min) % period
    if (offset < 0) offset += period
    return min + (offset > span ? period - offset : offset)
}

/** Which half of the Lane array a Lane sits in. This split is the model's whole notion of a hand. */
function handOf(lane: number, keys: number): number {
    return lane < keys / 2 ? 0 : 1
}

function instrumentDefinition(name: string) {
    return INSTRUMENTS_DATA[name as keyof typeof INSTRUMENTS_DATA] ?? INSTRUMENTS_DATA[INSTRUMENTS[0]]
}

/**
 * Whether this instrument has any Pitched Button. Read from config exactly like the sustain gate
 * beside it, never from a list of instrument names: a game gains pitched (or sustaining)
 * generation the moment its config gains such an instrument.
 */
function instrumentIsPitched(name: string): boolean {
    return instrumentDefinition(name).notes.some(note => note.pitched)
}

/** Notes grouped by track, index-aligned with the roster so an empty track keeps its slot. */
function notesByTrack(notes: readonly RecordedNote[], trackCount: number): RecordedNote[][] {
    const tracks: RecordedNote[][] = []
    for (let i = 0; i < trackCount; i++) tracks.push([])
    for (const note of notes) {
        //a note addressing a track the roster does not have still sounds at playback, on the
        //default instrument - so it is charted as track 0 rather than quietly discarded
        const index = note.trackIndex >= 0 && note.trackIndex < trackCount ? note.trackIndex : 0
        tracks[index].push(note)
    }
    return tracks
}

/**
 * One track's notes as presses (design section 6.4).
 *
 * The window is measured from the cluster's FIRST note rather than from the previous one: chaining
 * lets a run of 20ms-spaced notes fold into a single press of unbounded length, which is a whole
 * phrase collapsed into one Hit Object.
 */
function clusterTrack(notes: readonly RecordedNote[], trackIndex: number, instrumentName: string): PressEvent[] {
    const sorted = [...notes].sort((a, b) => a.time - b.time || a.id - b.id)
    const sustains = instrumentSupportsSustain(instrumentName)
    const presses: PressEvent[] = []
    let index = 0
    while (index < sorted.length) {
        const start = sorted[index]
        const numbers: number[] = []
        let longest = 0
        let covers = 0
        while (index < sorted.length && sorted[index].time - start.time <= SIMULTANEITY_MS) {
            const note = sorted[index]
            if (!numbers.includes(note.id)) numbers.push(note.id)
            longest = Math.max(longest, note.duration)
            covers++
            index++
        }
        numbers.sort((a, b) => a - b)
        //a hold the engine plays as a tap is worse than no hold, and dropping the sustain of a
        //one-shot sample costs nothing - so the hold exists only where it is audible
        presses.push({
            time: start.time,
            notes: numbers,
            hold: sustains && longest >= HOLD_MIN_MS ? longest : 0,
            sourceTrack: trackIndex,
            top: numbers[numbers.length - 1],
            covers,
        })
    }
    return presses
}

/** Peak presses per second: the busiest sliding window, not the average. */
function peakPressRate(times: readonly number[]): number {
    let peak = 0
    let start = 0
    for (let i = 0; i < times.length; i++) {
        while (times[i] - times[start] > DENSITY_WINDOW_MS) start++
        peak = Math.max(peak, i - start + 1)
    }
    return (peak * 1000) / DENSITY_WINDOW_MS
}

/**
 * The onsets a hand feels as ONE press, over a time-ordered stream: every press within
 * SIMULTANEITY_MS of the group's first. Returned as index groups, so a caller can still reach the
 * presses themselves.
 *
 * The budget is a question about the chart the player plays, and the player plays every charted
 * part at once: two parts striking together are a chord to one pair of hands, not two presses 0ms
 * apart, which is what a straight press-by-press gap check would call them. Within a single track
 * clusterTrack has already merged what is simultaneous, so a one-part stream groups one press per
 * group and nothing about it moves.
 */
function pressGroups(presses: readonly PressEvent[]): number[][] {
    const groups: number[][] = []
    let group: number[] = []
    for (let i = 0; i < presses.length; i++) {
        if (group.length > 0 && presses[i].time - presses[group[0]].time > SIMULTANEITY_MS) {
            groups.push(group)
            group = []
        }
        group.push(i)
    }
    if (group.length > 0) groups.push(group)
    return groups
}

/** When a group lands: its first press, which is the instant its Hit Objects sit at. */
function groupTime(presses: readonly PressEvent[], group: readonly number[]): number {
    return presses[group[0]].time
}

/**
 * Where an onset sits on the beat grid. The tolerance follows the tempo rather than being a fixed
 * few ms, so the same rubato that reads as on-beat at 90bpm does not read as on-beat at 240.
 */
function accentAt(time: number, beatMs: number): number {
    if (!(beatMs > 0)) return ACCENT_ON_BEAT
    const tolerance = Math.min(SIMULTANEITY_MS, beatMs / 8)
    const offBeat = Math.abs(time - Math.round(time / beatMs) * beatMs)
    if (offBeat <= tolerance) return ACCENT_ON_BEAT
    const half = beatMs / 2
    const offHalf = Math.abs(time - Math.round(time / half) * half)
    if (offHalf <= tolerance) return ACCENT_ON_HALF
    return ACCENT_OFF_GRID
}

/**
 * Whether a press stream fits a level's budget with NOTHING dropped (design section 6.3).
 *
 * Asked of the MERGED stream in runPass, never of one charted part at a time: the Rating and the
 * player's two hands both see every charted track at once, so four parts each inside Easy's budget
 * alone are four times Easy's press rate together - a chart the dialog would have offered as Easy
 * and nobody could play. Ranking (rankCandidates) still asks it of one track alone, because there
 * the question genuinely is what THAT part would cost.
 */
function fitsBudget(presses: readonly PressEvent[], knobs: GeneratorKnobs): boolean {
    if (presses.length === 0) return true
    const groups = pressGroups(presses)
    for (const group of groups) {
        //the whole group's notes rather than one press's: simultaneous presses from two parts land
        //on the same instant and the same hands, and the chord cap is a statement about the hands
        let notes = 0
        for (const index of group) notes += presses[index].notes.length
        if (notes > knobs.chordCap) return false
    }
    for (let i = 1; i < groups.length; i++) {
        const gap = groupTime(presses, groups[i]) - groupTime(presses, groups[i - 1])
        if (gap < knobs.minPressGapMs) return false
    }
    return peakPressRate(groups.map(group => groupTime(presses, group))) <= knobs.maxPressesPerSecond
}

/**
 * Per-track statistics, the whole-song beat grid, the accent weight of every onset in the song, and
 * the prominence ranking (design sections 6.1-6.3). Independent of level and seed, so the dialog
 * can call it once and show affordability for all three levels at the same time.
 *
 * It reads EVERY track, including ones no chart will touch: the beat, the accents and a track's
 * height "relative to the other tracks" are all statements about the whole song.
 */
export function analyseSource(
    source: RecordedSong,
    sourceInstruments: readonly InstrumentData[],
    sourceBpm: number
): SourceAnalysis {
    const trackCount = Math.max(sourceInstruments.length, 1)
    const grouped = notesByTrack(source.notes, trackCount)
    const beatMs = sourceBpm > 0 ? 60000 / sourceBpm : 0
    const accents = new Map<number, number>()
    let songStart = Number.POSITIVE_INFINITY
    let songEnd = Number.NEGATIVE_INFINITY
    for (const note of source.notes) {
        songStart = Math.min(songStart, note.time)
        songEnd = Math.max(songEnd, note.time)
        if (!accents.has(note.time)) accents.set(note.time, accentAt(note.time, beatMs))
    }
    const span = songEnd - songStart
    const tracks = grouped.map((notes, trackIndex) => {
        const name = sourceInstruments[trackIndex]?.name ?? INSTRUMENTS[0]
        const presses = clusterTrack(notes, trackIndex, name)
        const distinct = new Set(notes.map(note => note.id))
        const total = notes.reduce((sum, note) => sum + note.id, 0)
        //min/max rather than first/last: `source.notes` is time-sorted when it comes off a parsed
        //song, and a hand-built one is exactly where an unsorted track would go unnoticed
        let first = Number.POSITIVE_INFINITY
        let last = Number.NEGATIVE_INFINITY
        for (const note of notes) {
            first = Math.min(first, note.time)
            last = Math.max(last, note.time)
        }
        //a song whose notes all land on one instant has no span to be present across; a track with
        //any note at all is then present for all of it
        const presence = notes.length === 0 ? 0 : span > 0 ? (last - first) / span : 1
        return {
            trackIndex,
            noteCount: notes.length,
            distinctNumbers: distinct.size,
            meanNumber: notes.length === 0 ? 0 : total / notes.length,
            presence,
            peakPressRate: peakPressRate(presses.map(press => press.time)),
            pitched: instrumentIsPitched(name),
            presses,
        } satisfies TrackStats
    })
    return {tracks, candidates: rankCandidates(tracks), beatMs, accents}
}

/** The weighted prominence score, and the flags the dialog turns into a reason line. */
function rankCandidates(tracks: readonly TrackStats[]): TrackCandidate[] {
    const scored = tracks.filter(track => track.noteCount > 0)
    if (scored.length === 0) return []
    const means = scored.map(track => track.meanNumber)
    const lowest = Math.min(...means)
    const highest = Math.max(...means)
    const mostDistinct = Math.max(...scored.map(track => track.distinctNumbers))
    const mostNotes = Math.max(...scored.map(track => track.noteCount))
    const highestPitched = Math.max(
        ...scored.filter(track => track.pitched).map(track => track.meanNumber),
        Number.NEGATIVE_INFINITY
    )
    const candidates = scored.map(track => {
        //height is relative to the other tracks, never absolute: a bass line is low only because
        //something above it is high. A lone track is the top voice by default rather than by
        //measurement, which is the same answer with no division by zero in it.
        const height = highest > lowest ? (track.meanNumber - lowest) / (highest - lowest) : 1
        const varied = mostDistinct > 0 ? track.distinctNumbers / mostDistinct : 0
        const score = track.pitched
            ? W_PITCHED + W_HEIGHT * height + W_VARIED * varied + W_PRESENT * track.presence
            : 0
        return {
            trackIndex: track.trackIndex,
            score,
            reason: {
                topVoice: track.pitched && track.meanNumber === highestPitched,
                varied: track.distinctNumbers === mostDistinct,
                present: track.presence >= PRESENT_FLAG,
                dense: track.noteCount === mostNotes,
            },
            affordableAt: CHART_LEVELS.reduce((all, level) => {
                all[level] = fitsBudget(track.presses, LEVEL_KNOBS[level])
                return all
            }, {} as Record<ChartLevel, boolean>),
        } satisfies TrackCandidate
    })
    return candidates.sort((a, b) => b.score - a.score || a.trackIndex - b.trackIndex)
}

/**
 * WHICH source tracks get charted (design section 6.5). The proposal is the highest-scoring
 * candidate the level can fully cover; when nothing fits, the highest-scoring candidate is charted
 * anyway - as a Doubling, which carries no coverage obligation and is therefore free to be the
 * better chart.
 *
 * A percussion-only song still gets a chart: the pitched gate exists to stop drums out-ranking a
 * melody, not to refuse a song that has no melody in it.
 *
 * Decided ONCE, off the level's own knobs, and never revisited by the convergence loop: which part
 * you take responsibility for is the answer the dialog pre-ticks and the user overrides, so a
 * retune that quietly charted a different instrument would make that proposal a lie. What the loop
 * does revisit is whether each of these tracks is charted in FULL or thinned - see runPass.
 */
function selectTracks(analysis: SourceAnalysis, selection: number[] | null, level: ChartLevel): number[] {
    if (selection !== null) {
        return [...new Set(selection)]
            .filter(index => (analysis.tracks[index]?.noteCount ?? 0) > 0)
            .sort((a, b) => a - b)
    }
    return proposeTracks(analysis, level)
}

/**
 * The part a level proposes, with no user selection in play.
 *
 * Exported because the dialog PRE-TICKS this and has to be showing the same answer generation
 * would reach: a proposal re-derived beside the generator is one that can drift from it, and a
 * pre-ticked box that does not match what an untouched Generate produces is a lie about the
 * feature's one overridable decision.
 */
export function proposeTracks(analysis: SourceAnalysis, level: ChartLevel): number[] {
    const proposal = analysis.candidates.find(candidate => candidate.affordableAt[level])
        ?? analysis.candidates[0]
    return proposal === undefined ? [] : [proposal.trackIndex]
}

/**
 * Drop presses until the stream fits the budget, cheapest first by accent weight (design section
 * 6.6). DOUBLING MODE ONLY - a press dropped here is a note the chart no longer carries, and the
 * coverage ledger takes the mute away for it.
 *
 * The mode is a property of the CHART, not of a part: this runs on the merged stream, so the victim
 * is the cheapest press in the whole chart rather than the cheapest press in each part measured as
 * if it were the only one being played. A part that was affordable alone can lose a press to a
 * selection it shares Lanes with, and comes back a Doubling - which is the honest outcome, not a
 * broken contract: what it may never do is lose the press and keep the mute.
 *
 * Phrase edges are never dropped, so a thinned part still enters and ends where the music does.
 */
function reducePresses(
    presses: readonly PressEvent[],
    knobs: GeneratorKnobs,
    accents: Map<number, number>,
    beatMs: number
): PressEvent[] {
    const work = [...presses]
    const weightOf = (press: PressEvent) => accents.get(press.time) ?? accentAt(press.time, beatMs)
    //phrases are the MUSIC's, so they are read off the full stream once rather than recomputed as
    //it thins - otherwise every drop would promote its neighbours to protected phrase edges. Read
    //per PART rather than off the merge: a part that enters underneath another one still enters,
    //and the edge worth keeping is the one its own line has.
    const protectedPresses = new Set<PressEvent>()
    const lines = new Map<number, PressEvent[]>()
    for (const press of work) {
        const line = lines.get(press.sourceTrack)
        if (line === undefined) lines.set(press.sourceTrack, [press])
        else line.push(press)
    }
    for (const line of lines.values()) {
        for (let i = 0; i < line.length; i++) {
            const startsPhrase = i === 0 || line[i].time - line[i - 1].time > PHRASE_GAP_MS
            const endsPhrase = i === line.length - 1 || line[i + 1].time - line[i].time > PHRASE_GAP_MS
            if (startsPhrase || endsPhrase) protectedPresses.add(line[i])
        }
    }
    const droppable = (index: number) => !protectedPresses.has(work[index])
    //each pass removes exactly one press, so the stream is the bound: the loop cannot outlive it
    for (let guard = work.length; guard > 0; guard--) {
        const victim = cheapestViolator(work, knobs, weightOf, droppable)
        if (victim === -1) break
        work.splice(victim, 1)
    }
    return work
}

/**
 * The cheapest droppable press inside the first budget violation, or -1 when the stream fits (or
 * when everything that would fix it is a phrase edge, which ends reduction rather than looping).
 */
function cheapestViolator(
    presses: readonly PressEvent[],
    knobs: GeneratorKnobs,
    weightOf: (press: PressEvent) => number,
    droppable: (index: number) => boolean
): number {
    const cheaperOf = (indices: number[]) => {
        let best = -1
        for (const index of indices) {
            if (!droppable(index)) continue
            //<= rather than <, so a tie takes the LATER press. Dropping the earlier of a pair that
            //is too close leaves the later one just as close to whatever follows it, and the next
            //scan finds that same violation one press along - which walks the whole stream and eats
            //it. A bar of even on-beat quavers, where every weight ties, thinned to a quarter of
            //itself that way instead of to the half the gap actually asks for.
            if (best === -1 || weightOf(presses[index]) <= weightOf(presses[best])) best = index
        }
        return best
    }
    //over GROUPS for the same reason fitsBudget measures them: simultaneous presses from two parts
    //are one onset, so neither the gap to the next onset nor the press rate is fixed by dropping
    //one of them. A group that has to go loses its presses one scan at a time, cheapest first.
    const groups = pressGroups(presses)
    const at = (group: number) => groupTime(presses, groups[group])
    for (let i = 1; i < groups.length; i++) {
        if (at(i) - at(i - 1) >= knobs.minPressGapMs) continue
        const victim = cheaperOf([...groups[i - 1], ...groups[i]])
        if (victim !== -1) return victim
    }
    let start = 0
    for (let i = 0; i < groups.length; i++) {
        while (at(i) - at(start) > DENSITY_WINDOW_MS) start++
        const rate = ((i - start + 1) * 1000) / DENSITY_WINDOW_MS
        if (rate <= knobs.maxPressesPerSecond) continue
        const window: number[] = []
        for (let group = start; group <= i; group++) window.push(...groups[group])
        const victim = cheaperOf(window)
        if (victim !== -1) return victim
    }
    return -1
}

/** One press as it landed: the Lanes it occupies, low pitch first. */
type Placement = {
    press: PressEvent
    lanes: {lane: number; notes: number[]}[]
}

/**
 * Contour walk plus constraint pass, in ONE forward sweep over every charted track's presses
 * (design sections 6.7 and 6.8). Merged rather than per track, because the Lane invariant is a
 * statement about the whole chart and enforcing it by construction is the only way it cannot be
 * violated by an ordering nobody thought of.
 *
 * The two sections are one pass rather than two because the constraints decide WHERE the contour's
 * target actually lands: a jack break that runs after placement would have to undo a Lane the
 * invariant already booked.
 */
function placePresses(
    presses: readonly PressEvent[],
    keys: number,
    knobs: GeneratorKnobs,
    random: () => number
): Placement[] {
    const placements: Placement[] = []
    const holdUntil = new Array<number>(keys).fill(Number.NEGATIVE_INFINITY)
    const lastPress = new Array<number>(keys).fill(Number.NEGATIVE_INFINITY)
    //only the trailing window's worth: pruned as the sweep advances, so hand balance is a count
    //of what it holds rather than a scan of every press placed so far
    const recent: {time: number; hand: number}[] = []
    //presses arrive time-ordered, so the only Lanes that can collide are the ones taken at the
    //instant being placed - one set, reset when the timestamp moves on
    let takenAt = Number.NEGATIVE_INFINITY
    let taken = new Set<number>()
    let cursor = Math.floor(keys / 2)
    let previousTop: number | null = null
    for (const press of presses) {
        if (press.time !== takenAt) {
            takenAt = press.time
            taken = new Set<number>()
        }
        while (recent.length > 0 && press.time - recent[0].time > HAND_WINDOW_MS) recent.shift()
        const free = (lane: number) => !taken.has(lane) && holdUntil[lane] <= press.time
        const target = previousTop === null
            ? cursor
            : contourTarget(cursor, press.top - previousTop, keys, free, random)
        //the contour follows the MUSIC, so it moves on even for a press that finds no Lane
        previousTop = press.top
        //NARROW rather than drop. A Hit Object's notes are a set, so the same chord on fewer Lanes
        //is the same chord - it is the fallback the note distribution below already relies on for a
        //press with more notes than the cap allows Lanes. Dropping the press instead would forfeit
        //the coverage that earns the mute over an instant that was merely crowded: a hold occupies
        //its Lanes for as long as it lasts, so overlapping three-note chords can leave no
        //three-wide window free at an instant a one-Lane press still fits. Only a press that finds
        //no Lane at all is dropped, and that instant is genuinely full.
        let width = Math.min(press.notes.length, knobs.chordCap, keys)
        let start: number | null = null
        while (start === null && width > 0) {
            start = chooseWindow(press, target, width, keys, knobs, {holdUntil, lastPress, recent, taken}, random)
            if (start === null) width--
        }
        if (start === null) continue
        const lanes: {lane: number; notes: number[]}[] = []
        for (let i = 0; i < width; i++) lanes.push({lane: start + i, notes: []})
        //ascending notes onto ascending Lanes, low pitch left. A press with more notes than Lanes
        //stacks the extras onto the ones it has: a Hit Object's notes are a set, so the chord is
        //still sounded in full and coverage is untouched - only the number of fingers is capped.
        press.notes.forEach((note, index) => {
            lanes[Math.floor((index * width) / press.notes.length)].notes.push(note)
        })
        const centre = start + Math.floor((width - 1) / 2)
        for (const lane of lanes) {
            taken.add(lane.lane)
            lastPress[lane.lane] = press.time
            if (press.hold > 0) holdUntil[lane.lane] = press.time + press.hold
        }
        recent.push({time: press.time, hand: handOf(centre, keys)})
        //the walk is relative, so it follows where the press ACTUALLY landed rather than where the
        //contour aimed: a target nothing was placed on would make every later step measure from a
        //Lane the chart never used, and a persistent jack break would drift the whole contour
        cursor = centre
        placements.push({press, lanes})
    }
    return placements
}

/** Where the contour wants this press, before the constraints get a say (design section 6.7). */
function contourTarget(
    cursor: number,
    delta: number,
    keys: number,
    free: (lane: number) => boolean,
    random: () => number
): number {
    let direction: number
    let step: number
    if (delta === 0) {
        //a repeated pitch has no direction of its own, so it steps toward whichever side has more
        //room - which is also what keeps a repeated note off its own Lane
        let left = 0
        let right = 0
        for (let lane = 0; lane < cursor; lane++) if (free(lane)) left++
        for (let lane = cursor + 1; lane < keys; lane++) if (free(lane)) right++
        direction = left === right ? (random() < 0.5 ? -1 : 1) : left > right ? -1 : 1
        step = 1
    } else {
        direction = delta > 0 ? 1 : -1
        step = clamp(Math.round(Math.abs(delta) / STEP_SEMITONES), 1, keys - 1)
    }
    //REFLECT, not clamp: a clamped long ascent piles every press onto the top Lane, which is a
    //jack the mapping made up rather than one the music asked for
    return reflect(cursor + direction * step, 0, keys - 1)
}

/**
 * The Lane window this press lands in, or null when the instant has no room for it (design section
 * 6.8). Candidates are every window of `width` consecutive Lanes; the constraints are a ranking
 * rather than a filter, so a chart in a corner still places its press somewhere sensible.
 *
 * Ranked by, in order: jacks broken (a Lane pressed inside the level's window is the thing the
 * pass exists to move), distance from the contour's target (the nearest free Lane), then the hand
 * with fewer presses in the trailing window. Hold protection and the (Lane, timestamp) invariant
 * are not ranked at all - a window that violates either is not a candidate.
 */
function chooseWindow(
    press: PressEvent,
    target: number,
    width: number,
    keys: number,
    knobs: GeneratorKnobs,
    state: {
        holdUntil: number[]
        lastPress: number[]
        /** Already pruned to the trailing window: every entry counts. */
        recent: {time: number; hand: number}[]
        taken: Set<number>
    },
    random: () => number
): number | null {
    const desired = clamp(target - Math.floor((width - 1) / 2), 0, keys - width)
    const handLoad = [0, 0]
    for (const entry of state.recent) handLoad[entry.hand]++
    let best: [number, number, number] | null = null
    let ties: number[] = []
    for (let start = 0; start + width <= keys; start++) {
        let jacks = 0
        let usable = true
        for (let lane = start; lane < start + width; lane++) {
            if (state.taken.has(lane) || state.holdUntil[lane] > press.time) {
                usable = false
                break
            }
            if (press.time - state.lastPress[lane] < knobs.jackGapMs) jacks++
        }
        if (!usable) continue
        const centre = start + Math.floor((width - 1) / 2)
        const score: [number, number, number] = [
            jacks,
            Math.abs(start - desired),
            handLoad[handOf(centre, keys)],
        ]
        const comparison = best === null
            ? -1
            : score[0] - best[0] || score[1] - best[1] || score[2] - best[2]
        if (comparison < 0) {
            best = score
            ties = [start]
        } else if (comparison === 0) {
            ties.push(start)
        }
    }
    if (ties.length === 0) return null
    return ties[Math.floor(random() * ties.length)]
}

/**
 * Two Hit Objects in one Lane at one instant, or null. The player resolves a press to the first
 * renderable object in its Lane, so the second one is auto-missed however well it was played -
 * which makes this a correctness bug rather than a quality one, and the first thing a generated
 * chart should be checked for.
 */
export function findLaneCollision(song: VsrgSong): {lane: number; time: number} | null {
    const seen = new Set<string>()
    for (const track of song.tracks) {
        for (const hitObject of track.hitObjects) {
            const key = `${hitObject.index}@${hitObject.timestamp}`
            if (seen.has(key)) return {lane: hitObject.index, time: hitObject.timestamp}
            seen.add(key)
        }
    }
    return null
}

/**
 * The placed chart as a VsrgSong (design section 6.9).
 *
 * One VsrgTrack per charted source track with the source's own InstrumentData CLONED into it: the
 * timbre is preserved, and Stranded Notes are impossible by construction because the notes came
 * from that very instrument.
 */
function emit(
    request: GenerationRequest,
    charted: readonly number[],
    placements: readonly Placement[],
    performed: readonly number[]
): VsrgSong {
    const song = new VsrgSong(request.source.name)
    const tracks = charted.map((trackIndex, index) => {
        const track = new VsrgTrack()
        track.instrument = (request.sourceInstruments[trackIndex] ?? new InstrumentData()).clone()
        track.color = VSRG_TRACK_COLORS[index % VSRG_TRACK_COLORS.length]
        //placements are already time-ordered, and filtering keeps that: tickPlayback walks the
        //array and stops at the first object past the cursor, so an unsorted track is one whose
        //later objects never spawn at all
        for (const placement of placements) {
            if (placement.press.sourceTrack !== trackIndex) continue
            for (const lane of placement.lanes) {
                const hitObject = new VsrgHitObject(lane.lane, placement.press.time)
                hitObject.notes = [...lane.notes]
                //BOTH halves of a hold: serialize() stores only holdDuration and deserialize
                //re-derives isHeld from it, so a hold with isHeld left false sounds as a tap in
                //the session that generated it and silently becomes a real hold after a reload
                hitObject.holdDuration = placement.press.hold
                hitObject.isHeld = placement.press.hold > 0
                track.hitObjects.push(hitObject)
            }
        }
        return track
    })
    song.initTracksForConstruction(tracks)
    //before the mutes and before set(): it is what builds the modifier array they index into
    song.setAudioSong(request.audioSong)
    //CHECKED, not documented. setAudioSong early-returns when the id it is handed equals the one
    //already set - and a fresh VsrgSong starts at null, so an unregistered background song leaves
    //trackModifiers empty, every setTrackModifier below silently returns, and the result still
    //reports the track as performed. That is the coverage ledger drifting out of step with what the
    //song carries, which is the one failure this module exists to make impossible; and with no
    //audioSongId there is no Backing to be muted against anyway, so there is nothing to salvage.
    //A roster that disagrees with the modifiers indexes the mutes onto the wrong parts, which the
    //same count check catches.
    if (song.trackModifiers.length !== request.sourceInstruments.length) {
        throw new Error(
            `generated chart has ${song.trackModifiers.length} track modifiers for `
            + `${request.sourceInstruments.length} source instruments: the audio song must be a `
            + `registered song (a non-null id) carrying the roster the notes address`
        )
    }
    song.set({
        //setAudioSong has never carried these across, so a hand-picked background song leaves the
        //grid unaligned to the music under it. A generated song has no excuse: its snap points,
        //breakpoints and whole timeline are read against this bpm.
        bpm: request.sourceBpm,
        pitch: request.sourcePitch,
        keys: request.keys,
        snapPoint: request.snapPoint ?? song.snapPoint,
    })
    song.setDurationFromNotes(request.source.notes)
    //setDurationFromNotes maxes note.time and ignores note.duration, so a chart whose last press is
    //a long hold would end inside it
    const end = song.tracks.reduce(
        (max, track) => track.hitObjects.reduce((inner, hitObject) =>
            Math.max(inner, hitObject.timestamp + hitObject.holdDuration), max),
        0
    )
    if (end > song.duration) song.set({duration: end})
    //via the assigning setter: trackModifiers is $state.raw, so an in-place `[i].muted = true`
    //mutates and publishes nothing at all
    for (const trackIndex of performed) song.setTrackModifier(trackIndex, {muted: true})
    return song
}

/** One chart laid at one setting of the knobs: everything a GenerationResult carries but the search. */
type Attempt = {
    song: VsrgSong
    rating: number
    performed: number[]
    doubled: number[]
}

/**
 * Which of two attempts is the better outcome to hand back.
 *
 * The reserved band outranks the target band: 8-10 is hand-authoring territory (ADR-0016), so a
 * chart above MAX_GENERATED_RATING is one the generator may not return while it has any other,
 * however much closer to the band it happens to sit. Below the ceiling it is distance from the
 * band, which is what "the closest attempt" means.
 */
function isBetterAttempt(candidate: Attempt, best: Attempt, level: ChartLevel): boolean {
    const candidateOverCeiling = candidate.rating > MAX_GENERATED_RATING
    const bestOverCeiling = best.rating > MAX_GENERATED_RATING
    if (candidateOverCeiling !== bestOverCeiling) return !candidateOverCeiling
    return distanceFromBand(candidate.rating, level) < distanceFromBand(best.rating, level)
}

/**
 * One chart, from clustering to a measured Rating (design sections 6.4-6.9 plus the rate). The
 * convergence loop's body, and the only thing in here the knobs reach.
 *
 * Whether the chart is thinned at all is decided HERE rather than at selection time, against the
 * knobs this pass is running at: a retune that widens the minimum gap or lowers the rate ceiling can
 * push the charted stream out of the level's budget, and a stream outside the budget is one the
 * chart may thin - which is how a chart that rates too hard comes down without the generator ever
 * deciding to leave holes in a muted track.
 *
 * The mute is then decided by the coverage LEDGER, not by the mode: a track whose every press was
 * placed is muted, and anything that lost a press - to reduction, or to an instant with no Lane
 * left in it - stays in the Backing as a Doubling. That is the ADR's contract stated once, where it
 * cannot drift out of step with what was actually charted.
 */
function runPass(
    request: GenerationRequest,
    analysis: SourceAnalysis,
    charted: readonly number[],
    knobs: GeneratorKnobs
): Attempt {
    const random = mulberry32(request.seed)
    const merged = charted
        .flatMap(trackIndex => analysis.tracks[trackIndex].presses)
        .sort((a, b) => a.time - b.time || a.sourceTrack - b.sourceTrack || a.top - b.top)
    //the budget is asked of the MERGE, and so is the thinning: a part is affordable only given what
    //else is charted, and two parts that each fit alone can be twice the level's press rate
    //together. With one charted part this is the same question about the same stream it always was.
    const reducing = !fitsBudget(merged, knobs)
    const stream = reducing ? reducePresses(merged, knobs, analysis.accents, analysis.beatMs) : merged
    const placements = placePresses(stream, request.keys, knobs, random)
    const covered = new Map<number, number>()
    for (const placement of placements) {
        const track = placement.press.sourceTrack
        covered.set(track, (covered.get(track) ?? 0) + placement.press.covers)
    }
    const performed = charted.filter(
        trackIndex => (covered.get(trackIndex) ?? 0) === analysis.tracks[trackIndex].noteCount
    )
    const doubled = charted.filter(trackIndex => !performed.includes(trackIndex))
    const song = emit(request, charted, placements, performed)
    const collision = findLaneCollision(song)
    if (collision !== null) {
        throw new Error(`generated chart has two hit objects in lane ${collision.lane} at ${collision.time}ms`)
    }
    return {song, rating: rateChart(song), performed, doubled}
}

/**
 * Turn a source song into a chart that performs part of it: lay one, measure it, and retune until
 * the measured Rating agrees with the Chart Level it was aimed at (design section 6.10).
 *
 * WHY THIS TERMINATES. Two independent reasons, and the weaker one is not relied on:
 * - MAX_ATTEMPTS caps the walk outright, and a step that moves no knob (every one already against
 *   its bound) ends it earlier. So the loop is bounded whatever the Rating does.
 * - The knobs are monotone in the Rating, which is what makes the bounded walk a SEARCH rather than
 *   a wander. Every one of them only ever adds or removes Hit Objects, never rearranges them:
 *   narrowing the chord cap spends fewer Lanes on the same press, widening the minimum gap and
 *   lowering the reduction threshold drop presses out of a Doubling, and a widened gap can push a
 *   Performed Track into Doubling, which can only thin it further. Rating never rises when a chart
 *   loses Hit Objects or narrows its chords - vsrgRating's monotonicity suite is exactly that
 *   claim - so stepping toward "easier" cannot raise the Rating and stepping toward "harder" cannot
 *   lower it. `jackGapMs` is left out of the retune for want of that property.
 *
 * A direction FLIP ends the search too: having stepped past the band from one side, stepping back
 * lands on the setting we just left, and the two would trade places until the cap. The closest
 * attempt is returned instead.
 *
 * ABOVE THE RESERVED CEILING NEITHER OF THOSE APPLIES. 8-10 is hand-authoring territory, so while
 * every chart laid so far rates above MAX_GENERATED_RATING the only useful direction is down, and a
 * flip is no reason to stop: the chart that overshot the band's floor is still the one worth
 * handing back, because the one that did not is one the generator may not produce at all.
 *
 * On exhaustion the attempt nearest the band comes back with `converged: false`. Never a pretended
 * convergence: an out-of-band chart is a real outcome (a sparse song cannot be made Hard - there
 * are no notes to press), and the dialog says so rather than mislabelling the chart.
 */
export function generateChart(request: GenerationRequest): GenerationResult {
    const analysis = analyseSource(request.source, request.sourceInstruments, request.sourceBpm)
    const charted = selectTracks(analysis, request.selection, request.level)
    let knobs = knobsForLevel(request.level)
    let attempt = runPass(request, analysis, charted, knobs)
    //the best the search has come to, kept alongside the latest: a step in the right direction can
    //overshoot the band, and the chart that came nearest is the one worth handing back
    let best = attempt
    let attempts = 1
    let previousDirection = 0
    while (attempts < MAX_ATTEMPTS) {
        const overCeiling = best.rating > MAX_GENERATED_RATING
        if (!overCeiling && isRatingInBand(attempt.rating, request.level)) break
        const direction = overCeiling || attempt.rating > CHART_LEVEL_BANDS[request.level].max ? -1 : 1
        if (!overCeiling && previousDirection !== 0 && direction !== previousDirection) break
        previousDirection = direction
        const stepped = stepKnobs(knobs, direction)
        if (stepped === null) break
        knobs = stepped
        attempt = runPass(request, analysis, charted, knobs)
        attempts++
        if (isBetterAttempt(attempt, best, request.level)) best = attempt
    }
    //on `best` and not on the last attempt: the search stops on the chart it is keeping
    const converged = isRatingInBand(best.rating, request.level)
    return {
        song: best.song,
        rating: best.rating,
        performed: best.performed,
        doubled: best.doubled,
        attempts,
        converged,
    }
}
