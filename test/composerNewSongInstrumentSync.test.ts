import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {beforeEach, describe, expect, it, vi} from 'vitest'

type FakeInstrumentHandle = {
    name: string
    endNode: object | null
    volume: number
    reverbOverride: boolean | null
    disposed: boolean
    loaded: boolean
    connected: number
}

type PendingLoad = {
    instrument: FakeInstrumentHandle
    resolve: (loaded: boolean) => void
}

const fakes = vi.hoisted(() => ({
    instances: [] as FakeInstrumentHandle[],
    pendingLoads: [] as PendingLoad[],
}))

vi.mock('../src/lib/audio/Instrument.svelte', () => {
    class FakeInstrument implements FakeInstrumentHandle {
        endNode: object | null = {}
        volume = -1
        reverbOverride: boolean | null = null
        disposed = false
        loaded = false
        connected = 0

        constructor(public name: string) {
            fakes.instances.push(this)
        }

        load() {
            return new Promise<boolean>(resolve => {
                fakes.pendingLoads.push({
                    instrument: this,
                    resolve: loaded => {
                        this.loaded = true
                        resolve(loaded)
                    },
                })
            })
        }

        changeVolume(volume: number) {
            this.volume = volume
        }

        dispose() {
            this.disposed = true
            this.endNode = null
        }
    }

    return {Instrument: FakeInstrument}
})

import {InstrumentData} from '../src/lib/core/Songs/SongClasses'
import {Instrument} from '../src/lib/audio/Instrument.svelte'
import {AudioProvider} from '../src/lib/providers/AudioProvider'
import {ComposerInstrumentSynchronizer} from '../src/lib/components/pages/Composer/ComposerInstrumentSynchronizer'
import {INSTRUMENTS} from './imports'

// Composer owns two parallel representations of its layer roster: song.instruments renders the
// controls, while layers contains the loaded audio engines. The project has no component harness
// which replaces Composer's audio/canvas/service graph, so pin this lifecycle boundary at the AST
// level: replacing the song must be followed by synchronizing the loaded engines to that exact
// replacement rather than leaving the previous song's layers alive.
const component = readFileSync('src/lib/components/pages/Composer/Composer.svelte', 'utf8')
const instanceScript = component.match(/<script lang="ts">([\s\S]*?)<\/script>/)?.[1]
if (!instanceScript) throw new Error('Composer.svelte has no TypeScript instance script')
const source = ts.createSourceFile('Composer.svelte.ts', instanceScript, ts.ScriptTarget.Latest, true)

function functionDeclaration(name: string): ts.FunctionDeclaration {
    const declaration = source.statements.find(
        (statement): statement is ts.FunctionDeclaration =>
            ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    )
    if (!declaration) throw new Error(`Composer.svelte has no ${name} function`)
    return declaration
}

describe('Composer new-song instrument synchronization', () => {
    beforeEach(() => {
        fakes.instances.length = 0
        fakes.pendingLoads.length = 0
        vi.restoreAllMocks()
        vi.spyOn(AudioProvider, 'getAudioContext').mockReturnValue({} as AudioContext)
        vi.spyOn(AudioProvider, 'disconnect').mockImplementation(() => AudioProvider)
        vi.spyOn(AudioProvider, 'connect').mockImplementation((node, reverbOverride) => {
            const instrument = fakes.instances.find(instance => instance.endNode === node)
            if (instrument) {
                instrument.connected++
                instrument.reverbOverride = reverbOverride
            }
            return AudioProvider
        })
        vi.spyOn(AudioProvider, 'setReverbOfNode').mockImplementation((node, reverbOverride) => {
            const instrument = fakes.instances.find(instance => instance.endNode === node)
            if (instrument) instrument.reverbOverride = reverbOverride
            return undefined
        })
    })

    it('synchronizes loaded audio layers after installing the newly-created song', () => {
        const declaration = functionDeclaration('createNewSong')
        let replacementPosition = -1
        let synchronizationPosition = -1

        const visit = (node: ts.Node) => {
            if (
                ts.isBinaryExpression(node) &&
                node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                ts.isIdentifier(node.left) &&
                node.left.text === 'song' &&
                ts.isIdentifier(node.right) &&
                node.right.text === 'added'
            ) {
                replacementPosition = node.getStart(source)
            }
            if (
                ts.isCallExpression(node) &&
                ts.isIdentifier(node.expression) &&
                node.expression.text === 'syncInstruments' &&
                node.arguments.length === 1 &&
                ts.isIdentifier(node.arguments[0]) &&
                node.arguments[0].text === 'added'
            ) {
                synchronizationPosition = node.getStart(source)
            }
            ts.forEachChild(node, visit)
        }
        visit(declaration)

        expect(replacementPosition).toBeGreaterThanOrEqual(0)
        expect(synchronizationPosition).toBeGreaterThan(replacementPosition)
    })

    it('keeps new-song defaults when an older async song sync finishes last', async () => {
        const defaultName = INSTRUMENTS[0]
        const oldName = INSTRUMENTS.find(name => name !== defaultName)
        if (!oldName) throw new Error('Instrument sync regression needs two configured instruments')

        let layers: Instrument[] = [new Instrument(defaultName)]
        const publish = vi.fn((nextLayers: Instrument[]) => {
            layers = nextLayers
        })
        const onSynced = vi.fn()
        const synchronizer = new ComposerInstrumentSynchronizer({
            getLayers: () => layers,
            setLayers: publish,
            isMounted: () => true,
            onLoadError: vi.fn(),
            onSynced,
        })

        // The outgoing song has cold loads in flight. Its middle layer deliberately has the same
        // name as the new default roster, proving that a newer request can adopt a pending engine
        // and still apply its own settings when the stale creator eventually resumes.
        const olderSync = synchronizer.sync([
            new InstrumentData({name: oldName, volume: 20, reverbOverride: true}),
            new InstrumentData({name: defaultName, volume: 17, reverbOverride: true}),
            new InstrumentData({name: oldName, volume: 30, reverbOverride: true}),
        ])
        const outgoingLayers = [...layers] as unknown as FakeInstrumentHandle[]

        const defaults = [0, 1, 2].map(
            () => new InstrumentData({name: defaultName, volume: 90, reverbOverride: false}),
        )
        const latestSync = synchronizer.sync(defaults)
        const defaultLayers = [...layers] as unknown as FakeInstrumentHandle[]

        // Let every engine owned by the NEW request load first, including the same-name middle
        // engine which the old request originally created. The new roster must publish now.
        defaultLayers.forEach(instrument => resolveLoad(instrument))
        await latestSync

        expect(layers.map(instrument => instrument.name)).toEqual([
            defaultName,
            defaultName,
            defaultName,
        ])
        expect(defaultLayers.every(instrument => instrument.volume === 90)).toBe(true)
        expect(defaultLayers.every(instrument => instrument.reverbOverride === false)).toBe(true)
        expect(defaultLayers.every(instrument => instrument.connected === 1)).toBe(true)
        expect(publish).toHaveBeenCalledTimes(1)
        expect(onSynced).toHaveBeenCalledTimes(1)

        // The two non-default cold loads from the outgoing song finish last. They were disposed by
        // the new request and must not be reconnected or published over its three defaults.
        outgoingLayers
            .filter(instrument => !defaultLayers.includes(instrument))
            .forEach(instrument => resolveLoad(instrument))
        await olderSync

        expect(layers as unknown as FakeInstrumentHandle[]).toEqual(defaultLayers)
        expect(
            outgoingLayers
                .filter(instrument => !defaultLayers.includes(instrument))
                .every(instrument => instrument.disposed && instrument.connected === 0),
        ).toBe(true)
        expect(publish).toHaveBeenCalledTimes(1)
        expect(onSynced).toHaveBeenCalledTimes(1)
    })
})

function resolveLoad(instrument: FakeInstrumentHandle, loaded = true) {
    const index = fakes.pendingLoads.findIndex(pending => pending.instrument === instrument)
    if (index === -1) throw new Error(`No pending load for ${instrument.name}`)
    fakes.pendingLoads.splice(index, 1)[0].resolve(loaded)
}
