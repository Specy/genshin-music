import {afterEach, describe, expect, it, vi} from 'vitest'
import {ThrottledEventLoop} from '../src/lib/core/ThrottledEventLoop'

// Every test that starts a loop uses fake timers (the class' own polling loop is a real
// `setTimeout(this.tick, 8)` chain driven by `Date.now()`, both faked together by vitest/sinon's
// fake-timer implementation) - reset back to real timers after each test so no fake-timer state
// (or an accidentally-still-scheduled tick) leaks into a later test in this file.
afterEach(() => {
    vi.useRealTimers()
})

describe('changeMaxFps (interval math)', () => {
    it('updates the public fps getter', () => {
        const loop = new ThrottledEventLoop(() => {}, 30)
        expect(loop.fps).toBe(30)
        loop.changeMaxFps(60)
        expect(loop.fps).toBe(60)
    })

    it('takes effect immediately on a RUNNING loop: raising fps increases the firing rate over an equal time window', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 10) // maxFpsInterval = 1000/10 = 100ms - slow
        loop.start()
        vi.advanceTimersByTime(500)
        const callsAtSlowRate = calls

        loop.changeMaxFps(200) // maxFpsInterval = 1000/200 = 5ms - fast
        calls = 0
        vi.advanceTimersByTime(500)
        const callsAtFastRate = calls

        loop.stop()
        expect(callsAtSlowRate).toBeGreaterThan(0)
        expect(callsAtFastRate).toBeGreaterThan(callsAtSlowRate)
    })
})

describe('start() / stop() lifecycle', () => {
    it('stop() before any start() is a harmless no-op (clearTimeout(0))', () => {
        const loop = new ThrottledEventLoop(() => {}, 30)
        expect(() => loop.stop()).not.toThrow()
    })

    it('start() begins invoking the callback on the throttled interval', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 60)
        loop.start()
        expect(calls).toBe(0) // the synchronous tick() inside start() never fires on its own first call (deltaTime is 0)
        vi.advanceTimersByTime(200)
        expect(calls).toBeGreaterThan(0)
        loop.stop()
    })

    it('stop() halts further scheduling: no more callback calls after stop(), however long time is advanced', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 60)
        loop.start()
        vi.advanceTimersByTime(200)
        expect(calls).toBeGreaterThan(0)

        loop.stop()
        const countAtStop = calls
        vi.advanceTimersByTime(1000)
        expect(calls).toBe(countAtStop)
    })

    it('start() resets timing state, so a fresh call never fires synchronously even mid-run', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 60)
        loop.start()
        vi.advanceTimersByTime(200)
        expect(calls).toBeGreaterThan(0)

        calls = 0
        loop.start() // start() calls stop() first, then re-zeroes startTime/nextTick/previousTickTime
        expect(calls).toBe(0)
        loop.stop()
    })
})

describe('tick() duration cutoff', () => {
    it('stops scheduling once elapsed reaches the given duration, even if time keeps advancing', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 60)
        loop.start(100) // only run while elapsed < 100ms of (virtual) time

        // advance well past the duration cutoff in one go - fake timers replay every setTimeout
        // scheduled along the way, including the ones tick() re-schedules itself, so this single
        // advance already carries the chain to its natural stopping point.
        vi.advanceTimersByTime(300)
        expect(calls).toBeGreaterThan(0)
        const countAfterDurationElapsed = calls

        // if tick() were still scheduling itself, more calls would appear here
        vi.advanceTimersByTime(1000)
        expect(calls).toBe(countAfterDurationElapsed)
    })

    it('an unset duration defaults to effectively unlimited (Number.MAX_SAFE_INTEGER) and keeps ticking', () => {
        vi.useFakeTimers()
        let calls = 0
        const loop = new ThrottledEventLoop(() => {
            calls++
        }, 60)
        loop.start() // no duration argument
        vi.advanceTimersByTime(1000)
        const countAt1000 = calls
        expect(countAt1000).toBeGreaterThan(0)

        vi.advanceTimersByTime(1000)
        expect(calls).toBeGreaterThan(countAt1000) // still scheduling, unlike the duration-cutoff test above
        loop.stop()
    })
})
