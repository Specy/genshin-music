import {afterEach, describe, expect, it, vi} from 'vitest'

/**
 * The vsrg composer renderer's diff, and the capture it diffs (2026-08-06 reactive-model plan,
 * phase 2 step 3b - the phase's own highest-risk change, which shipped with no gate of its own).
 *
 * THE INVARIANT, stated once so the cases below are readable as instances of it:
 *
 *   VsrgComposerRenderer.update() decides what to recalculate by comparing the state it was handed
 *   LAST TIME against the one it was handed THIS time. That only means anything if each state is a
 *   MOMENT - values taken out of the song when the canvas was told something changed. A field
 *   reached through a shared live song is the same value on both sides of the comparison, so the
 *   branch it gates is permanently false: not wrong-looking, not slow, just silently never taken.
 *
 * That is not hypothetical. Before phase 2 the state carried the VsrgSong itself and the diff read
 * `previous.vsrg.bpm !== next.vsrg.bpm` / `previous.vsrg.tracks[i].color`; it worked only because
 * refreshVsrg() replaced the song with a clone after every edit. Deleting the clone (the point of
 * the phase) would have frozen `sizes` on a bpm or key change and the texture cache on a track
 * recolour - nothing would have thrown, the canvas would just have kept painting the previous
 * geometry with the previous textures. Reintroducing that shape while writing this file failed every
 * row below that diffs a song field, plus one of the snapshot tests; leaving the shape in and only
 * removing this file failed nothing.
 *
 * So there are two halves here, and they fail on different mistakes:
 *  - the RECALCULATION TABLE drives the real renderer with ONE stable VsrgSong instance and asserts
 *    which recalculation each kind of change reaches. It fails if a diffed field goes back to being
 *    read through the song.
 *  - the SNAPSHOT tests are about the capture rather than the diff: a field ADDED to
 *    VsrgSongRenderState later must not be a view onto the song either. They do not enumerate the
 *    fields, but they are not unlimited either - the two things they do NOT see are stated at that
 *    describe block.
 *
 * Observation is indirect because the recalculations are private, and each channel is observed by
 * something only that recalculation does:
 *  - `renderer.resize` is called by calculateSizes and nothing else;
 *  - `renderer.generateTexture` by the cache build and nothing else;
 *  - clearing a pixi Container is done by the draw path and nothing else, and each of the three
 *    scene containers is cleared by the draw that owns it (drawKeys clears the keys container
 *    unconditionally; the tracks and timeline containers are cleared by their own draw, or by the
 *    branch that empties them when there is no cache). So they are counted SEPARATELY, per
 *    container: "what did it draw", not "did draw() run". That distinction is the whole value of
 *    this channel - a gate added inside draw() ("skip repainting the tracks while the graph has not
 *    moved") shows up as one column dropping to 0 while the others stay at 1, and a gate written
 *    against a field reached through the stable song is precisely this file's bug class. Collapsed
 *    to one boolean, such a gate was invisible here.
 *  - `ThrottledEventLoop.changeMaxFps` by update()'s maxFps branch. It is the one decision that
 *    recalculates nothing and draws nothing, so the three channels above cannot see it at all, and
 *    it went uncovered until a review sabotaged it and the suite stayed green.
 * calculateSizes() ends in generateCache(), which ends in draw(), so the branches nest: "sizes"
 * implies "cache" implies "draw", and update() draws unconditionally today, which is why every row
 * below expects all three scenes drawn once. A row expecting anything else would mean a real gate
 * had been added to that branch - a deliberate table edit, not something that can happen quietly.
 */

const pixi = vi.hoisted(() => {
    class FakeTexture {
        destroy() {}
    }

    class FakeContainer {
        children: FakeContainer[] = []
        eventMode = 'none'
        hitArea: unknown
        visible = true
        x = 0
        y = 0
        width = 0
        height = 0
        angle = 0
        //assigned, not called: the vsrg renderer writes `sprite.anchor = 0.5` and
        //`trail.anchor = {x: 0, y: 0.5}`, so this has to be a plain writable field
        anchor: unknown = 0
        //how the DRAW branch is observed, PER CONTAINER - see this file's header. A draw clears the
        //scene it is about to rebuild, and nothing outside the draw path clears one, so a delta on
        //this counter means "the draw that owns this container ran".
        clears = 0
        //every event this container was subscribed to; the harness reads it off the stage's own
        //children to tell the three scene containers apart without depending on their order
        readonly listeners: string[] = []

        addChild<T extends FakeContainer>(...children: T[]): T {
            this.children.push(...children)
            return children[0]
        }

        removeChildren(): FakeContainer[] {
            this.clears++
            const children = this.children
            this.children = []
            return children
        }

        on(event: string) {
            this.listeners.push(event)
            return this
        }

        destroy() {}
    }

    class FakeGraphics extends FakeContainer {
        clear() { return this }
        rect() { return this }
        roundRect() { return this }
        circle() { return this }
        moveTo() { return this }
        lineTo() { return this }
        fill() { return this }
        stroke() { return this }
    }

    class FakeSprite extends FakeContainer {
        constructor(_texture: FakeTexture) {
            super()
        }
    }

    class FakeText extends FakeContainer {
        constructor(_options: unknown) {
            super()
        }
    }

    class FakeTextStyle {
        constructor(_options: unknown) {}
    }

    class FakeRectangle {
        constructor(_x: number, _y: number, _width: number, _height: number) {}
    }

    const applications: FakeApplication[] = []

    class FakeApplication {
        readonly canvas = document.createElement('canvas')
        readonly stage = new FakeContainer()
        readonly renderer = {
            background: {color: 0},
            resize: vi.fn(),
            generateTexture: vi.fn(() => new FakeTexture()),
        }

        constructor() {
            applications.push(this)
        }

        //no ticker: this fake renders nothing, and the counters below are the only observation
        async init() {}

        destroy() {}
    }

    /**
     * The three persistent scene containers, told apart by what init() DOES to each rather than by
     * the order it adds them to the stage: the timeline is the one it subscribes to pointer events,
     * the scrollable tracks are interactive with no listeners of their own, and the keys are what is
     * left. The addChild order is a z-order requirement (see the renderer's container declarations),
     * so a reorder is a legitimate change that must not silently relabel the columns below - hence
     * the throw rather than an index.
     */
    function findScenes(stage: FakeContainer) {
        const timeline = stage.children.filter(child => child.listeners.length > 0)
        const tracks = stage.children.filter(
            child => child.listeners.length === 0 && child.eventMode === 'static'
        )
        const keys = stage.children.filter(
            child => child.listeners.length === 0 && child.eventMode !== 'static'
        )
        if (stage.children.length !== 3 || timeline.length !== 1 || tracks.length !== 1 || keys.length !== 1) {
            throw new Error('the stage no longer holds one keys, one tracks and one timeline container')
        }
        return {keys: keys[0], tracks: tracks[0], timeline: timeline[0]}
    }

    return {
        Application: FakeApplication,
        Container: FakeContainer,
        Graphics: FakeGraphics,
        Rectangle: FakeRectangle,
        Sprite: FakeSprite,
        Text: FakeText,
        TextStyle: FakeTextStyle,
        Texture: FakeTexture,
        applications,
        findScenes,
    }
})

vi.mock('pixi.js', () => pixi)

//jsdom has no font loading; the renderer's own .catch() swallows this, which is what happens in a
//browser that fails to load Bonobo too
vi.mock('fontfaceobserver', () => ({
    default: class {
        load() {
            return Promise.reject(new Error('no font loading in jsdom'))
        }
    },
}))

import {INSTRUMENTS, VsrgSong} from './imports'
import {assertNoLiveAliasing} from './noAliasing'
import {captureVsrgSongState} from '$cmp/pages/VsrgComposer/vsrgSongRenderState'
import {ThrottledEventLoop} from '$core/ThrottledEventLoop'
import {
    VsrgComposerRenderer,
    type VsrgComposerRendererState,
} from '$cmp/pages/VsrgComposer/VsrgComposerRenderer'

/** Two tracks with different colours, a hit object, and room past every timestamp. */
function makeSong(): VsrgSong {
    const song = new VsrgSong('renderer diff')
    song.bpm = 120
    song.duration = 10000
    song.addTrack(INSTRUMENTS[0])
    song.addTrack(INSTRUMENTS[0])
    song.createHitObjectInTrack(0, 1000, 0)
    return song
}

/** The non-song half of the renderer's state: this page's own props, mutated by a case. */
function makeProps() {
    return {
        isHorizontal: true,
        isPlaying: false,
        snapPoint: 1,
        scrollSnap: false,
        snapPoints: [0, 1000, 2000],
        selectedHitObject: null,
        audioSong: null,
        scaling: 60,
        maxFps: 60,
        renderableNotes: [],
        tempoChanger: 1,
    }
}

type Props = ReturnType<typeof makeProps>

/**
 * What draw() repainted, one entry per scene container - the renderer's whole drawing surface, so a
 * scene that was NOT repainted is as visible here as one that was. See this file's header.
 */
interface SceneDraws {
    keys: number
    tracks: number
    timeline: number
}

/** What update() repaints today: all three scenes, once each. A row that differs would say so. */
const EVERY_SCENE: SceneDraws = {keys: 1, tracks: 1, timeline: 1}

interface Harness {
    song: VsrgSong
    props: Props
    /** Push the current song + props at the renderer and report what it recalculated. */
    push(): {sizes: number, cache: number, fps: number, draws: SceneDraws}
    destroy(): void
}

async function mount(): Promise<Harness> {
    const song = makeSong()
    const props = makeProps()
    const state = (): VsrgComposerRendererState => ({...captureVsrgSongState(song), ...props})
    const container = document.createElement('div')
    document.body.appendChild(container)
    const renderer = new VsrgComposerRenderer(container, state(), {
        onKeyDown: () => {},
        onKeyUp: () => {},
        onAddTime: () => {},
        onRemoveTime: () => {},
        onTimestampChange: () => {},
        onSnapPointSelect: () => {},
        dragHitObject: () => {},
        releaseHitObject: () => {},
        selectHitObject: () => {},
    })
    await renderer.init()
    //update()'s FOURTH decision. The other three land on the pixi fake, but maxFps goes to a real
    //ThrottledEventLoop the renderer owns privately, so the prototype method is the seam. It is
    //spied after init() so the constructor's own call is not counted as a diff result.
    const changeMaxFps = vi.spyOn(ThrottledEventLoop.prototype, 'changeMaxFps')
    const app = pixi.applications[pixi.applications.length - 1]
    const scenes = pixi.findScenes(app.stage)
    return {
        song,
        props,
        push() {
            const resizes = app.renderer.resize.mock.calls.length
            const textures = app.renderer.generateTexture.mock.calls.length
            const fpsCalls = changeMaxFps.mock.calls.length
            const cleared = {keys: scenes.keys.clears, tracks: scenes.tracks.clears, timeline: scenes.timeline.clears}
            renderer.update(state())
            return {
                sizes: app.renderer.resize.mock.calls.length - resizes,
                //the cache build calls generateTexture many times per pass; only "did it rebuild"
                //is being asserted, so collapse the count to 0 or 1
                cache: app.renderer.generateTexture.mock.calls.length > textures ? 1 : 0,
                fps: changeMaxFps.mock.calls.length - fpsCalls,
                //NOT collapsed, unlike the two above: how many times each scene was repainted is
                //the observation, so a skipped scene reads as 0 and a scene drawn twice reads as 2
                draws: {
                    keys: scenes.keys.clears - cleared.keys,
                    tracks: scenes.tracks.clears - cleared.tracks,
                    timeline: scenes.timeline.clears - cleared.timeline,
                },
            }
        },
        destroy() {
            changeMaxFps.mockRestore()
            renderer.destroy()
            container.remove()
        },
    }
}

afterEach(() => {
    pixi.applications.length = 0
    document.body.replaceChildren()
})

interface RecalculationCase {
    what: string
    /** ONE stable song instance and one props object - the same two the harness already pushed. */
    change: (song: VsrgSong, props: Props) => void
    /** calculateSizes(), which also rebuilds the cache and draws. */
    sizes: boolean
    /** generateCache(), which also draws. */
    cache: boolean
    /** ThrottledEventLoop.changeMaxFps(), update()'s fourth decision and the only one that draws nothing. */
    fps: boolean
    /**
     * draw(), per scene, reached either through the two above or on its own. EVERY_SCENE on every
     * row today because update() ends in an unconditional draw() that repaints all three - see this
     * file's header for why that is worth pinning rather than leaving implied.
     */
    draws: SceneDraws
}

const RECALCULATIONS: RecalculationCase[] = [
    {
        //`sizes.snapPointWidth` is 60000 / bpm / snapPoint * scaling; a bpm edit that does not
        //recalculate leaves the whole grid spaced for the old tempo
        what: 'the bpm changes',
        change: song => song.set({bpm: 200}),
        sizes: true,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //the fourth input of needsSizes, and the one this table was missing: snapPointWidth is
        //60000 / bpm / snapPoint * scaling, so a snap-point change that does not recalculate leaves
        //the grid spaced for the previous subdivision - the same failure as the bpm row, reached
        //from the page's own props instead of from the song
        what: 'the snap point changes',
        change: (_song, props) => {
            props.snapPoint = 2
        },
        sizes: true,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //keyHeight/keyWidth are height/keys - a key-count change that does not recalculate draws
        //4 lanes' worth of geometry for a 6-key song
        what: 'the key count changes',
        change: song => song.changeKeys(6),
        sizes: true,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //not a song field at all, but it shares the diff: the textures are baked per orientation
        what: 'the orientation changes',
        change: (_song, props) => {
            props.isHorizontal = false
        },
        sizes: false,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //THE case the `trackColors` field exists for: VsrgTrackSettings mutates the VsrgTrack in
        //place and hands the same object back, so nothing that compares track objects - or reads a
        //colour through them - can see this at all
        what: 'a track is recoloured in place',
        change: song => song.setTrack(0, song.tracks[0].set({color: '#123456'})),
        sizes: false,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //a second `trackColors` case, and the one that decides whether hit objects get their own
        //texture or VsrgCanvasCache's '#FF0000' fallback
        what: 'a track is added',
        change: song => void song.addTrack(INSTRUMENTS[0]),
        sizes: false,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        what: 'the scaling changes',
        change: (_song, props) => {
            props.scaling = 120
        },
        sizes: true,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //the row that makes the others mean something: update() always draws, so without this one
        //"it recalculated" would be indistinguishable from "it was called"
        what: 'a hit object is added (structure only)',
        change: song => void song.createHitObjectInTrack(1, 2000, 1),
        sizes: false,
        cache: false,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //the OTHER half of needsCache's trackColors test. The recolour and track-add rows above
        //both pin the element-wise compare; nothing pinned the length compare, so dropping it
        //passed the whole suite. Deleting the last track shrinks the array without changing any
        //surviving element - the one edit only the length clause can see
        what: 'the last track is deleted',
        change: song => song.deleteTrack(song.tracks.length - 1),
        sizes: false,
        cache: true,
        fps: false,
        draws: EVERY_SCENE,
    },
    {
        //update()'s first decision, and the only one that recalculates nothing and draws nothing -
        //so it is invisible to the three channels above and had no coverage at all
        what: 'the max fps changes',
        change: (_song, props) => {
            props.maxFps = 30
        },
        sizes: false,
        cache: false,
        fps: true,
        draws: EVERY_SCENE,
    },
    {
        what: 'nothing changed',
        change: () => {},
        sizes: false,
        cache: false,
        fps: false,
        draws: EVERY_SCENE,
    },
]

describe('VsrgComposerRenderer recalculates from a diff of two moments, on one stable song', () => {
    for (const testCase of RECALCULATIONS) {
        const {keys, tracks, timeline} = testCase.draws
        const expected = `sizes=${testCase.sizes} cache=${testCase.cache} fps=${testCase.fps}`
            + ` draws=keys:${keys} tracks:${tracks} timeline:${timeline}`
        it(`${testCase.what}: ${expected}`, async () => {
            const harness = await mount()
            try {
                //the baseline push: whatever init() did is behind us, and `previous` now holds the
                //pre-change moment. The song instance never changes from here on - that is the
                //condition the whole file is about
                harness.push()
                testCase.change(harness.song, harness.props)
                const recalculated = harness.push()
                expect(recalculated).toEqual({
                    sizes: testCase.sizes ? 1 : 0,
                    cache: testCase.cache ? 1 : 0,
                    fps: testCase.fps ? 1 : 0,
                    draws: testCase.draws,
                })
            } finally {
                harness.destroy()
            }
        })
    }
})

/**
 * The other half: the capture, independent of what the renderer happens to diff today.
 *
 * `captureVsrgSongState` is where a future field would be added, so these are written against the
 * SHAPE of its result rather than against the names in it. Two limits, precisely, because "field-
 * list-independent" reads wider than what this actually does:
 *  - it sees OBJECT identity. A value - a primitive, or a freshly built array - cannot be a view
 *    onto the song, so there is nothing here to check on one; equally, nothing here says a captured
 *    value is the RIGHT value, or was read at the right moment. That is the recalculation table's
 *    half.
 *  - it sees `captureVsrgSongState`'s own return value. A field the canvas reads off the song and
 *    puts on VsrgComposerRendererState directly, going around the capture, is invisible from here -
 *    the rule against that lives in VsrgComposerCanvas.svelte's $effect docstring, next to the code
 *    that would break it.
 */
describe('a captured song state is a moment, not a view onto the song', () => {
    it('holds no live model object except the references that document why', () => {
        const song = makeSong()
        const {tracks, breakpoints, ...captured} = captureVsrgSongState(song)
        //exemption 1: `tracks` IS the song's array, deliberately - the renderer wants the current
        //graph, and `structure` is what it would diff
        expect(tracks).toBe(song.tracks)
        //exemption 2: `breakpoints` is `$state.raw` and its installer assigns, so holding the
        //reference is holding a snapshot. The test below is what makes that true rather than said
        expect(breakpoints).toBe(song.breakpoints)
        //everything else must be a value or a fresh array. There is nothing here to catch TODAY -
        //that is the point: this fails the day a field is added that reads through the song
        assertNoLiveAliasing('captureVsrgSongState', song, captured)
        //...and it is not vacuous. This is the exact shape it exists to reject - the state carrying
        //the VsrgSong itself, which is what the diff read through before phase 2
        expect(() => assertNoLiveAliasing('probe', song, {...captured, vsrg: song})).toThrow()
    })

    it('the exempted `breakpoints` reference: setting one REPLACES the array, it is not edited', () => {
        const song = makeSong()
        const captured = captureVsrgSongState(song)
        song.setBreakpoint(2000, true)
        expect(captured.breakpoints).toEqual([])
        expect(song.breakpoints).toEqual([2000])
    })

    it('the exempted `tracks` reference is covered by `structure`, which does move', () => {
        const song = makeSong()
        const before = captureVsrgSongState(song)
        song.createHitObjectInTrack(0, 3000, 2)
        const after = captureVsrgSongState(song)
        //the identity comparison a diff would reach for first, and why it is not the one to use
        expect(after.tracks).toBe(before.tracks)
        expect(after.structure).not.toBe(before.structure)
    })
})
