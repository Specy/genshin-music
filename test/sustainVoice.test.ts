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
                start(when?: number) {
                    calls.push({method: 'start', args: [when]})
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

    it('release() ramps gain to 0 over the release time and stops the source at ramp end', () => {
        const {voice, created} = makeVoice()
        const source = created.sources[0]
        const gain = created.gains[1]
        voice.release()
        expect(voice.isReleased).toBe(true)
        expect(gain.calls).toContainEqual({method: 'setValueAtTime', args: [1, 10]})
        expect(gain.calls).toContainEqual({method: 'linearRampToValueAtTime', args: [0, 10.2]})
        expect(source.calls).toContainEqual({method: 'stop', args: [10.2]})
    })

    it('release is idempotent — a second release/releaseAt schedules nothing new', () => {
        const {voice, created} = makeVoice()
        const gain = created.gains[1]
        voice.release()
        const callsAfterFirst = gain.calls.length
        voice.release()
        voice.releaseAt(99)
        expect(gain.calls.length).toBe(callsAfterFirst)
    })

    it('releaseAt clamps to the voice start time (never releases before it starts)', () => {
        const {voice, created} = makeVoice({delay: 1}) // startedAt = 11
        const source = created.sources[0]
        voice.releaseAt(10.2)
        expect(source.calls).toContainEqual({method: 'stop', args: [11.2]})
    })

    it('release() brings a future scheduled release forward so playback stop cannot leave a voice sounding', () => {
        const {voice, created} = makeVoice()
        const source = created.sources[0]
        const gain = created.gains[1]
        voice.releaseAt(20)
        voice.release()
        expect(gain.calls).toContainEqual({method: 'cancelScheduledValues', args: [10]})
        expect(source.calls).toContainEqual({method: 'stop', args: [10.2]})
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
})

const SUSTAIN = {
    release: 0.3,
    loop: {start: 0.1, end: 1.9},
    noteLoops: [null, {start: 0.2, end: 1.2}],
}

/** A real Instrument, force-fed a sustain config and fake audio plumbing (no INSTRUMENTS_DATA entry sustains yet by design). */
function sustainingInstrument() {
    const instrument = new Instrument(INSTRUMENTS[0])
    ;(instrument.instrumentData as any).sustain = SUSTAIN
    const {context, created} = fakeContext()
    instrument.audioContext = context as any
    instrument.volumeNode = (context as any).createGain()
    instrument.buffers = instrument.notes.map(() => FAKE_BUFFER)
    return {instrument, created}
}

describe('Instrument sustain', () => {
    it('supportsSustain reflects the instrument data; every shipped instrument is one-shot', () => {
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
        expect(created.sources[0].loopStart).toBe(0.1) // default region (noteLoops[0] = null)
        expect(created.sources[1].loopStart).toBe(0.2) // per-note override
        instrument.releaseNote(1)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(false)
        //releasing an unheld button is a no-op
        instrument.releaseNote(5)
    })

    it('re-pressing a held button releases the previous voice (retrigger)', () => {
        const {instrument, created} = sustainingInstrument()
        instrument.pressNote(0, 'C')
        instrument.pressNote(0, 'C')
        expect(created.sources.length).toBe(2)
        expect(created.sources[0].calls.some((c: Call) => c.method === 'stop')).toBe(true)
        expect(created.sources[1].calls.some((c: Call) => c.method === 'stop')).toBe(false)
    })

    it('a durationMs press self-releases on the audio timeline and is not registered as held', () => {
        const {instrument, created} = sustainingInstrument()
        const voice = instrument.pressNote(0, 'C', {durationMs: 500})
        expect(voice?.isReleased).toBe(true) // scheduled release counts as released
        expect(created.sources[0].calls).toContainEqual({method: 'stop', args: [10.8]}) // 10 + 0.5 + 0.3 release
        instrument.releaseNote(0) // no live voice to release
        expect(created.sources.length).toBe(1)
    })

    it('releaseAllNotes releases every sounding voice (ramped) or hard-stops on teardown', () => {
        const {instrument, created} = sustainingInstrument()
        instrument.pressNote(0, 'C')
        instrument.pressNote(1, 'C')
        instrument.releaseAllNotes()
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

    it('same-id overlapping notes close LIFO and already-closed notes are skipped', () => {
        vi.setSystemTime(2000_000)
        const recording = new Recording()
        recording.addNote(60)
        vi.setSystemTime(2000_200)
        recording.addNote(60)
        vi.setSystemTime(2000_500)
        recording.releaseNote(60) // closes the SECOND press (300ms)
        expect(recording.notes[1].duration).toBe(300)
        expect(recording.notes[0].duration).toBe(0)
        vi.setSystemTime(2000_900)
        recording.releaseNote(60) // now closes the first: elapsed 1000 - its time 100 = 900
        expect(recording.notes[0].duration).toBe(900)
        //releasing an id with no open notes is a no-op
        recording.releaseNote(99)
    })
})
