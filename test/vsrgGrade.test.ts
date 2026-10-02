// The end-of-song letter grade. Like Rating (vsrgRating.test.ts), a grade is derived on every read
// and stored nowhere, so nothing in the app can disagree with it - and nothing in the app notices
// when it drifts either. This file is what notices.
//
// What silently breaks without it:
// - the top grade stops meaning a clean run. One miss in a thousand hits still rounds to 99.9%
//   accuracy, so the miss rule is the only thing standing between "nearly flawless" and "flawless"
//   and it is invisible in every tally a normal test would build.
// - a floor stops being inclusive. Every letter is decided by the first floor a run clears, so an
//   off-by-one there silently hands out the letter below at exactly the advertised number.
// - the weights drift off holds. A held note pays out a `perfect` every 300ms, so weighting
//   `perfect` under `amazing` would quietly cap every hold-heavy chart below the top grades, in a
//   way that looks like the player's fault.
import {describe, expect, it} from 'vitest'
import {GRADE_THRESHOLDS, vsrgAccuracy, vsrgGrade, type VsrgHitTally} from '$stores/vsrgGrade'

function tally(counts: Partial<VsrgHitTally>): VsrgHitTally {
    return {amazing: 0, perfect: 0, great: 0, good: 0, bad: 0, miss: 0, ...counts}
}

/**
 * A miss-free run at exactly `accuracy`, built from `amazing` and `good`.
 *
 * 700 judgments is not arbitrary: `good` is worth 0.3, so it sheds 0.7 per press, and 700 makes
 * every floor in the table land on a whole number of them - no rounding, so a test asserting the
 * floor is inclusive is really asserting that and not float noise. It reaches down past 0.5, which
 * a mix of `amazing` and `great` cannot (all-`great` bottoms out at 0.65).
 *
 * An all-`good` run is the floor of what this can build, at 0.3 - so asking for less than that
 * (only F's floor of 0 does) returns that instead. Still under every floor but F's, which is all
 * that end of the table is being asked to show.
 */
function cleanRunAt(accuracy: number): VsrgHitTally {
    const good = Math.min(700, Math.round((700 * (1 - accuracy)) / 0.7))
    return tally({amazing: 700 - good, good})
}

/** The same run with one `amazing` traded for one `good`: 0.001 lower, still miss-free. */
function oneNotchUnder(accuracy: number): VsrgHitTally {
    const run = cleanRunAt(accuracy)
    return tally({amazing: run.amazing - 1, good: run.good + 1})
}

describe('the threshold table', () => {
    it('descends strictly, so every letter is reachable', () => {
        //vsrgGrade returns the FIRST floor a run clears; a floor at or under the one before it
        //could never be the first, and the letter would silently never be handed out
        for (let i = 1; i < GRADE_THRESHOLDS.length; i++) {
            expect(
                GRADE_THRESHOLDS[i].minAccuracy,
                `${GRADE_THRESHOLDS[i].grade} vs ${GRADE_THRESHOLDS[i - 1].grade}`
            ).toBeLessThan(GRADE_THRESHOLDS[i - 1].minAccuracy)
        }
    })

    it('bottoms out at 0, so no run can fall off the end of the table', () => {
        //vsrgAccuracy is 0-1, so a last floor above 0 would leave the loop's fallthrough reachable
        expect(GRADE_THRESHOLDS[GRADE_THRESHOLDS.length - 1]).toEqual({grade: 'F', minAccuracy: 0})
    })

    it('offers exactly the eight letters the end-of-song panel promises', () => {
        expect(GRADE_THRESHOLDS.map(t => t.grade)).toEqual(['S+', 'S', 'A', 'B', 'C', 'D', 'E', 'F'])
    })
})

describe('grade boundaries', () => {
    it('treats every floor as inclusive - a run AT the number earns the letter', () => {
        for (const {grade, minAccuracy} of GRADE_THRESHOLDS) {
            const run = cleanRunAt(minAccuracy)
            expect(vsrgAccuracy(run), `${grade} at ${minAccuracy}`).toBeGreaterThanOrEqual(
                minAccuracy
            )
            expect(vsrgGrade(run), `${grade} at ${minAccuracy}`).toBe(grade)
        }
    })

    it('drops to the next letter one notch under each floor', () => {
        //skip F: there is nothing under its floor of 0
        for (let i = 0; i < GRADE_THRESHOLDS.length - 1; i++) {
            const {grade, minAccuracy} = GRADE_THRESHOLDS[i]
            const below = GRADE_THRESHOLDS[i + 1].grade
            expect(vsrgGrade(oneNotchUnder(minAccuracy)), `just under ${grade}`).toBe(below)
        }
    })

    it('reads the exact letters the design names at the accuracies it names them at', () => {
        //the table above is checked against itself; this pins the numbers themselves, so retuning
        //one is a deliberate edit here rather than a silently-passing change
        expect(vsrgGrade(cleanRunAt(1))).toBe('S+')
        expect(vsrgGrade(cleanRunAt(0.96))).toBe('S')
        expect(vsrgGrade(cleanRunAt(0.92))).toBe('A')
        expect(vsrgGrade(cleanRunAt(0.85))).toBe('B')
        expect(vsrgGrade(cleanRunAt(0.75))).toBe('C')
        expect(vsrgGrade(cleanRunAt(0.65))).toBe('D')
        expect(vsrgGrade(cleanRunAt(0.55))).toBe('E')
        expect(vsrgGrade(cleanRunAt(0.4))).toBe('F')
    })
})

describe('the top grade', () => {
    it('goes to a flawless run', () => {
        expect(vsrgGrade(tally({amazing: 500}))).toBe('S+')
    })

    it('goes to an all-perfect run, because holds pay out perfects on a timer', () => {
        //a held note awards a `perfect` every 300ms for as long as it is held - those ticks are the
        //chart's clock, not the player's precision, so a weight under 1 on `perfect` would cap a
        //hold-heavy chart at a grade nobody could reach by playing it well
        expect(vsrgGrade(tally({perfect: 500}))).toBe('S+')
        expect(vsrgAccuracy(tally({amazing: 250, perfect: 250}))).toBe(1)
    })

    it('is blocked by a single miss no matter how high the accuracy rounds', () => {
        //999 amazings and one miss is 99.9% - comfortably over the S+ floor. The letter has to mean
        //the run everyone watching could see was clean, and only the explicit rule can say so
        const nearlyFlawless = tally({amazing: 999, miss: 1})
        expect(vsrgAccuracy(nearlyFlawless)).toBeGreaterThan(0.98)
        expect(vsrgGrade(nearlyFlawless)).toBe('S')
    })

    it('is not blocked by a bad, which the ratio is left to punish on its own', () => {
        //only `miss` carries the extra rule; every other imperfect judgment is already priced in
        expect(vsrgGrade(tally({amazing: 999, bad: 1}))).toBe('S+')
    })
})

describe('vsrgAccuracy', () => {
    it('scores an untouched run 0, not 1', () => {
        //resetScore's shape, which is what the panel would read for a song stopped before its
        //first note - an untouched chart is not a flawless one
        expect(vsrgAccuracy(tally({}))).toBe(0)
        expect(vsrgGrade(tally({}))).toBe('F')
    })

    it('scores an all-miss run 0', () => {
        expect(vsrgAccuracy(tally({miss: 40}))).toBe(0)
        expect(vsrgGrade(tally({miss: 40}))).toBe('F')
    })

    it('ranks the judgment tiers in order below the top two', () => {
        const of = (type: keyof VsrgHitTally) => {
            const run = tally({})
            run[type] = 100
            return vsrgAccuracy(run)
        }
        expect(of('amazing')).toBe(1)
        expect(of('perfect')).toBe(1)
        expect(of('great')).toBeLessThan(of('perfect'))
        expect(of('good')).toBeLessThan(of('great'))
        expect(of('bad')).toBeLessThan(of('good'))
        expect(of('miss')).toBeLessThan(of('bad'))
    })

    it('is length-independent, unlike the running score it replaces', () => {
        //vsrgPlayerStore's score is combo-multiplied, so the same play on a chart twice as long is
        //worth four times as much - the whole reason a grade reads the tallies instead
        expect(vsrgAccuracy(tally({amazing: 9, miss: 1}))).toBe(
            vsrgAccuracy(tally({amazing: 900, miss: 100}))
        )
    })
})
