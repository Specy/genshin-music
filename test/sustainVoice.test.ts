// Phase-B sustain engine tests. jsdom has no AudioContext (see audioModels.test.ts's
// header), so these run the Voice/Instrument sustain logic against a minimal fake
// implementing exactly the WebAudio surface the engine touches — wiring, loop points,
// release-ramp scheduling, and registry behavior are what's under test, not DSP.
import {beforeEach, afterEach, describe, expect, it, vi} from 'vitest'
import {Voice} from '../src/lib/audio/Voice'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {Recording} from '../src/lib/core/Songs/SongClasses'
import {INSTRUMENTS} from './imports'

type Call = { method: string, args: unknown[] }

function fakeGainParam(calls: Call[]) {
    return {
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
}

function fakeContext(currentTime = 10) {
    const created: { sources: any[], gains: any[] } = {sources: [], gains: []}
    const context = {
        currentTime,
        createGain() {
            const calls: Call[] = []
            const gain = {
                calls,
                gain: fakeGainParam(calls),
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

function makeVoice(overrides: Partial<ConstructorParameters<typeof Voice>[0]> = {}) {
    const {context, created} = fakeContext()
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

    it('without a loop region the source plays one-shot; with delay it starts at now+delay', () => {
        const {created, voice} = makeVoice({loop: null, delay: 0.5})
        const source = created.sources[0]
        expect(source.loop).toBe(false)
        expect(voice.startedAt).toBe(10.5)
        expect(source.calls).toContainEqual({method: 'start', args: [10.5]})
    })

    it('release() crossfades into the natural post-loop tail and safety-fades its end', () => {
        const {voice, created} = makeVoice()
        const sustainSource = created.sources[0]
        const sustainGain = created.gains[1]
        voice.release()
        const releaseSource = created.sources[1]
        const releaseGain = created.gains[2]
        expect(voice.isReleased).toBe(true)
        expect(sustainGain.calls).toContainEqual({method: 'setValueAtTime', args: [1, 10]})
        expect(sustainGain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [0, 10.02]})
        expect(sustainSource.calls).toContainEqual({method: 'stop', args: [10.02]})
        expect(releaseSource.buffer).toBe(FAKE_BUFFER)
        expect(releaseSource.loop).toBe(false)
        expect(releaseSource.playbackRate.value).toBe(1.5)
        expect(releaseSource.calls).toContainEqual({method: 'start', args: [10, 2.5]})
        expect(releaseGain.calls).toContainEqual({method: 'setValueAtTime', args: [0, 10]})
        expect(releaseGain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [1, 10.02]})
        const finalRamp = releaseGain.calls.at(-1)
        expect(finalRamp?.method).toBe('linearRampToValueAtTime')
        expect(finalRamp?.args[0]).toBe(0)
        expect(finalRamp?.args[1]).toBeCloseTo(10 + (3 - 2.5) / 1.5)
    })

    it('release is idempotent — a second release/releaseAt schedules nothing new', () => {
        const {voice, created} = makeVoice()
        voice.release()
        const callsAfterFirst = created.gains.reduce((count, gain) => count + gain.calls.length, 0)
        voice.release()
        voice.releaseAt(99)
        expect(created.gains.reduce((count, gain) => count + gain.calls.length, 0)).toBe(callsAfterFirst)
        expect(created.sources).toHaveLength(2)
    })

    it('releaseAt clamps to the voice start time (never releases before it starts)', () => {
        const {voice, created} = makeVoice({delay: 1}) // startedAt = 11
        voice.releaseAt(10.2)
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [11.02]})
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [11, 2.5]})
    })

    it('release() brings a future scheduled release forward so playback stop cannot leave a voice sounding', () => {
        const {voice, created} = makeVoice()
        const gain = created.gains[1]
        voice.releaseAt(20)
        voice.release()
        expect(gain.calls).toContainEqual({method: 'cancelScheduledValues', args: [10]})
        expect(created.sources[1].calls).toContainEqual({method: 'stop', args: [undefined]})
        expect(created.sources[2].calls).toContainEqual({method: 'start', args: [10, 2.5]})
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

    it('fadeOut cancels a delayed voice before it can make a late sound', () => {
        const {voice, created} = makeVoice({delay: 0.5})
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
        const {voice, created} = makeVoice()
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
 * A real Instrument, force-fed a sustain config and fake audio plumbing (the default
 * instrument is one-shot by design). Post-ADR-0003 the per-note loop override lives on
 * the note struct itself (button 1 here), and instrumentData is a REFERENCE to the
 * shared config — so this builds a fresh copy instead of mutating it in place.
 */
function sustainingInstrument() {
    const instrument = new Instrument(INSTRUMENTS[0])
    instrument.instrumentData = {
        ...instrument.instrumentData,
        sustain: SUSTAIN,
        notes: instrument.instrumentData.notes.map((note, i) =>
            i === 1 ? {...note, loop: {start: 0.2, end: 1.2}} : note
        ),
    }
    const {context, created} = fakeContext()
    instrument.audioContext = context as any
    instrument.volumeNode = (context as any).createGain()
    instrument.buffers = instrument.notes.map(() => FAKE_BUFFER)
    return {instrument, created}
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
        const voice = instrument.pressNote(0, 'C')
        expect(voice).toBeNull()
        const source = created.sources[0]
        expect(source.loop).toBe(false)
        expect(source.calls).toContainEqual({method: 'start', args: [undefined]})
    })

    it('pressNote starts a held voice with the per-note loop override (default loop otherwise) and releaseNote releases it', () => {
        const {instrument, created} = sustainingInstrument()
        instrument.pressNote(0, 'C')
        instrument.pressNote(1, 'C')
        expect(created.sources[0].loopStart).toBe(0.1) // default region (note 0 has no loop override)
        expect(created.sources[1].loopStart).toBe(0.2) // per-note override
        instrument.releaseNote(1)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(created.sources[2].calls).toContainEqual({method: 'start', args: [10, 1.2]})
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
        //releasing an unheld button is a no-op
        instrument.releaseNote(5)
    })

    it('re-pressing a held button releases the previous voice (retrigger)', () => {
        const {instrument, created} = sustainingInstrument()
        instrument.pressNote(0, 'C')
        instrument.pressNote(0, 'C')
        expect(created.sources.length).toBe(2)
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.02]})
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('same note on separate instrument instances has independent voice and release state', () => {
        const first = sustainingInstrument()
        const second = sustainingInstrument()
        first.instrument.pressNote(0, 'C')
        second.instrument.pressNote(0, 'C')
        first.instrument.releaseNote(0)
        expect(first.created.sources).toHaveLength(2) // sustain + its release tail
        expect(second.created.sources).toHaveLength(1)
        expect(second.created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('a durationMs press self-releases on the audio timeline and is not registered as held', () => {
        const {instrument, created} = sustainingInstrument()
        const voice = instrument.pressNote(0, 'C', {durationMs: 500})
        expect(voice?.isReleased).toBe(true) // scheduled release counts as released
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.52]})
        expect(created.sources[1].calls).toContainEqual({method: 'start', args: [10.5, 1.9]})
        instrument.releaseNote(0) // no live voice to release
        expect(created.sources.length).toBe(2)
    })

    it('releaseAllNotes releases every sounding voice (ramped) or hard-stops on teardown', () => {
        const {instrument, created} = sustainingInstrument()
        instrument.pressNote(0, 'C')
        instrument.pressNote(1, 'C')
        instrument.releaseAllNotes()
        expect(created.sources).toHaveLength(2) // global stop fades; it does not spawn tails
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(true)

        const second = sustainingInstrument()
        second.instrument.pressNote(0, 'C')
        second.instrument.dispose()
        expect(second.created.sources[0].calls).toContainEqual({method: 'stop', args: [undefined]})
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
