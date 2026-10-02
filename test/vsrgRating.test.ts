// The Rating model (ADR-0016, the 2026-08-30 generation design's section 7 and phase A). Rating is
// derived on every read and stored nowhere, so nothing in the app can disagree with it - which also
// means nothing in the app notices when it drifts. This file is the only thing that does.
//
// What silently breaks without it:
// - the convergence loop stops terminating. It widens the minimum gap, narrows the chord cap and
//   drops presses to come down into a band, and that only converges because no knob can raise the
//   Rating.
// - Strain stops being per Lane. The metric is only worth having if a jack rates above the same
//   press count spread across Lanes; summed strain would be blind to the difference and still look
//   entirely reasonable.
// - the scale drifts off its anchors. They are stated absolutes rather than a fit to a corpus (no
//   corpus exists), so a tuning change with no test under it re-rates the whole library by accident.
import {describe, expect, it} from 'vitest'
import {INSTRUMENTS, VsrgHitObject, VsrgSong, VsrgTrack} from './imports'
import {
    CHART_LEVEL_BANDS,
    MAX_GENERATED_RATING,
    MAX_RATING,
    MIN_RATING,
    RATING_ANCHORS,
    isRatingInBand,
    rateChart,
    type ChartLevel,
} from '$core/Songs/vsrgRating'

type Press = {lane: number; time: number; hold?: number}

/** Lane orders that alternate hands, so a plain stream is the balanced chart the anchors read. */
const ALTERNATING_4 = [0, 2, 1, 3]
const ALTERNATING_6 = [0, 3, 1, 4, 2, 5]

/** One track holding every press. Rating reads the graph, so a track is the only way in. */
function chartOf(keys: 4 | 6, presses: Press[]): VsrgSong {
    return chartOfTracks(keys, [presses])
}

function chartOfTracks(keys: 4 | 6, tracks: Press[][]): VsrgSong {
    const song = new VsrgSong('rating test')
    song.keys = keys
    song.initTracksForConstruction(tracks.map(presses => {
        const track = new VsrgTrack(INSTRUMENTS[0], 'lead')
        track.hitObjects = presses.map(press => {
            const hitObject = new VsrgHitObject(press.lane, press.time)
            hitObject.holdDuration = press.hold ?? 0
            //isHeld is not serialized, so the model reads holdDuration - set both, as the player does
            hitObject.isHeld = (press.hold ?? 0) > 0
            return hitObject
        })
        return track
    }))
    return song
}

/** A plain stream: `rate` presses per second for `seconds`, walking Lanes hand by hand. */
function stream(rate: number, seconds: number, from = 0, order = ALTERNATING_4): Press[] {
    const gap = 1000 / rate
    const presses: Press[] = []
    for (let i = 0; i * gap < seconds * 1000; i++) {
        presses.push({lane: order[i % order.length], time: from + Math.round(i * gap)})
    }
    return presses
}

/**
 * A chart described the way the design's anchor table describes one: so many presses per second,
 * some of them chords, some of them held. `keyRate` counts HIT OBJECTS per second (the glossary's
 * "press"), so the event rate is solved backwards from how many of them each event places.
 */
function describedChart(row: {
    keyRate: number
    seconds: number
    chordEvery?: number
    chordWidth?: number
    holdEvery?: number
    holdMs?: number
}): Press[] {
    const width = row.chordWidth ?? 1
    const chordEvery = row.chordEvery ?? 0
    const keysPerEvent = chordEvery > 0 ? 1 + (width - 1) / chordEvery : 1
    const gap = (1000 * keysPerEvent) / row.keyRate
    const presses: Press[] = []
    let event = 0
    for (let at = 0; at < row.seconds * 1000; at += gap, event++) {
        const time = Math.round(at)
        const lane = ALTERNATING_4[event % ALTERNATING_4.length]
        const hold = row.holdEvery && event % row.holdEvery === 0 ? (row.holdMs ?? 300) : 0
        presses.push({lane, time, hold})
        if (chordEvery > 0 && event % chordEvery === 0) {
            for (let w = 1; w < width; w++) presses.push({lane: (lane + w) % 4, time})
        }
    }
    return presses
}

const stretched = (presses: Press[], factor: number): Press[] =>
    presses.map(press => ({...press, time: Math.round(press.time * factor)}))

describe('a Rating reads the whole chart', () => {
    it('rates a chart with nothing to press at the floor of the scale', () => {
        expect(rateChart(chartOf(4, []))).toBe(MIN_RATING)
        expect(rateChart(new VsrgSong('no tracks at all'))).toBe(MIN_RATING)
    })

    it('rates a single Hit Object near the floor, inside the Easy band', () => {
        //one press is not a chart; the scale's bottom has to be reachable or Easy starts at 2
        const rating = rateChart(chartOf(4, [{lane: 1, time: 0}]))
        expect(rating).toBeGreaterThanOrEqual(MIN_RATING)
        expect(rating).toBeLessThan(2)
        expect(isRatingInBand(rating, 'easy')).toBe(true)
    })

    it('rates the same Hit Objects the same however many tracks they are spread over', () => {
        //Hit Objects in different tracks land on one pair of hands; a per-track Rating would let a
        //two-instrument chart read as two easy charts
        const presses = stream(5, 8)
        const split = presses.filter((_, i) => i % 2 === 0)
        const rest = presses.filter((_, i) => i % 2 === 1)
        expect(rateChart(chartOfTracks(4, [split, rest]))).toBe(rateChart(chartOf(4, presses)))
    })

    it('never leaves the 1-10 scale, however dense the chart', () => {
        for (const rate of [0.2, 1, 4, 12, 40]) {
            const rating = rateChart(chartOf(4, stream(rate, 12)))
            expect(rating).toBeGreaterThanOrEqual(MIN_RATING)
            expect(rating).toBeLessThanOrEqual(MAX_RATING)
        }
    })

    it('rates a chart by its hardest stretch rather than by its mean', () => {
        //a burst inside an otherwise quiet chart, against the same note count spread evenly over
        //the same span: a mean cannot tell them apart, and the burst is what a player passes or fails
        const quietTail = (seconds: number) =>
            Array.from({length: seconds}, (_, i) => ({lane: ALTERNATING_4[i % 4], time: 2000 + i * 1000}))
        const bursty = [...stream(8, 2), ...quietTail(10)]
        const spread = stream(bursty.length / 12, 12)
        expect(spread.length).toBe(bursty.length)
        expect(rateChart(chartOf(4, bursty))).toBeGreaterThan(rateChart(chartOf(4, spread)))
    })

    it('rates a burst with a quiet tail far below a chart that sustains the burst', () => {
        //the slice is neither the mean nor the max, and only a margin tells those apart: the two
        //charts share their worst instant, so rating by the single worst window (TOP_SAMPLES = 1)
        //closes this gap to about a point. The weighted slice spends most of its weight on windows
        //the burst chart does not have, and leaves four.
        const burst = [...stream(8, 2), ...stream(1, 6, 2000)]
        const sustained = stream(8, 8)
        expect(rateChart(chartOf(4, sustained)) - rateChart(chartOf(4, burst))).toBeGreaterThan(3)
    })

    it('does not let a long quiet stretch dilute the burst inside it', () => {
        //the sharp end of "not its mean": lengthening the quiet part of a chart lowers its average
        //density and must leave the hardest stretch - and so the Rating - where it was
        const short = [...stream(8, 2), ...stream(1, 10, 2000)]
        const long = [...stream(8, 2), ...stream(1, 60, 2000)]
        expect(rateChart(chartOf(4, long))).toBeCloseTo(rateChart(chartOf(4, short)), 1)
        const shortMean = rateChart(chartOf(4, stream(short.length / 12, 12)))
        const longMean = rateChart(chartOf(4, stream(long.length / 62, 62)))
        expect(longMean).toBeLessThan(shortMean - 0.3)
    })
})

describe('Strain is per Lane', () => {
    //the whole reason the model is not a density curve: one finger asked twice is harder than two
    //fingers asked once, and only a per-Lane state can see that
    for (const rate of [2, 2.5, 4, 6]) {
        it(`rates a ${rate}/s jack above the same press count spread across the Lanes`, () => {
            const count = Math.round(rate * 8)
            const gap = 1000 / rate
            const jack = Array.from({length: count}, (_, i) => ({lane: 1, time: Math.round(i * gap)}))
            const spread = stream(rate, 8)
            expect(spread.length).toBe(jack.length)
            expect(rateChart(chartOf(4, jack))).toBeGreaterThan(rateChart(chartOf(4, spread)))
        })
    }

    it('rates a chart that never leaves one Lane, without running off the scale', () => {
        //the degenerate chart the constraint pass exists to prevent, and the one a Lane-blind
        //aggregate would rate exactly like a comfortable spread stream
        const oneLane = Array.from({length: 20}, (_, i) => ({lane: 2, time: i * 500}))
        const rating = rateChart(chartOf(4, oneLane))
        expect(rating).toBeGreaterThan(rateChart(chartOf(4, stream(2, 10))))
        expect(rating).toBeLessThanOrEqual(MAX_RATING)
    })

    it('rates a stream that leans on one hand above the same stream split between the two', () => {
        //the same press times over the same NUMBER of Lanes, differing only in which hand they sit
        //on: {0,1} is one hand on a 4-Lane chart, {0,2} is one press each. Comparing against a
        //four-Lane round-robin instead would prove nothing about hands - the p-norm alone rates a
        //two-Lane chart above a four-Lane one, and the comparison passes with the hand term deleted.
        const times = stream(4, 10)
        const oneHand = times.map((press, i) => ({...press, lane: i % 2}))
        const bothHands = times.map((press, i) => ({...press, lane: i % 2 === 0 ? 0 : 2}))
        expect(rateChart(chartOf(4, oneHand))).toBeGreaterThan(rateChart(chartOf(4, bothHands)) + 0.3)
    })

    it('reads the hand split off the song\'s Lane count, not off the Lanes the chart uses', () => {
        //Lane 2 is the right hand of a 4-Lane chart and the left hand of a 6-Lane one, so the same
        //Hit Objects lean differently under the two. A sparse chart generated at 6 keys that never
        //reaches Lane 5 is exactly this case, and it would be rated on the wrong split if the model
        //took its Lane count from the Lanes it found used.
        const lowLanes = stream(4, 12, 0, [0, 2, 1])
        expect(rateChart(chartOf(6, lowLanes))).toBeGreaterThan(rateChart(chartOf(4, lowLanes)))
    })
})

describe('the Rating never rises when a chart is made easier', () => {
    //ADR-0016's convergence loop widens the minimum gap, narrows the chord cap and - in Doubling
    //mode - drops presses, until the Rating falls into the target band. That search terminates only
    //because none of those three moves can raise it, which makes this a test rather than an
    //assumption.
    //
    //Stated over charts with at least a window of material - which is what the loop ever rates. A
    //chart of two presses is one window whichever way its gaps are stretched, and there the p-norm
    //moving apart (two Lanes at once are worth less than two Lanes in turn) can outweigh the
    //spreading - by a tenth of a point, at the very bottom of the scale.
    const CHARTS: Record<string, Press[]> = {
        'a 6/s stream': stream(6, 8),
        'a 3/s stream': stream(3, 8),
        'an 8/s burst with a quiet tail': [...stream(8, 2), ...stream(1, 6, 2000)],
        'a 4/s jack': Array.from({length: 32}, (_, i) => ({lane: 1, time: i * 250})),
        'a chart of held notes': stream(4, 8).map((p, i) => ({...p, hold: i % 2 === 0 ? 300 : 0})),
        'a described Hard chart': describedChart({keyRate: 6.5, seconds: 10, chordEvery: 4, chordWidth: 2, holdEvery: 6}),
    }

    for (const [name, presses] of Object.entries(CHARTS)) {
        it(`never rates ${name} higher for having wider gaps`, () => {
            let previous = MAX_RATING
            for (const factor of [1, 1.1, 1.25, 1.5, 2, 3]) {
                const rating = rateChart(chartOf(4, stretched(presses, factor)))
                expect(rating, `factor ${factor}`).toBeLessThanOrEqual(previous)
                previous = rating
            }
        })
    }

    it('never rates a chart higher for a narrower chord cap', () => {
        //the loop's other knob: same press times, fewer Lanes per press
        const events = stream(3, 10)
        const atWidth = (width: number) => rateChart(chartOf(4, events.flatMap(press =>
            Array.from({length: width}, (_, w) => ({lane: (press.lane + w) % 4, time: press.time})))))
        expect(atWidth(2)).toBeLessThanOrEqual(atWidth(3))
        expect(atWidth(1)).toBeLessThanOrEqual(atWidth(2))
    })

    //The reduction pass's knob (design 6.6): in Doubling mode it DROPS presses to come down into a
    //band, cheapest by accent weight, so a thinning that raises the Rating is a step the loop takes
    //in the direction it was told to and lands further from where it was going.
    //
    //An even thinning is the easy case and the one a broken model still gets right. What it misses
    //is a thinning that takes from one hand or one stretch: a hand term charged on the pressing
    //hand's SHARE of the recent presses got dearer for every press the other hand lost, so dropping
    //the sparse off-hand filler - which is exactly what "cheapest by accent weight" drops first -
    //rated the chart higher for carrying less.
    //
    //Every chart here keeps a top slice's worth of material (~8s) after the thinning, which is the
    //boundary TOP_SAMPLES' note names: below it the slice is the whole chart and its easy windows
    //count in the average, so a short chart CAN rate higher for losing its quiet half.
    const offHandFiller = Array.from({length: 48}, (_, i) => ({lane: i % 2 === 0 ? 2 : 3, time: i * 250}))
        .map((press, i) => (i % 9 === 0 ? {...press, lane: 0} : press))
    const easyFiller = [...stream(6, 10), ...stream(1.5, 12, 10_500)]
    const THINNINGS: {name: string; full: Press[]; thin: (presses: Press[]) => Press[]}[] = [
        {name: 'a 6/s stream, every third press', full: stream(6, 10), thin: p => p.filter((_, i) => i % 3 !== 2)},
        {name: 'a 6/s stream, every other press', full: stream(6, 10), thin: p => p.filter((_, i) => i % 2 === 0)},
        {name: 'a two-Lane stream, its off-hand filler', full: offHandFiller, thin: p => p.filter(press => press.lane !== 0)},
        {
            name: 'a two-Lane stream, a quarter of its busy hand',
            full: offHandFiller,
            thin: p => p.filter((press, i) => press.lane === 0 || i % 4 !== 0),
        },
        {
            name: 'a dense stretch with easy filler after it, half the filler',
            full: easyFiller,
            thin: p => p.filter((press, i) => press.time < 10_500 || i % 2 === 0),
        },
        {name: 'a dense stretch with easy filler after it, all of the filler', full: easyFiller, thin: p => p.filter(press => press.time < 10_500)},
    ]

    for (const {name, full, thin} of THINNINGS) {
        it(`never rates ${name} higher for dropping presses out of it`, () => {
            expect(rateChart(chartOf(4, thin(full)))).toBeLessThanOrEqual(rateChart(chartOf(4, full)))
        })
    }
})

describe('the anchor table', () => {
    //the stated calibration: a plain stream of N presses per second rates about N. Everything else
    //in the model is measured against these, so a change that moves them is a change to every
    //Rating in the library and has to be a deliberate one.
    for (const anchor of RATING_ANCHORS) {
        it(`rates a plain ${anchor.pressesPerSecond}/s stream at about ${anchor.rating}`, () => {
            const rating = rateChart(chartOf(4, stream(anchor.pressesPerSecond, 14)))
            expect(rating).toBeCloseTo(anchor.rating, 0)
        })
    }

    it('climbs with the press rate, with no dip a convergence step could fall into', () => {
        const rates = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10]
        const ratings = rates.map(rate => rateChart(chartOf(4, stream(rate, 14))))
        for (let i = 1; i < ratings.length; i++) {
            expect(ratings[i], `${rates[i]}/s vs ${rates[i - 1]}/s`).toBeGreaterThanOrEqual(ratings[i - 1])
        }
    })

    //One chart per row of the design's table, built from what the row says: the press rate it
    //names, the chords it allows, the holds it mentions. "Presses" are Hit Objects, so a chord of
    //two spends two of them.
    //
    //`rating` is a PIN, not a target the model was fitted to - it is what the model measures today.
    //The bands leave a point or two of slack either side, and the plain-stream assertions above
    //cannot take up that slack because the thresholds are measured from the same reference stream
    //they assert on (halving DECAY_MS leaves all five of them green). These charts are not that
    //stream, so a tuning change moves them, and moving them has to be a re-blessing rather than
    //something a band absorbs in silence.
    const ROWS: {level: ChartLevel; chart: Press[]; rating: number}[] = [
        //1-3: up to ~2.5 presses/s sustained, chords of no more than 2
        {level: 'easy', rating: 2.8, chart: describedChart({keyRate: 2.5, seconds: 14, chordEvery: 6, chordWidth: 2})},
        //3.5-6: ~4 presses/s sustained, occasional 3-wide chords
        {level: 'normal', rating: 4.6, chart: describedChart({keyRate: 4, seconds: 14, chordEvery: 8, chordWidth: 3})},
        //6-8: ~6-7 presses/s sustained, regular chords and holds
        {level: 'hard', rating: 7.3, chart: describedChart({keyRate: 6.5, seconds: 14, chordEvery: 4, chordWidth: 2, holdEvery: 6})},
    ]

    for (const row of ROWS) {
        it(`rates the table's ${row.level} chart at ${row.rating}, inside the ${row.level} band`, () => {
            const rating = rateChart(chartOf(4, row.chart))
            const band = CHART_LEVEL_BANDS[row.level]
            expect(rating, `${rating} outside ${band.min}-${band.max}`).toBeGreaterThanOrEqual(band.min)
            expect(rating, `${rating} outside ${band.min}-${band.max}`).toBeLessThanOrEqual(band.max)
            expect(isRatingInBand(rating, row.level)).toBe(true)
            expect(rating, 'the pinned Rating moved - re-bless it deliberately').toBeCloseTo(row.rating, 1)
        })
    }

    it('leaves the top of the scale to hand authoring', () => {
        //8-10 is reserved: no described row may reach it, or a generated chart could claim a 9
        for (const row of ROWS) {
            expect(rateChart(chartOf(4, row.chart))).toBeLessThanOrEqual(MAX_GENERATED_RATING)
        }
        //the reservation starts AT 8 and a band's top end is inclusive, so a Hard band of 6-8 would
        //ACCEPT a chart measured at exactly 8.0 - which is what the Hard row is at 7/s rather than
        //its own 6.5/s, and what the convergence loop would then stop on and report as converged
        const dense = describedChart({keyRate: 7, seconds: 14, chordEvery: 4, chordWidth: 2, holdEvery: 6})
        expect(isRatingInBand(rateChart(chartOf(4, dense)), 'hard')).toBe(true)
        expect(rateChart(chartOf(4, dense))).toBeLessThan(8)
        for (const level of ['easy', 'normal', 'hard'] as const) expect(isRatingInBand(8, level)).toBe(false)
        expect(CHART_LEVEL_BANDS.hard.max).toBe(MAX_GENERATED_RATING)
        expect(MAX_GENERATED_RATING).toBeLessThan(8)
        expect(MAX_GENERATED_RATING).toBeLessThan(MAX_RATING)
    })

    it('orders the bands and leaves no reachable gap between them', () => {
        expect(CHART_LEVEL_BANDS.easy.min).toBe(MIN_RATING)
        expect(CHART_LEVEL_BANDS.easy.max).toBeLessThan(CHART_LEVEL_BANDS.normal.min)
        expect(CHART_LEVEL_BANDS.normal.max).toBe(CHART_LEVEL_BANDS.hard.min)
        for (const level of ['easy', 'normal', 'hard'] as const) {
            const band = CHART_LEVEL_BANDS[level]
            expect(isRatingInBand(band.min, level)).toBe(true)
            expect(isRatingInBand(band.max, level)).toBe(true)
            expect(isRatingInBand(band.min - 0.1, level)).toBe(false)
            expect(isRatingInBand(band.max + 0.1, level)).toBe(false)
        }
    })
})

describe('a Rating is measured the same way whatever the chart is made of', () => {
    it('rates a 6-Lane chart below the 4-Lane chart of the same press rate', () => {
        //more Lanes is more fingers for the same stream; the scale is anchored on 4, so 6 reads
        //lower rather than the two key counts meaning different things
        for (const rate of [3, 5, 7]) {
            const four = rateChart(chartOf(4, stream(rate, 12)))
            const six = rateChart(chartOf(6, stream(rate, 12, 0, ALTERNATING_6)))
            expect(six, `${rate}/s`).toBeLessThan(four)
        }
    })

    it('rates held notes above the same chart tapped', () => {
        //a hold commits the finger, so what is left plays the rest - which is only visible if the
        //model reads holdDuration off the Hit Object
        const taps = stream(4, 10)
        const holds = taps.map((press, i) => ({...press, hold: i % 2 === 0 ? 400 : 0}))
        expect(rateChart(chartOf(4, holds))).toBeGreaterThan(rateChart(chartOf(4, taps)))
    })

    it('rates a chord above the single press it was made from', () => {
        const singles = stream(3, 10)
        const chords = singles.flatMap(press => [press, {lane: (press.lane + 1) % 4, time: press.time}])
        expect(rateChart(chartOf(4, chords))).toBeGreaterThan(rateChart(chartOf(4, singles)))
    })

    it('charges a chord more than the same two presses a hair apart', () => {
        //the test above spends a second Hit Object to make its chord, so it passes on press count
        //alone and says nothing about the width multiplier. Chord width is DERIVED from the press
        //times, so nothing isolates it while the chart is held fixed - what isolates it is the
        //simultaneity window: 31ms apart is the same two Lanes and all but 31ms of the same decay,
        //and no chord.
        const events = stream(3, 10)
        const chorded = events.flatMap(press => [press, {lane: (press.lane + 1) % 4, time: press.time}])
        const rolled = events.flatMap(press => [press, {lane: (press.lane + 1) % 4, time: press.time + 31}])
        expect(rateChart(chartOf(4, chorded))).toBeGreaterThan(rateChart(chartOf(4, rolled)) + 0.3)
    })

    it('stops charging for a hold once it has been released', () => {
        //holds are collected in press order and expire out of it, so a short hold sitting behind a
        //long one in the list has to be tested rather than waited out: while it was, every press
        //for the rest of the song was charged for a finger that had long since come up
        const withHold: Press[] = [
            {lane: 0, time: 0, hold: 8000},
            {lane: 1, time: 100, hold: 200},
            ...stream(4, 8, 2000),
        ]
        const withTap = withHold.map(press =>
            (press.time === 100 ? {...press, hold: 0} : press))
        expect(rateChart(chartOf(4, withHold))).toBe(rateChart(chartOf(4, withTap)))
    })

    it('does not charge a press for a hold living in its own Lane', () => {
        //the finger is already there: a Lane re-pressed inside its own hold is a jack, which the
        //decay charges for, and charging the hold on top would bill the same finger twice. Every
        //hold here overlaps nothing but its own Lane, so the whole chart has to rate exactly as it
        //does tapped - the equality dies the moment the same-Lane exclusion goes.
        const held: Press[] = []
        for (let i = 0; i * 250 < 8000; i++) held.push({lane: 0, time: i * 250, hold: i % 2 === 0 ? 300 : 0})
        expect(rateChart(chartOf(4, held))).toBe(rateChart(chartOf(4, held.map(press => ({...press, hold: 0})))))
    })

    it('does not charge a press for a hold that starts on the same instant', () => {
        //a hold starting under this press is the other half of a chord, not a committed finger, and
        //chord width has already charged for the reach. Both notes of every chord here are held and
        //released before the next one, so nothing but the co-start rule is in play and the chart
        //rates exactly as it does tapped - while moving the second note 1ms later, still one chord
        //by the simultaneity window, makes the first note a hold this press is played under.
        const chords: Press[] = []
        for (let i = 0; i * 500 < 10_000; i++) {
            const lane = ALTERNATING_4[i % 4]
            chords.push({lane, time: i * 500, hold: 200}, {lane: (lane + 1) % 4, time: i * 500, hold: 200})
        }
        const rating = rateChart(chartOf(4, chords))
        expect(rating).toBe(rateChart(chartOf(4, chords.map(press => ({...press, hold: 0})))))
        const offset = chords.map((press, i) => (i % 2 === 1 ? {...press, time: press.time + 1} : press))
        expect(rateChart(chartOf(4, offset))).toBeGreaterThan(rating)
    })

    it('does not care where in time the chart starts', () => {
        //the grid is anchored on the first press: a chart pushed later in the song is the same chart
        const presses = stream(5, 10)
        const later = presses.map(press => ({...press, time: press.time + 37_000}))
        expect(rateChart(chartOf(4, later))).toBe(rateChart(chartOf(4, presses)))
    })

    it('ignores a silence a chart happens to sit either side of', () => {
        //two bursts a minute apart are two stretches, not one stretch averaged with the nothing
        const burst = stream(6, 3)
        const apart = [...burst, ...burst.map(press => ({...press, time: press.time + 60_000}))]
        expect(rateChart(chartOf(4, apart))).toBe(rateChart(chartOf(4, burst)))
    })
})
