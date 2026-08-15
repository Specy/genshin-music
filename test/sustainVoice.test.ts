// Phase-B sustain engine tests. jsdom has no AudioContext (see audioModels.test.ts's
// header), so these run the Voice/Instrument sustain logic against a minimal fake
// implementing exactly the WebAudio surface the engine touches — wiring, loop points,
// release-ramp scheduling, and registry behavior are what's under test, not DSP.
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {Voice} from '../src/lib/audio/Voice'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {Recording} from '../src/lib/core/Songs/SongClasses'
import {INSTRUMENTS} from './imports'
import type {SustainLoopMode} from '../src/lib/games/types'

type Call = { method: string, args: unknown[] }

function fakeGainParam(calls: Call[], withCancelAndHold: boolean) {
    const param: Record<string, unknown> = {
        value: 1,
        setValueAtTime(value: number, time: number) {
            calls.push({method: 'setValueAtTime', args: [value, time]})
        },
        linearRampToValueAtTime(value: number, time: number) {
            calls.push({method: 'linearRampToValueAtTime', args: [value, time]})
        },
        cancelScheduledValues(time: number) {
            calls.push({method: 'cancelScheduledValues', args: [time]})
        },
    }
    // All current browsers have cancelAndHoldAtTime, so the default fake does too —
    // otherwise the tests would only ever exercise the legacy-Safari fallback branch
    // of Voice.fadeParam (which is exactly how the unanchored-ramp bug shipped).
    if (withCancelAndHold) {
        param.cancelAndHoldAtTime = (time: number) => {
            calls.push({method: 'cancelAndHoldAtTime', args: [time]})
        }
    }
    return param
}

function fakeContext(currentTime = 10, {withCancelAndHold = true} = {}) {
    const created: { sources: any[], gains: any[] } = {sources: [], gains: []}
    const context = {
        currentTime,
        createGain() {
            const calls: Call[] = []
            const gain = {
                calls,
                gain: fakeGainParam(calls, withCancelAndHold),
                connectedTo: [] as unknown[],
                connect(node: unknown) {
                    this.connectedTo.push(node)
                },
                disconnect() {
                    calls.push({method: 'disconnect', args: []})
                },
            }
            created.gains.push(gain)
            return gain
        },
        createBufferSource() {
            const calls: Call[] = []
            const listeners = new Map<string, () => void>()
            const source = {
                calls,
                buffer: null as unknown,
                loop: false,
                loopStart: 0,
                loopEnd: 0,
                playbackRate: {value: 1},
                connectedTo: [] as unknown[],
                connect(node: unknown) {
                    this.connectedTo.push(node)
                },
                disconnect() {
                    calls.push({method: 'disconnect', args: []})
                },
                start(when?: number, offset?: number) {
                    calls.push({method: 'start', args: offset === undefined ? [when] : [when, offset]})
                },
                stop(when?: number) {
                    calls.push({method: 'stop', args: [when]})
                },
                addEventListener(type: string, cb: () => void) {
                    listeners.set(type, cb)
                },
                removeEventListener(type: string) {
                    listeners.delete(type)
                },
                emitEnded() {
                    listeners.get('ended')?.()
                },
            }
            created.sources.push(source)
            return source
        },
    }
    return {context: context as unknown as BaseAudioContext, created}
}

const FAKE_BUFFER = {duration: 3} as AudioBuffer

function makeVoice(
    overrides: Partial<ConstructorParameters<typeof Voice>[0]> = {},
    contextOptions?: {withCancelAndHold?: boolean},
) {
    const {context, created} = fakeContext(10, contextOptions)
    const destination = (context as any).createGain()
    const voice = new Voice({
        context,
        buffer: FAKE_BUFFER,
        destination,
        playbackRate: 1.5,
        loop: {start: 0.5, end: 2.5},
        release: 0.2,
        ...overrides,
    })
    return {voice, created, destination, context}
}

describe('Voice', () => {
    it('wires source -> gain -> destination, applies loop region and playback rate, starts immediately', () => {
        const {created, destination} = makeVoice()
        const source = created.sources[0]
        const gain = created.gains[1] // gains[0] is the destination itself
        expect(source.buffer).toBe(FAKE_BUFFER)
        expect(source.playbackRate.value).toBe(1.5)
        expect(source.loop).toBe(true)
        expect(source.loopStart).toBe(0.5)
        expect(source.loopEnd).toBe(2.5)
        expect(source.connectedTo).toEqual([gain])
        expect(gain.connectedTo).toEqual([destination])
        expect(source.calls).toContainEqual({method: 'start', args: [undefined]})
    })

    it('without a loop region the source plays one-shot; with a future `at` it starts at that absolute time', () => {
        const {created, voice} = makeVoice({loop: null, at: 10.5})
        const source = created.sources[0]
        expect(source.loop).toBe(false)
        expect(voice.startedAt).toBe(10.5)
        expect(source.calls).toContainEqual({method: 'start', args: [10.5]})
    })

    it('an `at` at or before the audio clock (or non-finite) starts immediately — startedAt clamps to now', () => {
        for (const at of [10, 9, NaN, Infinity]) {
            const {created, voice} = makeVoice({loop: null, at})
            expect(voice.startedAt).toBe(10)
            expect(created.sources[0].calls).toContainEqual({method: 'start', args: [undefined]})
        }
    })

    it('loop-continuous (default): release keeps the loop wrapping and fades it out over `release` — no tail source', () => {
        const {voice, created} = makeVoice()
        const sustainSource = created.sources[0]
        const sustainGain = created.gains[1]
        voice.release()
        expect(voice.isReleased).toBe(true)
        expect(created.sources).toHaveLength(1) // never leaves the loop
        expect(sustainSource.loop).toBe(true)
        expect(sustainGain.calls).toContainEqual({method: 'setValueAtTime', args: [1, 10]})
        expect(sustainGain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [0, 10.2]})
        expect(sustainSource.calls).toContainEqual({method: 'stop', args: [10.2]})
    })

    it('loop-sustain: a tap released in the attack plays out the whole file from the exact playhead phase', () => {
        const {voice, created} = makeVoice({loopMode: 'loop-sustain'})
        const sustainSource = created.sources[0]
        const sustainGain = created.gains[1]
        voice.release() // key-up right away — playhead is at position 0
        const releaseSource = created.sources[1]
        const releaseGain = created.gains[2]
        expect(voice.isReleased).toBe(true)
        expect(sustainGain.calls).toContainEqual({method: 'setValueAtTime', args: [1, 10]})
        expect(sustainGain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [0, 10.02]})
        expect(sustainSource.calls).toContainEqual({method: 'stop', args: [10.02]})
        expect(releaseSource.buffer).toBe(FAKE_BUFFER)
        expect(releaseSource.loop).toBe(false)
        expect(releaseSource.playbackRate.value).toBe(1.5)
        // spliced with identical content at the current position — front to back
        expect(releaseSource.calls).toContainEqual({method: 'start', args: [10, 0]})
        expect(releaseGain.calls).toContainEqual({method: 'setValueAtTime', args: [0, 10]})
        expect(releaseGain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [1, 10.02]})
        const finalRamp = releaseGain.calls.at(-1)
        expect(finalRamp?.method).toBe('linearRampToValueAtTime')
        expect(finalRamp?.args[0]).toBe(0)
        expect(finalRamp?.args[1]).toBeCloseTo(10 + 3 / 1.5) // natural end of the whole file
    })

    it('loop-sustain: releases continue from the current phase — mid-first-pass and after wrapping', () => {
        // mid-first-pass: played (11-10)*1.5 = 1.5 sample-seconds, still before loop.end
        const first = makeVoice({loopMode: 'loop-sustain'})
        ;(first.context as any).currentTime = 11
        first.voice.release()
        expect(first.created.sources[1].calls).toContainEqual({method: 'start', args: [11, 1.5]})

        // wrapped: played (13-10)*1.5 = 4.5 -> 0.5 + (4.5-2.5) % 2 = position 0.5
        const wrapped = makeVoice({loopMode: 'loop-sustain'})
        ;(wrapped.context as any).currentTime = 13
        wrapped.voice.release()
        expect(wrapped.created.sources[1].calls).toContainEqual({method: 'start', args: [13, 0.5]})
        // never deferred: the release acts exactly when requested
        expect(wrapped.created.sources[0].calls).toContainEqual({method: 'stop', args: [13.02]})
    })

    it('a scheduled future release holds full level until the release point (anchored ramp — the Composer whole-note-fade bug)', () => {
        const {voice, created} = makeVoice()
        const gain = created.gains[1]
        voice.releaseAt(20)
        // Without an explicit setValueAtTime anchor the lone linearRamp has no defined
        // start point: browsers fade from scheduling time, sagging the gain across the
        // entire note and popping the tail in at full volume at the end.
        const anchor = gain.calls.findIndex(
            (c: Call) => c.method === 'setValueAtTime' && c.args[0] === 1 && c.args[1] === 20)
        const ramp = gain.calls.findIndex(
            (c: Call) => c.method === 'linearRampToValueAtTime' && c.args[1] === 20.2)
        expect(anchor).toBeGreaterThanOrEqual(0)
        expect(ramp).toBeGreaterThan(anchor)
        expect(gain.calls).toContainEqual({method: 'cancelAndHoldAtTime', args: [20]})
    })

    it('params without cancelAndHoldAtTime (older Safari) still cancel and anchor before ramping', () => {
        const {voice, created} = makeVoice({}, {withCancelAndHold: false})
        const gain = created.gains[1]
        voice.releaseAt(20)
        expect(gain.calls).toContainEqual({method: 'cancelScheduledValues', args: [20]})
        const anchor = gain.calls.findIndex(
            (c: Call) => c.method === 'setValueAtTime' && c.args[0] === 1 && c.args[1] === 20)
        const ramp = gain.calls.findIndex(
            (c: Call) => c.method === 'linearRampToValueAtTime' && c.args[1] === 20.2)
        expect(anchor).toBeGreaterThanOrEqual(0)
        expect(ramp).toBeGreaterThan(anchor)
    })

    it('release is idempotent — a second release/releaseAt schedules nothing new', () => {
        const {voice, created} = makeVoice()
        voice.release()
        const callsAfterFirst = created.gains.reduce((count, gain) => count + gain.calls.length, 0)
        voice.release()
        voice.releaseAt(99)
        expect(created.gains.reduce((count, gain) => count + gain.calls.length, 0)).toBe(callsAfterFirst)
        expect(created.sources).toHaveLength(1)
    })

    it('releaseAt clamps to the voice start time (never releases before it starts)', () => {
        const {voice, created} = makeVoice({at: 11, loopMode: 'loop-sustain'}) // startedAt = 11
        voice.releaseAt(10.2)
        // clamped to the start: position 0, tail plays the file front to back
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [11.02]})
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [11, 0]})
    })

    it('skip resumes mid-note: source starts at the elapsed position, scaled by playbackRate', () => {
        // 0.5 note-seconds in -> buffer position 0.5 * 1.5 = 0.75, still in the attack
        const {created, voice} = makeVoice({skip: 0.5})
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [10, 0.75]})
        expect(voice.startedAt).toBe(10)
    })

    it('skip past the first pass wraps into the loop region, like the live playhead would', () => {
        // 3 note-seconds -> buffer 4.5 -> 0.5 + (4.5 - 2.5) % 2 = 0.5
        const wrapped = makeVoice({skip: 3})
        expect(wrapped.created.sources[0].calls).toContainEqual({method: 'start', args: [10, 0.5]})
        // exactly at loop.end wraps to loop.start (rate 1 keeps the arithmetic exact)
        const atEnd = makeVoice({skip: 2.5, playbackRate: 1})
        expect(atEnd.created.sources[0].calls).toContainEqual({method: 'start', args: [10, 0.5]})
    })

    it('skip composes with a scheduled start: source starts at `at` from the skipped position', () => {
        const {created, voice} = makeVoice({at: 10.5, skip: 1})
        expect(voice.startedAt).toBe(10.5)
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [10.5, 1.5]})
    })

    it('loop-sustain releases splice at the true phase when the voice was started with skip', () => {
        // initial buffer position 1.5; released 0.5s later: 1.5 + 0.5 * 1.5 = 2.25
        const {voice, created, context} = makeVoice({loopMode: 'loop-sustain', skip: 1})
        ;(context as any).currentTime = 10.5
        voice.release()
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [10.5, 2.25]})

        // skip already wrapped: buffer 2 * 1.5 = 3 -> 0.5 + 0.5 % 2 = 1; released immediately
        const wrapped = makeVoice({loopMode: 'loop-sustain', skip: 2})
        wrapped.voice.release()
        expect(wrapped.created.sources[1].calls).toContainEqual({method: 'start', args: [10, 1]})
    })

    it('a skip past the end of a loopless sample clamps to the end (born ended, no sound, no throw)', () => {
        const {created} = makeVoice({loop: null, skip: 10})
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [10, 3]})
    })

    it('non-finite or non-positive skip behaves as no skip at all', () => {
        for (const skip of [0, -2, NaN, Infinity]) {
            const {created} = makeVoice({skip})
            expect(created.sources[0].calls).toContainEqual({method: 'start', args: [undefined]})
        }
    })

    it('a skipped start ramps in over the crossfade — a hard start at mid-waveform amplitude clicks', () => {
        const {created} = makeVoice({skip: 1})
        const gain = created.gains[1]
        expect(gain.calls).toContainEqual({method: 'setValueAtTime', args: [0, 10]})
        expect(gain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [1, 10.02]})
        // an un-skipped press keeps its natural attack — no ramp events at all
        expect(makeVoice().created.gains[1].calls).toHaveLength(0)
        // crossfade 0 = author opted out of splice fades everywhere
        expect(makeVoice({skip: 1, crossfade: 0}).created.gains[1].calls).toHaveLength(0)
    })

    it('releases on a skipped voice anchor at the gain the ramp-in reaches, not the stale .value', () => {
        const {voice, created} = makeVoice({skip: 1})
        const gain = created.gains[1]
        // what a real browser's .value getter reports at the ramp's start instant
        // (zero-delay resume): anchoring there would hard-cut the note at its release
        ;(gain.gain as any).value = 0
        voice.releaseAt(20)
        expect(gain.calls).toContainEqual({method: 'setValueAtTime', args: [1, 20]})
        expect(gain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [0, 20.2]})
    })

    it('a release landing mid-ramp anchors at the ramp value of that exact instant (no step)', () => {
        const {voice, created} = makeVoice({skip: 1})
        voice.releaseAt(10.01) // halfway through the 0.02s ramp-in
        const anchor = created.gains[1].calls.find(
            (c: Call) => c.method === 'setValueAtTime' && c.args[1] === 10.01)
        expect(anchor).toBeDefined()
        expect(anchor!.args[0] as number).toBeCloseTo(0.5, 10)
    })

    it('release() brings a future scheduled release forward so playback stop cannot leave a voice sounding', () => {
        const {voice, created} = makeVoice({loopMode: 'loop-sustain'})
        const gain = created.gains[1]
        voice.releaseAt(20) // scheduled tail at phase(20): 15 played -> 0.5 + 12.5 % 2 = 1
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [20, 0.5 + (15 - 2.5) % 2]})
        voice.release() // brought forward to now — old tail cancelled, new one at phase(10) = 0
        expect(gain.calls).toContainEqual({method: 'cancelAndHoldAtTime', args: [10]})
        expect(created.sources[1].calls).toContainEqual({method: 'stop', args: [undefined]})
        expect(created.sources[2].calls).toContainEqual({method: 'start', args: [10, 0]})
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.02]})
    })

    it('fadeOut skips the release tail and choke uses only the short crossfade', () => {
        const faded = makeVoice()
        faded.voice.fadeOut()
        expect(faded.created.sources).toHaveLength(1)
        expect(faded.created.sources[0].calls).toContainEqual({method: 'stop', args: [10.2]})

        const choked = makeVoice()
        choked.voice.choke()
        expect(choked.created.sources).toHaveLength(1)
        expect(choked.created.sources[0].calls).toContainEqual({method: 'stop', args: [10.02]})
    })

    it('fadeOut cancels a scheduled voice before it can make a late sound', () => {
        const {voice, created} = makeVoice({at: 10.5})
        voice.fadeOut()
        expect(voice.isDisposed).toBe(true)
        expect(created.sources).toHaveLength(1)
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [undefined]})
    })

    it('stop() hard-stops and disconnects both nodes', () => {
        const {voice, created} = makeVoice()
        const source = created.sources[0]
        const gain = created.gains[1]
        voice.stop()
        expect(source.calls).toContainEqual({method: 'stop', args: [undefined]})
        expect(source.calls).toContainEqual({method: 'disconnect', args: []})
        expect(gain.calls).toContainEqual({method: 'disconnect', args: []})
    })

    it('the ended event tears the voice down exactly once', () => {
        const {created} = makeVoice()
        const source = created.sources[0]
        source.emitEnded()
        source.emitEnded()
        expect(source.calls.filter((c: Call) => c.method === 'disconnect').length).toBe(1)
    })

    it('sustain-source end does not dispose a voice until its release tail also ends', () => {
        const {voice, created} = makeVoice({loopMode: 'loop-sustain'})
        voice.release()
        created.sources[0].emitEnded()
        expect(voice.isDisposed).toBe(false)
        created.sources[1].emitEnded()
        expect(voice.isDisposed).toBe(true)
    })

    it('sanitizes authored metadata: reversed/NaN loop bounds fall back to one-shot, loop end clamps to the sample, bad release/rate get safe defaults', () => {
        const reversed = makeVoice({loop: {start: 2.5, end: 0.5}})
        expect(reversed.created.sources[0].loop).toBe(false)
        const nan = makeVoice({loop: {start: NaN, end: 2}})
        expect(nan.created.sources[0].loop).toBe(false)
        const overlong = makeVoice({loop: {start: 0.5, end: 99}}) // buffer duration is 3
        expect(overlong.created.sources[0].loop).toBe(true)
        expect(overlong.created.sources[0].loopEnd).toBe(3)
        const badRelease = makeVoice({release: -5, loop: null})
        badRelease.voice.release()
        //negative fallback release clamps to 0: ramp and stop land AT the release time
        expect(badRelease.created.sources[0].calls).toContainEqual({method: 'stop', args: [10]})
        const badRate = makeVoice({playbackRate: NaN})
        expect(badRate.created.sources[0].playbackRate.value).toBe(1)
    })
})

const SUSTAIN = {
    release: 0.3,
    loop: {start: 0.1, end: 1.9},
}

/**
 * The Note Id of a button. The engine's public API is keyed by Note Id (ADR-0005 §4) while
 * the per-note config overrides below are still authored per BUTTON (private storage), so
 * the tests state the button they mean and translate here.
 */
const idAt = (instrument: Instrument, button: number) => instrument.notes[button].id

/**
 * A real Instrument, force-fed a sustain config and fake audio plumbing (the default
 * instrument is one-shot by design). Post-ADR-0003 the per-note loop override lives on
 * the note struct itself (button 1 here), and instrumentData is a REFERENCE to the
 * shared config — so this builds a fresh copy instead of mutating it in place.
 * The registry normalizes loopMode to 'loop-continuous' when unauthored; mirrored here.
 * `id(button)` is that button's Note Id, the engine's key.
 */
function sustainingInstrument(loopMode: SustainLoopMode = 'loop-continuous') {
    const instrument = new Instrument(INSTRUMENTS[0])
    instrument.instrumentData = {
        ...instrument.instrumentData,
        sustain: {...SUSTAIN, loopMode},
        notes: instrument.instrumentData.notes.map((note, i) =>
            i === 1 ? {...note, loop: {start: 0.2, end: 1.2}} : note
        ),
    }
    const {context, created} = fakeContext()
    instrument.audioContext = context as any
    instrument.volumeNode = (context as any).createGain()
    instrument.buffers = instrument.notes.map(() => FAKE_BUFFER)
    return {instrument, created, id: (button: number) => idAt(instrument, button)}
}

/** A real one-shot Instrument (the default is one) with fake audio plumbing, for the scheduled-one-shot registry tests. */
function oneShotInstrument() {
    const instrument = new Instrument(INSTRUMENTS[0])
    const {context, created} = fakeContext()
    instrument.audioContext = context as any
    instrument.volumeNode = (context as any).createGain()
    instrument.buffers = instrument.notes.map(() => FAKE_BUFFER)
    return {instrument, created, context, id: (button: number) => idAt(instrument, button)}
}

/** sustainingInstrument with sustain.minLength authored (and optionally a per-note override on button 1). */
function minLengthInstrument(minLength: number, options: {noteOneMinLength?: number} = {}) {
    const {instrument, created, id} = sustainingInstrument()
    instrument.instrumentData = {
        ...instrument.instrumentData,
        sustain: {...SUSTAIN, loopMode: 'loop-continuous', minLength},
        notes: instrument.instrumentData.notes.map((note, i) =>
            i === 1 && options.noteOneMinLength !== undefined
                ? {...note, minLength: options.noteOneMinLength}
                : note
        ),
    }
    return {instrument, created, id}
}

describe('Instrument sustain', () => {
    it('supportsSustain reflects the selected instrument data', () => {
        expect(new Instrument(INSTRUMENTS[0]).supportsSustain).toBe(false)
        const {instrument} = sustainingInstrument()
        expect(instrument.supportsSustain).toBe(true)
    })

    it('pressNote on a one-shot instrument takes the play() path and returns null', () => {
        const instrument = new Instrument(INSTRUMENTS[0])
        const {context, created} = fakeContext()
        instrument.audioContext = context as any
        instrument.volumeNode = (context as any).createGain()
        instrument.buffers = instrument.notes.map(() => FAKE_BUFFER)
        const voice = instrument.pressNote(idAt(instrument, 0), 'C')
        expect(voice).toBeNull()
        const source = created.sources[0]
        expect(source.loop).toBe(false)
        expect(source.calls).toContainEqual({method: 'start', args: [undefined]})
    })

    it('pressNote starts a held voice with the per-note loop override (default loop otherwise) and releaseNote releases it', () => {
        const {instrument, created, id} = sustainingInstrument()
        instrument.pressNote(id(0), 'C')
        instrument.pressNote(id(1), 'C')
        expect(created.sources[0].loopStart).toBe(0.1) // default region (note 0 has no loop override)
        expect(created.sources[1].loopStart).toBe(0.2) // per-note override
        instrument.releaseNote(id(1))
        // loop-continuous default: fades out over `release`, spawns no tail source
        expect(created.sources).toHaveLength(2)
        expect(created.sources[1].calls).toContainEqual({method: 'stop', args: [10.3]})
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
        //releasing an unheld button is a no-op
        instrument.releaseNote(id(5))
    })

    it('a loop-sustain instrument plays out from the current phase on release', () => {
        const {instrument, created, id} = sustainingInstrument('loop-sustain')
        instrument.pressNote(id(1), 'C')
        instrument.releaseNote(id(1)) // released at start time — position 0, file front to back
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [10, 0]})
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.02]})
    })

    it("loopMode 'one-shot' ignores note-off entirely — the explicit \"tap\" spelling", () => {
        const {instrument, created, id} = sustainingInstrument('one-shot')
        expect(instrument.supportsSustain).toBe(false)
        const voice = instrument.pressNote(id(0), 'C')
        expect(voice).toBeNull() // plain play() path, same as an instrument without sustain
        expect(created.sources[0].loop).toBe(false)
        instrument.releaseNote(id(0)) // nothing held — no-op, the sample rings out fully
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('re-pressing a held button releases the previous voice (retrigger)', () => {
        const {instrument, created, id} = sustainingInstrument()
        instrument.pressNote(id(0), 'C')
        instrument.pressNote(id(0), 'C')
        expect(created.sources.length).toBe(2)
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.02]})
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('same note on separate instrument instances has independent voice and release state', () => {
        const first = sustainingInstrument()
        const second = sustainingInstrument()
        first.instrument.pressNote(first.id(0), 'C')
        second.instrument.pressNote(second.id(0), 'C')
        first.instrument.releaseNote(first.id(0))
        expect(first.created.sources).toHaveLength(1) // continuous: fade only, no tail source
        expect(first.created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(second.created.sources).toHaveLength(1)
        expect(second.created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('a durationMs press self-releases exactly at its musical end and is not registered as held', () => {
        const {instrument, created, id} = sustainingInstrument()
        const voice = instrument.pressNote(id(0), 'C', {durationMs: 500})
        expect(voice?.isReleased).toBe(true) // scheduled release counts as released
        // release acts at the requested time (10.5) — never deferred to a loop boundary
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.5 + 0.3]})
        instrument.releaseNote(id(0)) // no live voice to release
        expect(created.sources.length).toBe(1)
    })

    it('a scheduled durationMs press on a loop-sustain instrument plays out from the phase at its end', () => {
        const {instrument, created, id} = sustainingInstrument('loop-sustain')
        instrument.pressNote(id(0), 'C', {durationMs: 2500})
        // phase at 12.5: played 2.5 sample-seconds >= loop.end 1.9 -> 0.1 + (2.5 - 1.9) % 1.8
        expect(created.sources[1].calls).toContainEqual(
            {method: 'start', args: [12.5, 0.1 + (2.5 - 1.9) % (1.9 - 0.1)]})
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [12.52]})
    })

    it('releaseAllNotes releases every sounding voice (ramped) or hard-stops on teardown', () => {
        const {instrument, created, id} = sustainingInstrument()
        instrument.pressNote(id(0), 'C')
        instrument.pressNote(id(1), 'C')
        instrument.releaseAllNotes()
        expect(created.sources).toHaveLength(2) // global stop fades; it does not spawn tails
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(true)

        const second = sustainingInstrument()
        second.instrument.pressNote(second.id(0), 'C')
        second.instrument.dispose()
        expect(second.created.sources[0].calls).toContainEqual({method: 'stop', args: [undefined]})
    })

    it('play() on a sustaining instrument is a tap (press + immediate release), never the raw whole file', () => {
        const {instrument, created, id} = sustainingInstrument()
        instrument.play(id(0), 'C')
        const source = created.sources[0]
        expect(source.loop).toBe(true) // a Voice with the loop region, not a bare one-shot source
        expect(source.loopStart).toBe(0.1)
        // no minLength authored: released at start, fades over `release` (0.3)
        expect(source.calls).toContainEqual({method: 'stop', args: [10.3]})
        instrument.releaseNote(id(0)) // taps are scheduled, not held
        expect(created.sources).toHaveLength(1)
    })

    it('sustain.minLength shapes taps from play(): the note sounds minLength, then releases', () => {
        const {instrument, created, id} = minLengthInstrument(0.5)
        instrument.play(id(0), 'C')
        // released at 10.5 (the minimum, measured from the note start), faded by 10.8
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.5 + 0.3]})
    })

    it('per-note minLength overrides the instrument default (0 = no minimum)', () => {
        const {instrument, created, id} = minLengthInstrument(0.5, {noteOneMinLength: 0})
        instrument.play(id(1), 'C')
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10 + 0.3]})
    })

    it('a live release before minLength is deferred to it; a late release acts on the key-up', () => {
        const early = minLengthInstrument(0.5)
        early.instrument.pressNote(early.id(0), 'C')
        early.instrument.releaseNote(early.id(0)) // key-up at 10 — the note still sounds until 10.5
        expect(early.created.sources[0].calls).toContainEqual({method: 'stop', args: [10.5 + 0.3]})

        const late = minLengthInstrument(0.5)
        late.instrument.pressNote(late.id(0), 'C')
        ;(late.instrument.audioContext as any).currentTime = 11
        late.instrument.releaseNote(late.id(0)) // minimum long elapsed — releases now
        expect(late.created.sources[0].calls).toContainEqual({method: 'stop', args: [11 + 0.3]})
    })

    it('scheduled durations shorter than minLength stretch to it; longer ones are untouched', () => {
        const short = minLengthInstrument(0.5)
        short.instrument.pressNote(short.id(0), 'C', {durationMs: 125})
        expect(short.created.sources[0].calls).toContainEqual({method: 'stop', args: [10.5 + 0.3]})

        const long = minLengthInstrument(0.5)
        long.instrument.pressNote(long.id(0), 'C', {durationMs: 1000})
        expect(long.created.sources[0].calls).toContainEqual({method: 'stop', args: [11 + 0.3]})
    })

    it('skipMs counts toward minLength — a resumed mid-note press is not re-stretched', () => {
        // 125ms already served: 375ms of the minimum remain and win over the 125ms hold
        const partial = minLengthInstrument(0.5)
        partial.instrument.pressNote(partial.id(0), 'C', {durationMs: 125, skipMs: 125})
        expect(partial.created.sources[0].calls).toContainEqual(
            {method: 'stop', args: [10.375 + 0.3]})
        // resumed past the whole minimum: the remaining hold applies as-is
        const served = minLengthInstrument(0.5)
        served.instrument.pressNote(served.id(0), 'C', {durationMs: 125, skipMs: 750})
        expect(served.created.sources[0].calls).toContainEqual(
            {method: 'stop', args: [10.125 + 0.3]})
    })

    it('releaseAllNotes ignores minLength — playback stop stays immediate', () => {
        const {instrument, created, id} = minLengthInstrument(0.5)
        instrument.pressNote(id(0), 'C')
        instrument.releaseAllNotes()
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.3]})
    })
})

// ADR-0006: play/pressNote take an ABSOLUTE AudioContext time, and everything committed to a
// future start is retractable through cancelScheduledAfter until the moment it starts.
describe('Instrument committed scheduling', () => {
    it('play with a future `at` commits the one-shot at that absolute time', () => {
        const {instrument, created, id} = oneShotInstrument()
        instrument.play(id(0), 'C', 10.4)
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [10.4]})
    })

    it('play with no `at` (or one already past) starts now and is fire-and-forget — sounding audio always rings out', () => {
        const {instrument, created, id} = oneShotInstrument()
        instrument.play(id(0), 'C')
        instrument.play(id(1), 'C', 9.5)
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [undefined]})
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [undefined]})
        instrument.cancelScheduledAfter(0) // nothing registered — nothing to retract
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('cancelScheduledAfter retracts committed one-shots from `at` on, leaving earlier ones committed', () => {
        const {instrument, created, id} = oneShotInstrument()
        instrument.play(id(0), 'C', 10.3)
        instrument.play(id(1), 'C', 10.6)
        instrument.cancelScheduledAfter(10.5)
        const [first, second] = created.sources
        expect(first.calls.some((c: Call) => c.method === 'stop')).toBe(false)
        expect(second.calls).toContainEqual({method: 'stop', args: [undefined]})
        expect(second.calls).toContainEqual({method: 'disconnect', args: []})
        // retraction deregisters: a wider second sweep cannot double-stop it
        instrument.cancelScheduledAfter(10.2)
        expect(second.calls.filter((c: Call) => c.method === 'stop')).toHaveLength(1)
        // and that sweep retracts the earlier one-shot, still unstarted
        expect(first.calls).toContainEqual({method: 'stop', args: [undefined]})
    })

    it('a cutoff already in the past clamps to now — a one-shot that began sounding is never cut', () => {
        const {instrument, created, id, context} = oneShotInstrument()
        instrument.play(id(0), 'C', 10.4)
        ;(context as any).currentTime = 10.5 // started sounding at 10.4
        instrument.cancelScheduledAfter(10)
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it("the 'ended' handler deregisters a committed one-shot", () => {
        const {instrument, created, id} = oneShotInstrument()
        instrument.play(id(0), 'C', 10.4)
        const source = created.sources[0]
        source.emitEnded()
        const stops = source.calls.filter((c: Call) => c.method === 'stop').length
        instrument.cancelScheduledAfter(10.2) // would re-stop 10.4 if it were still registered
        expect(source.calls.filter((c: Call) => c.method === 'stop')).toHaveLength(stops)
    })

    it("play() prunes entries long past their start — a lost 'ended' must not grow the registry over a session", () => {
        const {instrument, id, context} = oneShotInstrument()
        instrument.play(id(0), 'C', 10.4)
        instrument.play(id(1), 'C', 10.6)
        expect((instrument as any).scheduledOneShots).toHaveLength(2)
        ;(context as any).currentTime = 11.2 // both within the 1s retention bound — kept
        instrument.play(id(0), 'C')
        expect((instrument as any).scheduledOneShots).toHaveLength(2)
        ;(context as any).currentTime = 20 // both long past it — dropped
        instrument.play(id(0), 'C')
        expect((instrument as any).scheduledOneShots).toHaveLength(0)
    })

    it('pressNote with `at` starts the voice at that absolute time and durationMs counts from it', () => {
        const {instrument, created, id} = sustainingInstrument()
        const voice = instrument.pressNote(id(0), 'C', {at: 12, durationMs: 500})
        expect(voice?.startedAt).toBe(12)
        expect(created.sources[0].calls).toContainEqual({method: 'start', args: [12]})
        // released at startedAt + durationMs, faded over `release` (0.3)
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [12.5 + 0.3]})
    })

    it('cancelScheduledAfter retracts a committed-but-unstarted Voice and leaves a sounding one ringing', () => {
        const {instrument, created, id} = sustainingInstrument()
        instrument.pressNote(id(0), 'C', {durationMs: 5000}) // sounding since 10
        instrument.pressNote(id(1), 'C', {at: 11, durationMs: 500}) // committed, starts at 11
        instrument.cancelScheduledAfter(10.5)
        expect(created.sources[1].calls).toContainEqual({method: 'stop', args: [undefined]})
        expect(created.sources[1].calls).toContainEqual({method: 'disconnect', args: []})
        // the sounding voice keeps only its own musical release (at 15, faded by 15.3)
        expect(created.sources[0].calls.filter((c: Call) => c.method === 'stop'))
            .toEqual([{method: 'stop', args: [15 + 0.3]}])
        // the retracted voice left activeVoices: a later stop touches only the sounding one
        const stopsAfterRetraction =
            created.sources[1].calls.filter((c: Call) => c.method === 'stop').length
        instrument.releaseAllNotes(true)
        expect(created.sources[1].calls.filter((c: Call) => c.method === 'stop'))
            .toHaveLength(stopsAfterRetraction)
    })
})

describe('Recording duration capture', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('releaseNote stamps press->release ms on the most recent open note of that id', () => {
        vi.setSystemTime(1000_000)
        const recording = new Recording()
        recording.addNote(60) // starts the recording: startTimestamp = now - 100 -> time = 100
        vi.setSystemTime(1000_400)
        recording.releaseNote(60)
        expect(recording.notes[0].time).toBe(100)
        expect(recording.notes[0].duration).toBe(400)
    })

    it('re-pressing an open id closes the previous press first (exact pairing, mirrors voice retrigger)', () => {
        vi.setSystemTime(2000_000)
        const recording = new Recording()
        recording.addNote(60) // time 100 (start() backdates by 100ms)
        vi.setSystemTime(2000_200)
        recording.addNote(60) // retrigger: closes the first press at 200ms elapsed
        expect(recording.notes[0].duration).toBe(200)
        vi.setSystemTime(2000_500)
        recording.releaseNote(60) // unambiguous: only the second press is open
        expect(recording.notes[1].duration).toBe(300)
        vi.setSystemTime(2000_900)
        recording.releaseNote(60) // nothing open — no-op, durations unchanged
        expect(recording.notes[0].duration).toBe(200)
        expect(recording.notes[1].duration).toBe(300)
        //releasing an id with no open notes is a no-op
        recording.releaseNote(99)
    })

    it('closeAllOpenNotes stamps every held note (recording stop / window blur) and instant taps close as 1ms', () => {
        vi.setSystemTime(3000_000)
        const recording = new Recording()
        recording.addNote(60)
        recording.addNote(62)
        recording.releaseNote(62) // same-ms tap: floors to 1ms so it reads as closed
        expect(recording.notes[1].duration).toBe(1)
        vi.setSystemTime(3000_600)
        recording.closeAllOpenNotes()
        expect(recording.notes[0].duration).toBe(600) // elapsed 700 - time 100
        expect(recording.notes[1].duration).toBe(1) // already closed — untouched
    })
})
