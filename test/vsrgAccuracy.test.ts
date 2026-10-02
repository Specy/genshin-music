// VSRG timing windows. getAccuracyBounds() is the whole of how forgiving a song plays: the
// renderer rates a press against these tiers AND takes the last one as its overall hit
// tolerance, so an error here is felt directly as unhittable notes or free perfects.
//
// The windows were widened and the difficulty weight made proportional (2026-08-08). What
// follows pins the properties that change had to preserve, plus the OLD windows as an explicit
// floor — the brief was "easier at every difficulty", so no setting may come out harsher.
import {describe, expect, it} from 'vitest'
import {
    MAX_VSRG_DIFFICULTY,
    MIN_VSRG_DIFFICULTY,
    VsrgSong,
    type VsrgAccuracyBounds,
} from '../src/lib/core/Songs/VsrgSong.svelte'

const DIFFICULTIES = Array.from(
    {length: MAX_VSRG_DIFFICULTY - MIN_VSRG_DIFFICULTY + 1},
    (_, i) => i + MIN_VSRG_DIFFICULTY
)

function boundsAt(difficulty: number): VsrgAccuracyBounds {
    const song = new VsrgSong('test')
    song.difficulty = difficulty
    return song.getAccuracyBounds()
}

/**
 * The windows this replaced, as they actually PLAYED — a judgment-window model imported from
 * another rhythm game, shrunk a flat 2ms per difficulty step, then capped by the renderer's
 * hardcoded 150ms hit tolerance.
 *
 * The cap is the part that matters here. The nominal `bad` window was 168..186ms across the
 * difficulty range, all of it above 150, and a press further off than 150 never registered
 * against the note at all — so it never reached the rating code and `bad` behaved as if it
 * were 150 flat. Comparing against the nominal 188-2d would hold the new windows to a bar the
 * old ones never actually cleared.
 */
const PREVIOUS_HIT_TOLERANCE = 150

function previousBounds(difficulty: number): VsrgAccuracyBounds {
    //`awesome` was a hardcoded 16 that difficulty never touched - only the other four carried
    //the -2ms per step. Subtracting from all five would sink this floor to -4ms at difficulty
    //10, which any output whatsoever would clear.
    return [
        16,
        64 - difficulty * 2,
        97 - difficulty * 2,
        127 - difficulty * 2,
        Math.min(188 - difficulty * 2, PREVIOUS_HIT_TOLERANCE),
    ]
}

describe('VSRG accuracy bounds', () => {
    it('widens every tier at every difficulty compared to the old windows', () => {
        //the actual brief: easier to get decent scores, at any difficulty the player picks
        for (const difficulty of DIFFICULTIES) {
            const now = boundsAt(difficulty)
            const before = previousBounds(difficulty)
            for (let tier = 0; tier < now.length; tier++) {
                expect(
                    now[tier],
                    `difficulty ${difficulty}, tier ${tier} got tighter`
                ).toBeGreaterThanOrEqual(before[tier])
            }
        }
    })

    it('orders the tiers strictly, so every rating is reachable', () => {
        //a tier that isn't strictly wider than the one before it can never be returned:
        //getHitRating tests them in order and takes the first match
        for (const difficulty of DIFFICULTIES) {
            const bounds = boundsAt(difficulty)
            for (let tier = 1; tier < bounds.length; tier++) {
                expect(bounds[tier], `difficulty ${difficulty}, tier ${tier}`).toBeGreaterThan(
                    bounds[tier - 1]
                )
            }
        }
    })

    it('makes a higher difficulty tighter on every tier', () => {
        //this is the "scale by the difficulty weight" half of the brief - and what the old flat
        //subtraction failed to deliver on the outermost window, which the renderer clamped away
        for (let i = 1; i < DIFFICULTIES.length; i++) {
            const easier = boundsAt(DIFFICULTIES[i - 1])
            const harder = boundsAt(DIFFICULTIES[i])
            for (let tier = 0; tier < easier.length; tier++) {
                expect(
                    harder[tier],
                    `difficulty ${DIFFICULTIES[i]} tier ${tier} vs ${DIFFICULTIES[i - 1]}`
                ).toBeLessThan(easier[tier])
            }
        }
    })

    it('scales the awesome tier with difficulty at all', () => {
        //the old bound was a hardcoded 16 at every difficulty, so the tier that decides a full
        //combo's quality was the one thing difficulty could not touch
        expect(boundsAt(MIN_VSRG_DIFFICULTY)[0]).toBeGreaterThan(boundsAt(MAX_VSRG_DIFFICULTY)[0])
    })

    it('clamps a difficulty from outside the composer range instead of extrapolating', () => {
        //hand-edited files and pre-setting songs can carry anything; extrapolating would hand
        //back negative (unhittable) windows at the top end
        expect(boundsAt(999)).toEqual(boundsAt(MAX_VSRG_DIFFICULTY))
        expect(boundsAt(-5)).toEqual(boundsAt(MIN_VSRG_DIFFICULTY))
        expect(boundsAt(0)).toEqual(boundsAt(MIN_VSRG_DIFFICULTY))
    })

    it('keeps every window a positive whole number of milliseconds', () => {
        for (const difficulty of [...DIFFICULTIES, -5, 0, 999]) {
            for (const bound of boundsAt(difficulty)) {
                expect(Number.isInteger(bound)).toBe(true)
                expect(bound).toBeGreaterThan(0)
            }
        }
    })

    it('defaults a fresh song to the middle of the range', () => {
        //the renderer reads bounds off whatever difficulty a song carries; a new song's default
        //is what most players actually meet
        const song = new VsrgSong('test')
        expect(song.difficulty).toBe(5)
        expect(song.getAccuracyBounds()).toEqual(boundsAt(5))
    })
})
