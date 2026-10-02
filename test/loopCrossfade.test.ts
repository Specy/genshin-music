// Pre-rendered crossfade looping (loopCrossfade.ts): pure Float32 DSP, so unlike the
// Voice tests this is real math on real signals — no Web Audio surface involved.
import {describe, expect, it} from 'vitest'
import {crossfadeLoopRegion, DEFAULT_LOOP_CROSSFADE_S} from '../src/lib/audio/loopCrossfade'

const RATE = 48000

/** A sine whose loop points are deliberately NOT phase-aligned (the imperfect-file case). */
function makeSine(seconds = 2, hz = 440.7) {
    const data = new Float32Array(Math.round(seconds * RATE))
    for (let i = 0; i < data.length; i++) data[i] = Math.sin((2 * Math.PI * hz * i) / RATE)
    return data
}

//raised timeout: these cases blend seconds of 48kHz audio for real (~3.4s of pure DSP), close
//enough to vitest's 5s default that a loaded machine tripped the whole suite three times
describe('crossfadeLoopRegion', {timeout: 30_000}, () => {
    const LOOP = {start: 0.5, end: 1.5}

    it('makes the wrap continuous: the last blended sample equals the sample before loop.start', () => {
        const data = makeSine()
        const startIdx = Math.round(LOOP.start * RATE)
        const endIdx = Math.round(LOOP.end * RATE)
        const spliceBefore = Math.abs(data[endIdx - 1] - data[startIdx - 1])
        expect(spliceBefore).toBeGreaterThan(0.01) // the chosen points genuinely mismatch
        crossfadeLoopRegion(data, RATE, LOOP, DEFAULT_LOOP_CROSSFADE_S)
        // after the blend, wrapping end -> start continues the signal's own motion
        expect(Math.abs(data[endIdx - 1] - data[startIdx - 1])).toBeLessThan(1e-6)
    })

    it('only touches the blend window before loop.end', () => {
        const data = makeSine()
        const original = data.slice()
        const endIdx = Math.round(LOOP.end * RATE)
        const n = Math.round(DEFAULT_LOOP_CROSSFADE_S * RATE)
        crossfadeLoopRegion(data, RATE, LOOP, DEFAULT_LOOP_CROSSFADE_S)
        let firstTouchedOutsideWindow = -1
        for (let i = 0; i < data.length; i++) {
            if (i >= endIdx - n && i < endIdx) continue
            if (data[i] !== original[i]) {
                firstTouchedOutsideWindow = i
                break
            }
        }
        expect(firstTouchedOutsideWindow).toBe(-1)
    })

    it('keeps level through the blend (equal-power, no dip on correlated material)', () => {
        const data = makeSine()
        crossfadeLoopRegion(data, RATE, LOOP, DEFAULT_LOOP_CROSSFADE_S)
        const endIdx = Math.round(LOOP.end * RATE)
        const n = Math.round(DEFAULT_LOOP_CROSSFADE_S * RATE)
        let sum = 0
        for (let i = endIdx - n; i < endIdx; i++) sum += data[i] ** 2
        const rms = Math.sqrt(sum / n)
        expect(rms).toBeGreaterThan(0.4) // sine RMS is ~0.707; a linear blend of the
        expect(rms).toBeLessThan(1.1) //   detuned copies would dip far lower mid-fade
    })

    it('no-ops when the region cannot support the fade, instead of corrupting audio', () => {
        const cases: Array<[{start: number, end: number}, number]> = [
            [{start: 0, end: 1}, 0.05], //no pre-roll before loop.start to blend from
            [LOOP, 0], //disabled
            [LOOP, -1], //invalid
            [LOOP, NaN], //invalid
            [{start: 1.5, end: 0.5}, 0.05], //reversed
            [{start: 0.5, end: 99}, 0.05], //past the end of the buffer
            [{start: NaN, end: 1.5}, 0.05], //invalid bounds
        ]
        for (const [loop, seconds] of cases) {
            const data = makeSine(2)
            const original = data.slice()
            crossfadeLoopRegion(data, RATE, loop, seconds)
            expect(data).toEqual(original)
        }
    })

    it('shrinks the fade to what the geometry allows (short loop, short attack)', () => {
        //loop shorter than the requested fade: blend length caps at the loop length
        const data = makeSine()
        const loop = {start: 0.5, end: 0.51} //480 frames < 0.05s * 48000
        const startIdx = Math.round(loop.start * RATE)
        const endIdx = Math.round(loop.end * RATE)
        crossfadeLoopRegion(data, RATE, loop, 0.05)
        expect(Math.abs(data[endIdx - 1] - data[startIdx - 1])).toBeLessThan(1e-6)
    })
})
