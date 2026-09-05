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
 *  - `Application.render` by draw() and nothing else, which is what `autoStart: false` made
 *    observable at all: the canvas no longer renders on pixi's own ticker, so a render IS a draw;
 *  - clearing the KEYS container by drawKeys, which is the one scene still rebuilt wholesale;
 *  - `ThrottledEventLoop.changeMaxFps` by update()'s maxFps branch. It is the one decision that
 *    recalculates nothing and draws nothing, so the channels above cannot see it at all, and
 *    it went uncovered until a review sabotaged it and the suite stayed green.
 * calculateSizes() ends in generateCache(), which ends in draw(), so the branches nest: "sizes"
 * implies "cache" implies "draw", and update() draws unconditionally today, which is why every row
 * below expects exactly one render. A row expecting anything else would mean a real gate had been
 * added to that branch - a deliberate table edit, not something that can happen quietly.
 *
 * THE `draws` COLUMN USED TO BE THREE NUMBERS - one per scene container, read off `removeChildren()`
 * - and the pooling pass (2026-08-30) retired two of them, which is the table edit that header
 * paragraph anticipated. The tracks and timeline scenes are now painted from slot pools that
 * construct nothing and clear nothing on a steady-state frame, so "did that scene's draw run" has
 * no structural signature left and, more to the point, stopped being the interesting question: a
 * pooled draw is cheap and idempotent, and what matters is what ends up on screen. What replaces
 * them:
 *  - `renders`, which says the draw path ran at all, on every row;
 *  - `keys`, which is now a real gate rather than an unconditional 1 - the keys are painted from
 *    their own signature (orientation, key count, canvas geometry, playbar offset, theme, font),
 *    so a row where they rebuild is a row where one of those moved, and every other row must be 0
 *    or the per-frame text rasterization this pass removed has come back;
 *  - THE POOL BLOCK at the bottom of this file, which is where "the scene was repainted without
 *    being rebuilt" is actually pinned: it drives the renderer over a moving window twice and
 *    asserts the second pass constructs and destroys nothing.
 */

/**
 * How the POOL is observed: a display object built after the harness has mounted means a pool grew,
 * one destroyed means a pool was thrown away. The renderer builds its persistent scene containers
 * and its per-pool layers in field initialisers and in init(), so everything constructed from the
 * first draw onwards is either pool growth or the keys scene being rebuilt - and the keys are the
 * only Graphics and, once the end-of-song buttons are off screen, the only Text.
 *
 * Sprites, Texts and Graphics each un-count the Container their own constructor ran, so the four
 * numbers partition rather than overlap.
 */
const counters = vi.hoisted(() => ({
    constructed: {containers: 0, sprites: 0, texts: 0, graphics: 0},
    destroyed: {containers: 0, sprites: 0, texts: 0, graphics: 0},
    reset() {
        this.constructed = {containers: 0, sprites: 0, texts: 0, graphics: 0}
        this.destroyed = {containers: 0, sprites: 0, texts: 0, graphics: 0}
    },
}))

const NOTHING_BUILT = {containers: 0, sprites: 0, texts: 0, graphics: 0}

const pixi = vi.hoisted(() => {
    class FakeTexture {
        destroy() {}
    }

    class FakeContainer {
        children: FakeContainer[] = []
        //pixi's own default, and the distinction the hit-testing assertion below rests on: 'passive'
        //is still hit-tested and resolves to the nearest interactive ancestor, while 'none' is
        //pruned and lets the click reach whatever is behind it
        eventMode = 'passive'
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

        constructor() {
            counters.constructed.containers++
        }

        addChild<T extends FakeContainer>(...children: T[]): T {
            this.children.push(...children)
            return children[0]
        }

        removeChild<T extends FakeContainer>(child: T): T {
            const index = this.children.indexOf(child)
            if (index !== -1) this.children.splice(index, 1)
            return child
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

        //`children: true` recurses the way pixi's does, so a pool destroying one view container
        //un-counts every sprite inside it and the two halves of the counter stay comparable
        destroy(options?: {children?: boolean}) {
            counters.destroyed.containers++
            if (options?.children) {
                const children = this.children
                this.children = []
                for (const child of children) child.destroy(options)
            }
        }
    }

    class FakeGraphics extends FakeContainer {
        constructor() {
            super()
            counters.constructed.containers--
            counters.constructed.graphics++
        }

        override destroy(options?: {children?: boolean}) {
            super.destroy(options)
            counters.destroyed.containers--
            counters.destroyed.graphics++
        }

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
        //optional: the pooled sprites are constructed empty and given their texture by the paint
        constructor(_texture?: FakeTexture) {
            super()
            counters.constructed.containers--
            counters.constructed.sprites++
        }

        override destroy(options?: {children?: boolean}) {
            super.destroy(options)
            counters.destroyed.containers--
            counters.destroyed.sprites++
        }
    }

    class FakeText extends FakeContainer {
        constructor(_options: unknown) {
            super()
            counters.constructed.containers--
            counters.constructed.texts++
        }

        override destroy(options?: {children?: boolean}) {
            super.destroy(options)
            counters.destroyed.containers--
            counters.destroyed.texts++
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
        initOptions: {preference?: string | string[], autoStart?: boolean} | undefined
        //the "did the draw path run" channel. Real pixi would also have this on a ticker; the
        //renderer passes `autoStart: false` precisely so that it does not, which is why counting
        //explicit calls here means anything
        readonly render = vi.fn()

        constructor() {
            applications.push(this)
        }

        //no ticker: this fake renders nothing, and the counters above are the only observation
        async init(options?: {preference?: string | string[], autoStart?: boolean}) {
            this.initOptions = options
        }

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
import {WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS} from '$cmp/pixiContextRecovery'
import {ThrottledEventLoop} from '$core/ThrottledEventLoop'
import {vsrgComposerStore} from '$stores/VsrgComposerStore.svelte'
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

/** What one update() reached. See this file's header for what each channel rides on. */
interface Recalculated {
    sizes: number
    cache: number
    fps: number
    /** drawKeys() rebuilds, which is a GATE now and not an unconditional 1. */
    keys: number
    /** draw() calls, i.e. explicit renders - the "did anything happen at all" channel. */
    renders: number
}

interface Harness {
    song: VsrgSong
    props: Props
    app: FakeApp
    /** Every timestamp the renderer reported, in order - the playback clock's own output. */
    timestamps: number[]
    /** Push the current song + props at the renderer and report what it recalculated. */
    push(): Recalculated
    destroy(): void
}

type FakeApp = (typeof pixi.applications)[number]
type FakeNode = InstanceType<typeof pixi.Container>

/** Everything below `node`, itself excluded - the scenes nest their per-pool layers a level deep. */
function descendants(node: FakeNode): FakeNode[] {
    return node.children.flatMap(child => [child, ...descendants(child)])
}

/** The pooled hit objects in a scene: the only thing in one that carries a `pointerdown`. */
function hitObjectViews(scene: FakeNode): FakeNode[] {
    return descendants(scene).filter(child => child.listeners.includes('pointerdown'))
}

async function mount(): Promise<Harness> {
    const song = makeSong()
    const props = makeProps()
    const timestamps: number[] = []
    const state = (): VsrgComposerRendererState => ({...captureVsrgSongState(song), ...props})
    const container = document.createElement('div')
    document.body.appendChild(container)
    const renderer = new VsrgComposerRenderer(container, state(), {
        onKeyDown: () => {},
        onKeyUp: () => {},
        onAddTime: () => {},
        onRemoveTime: () => {},
        onTimestampChange: (timestamp) => timestamps.push(timestamp),
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
        app,
        timestamps,
        push() {
            const resizes = app.renderer.resize.mock.calls.length
            const textures = app.renderer.generateTexture.mock.calls.length
            const fpsCalls = changeMaxFps.mock.calls.length
            const renders = app.render.mock.calls.length
            const keyClears = scenes.keys.clears
            renderer.update(state())
            return {
                sizes: app.renderer.resize.mock.calls.length - resizes,
                //the cache build calls generateTexture many times per pass; only "did it rebuild"
                //is being asserted, so collapse the count to 0 or 1
                cache: app.renderer.generateTexture.mock.calls.length > textures ? 1 : 0,
                fps: changeMaxFps.mock.calls.length - fpsCalls,
                //NOT collapsed, unlike the cache above: a scene rebuilt twice in one update is as
                //much of a finding as one skipped
                keys: scenes.keys.clears - keyClears,
                renders: app.render.mock.calls.length - renders,
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
    vi.useRealTimers()
    pixi.applications.length = 0
    counters.reset()
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
     * drawKeys(). TRUE on exactly the two rows that move one of the keys' own inputs - the key
     * count and the orientation - and false everywhere else, the cache-rebuilding rows included:
     * the keys borrow nothing from the texture cache, and a row that starts rebuilding them for a
     * scaling or colour change has put a per-frame text rasterization back on the playback path.
     */
    keys: boolean
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
        keys: false,
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
        keys: false,
    },
    {
        //keyHeight/keyWidth are height/keys - a key-count change that does not recalculate draws
        //4 lanes' worth of geometry for a 6-key song
        what: 'the key count changes',
        change: song => song.changeKeys(6),
        sizes: true,
        cache: true,
        fps: false,
        keys: true,
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
        keys: true,
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
        keys: false,
    },
    {
        //a second `trackColors` case, and the one that decides whether hit objects get their own
        //texture or VsrgCanvasCache's '#FF0000' fallback
        what: 'a track is added',
        change: song => void song.addTrack(INSTRUMENTS[0]),
        sizes: false,
        cache: true,
        fps: false,
        keys: false,
    },
    {
        what: 'the scaling changes',
        change: (_song, props) => {
            props.scaling = 120
        },
        sizes: true,
        cache: true,
        fps: false,
        keys: false,
    },
    {
        //the row that makes the others mean something: update() always draws, so without this one
        //"it recalculated" would be indistinguishable from "it was called"
        what: 'a hit object is added (structure only)',
        change: song => void song.createHitObjectInTrack(1, 2000, 1),
        sizes: false,
        cache: false,
        fps: false,
        keys: false,
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
        keys: false,
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
        keys: false,
    },
    {
        what: 'nothing changed',
        change: () => {},
        sizes: false,
        cache: false,
        fps: false,
        keys: false,
    },
]

describe('VsrgComposerRenderer recalculates from a diff of two moments, on one stable song', () => {
    for (const testCase of RECALCULATIONS) {
        const expected = `sizes=${testCase.sizes} cache=${testCase.cache} fps=${testCase.fps}`
            + ` keys=${testCase.keys}`
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
                    keys: testCase.keys ? 1 : 0,
                    //update() ends in an unconditional draw on every row - see this file's header
                    renders: 1,
                })
            } finally {
                harness.destroy()
            }
        })
    }
})

describe('VsrgComposerRenderer context recovery', () => {
    it('suppresses GPU work while lost and rebuilds every generated texture after restoration', async () => {
        const harness = await mount()
        try {
            const app = pixi.applications[pixi.applications.length - 1]
            const texturesBeforeLoss = app.renderer.generateTexture.mock.calls.length
            const resizesBeforeLoss = app.renderer.resize.mock.calls.length
            const lost = new Event('webglcontextlost', {cancelable: true})
            app.canvas.dispatchEvent(lost)

            expect(lost.defaultPrevented).toBe(true)
            expect(harness.push()).toEqual({
                sizes: 0,
                cache: 0,
                fps: 0,
                keys: 0,
                renders: 0,
            })

            app.canvas.dispatchEvent(new Event('webglcontextrestored'))
            expect(app.renderer.resize.mock.calls.length).toBeGreaterThan(resizesBeforeLoss)
            expect(app.renderer.generateTexture.mock.calls.length).toBeGreaterThan(texturesBeforeLoss)
        } finally {
            harness.destroy()
        }
    })

    it('restarts WebGL once before making Canvas the terminal fallback', async () => {
        vi.useFakeTimers()
        const harness = await mount()
        try {
            const original = pixi.applications[pixi.applications.length - 1]
            original.canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true}))
            await vi.advanceTimersByTimeAsync(WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS)

            const restarted = pixi.applications[pixi.applications.length - 1]
            expect(restarted).not.toBe(original)
            expect(restarted.initOptions?.preference).toBe('webgl')

            restarted.canvas.dispatchEvent(new Event('webglcontextlost', {cancelable: true}))
            await vi.advanceTimersByTimeAsync(WEBGL_CONTEXT_RECOVERY_TIMEOUT_MS)

            const fallback = pixi.applications[pixi.applications.length - 1]
            expect(fallback).not.toBe(restarted)
            expect(fallback.initOptions?.preference).toBe('canvas')
        } finally {
            harness.destroy()
        }
    })
})

/**
 * THE POOL, and the two things it is worth having: nothing is built per frame, and nothing renders
 * when nothing happened.
 *
 * Both are stated over a MOVING window rather than a repeated identical draw, because a slot pool
 * that only ever holds the same occupants proves nothing - the interesting frame is the one where
 * the visible set has changed and the pool has to repaint slots instead of rebuilding them. The
 * timestamp is moved through vsrgComposerStore, the seek COMMAND channel, which is the same
 * setTimestamp -> draw path a playback tick takes.
 *
 * Each run drives the SAME sequence twice: the first pass is where the pools grow to their high
 * water mark, and the second is the claim. Comparing two passes over one sequence, rather than
 * asserting an absolute count, is what keeps this independent of the jsdom canvas geometry (which
 * measures 0x0, so how many objects land inside the window is not something to hard-code).
 */
describe('VsrgComposerRenderer paints from pools and renders on demand', () => {
    const WINDOW: number[] = [0, 250, 500, 750, 1000, 1500, 2000, 2500]

    it('reuses its pooled display objects across a moving window instead of rebuilding them', async () => {
        const harness = await mount()
        try {
            counters.reset()
            for (const timestamp of WINDOW) vsrgComposerStore.emitEvent('timestampChange', timestamp)
            //not vacuous: the first pass over the window IS where the pools are built
            expect(counters.constructed.sprites).toBeGreaterThan(0)

            counters.reset()
            for (const timestamp of WINDOW) vsrgComposerStore.emitEvent('timestampChange', timestamp)
            expect(counters.constructed).toEqual(NOTHING_BUILT)
            expect(counters.destroyed).toEqual(NOTHING_BUILT)
        } finally {
            harness.destroy()
        }
    })

    /**
     * The pooled hit object is ONE interactive container over six sprites, so every pixel it draws
     * has to resolve to that container. A sprite set to 'none' is pruned from hit testing instead of
     * absorbed, and since the container itself has no hitArea the click then falls past the whole
     * view to the snap-point layer beneath - whose sprites tile the canvas - so a click on the
     * selection ring's visible edge (drawn wider than the note, and so overhanging into the previous
     * column) edited the song at a timestamp the user never pointed at.
     */
    it('keeps every part of a hit object hit-testable, so no click falls through to the grid', async () => {
        const harness = await mount()
        try {
            const tracks = pixi.findScenes(harness.app.stage).tracks
            //SWEPT rather than seeked once: jsdom measures the canvas at 0x0, so the window a draw
            //culls to is a degenerate band whose bounds are the playbar offset rather than any
            //screen width, and which timestamp brings makeSong's single object into it is geometry
            //this test has no business pinning
            let painted = 0
            for (let timestamp = 1000; timestamp <= 1400; timestamp += 25) {
                vsrgComposerStore.emitEvent('timestampChange', timestamp)
                painted += hitObjectViews(tracks).filter(view => view.visible).length
            }
            expect(painted).toBeGreaterThan(0)
            for (const view of hitObjectViews(tracks)) {
                expect(view.children.length).toBeGreaterThan(0)
                for (const part of descendants(view)) expect(part.eventMode).not.toBe('none')
            }
        } finally {
            harness.destroy()
        }
    })

    it('renders exactly once per draw, and not at all while nothing is asking', async () => {
        vi.useFakeTimers()
        const harness = await mount()
        try {
            expect(harness.app.initOptions?.autoStart).toBe(false)
            const before = harness.app.render.mock.calls.length
            vsrgComposerStore.emitEvent('timestampChange', 1000)
            expect(harness.app.render.mock.calls.length).toBe(before + 1)
            //paused, so no clock is running and pixi's own ticker is not rendering behind our back
            await vi.advanceTimersByTimeAsync(1000)
            expect(harness.app.render.mock.calls.length).toBe(before + 1)
        } finally {
            harness.destroy()
        }
    })

    it('runs the playback clock only while playing, and starts it without jumping the song', async () => {
        vi.useFakeTimers()
        const harness = await mount()
        try {
            harness.props.isPlaying = true
            harness.push()
            const playing = harness.app.render.mock.calls.length
            harness.timestamps.length = 0
            await vi.advanceTimersByTimeAsync(500)
            expect(harness.app.render.mock.calls.length).toBeGreaterThan(playing)
            //ThrottledEventLoop.start() anchors `previousTickTime` on the run's own start time; the
            //0 it used to anchor on made the first tick of a run advance the song by the epoch
            expect(harness.timestamps.length).toBeGreaterThan(0)
            expect(harness.timestamps[harness.timestamps.length - 1]).toBeLessThan(1000)

            harness.props.isPlaying = false
            harness.push()
            const paused = harness.app.render.mock.calls.length
            await vi.advanceTimersByTimeAsync(500)
            expect(harness.app.render.mock.calls.length).toBe(paused)
        } finally {
            harness.destroy()
        }
    })
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
