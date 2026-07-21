// AudioPlayer.syncInstruments diffing logic - split out from test/audioModels.test.ts (see that
// file's header comment for why): AudioPlayer.ts has no constructor-injection point for
// Instrument/AudioProvider (both are module-level imports it uses directly), so per the brief's
// "module mock" option, `$lib/audio/Instrument.svelte` is replaced with a lightweight fake class
// (`vi.mock` is file-scoped/hoisted - it only affects THIS file's module graph, so it's safe here
// in its own dedicated file). `AudioProvider` itself is NOT module-mocked: it's a plain singleton
// object whose methods are ordinary own-properties, so `vi.spyOn` on the real instance is enough
// (no need to replace the whole module) and it stays the real object elsewhere if anything else
// in this file's module graph touches it.
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {AudioProvider} from '../src/lib/providers/AudioProvider'
import {AudioPlayer} from '../src/lib/audio/AudioPlayer'
import {InstrumentData} from '../src/lib/core/Songs/SongClasses'

type FakeInstrumentHandle = {
    name: string
    endNode: object
    volume: number
    reverbOverride: boolean | null
    disposed: boolean
    loaded: boolean
}
const fakeInstrumentInstances: FakeInstrumentHandle[] = []

vi.mock('../src/lib/audio/Instrument.svelte', () => {
    class FakeInstrument {
        name: string
        endNode = {}
        volume = -1
        reverbOverride: boolean | null = null
        disposed = false
        loaded = false

        constructor(name: string) {
            this.name = name
            fakeInstrumentInstances.push(this as unknown as FakeInstrumentHandle)
        }

        async load() {
            this.loaded = true
            return true
        }

        changeVolume(v: number) {
            this.volume = v
        }

        dispose() {
            this.disposed = true
        }
    }
    return {Instrument: FakeInstrument}
})

// `instrument.endNode` is a SEPARATE plain object ({}) from the FakeInstrument handle itself
// (mirroring the real Instrument, whose `endNode` getter returns a GainNode, not `this`) - the
// connect/setReverbOfNode spies below look the owning handle up by endNode identity rather than
// writing onto the endNode object itself.
function findHandleByEndNode(node: object | null): FakeInstrumentHandle | undefined {
    return fakeInstrumentInstances.find(h => h.endNode === node)
}

describe('AudioPlayer.syncInstruments diffing', () => {
    beforeEach(() => {
        fakeInstrumentInstances.length = 0
        vi.spyOn(AudioProvider, 'getAudioContext').mockReturnValue({} as AudioContext)
        vi.spyOn(AudioProvider, 'connect').mockImplementation((node, reverbOverride) => {
            const handle = findHandleByEndNode(node)
            if (handle) handle.reverbOverride = reverbOverride
            return AudioProvider
        })
        vi.spyOn(AudioProvider, 'disconnect').mockImplementation(() => AudioProvider)
        vi.spyOn(AudioProvider, 'setReverbOfNode').mockImplementation((node, reverbOverride) => {
            const handle = findHandleByEndNode(node)
            if (handle) handle.reverbOverride = reverbOverride
            return undefined
        })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('constructs a new wrapper per entry on first sync, applying volume/reverb', async () => {
        const player = new AudioPlayer('C')
        await player.syncInstruments([
            new InstrumentData({name: 'A', volume: 50, reverbOverride: true}),
            new InstrumentData({name: 'B', volume: 80, reverbOverride: false}),
        ])
        expect(player.audioInstruments).toHaveLength(2)
        expect(fakeInstrumentInstances).toHaveLength(2)
        const [a, b] = player.audioInstruments as unknown as FakeInstrumentHandle[]
        expect(a.name).toBe('A')
        expect(a.volume).toBe(50)
        expect(a.reverbOverride).toBe(true)
        expect(b.name).toBe('B')
        expect(b.volume).toBe(80)
        expect(b.reverbOverride).toBe(false)
    })

    it('keeps the same wrapper (no new Instrument) and just updates volume/reverb when the name is unchanged', async () => {
        const player = new AudioPlayer('C')
        await player.syncInstruments([new InstrumentData({name: 'A', volume: 50, reverbOverride: null})])
        const wrapperBefore = player.audioInstruments[0]
        expect(fakeInstrumentInstances).toHaveLength(1)

        await player.syncInstruments([new InstrumentData({name: 'A', volume: 90, reverbOverride: true})])

        expect(player.audioInstruments[0]).toBe(wrapperBefore)
        expect(fakeInstrumentInstances).toHaveLength(1) // still just the one wrapper ever constructed
        const handle = wrapperBefore as unknown as FakeInstrumentHandle
        expect(handle.volume).toBe(90)
        expect(handle.reverbOverride).toBe(true)
    })

    it('disposes and replaces the wrapper when the instrument name changes at the same position', async () => {
        const player = new AudioPlayer('C')
        await player.syncInstruments([new InstrumentData({name: 'A', volume: 50})])
        const oldHandle = player.audioInstruments[0] as unknown as FakeInstrumentHandle

        await player.syncInstruments([new InstrumentData({name: 'B', volume: 50})])

        expect(oldHandle.disposed).toBe(true)
        expect(fakeInstrumentInstances).toHaveLength(2)
        expect((player.audioInstruments[0] as unknown as FakeInstrumentHandle).name).toBe('B')
    })

    it('trims and disposes excess wrappers when fewer instruments are synced', async () => {
        const player = new AudioPlayer('C')
        await player.syncInstruments([
            new InstrumentData({name: 'A', volume: 50}),
            new InstrumentData({name: 'B', volume: 50}),
        ])
        const extra = player.audioInstruments[1] as unknown as FakeInstrumentHandle

        await player.syncInstruments([new InstrumentData({name: 'A', volume: 50})])

        expect(player.audioInstruments).toHaveLength(1)
        expect(extra.disposed).toBe(true)
    })

    it('destroy() disconnects and disposes every wrapper', async () => {
        const player = new AudioPlayer('C')
        await player.syncInstruments([
            new InstrumentData({name: 'A', volume: 50}),
            new InstrumentData({name: 'B', volume: 50}),
        ])
        const handles = player.audioInstruments as unknown as FakeInstrumentHandle[]

        player.destroy()

        expect(handles.every(h => h.disposed)).toBe(true)
        expect(AudioProvider.disconnect).toHaveBeenCalledTimes(2)
    })
})
