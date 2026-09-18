// Rating: how hard a chart actually is, 1-10, computed from its Hit Objects (ADR-0016, and the
// 2026-08-30 generation design's section 7). Data in, number out - the vsrg composer can show a
// live readout and the generator can converge on a band without either of them owning the
// arithmetic, and nothing here is reactive.
//
// WHY PER-LANE STRAIN RATHER THAN DENSITY: presses per second is blind to the thing that actually
// makes a chart hard, which is a finger asked for a second press before it has recovered from the
// first. Strain is per Lane by definition (CONTEXT.md): it spikes when that Lane is pressed and
// decays with time, so repeated presses in one Lane pile up while the same count spread across
// Lanes does not.
//
// WHY THESE NUMBERS ARE STATED RATHER THAN FITTED: there is no chart corpus to fit against - the
// repo's only vsrg fixtures are two-Hit-Object format goldens - so the 1-10 scale is pinned to
// synthetic reference streams at the presses-per-second the design's anchor table names, and
// everything between them is interpolated. They are a guess, and deliberately the cheapest part of
// the feature to change: Rating is derived and never stored, so moving a constant here re-rates
// every chart in the library at once, with no migration.
import type {VsrgSong} from './VsrgSong.svelte'

export type ChartLevel = 'easy' | 'normal' | 'hard'

/** The Rating range a Chart Level aims at, inclusive at both ends. */
export type RatingBand = {min: number; max: number}

export const MIN_RATING = 1
export const MAX_RATING = 10

/**
 * The target band per Chart Level (ADR-0016). A level is a target and not a preset: the generator
 * charts, rates and retunes until the measured Rating lands inside its band, which is why the
 * bands live beside the metric that has to hit them rather than beside the generator.
 *
 * They stop short of the scale's top on purpose - 8-10 is reserved for hand authoring, so a 9
 * always means a human made it and the generator is never judged on charts it was not trying to
 * make. Easy's floor is the scale's floor, since a chart with nothing to press is a 1.
 *
 * Hard stops at 7.9 rather than at 8 because the reserved range starts AT 8 and this end is
 * inclusive: a band of 6-8 accepts a chart measured at exactly 8.0, which a 7/s chart of chords and
 * holds reaches. `rateChart` rounds to a tenth, so 7.9 is the whole step below the reservation and
 * nothing is lost between them.
 */
export const CHART_LEVEL_BANDS = {
    easy: {min: MIN_RATING, max: 3},
    normal: {min: 3.5, max: 6},
    hard: {min: 6, max: 7.9},
} as const satisfies Record<ChartLevel, RatingBand>

/** Nothing generation produces may pass here; the convergence loop treats it as a hard ceiling. */
export const MAX_GENERATED_RATING = CHART_LEVEL_BANDS.hard.max

/** Whether a measured Rating satisfies a Chart Level. Both ends inclusive: the bands abut at 6. */
export function isRatingInBand(rating: number, level: ChartLevel): boolean {
    const band = CHART_LEVEL_BANDS[level]
    return rating >= band.min && rating <= band.max
}

/**
 * How long a Lane stays hot. A press 600ms after another in the same Lane still lands on ~37% of
 * the first one's spike, while a 150ms repeat (a 6.6/s jack) has barely decayed at all. This sets
 * the model's whole time scale - every other duration here is read against it.
 */
const DECAY_MS = 600

/**
 * One press's unit load. Free to be 1: the anchors are measured with this same model, so any
 * constant factor cancels between a chart's strain and the thresholds it is compared against.
 */
const BASE = 1

/**
 * How the per-Lane strains become one number.
 *
 * NOT the plain sum the design writes, because a plain sum is Lane-BLIND: the summed strain at any
 * instant is the sum over every past press of value * exp(-dt / DECAY_MS) whatever Lane each press
 * landed in, so a jack and a perfectly spread round-robin at the same press rate produce
 * bit-identical totals and the per-Lane model buys nothing at all. A p-norm keeps the units (a
 * chart that uses one Lane scores exactly that Lane's strain) and scores the same press count
 * spread over k Lanes at k^(1/p - 1) of the concentrated case - half of it, at p = 2 over 4 Lanes.
 */
const LANE_NORM_EXPONENT = 2

/** Presses closer together than this are one chord to a hand; the generator clusters on the same window. */
const SIMULTANEITY_MS = 30

/**
 * The sampling grid, and what one sample measures.
 *
 * Sampling by TIME rather than per press is what makes the aggregate a sustained load instead of a
 * note count: a slow bar contributes as many samples as it lasts. The grid is anchored at the
 * chart's first press rather than at t = 0, so a chart does not rate differently for starting
 * 100ms later.
 *
 * A sample is the MEAN strain across the WINDOW_MS that follows it, not the strain at the grid
 * line and not the peak inside a cell. Both of those rate a press by where it happens to fall
 * between two grid lines - a press 10ms before a line hands its whole spike to the next sample -
 * and that phase noise showed up as a chart rating HIGHER after its gaps were widened, which is
 * the one property the convergence loop cannot do without. The window is long because the
 * alternative measures instants: with a 200ms window, six isolated three-Lane chords scattered
 * through a twelve-second chart took over the top of the sorted list and rated it a 7 when the
 * same chart without them rated a 5.
 */
const SAMPLE_MS = 200
const WINDOW_MS = 1800

/**
 * Geometric weight over the descending-sorted windows, and how many of them are taken.
 *
 * 0.94 puts half the weight in the top ~9 windows and 86% inside the 32 taken, so the number
 * answers "how hard is the hardest sustained stretch" rather than "how hard is the average bar"
 * (a mean, which any burst hides in) or "how hard is the single worst instant" (a max, which one
 * accidental cluster owns). The result is normalized by the weight actually used, so a chart with
 * less material than the slice is not scored as though its silence were easy - and, again, so
 * that stretching a chart's gaps cannot raise its Rating by lengthening it.
 *
 * That normalization is what bounds the slice: past 32 kept windows - about 8s of non-silent
 * material - the taken set of a chart is the taken set of any chart it is contained in, so adding
 * Hit Objects can only raise a Rating and dropping them can only lower it, which is the property
 * the convergence loop searches on. BELOW that much material the slice is the whole chart, and
 * easy material added to it counts in the average: a three-second burst with a quiet tail rates
 * under the same burst alone. Every way out of that costs more than it buys - a slice sized as a
 * fraction of the chart makes a Rating depend on total length again, a fixed 32-weight mass makes
 * a chart harder for repeating its hardest bar, and a slice short enough for any chart to fill
 * collapses the whole measure onto its single worst instant.
 */
const SAMPLE_WEIGHT = 0.94
const TOP_SAMPLES = 32

/**
 * How far past the last press sampling continues, and how long a gap counts as silence rather than
 * as part of a stretch. The cool-down IS part of the chart - without it every sample would sit on
 * a peak, and a two-press chart would rate as hard as the instant of its second press.
 */
const TAIL_MS = 2 * DECAY_MS

/**
 * Chord width - simultaneous presses across Lanes, not the note count on one Hit Object, which is
 * free (one press sounds the whole set). The width already spends one spike per Lane and the norm
 * above already charges for it; this multiplier is only the coordination on top, so it stays
 * small. Capped because past four fingers the chart is a slam and further Lanes cost nothing more.
 */
const CHORD_WEIGHT = 0.12
const CHORD_WIDTH_CAP = 4

/**
 * Pressing a Lane while other Lanes are held: those fingers are committed, so what is left does
 * the work. Capped for the same reason as chord width - a hand can only be so encumbered.
 */
const HOLD_WEIGHT = 0.15
const HOLD_OVERLAP_CAP = 3

/**
 * Hand load: a press on the hand that has been doing the recent work costs more than one that
 * alternates, so a stretch played entirely with one hand is worth up to a fifth more per press.
 *
 * Charged on the pressing hand's OWN decaying load, never on its share of the recent presses. A
 * share is a ratio the other hand dilutes: filling an idle hand with off-beat notes made every
 * later press on the busy hand cheaper, so a chart could rate LOWER for gaining Hit Objects and
 * higher for losing them - and the Doubling reduction pass (design section 6.6) drops presses to
 * come DOWN into a band, which is a search that only terminates while every knob is monotone.
 *
 * Saturating at the load one hand carries pressing four times a second - the design's Normal row.
 * Past that the hand is committed and further crowding is the p-norm's business. The anchor
 * streams alternate hands, so a hand-alternating chart's share of this charge is baked into the
 * thresholds and only the imbalance above it reaches a Rating.
 */
const HAND_WEIGHT = 0.2
const HAND_SATURATION = 2

/**
 * The 1-10 scale, as the design's anchor table states it: what a chart of plain taps, evenly
 * spread across 4 Lanes at this many presses per second, is worth. Between 2.5 and 10 the scale
 * reads as "a Rating is about the presses per second a chart sustains", which is the whole
 * calibration in one sentence.
 *
 * That leaves each Chart Level's band room above its headline rate for what the design's rows put
 * there - Easy's chords of 2, Normal's occasional 3-wide chords and short bursts, Hard's regular
 * chords, holds and dense bursts all ride upward from these numbers inside the same band. The
 * bottom row is this module's own: the design's table has no floor, and without one everything
 * below 2.5 presses/s interpolates against an empty chart, which rated a handful of isolated notes
 * a 2.3.
 *
 * The thresholds are MEASURED from these rates by running the model over a reference stream rather
 * than written down as strain values, so retuning DECAY_MS or a multiplier keeps the anchors
 * meaning what they say instead of silently re-scaling the whole library.
 */
export const RATING_ANCHORS = [
    {pressesPerSecond: 1, rating: 1.5},
    {pressesPerSecond: 2.5, rating: 2.5},
    {pressesPerSecond: 4, rating: 4},
    {pressesPerSecond: 6.5, rating: 6.5},
    {pressesPerSecond: 10, rating: 10},
] as const

const ANCHOR_LANES = 4
const ANCHOR_MS = 20000
/** Round-robin over the four Lanes that ALTERNATES hands: the reference is a balanced chart. */
const ANCHOR_LANE_ORDER = [0, 2, 1, 3]

/** One scored press, flattened out of the track graph: which Lane, when, and how long it is held. */
type StrainPress = {
    time: number
    lane: number
    /** ms, 0 = a tap. */
    hold: number
    /** Presses in this one's simultaneity cluster, itself included. */
    chordWidth: number
}

function clamp(value: number, min: number, max: number): number {
    return value < min ? min : value > max ? max : value
}

/**
 * Flatten every track's Hit Objects into one time-ordered press list and stamp each press with the
 * width of its chord. Tracks are merged rather than rated apart: they are one pair of hands.
 *
 * Reads `holdDuration`, never `isHeld`: only the duration is serialized, so a freshly built hold
 * carries `isHeld` only if whoever built it remembered to, and a Rating that asked `isHeld` would
 * move when the same song was saved and reloaded.
 */
function collectPresses(song: VsrgSong): StrainPress[] {
    const presses: StrainPress[] = []
    for (const track of song.tracks) {
        for (const hitObject of track.hitObjects) {
            presses.push({
                time: hitObject.timestamp,
                lane: hitObject.index,
                hold: Math.max(0, hitObject.holdDuration),
                chordWidth: 1,
            })
        }
    }
    presses.sort((a, b) => a.time - b.time || a.lane - b.lane)
    stampChordWidths(presses)
    return presses
}

/** In place, on a time-ordered list: every press in a cluster carries the whole cluster's width. */
function stampChordWidths(presses: StrainPress[]) {
    let start = 0
    for (let i = 1; i <= presses.length; i++) {
        if (i < presses.length && presses[i].time - presses[start].time <= SIMULTANEITY_MS) continue
        for (let j = start; j < i; j++) presses[j].chordWidth = i - start
        start = i
    }
}

/** Which half of the Lane array a Lane sits in. This split is the model's whole notion of a hand. */
function handOf(lane: number, laneCount: number): number {
    return lane < laneCount / 2 ? 0 : 1
}

function laneNorm(strain: readonly number[]): number {
    let total = 0
    for (const value of strain) total += value ** LANE_NORM_EXPONENT
    return total ** (1 / LANE_NORM_EXPONENT)
}

/**
 * What the whole chart is worth the instant each press lands: walk the presses, decay every Lane by
 * the gap, spike the pressed one by its multipliers, and take the norm.
 *
 * Between two presses every Lane decays by the SAME factor, so the norm decays by that factor too.
 * That is what lets the sampler below reconstruct any moment from the peak before it, instead of
 * stepping the Lane array again per grid line.
 */
function strainPeaks(presses: readonly StrainPress[], laneCount: number): number[] {
    const strain = new Array<number>(laneCount).fill(0)
    const peaks: number[] = []
    //the live holds and the two hands' loads both trail the press being scored, so both stay in
    //step with the walk rather than needing a second pass
    const holds: StrainPress[] = []
    const handLoad = [0, 0]
    let previousTime = presses[0].time
    for (const press of presses) {
        const decay = Math.exp(-(press.time - previousTime) / DECAY_MS)
        for (let lane = 0; lane < laneCount; lane++) strain[lane] *= decay
        handLoad[0] *= decay
        handLoad[1] *= decay
        previousTime = press.time

        //holds are collected in press order but expire out of it, so each is tested rather than
        //the front of the list pruned. A hold STARTING on this instant is a chord and not an
        //encumbrance: the finger is not committed yet, and chordWidth has charged for the reach.
        let overlap = 0
        for (let i = holds.length - 1; i >= 0; i--) {
            const hold = holds[i]
            if (hold.time + hold.hold < press.time) {
                holds.splice(i, 1)
                continue
            }
            if (hold.lane !== press.lane && hold.time < press.time) overlap++
        }

        //read before this press is counted: what the hand was already carrying is what makes this
        //press expensive, and a press cannot make itself dearer
        const hand = handOf(press.lane, laneCount)
        const load = clamp(handLoad[hand] / HAND_SATURATION, 0, 1)

        const chord = 1 + CHORD_WEIGHT * (Math.min(press.chordWidth, CHORD_WIDTH_CAP) - 1)
        const held = 1 + HOLD_WEIGHT * Math.min(overlap, HOLD_OVERLAP_CAP)
        const hands = 1 + HAND_WEIGHT * load
        strain[press.lane] += BASE * chord * held * hands

        peaks.push(laneNorm(strain))
        if (press.hold > 0) holds.push(press)
        handLoad[hand] += BASE
    }
    return peaks
}

/**
 * The strain integrated over each grid cell, divided by the cell - the mean strain in it.
 *
 * Exact rather than stepped: the curve is one exponential between presses and jumps at each, so a
 * cell's integral is a sum of DECAY_MS * (value at the segment's start - value at its end).
 *
 * Cells whose newest press is further back than TAIL_MS are silence and are dropped, so a chart
 * with a minute of nothing in the middle rates as the harder of its two halves rather than as
 * their average with the nothing.
 */
function cellMeans(presses: readonly StrainPress[], peaks: readonly number[]): number[] {
    const means: number[] = []
    const start = presses[0].time
    const end = presses[presses.length - 1].time + TAIL_MS
    let index = 0
    let value = 0
    let previousTime = start
    let newestPress = start
    for (let cell = start; cell < end; cell += SAMPLE_MS) {
        let integral = 0
        while (index < presses.length && presses[index].time < cell + SAMPLE_MS) {
            const gap = presses[index].time - previousTime
            integral += value * DECAY_MS * (1 - Math.exp(-gap / DECAY_MS))
            value = peaks[index]
            previousTime = presses[index].time
            newestPress = presses[index].time
            index++
        }
        const boundary = cell + SAMPLE_MS
        const rest = Math.exp(-(boundary - previousTime) / DECAY_MS)
        integral += value * DECAY_MS * (1 - rest)
        value *= rest
        previousTime = boundary
        if (cell - newestPress <= TAIL_MS) means.push(integral / SAMPLE_MS)
    }
    return means
}

/**
 * The chart's hardest sustained stretch, in strain units: the mean strain over every WINDOW_MS
 * window on the grid, sorted descending, geometrically weighted.
 *
 * A chart with less than one window of material gets the one window it has.
 */
function sustainedStrain(presses: readonly StrainPress[], laneCount: number): number {
    if (presses.length === 0) return 0
    const means = cellMeans(presses, strainPeaks(presses, laneCount))
    const span = Math.min(Math.round(WINDOW_MS / SAMPLE_MS), means.length)
    const windows: number[] = []
    let running = 0
    for (let i = 0; i < means.length; i++) {
        running += means[i]
        if (i >= span) running -= means[i - span]
        if (i >= span - 1) windows.push(running / span)
    }
    windows.sort((a, b) => b - a)
    const taken = Math.min(windows.length, TOP_SAMPLES)
    let weighted = 0
    let mass = 0
    for (let i = 0; i < taken; i++) {
        const weight = SAMPLE_WEIGHT ** i
        weighted += windows[i] * weight
        mass += weight
    }
    return mass === 0 ? 0 : weighted / mass
}

/**
 * The anchor rates as strain thresholds, measured once by running the model over a reference stream
 * at each: plain taps in a hand-alternating round-robin over ANCHOR_LANES (so what a Rating reads
 * as hand load is what a chart leans on one hand OVER a balanced one), long enough to fill the top
 * slice several times over.
 *
 * Cached because it is a constant of the model rather than of a chart. Nothing in it touches a
 * song, config, or the DOM, so computing it on first use is safe wherever this module is imported.
 */
let anchorStrains: number[] | null = null
function anchorThresholds(): number[] {
    if (anchorStrains !== null) return anchorStrains
    anchorStrains = RATING_ANCHORS.map(anchor => {
        const gap = 1000 / anchor.pressesPerSecond
        const presses: StrainPress[] = []
        for (let i = 0; i * gap < ANCHOR_MS; i++) {
            const lane = ANCHOR_LANE_ORDER[i % ANCHOR_LANE_ORDER.length]
            presses.push({time: i * gap, lane, hold: 0, chordWidth: 1})
        }
        return sustainedStrain(presses, ANCHOR_LANES)
    })
    return anchorStrains
}

/**
 * Strain to Rating: piecewise-linear through the anchors, with (no strain, 1) as the bottom point -
 * a chart with nothing to press is a 1 - and saturating at the top, since a chart can always be
 * harder than the hardest thing anyone anchored.
 */
function ratingForStrain(strain: number): number {
    const thresholds = anchorThresholds()
    let previousStrain = 0
    let previousRating = MIN_RATING
    for (let i = 0; i < RATING_ANCHORS.length; i++) {
        const anchorStrain = thresholds[i]
        const anchorRating = RATING_ANCHORS[i].rating
        if (strain <= anchorStrain) {
            const span = anchorStrain - previousStrain
            const position = span <= 0 ? 1 : (strain - previousStrain) / span
            const rating = previousRating + position * (anchorRating - previousRating)
            return clamp(rating, MIN_RATING, MAX_RATING)
        }
        previousStrain = anchorStrain
        previousRating = anchorRating
    }
    return clamp(RATING_ANCHORS[RATING_ANCHORS.length - 1].rating, MIN_RATING, MAX_RATING)
}

/**
 * How hard this chart is to play, 1-10, across its whole track graph - Hit Objects in different
 * tracks fall on the same pair of hands, so they are rated as one stream.
 *
 * Works on any chart, hand-made or generated, and is derived every time it is asked for rather than
 * stored: a saved number goes stale the first time somebody drags a note, and a stale difficulty
 * label is worse than none (ADR-0016). It is not `difficulty`, which says how forgiving the
 * judgment windows are and nothing about the notes.
 *
 * Rounded to a tenth, so a readout and a golden fixture both get a stable number; comparisons
 * (bands, monotonicity) are meant to be made on what this returns.
 *
 * Reading `song.tracks` subscribes to the song's structure signal. Call this from an event handler
 * or wrap it in `untrack()`, the same care VsrgPlayerRenderer.onSongPick takes.
 */
export function rateChart(song: VsrgSong): number {
    const presses = collectPresses(song)
    if (presses.length === 0) return MIN_RATING
    const widest = presses.reduce((max, press) => Math.max(max, press.lane + 1), 0)
    const rating = ratingForStrain(sustainedStrain(presses, Math.max(song.keys, widest)))
    return Math.round(rating * 10) / 10
}
