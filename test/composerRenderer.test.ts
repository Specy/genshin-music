import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import type {ComposerCache} from '$cmp/pages/Composer/ComposerCache'

/**
 * The composer renderer's column POOL and its update() diff (2026-08-06 reactive-model plan,
 * phase 3). Before this phase, drawNotesStage destroyed and rebuilt every display object in the
 * visible window on every update - ~276 pixi nodes per playback tick at the shipped default - and
 * computeTailsByColumn walked columns 0..visibleEnd, a scan that grew as playback advanced.
 *
 * THE INVARIANT, stated once so the cases below read as instances of it:
 *
 *   update() decides how much to repaint by comparing the state it last PAINTED against the one it
 *   was handed now. That only means anything if each state is a MOMENT - values taken out of the
 *   song when the canvas was told something changed. A field reached through a shared live song is
 *   the same value on both sides, so the branch it gates is permanently false; and `song.columns`
 *   keeps one identity across the edits that mutate columns in place, so an identity comparison of
 *   it does not see those. `structureVersion` is the value that moves on every graph edit - and it
 *   is per-song, so the columns identity is compared beside it for the song-swap case.
 *
 * AND ITS PER-COLUMN HALF (phase 4), which is the same idea one level down. A graph edit repaints
 * only the drawn columns whose own `NoteColumn.version` counter differs from what their view last
 * painted; every other input to a column's pixels forces the whole window instead, and the rows
 * below pin each of those - moving any one of `currentLayer`, `instruments`, `breakpoints`,
 * `selectedColumns`, `beatMarks` or `smoothScroll` onto the narrowed path fails three to five
 * tests.
 *
 * The key a view holds is the PAIR (column object, version). The object half is the one this file
 * has to construct a case for: addColumns/removeColumns/pasteColumns splice the live array in
 * place, so column objects move to new INDEXES without the array's identity moving, and two
 * counters sitting at the same number is an ordinary coincidence - see the two rows that build
 * exactly that and assert it. A version-only key fails them with `!==` and with `>` alike.
 *
 * What this file does NOT distinguish, said here rather than left to be rediscovered: `>` versus
 * `!==` while the object half is present (a given column's counter only increments, so the two
 * cannot differ), and clearing a released view's key (redundant against the renderer painting every
 * view it acquires). Both are pinned only in the forms above, and the renderer says so at each.
 *
 * THE SILENT FAILURE MODE the pool introduces is a reused view showing something its previous
 * occupant left behind - a texture, an alpha, a note sprite that should have been hidden. Nothing
 * about that is visible in HOW MUCH was repainted, so counting repaints cannot see it. The second
 * and third parts below are aimed at it, and each compares against a reference the pooled path had
 * no hand in producing.
 *
 * Seven parts, because they fail on different mistakes:
 *
 *  - the RECALCULATION TABLE drives the real renderer with ONE stable ComposedSong and asserts how
 *    much each kind of change repainted. It fails when a diffed field goes back to being read
 *    through the song, and when a fast path is taken for a change it cannot apply.
 *  - the EQUIVALENCE part re-runs the same table and asserts that the scene an incremental path
 *    left behind is the scene a SECOND RENDERER, freshly mounted at the same final state with its
 *    own pool and its own texture cache, paints in one go. Nothing of the first renderer's history
 *    reaches the second, so a property the incremental path failed to write is a difference rather
 *    than a shared value. What it cannot see is a mistake both renderers make.
 *  - the CONTENT part compares the same scene against the DRAWING RULES, stated here from the song
 *    and the props. The description of the scene, below, is what is in that comparison; among the
 *    decisions it reaches are where the column container is scrolled to, where each view sits,
 *    which cache slot its background comes from, which rows carry a note sprite and with which
 *    texture, position and alpha, which columns carry the selection overlay and the breakpoint
 *    marker, every tail rectangle - the last found by scanning the whole song from column 0, where
 *    the renderer scans backwards from a bound - and the timeline's background, selection band,
 *    breakpoint markers and viewport outline. It fails on a wrong texture, a wrong position, a
 *    wrong alpha, a sprite that is not shown, a wrong tail colour or geometry, and on a scan bound
 *    that reaches too far or not far enough.
 *  - the tests between the tables and PART FIVE are single claims neither table makes on its own,
 *    each stating at its own site what it is there for.
 *  - PART FIVE, THE GLIDE, turns smooth scrolling on and states where the playhead is at fractions
 *    of a column over a driven clock. It fails on a chase-toward-a-target implementation, on a
 *    lookahead not honoured, and on a queue that drops segments.
 *  - PART SIX, THE FRAME LOOP, reads how often the renderer ASKED to render rather than what it
 *    painted - the half a scene description cannot see. It fails on a loop that runs while idle,
 *    on the cap set on the wrong ticker, and on a render per tick rather than per frame that moved.
 *  - PART SEVEN, MANUAL SCROLLING, drives a drag, a wheel and the mini-timeline in BOTH scroll
 *    modes. It fails on quantised motion, on a gesture fought by its own selectColumn round-trip,
 *    on one that never settles, and on a gesture nothing ends.
 *
 * BOTH tables read the same description of the scene (Harness.paintedScene), so WHAT THAT
 * DESCRIPTION CARRIES is what either of them can see. It carries, for every child of a pooled
 * column view and of the timeline: the cache slot its texture came from, its x, its y, its alpha
 * and whether it is shown at all. It carries the placement and presentation of every container
 * those children hang off, up to and including each Application's own stage - a scene displaced,
 * faded or hidden at its ROOT is a scene every child of which still reads correct. And it carries
 * the two things outside the pixi scene graph that blank the notes canvas on their own: what that
 * Application clears to behind the columns, and the canvas ELEMENT's whole inline style.
 *
 * Deliberate omissions, each of them somewhere a defect can sit unseen. What a hidden object still
 * holds: a hidden sprite reads as absent, which is what lets a pooled view keep more note sprites
 * than its column needs. The TIMELINE canvas' clear colour: that Application is initialised with
 * backgroundAlpha 0 and the fakes model a colour but not an alpha, so there is nothing here to
 * state it against. Pixels: nothing rasterises, so two textures differ by the cache slot they came
 * from rather than by what they look like. And whatever the fakes below do not model at all - the
 * readers can only report what those objects hold, so a pixi property the fakes never gave them is
 * invisible here by construction.
 *
 * Known unpinned areas, as of the close of phase 3 - written down because a list of what a guard
 * does NOT cover ages better than a claim that it covers everything, and each of these was found by
 * mutating the code and watching this file stay green:
 *  - computeCanvasSize() end to end. `canvasWidth` is what the renderer reports through
 *    onGeometryChange and the heights are what it passed to resize(); geometry() cross-checks the
 *    cache against them, so an INCONSISTENCY fails, but a size wrong the same way in all three is
 *    endorsed. Re-deriving it here would duplicate the row-height scale and the inPreview scaling.
 *  - the pixi interaction wiring (eventMode, interactiveChildren, hitArea) on the root containers.
 *    The pointer and wheel HANDLERS are driven - by the click-inverse test and by the manual-scroll
 *    part - but what routes an event to them is not: the hitareas decide whether a drag continues
 *    outside the canvas, and nothing here states that.
 *  - the Application constructor options other than `autoStart`, which FakeApplication.init() reads
 *    because the ticker's behaviour hangs off it. resolution, autoDensity, antialias and the
 *    initial canvas size are still discarded and so invisible.
 *  - what a render group actually CHANGES. FakeContainer.enableRenderGroup records the call and the
 *    scene it produces is identical either way, which is the point of the real one - so what is
 *    pinned is that the renderer asks for it, not that pixi then moves the transform to the GPU.
 *  - teardown: nothing requires either Application to be destroyed, though destroy()'s own comment
 *    calls that a hard requirement against a WebGL leak on remount.
 *  - the rules this file imports from production rather than restating - nearestEven,
 *    computeRowLayerStatuses, computeStrandedRows, displayButtonForId, isColumnVisible. A defect
 *    inside one of those is followed by the reference rather than caught, EXCEPT where a second,
 *    independent statement pins it (the closed-form window range does this for isColumnVisible).
 *  - an edit to a column entirely OUTSIDE the drawn window. It is correct because the column is
 *    painted on the way in, but nothing here drives that.
 *  - a wrong skip whose stale content happens to equal the correct content. Invisible by
 *    construction, since the scene is compared as values - and harmless for the same reason.
 *  - over-repainting BEYOND the marked set. Only the counts can see it, and only on the rows that
 *    state an exact painted set rather than 'window'.
 *
 * HOW MUCH was repainted, AND WHICH COLUMNS, is observed indirectly, because everything the
 * renderer decides is private. Each counter of Repainted rides on something the class does in one
 * place:
 *  - painting a column clears that view's tail Graphics; the timeline viewport is the other
 *    Graphics this class clears, and it is subtracted by identity, so `columnPaints` follows column
 *    paints rather than clears in general. `paintedColumns` reads the SAME clears per view instead
 *    of globally, and push() asserts the two agree, so neither reading can narrow on its own;
 *  - rebuilding the timeline content removeChildren()s the timeline content container, which
 *    nothing else in the class calls;
 *  - the class constructs plain Containers in two places - its persistent scene containers, in
 *    field initialisers that run before init(), and the pooled views - so once a harness is mounted,
 *    container constructions and destructions read as "the pool grew" / "the pool was thrown away".
 *    A Sprite and a Graphics each un-count themselves in their own constructor.
 *  - Application.render() is the "did this update do anything at all" channel, and the rows where
 *    it is 0 are what make the rest mean something.
 *  - and, for the parts that drive a MOTION rather than an update, the notes Application's fake
 *    Ticker: `frames` counts the rAF callbacks it took, `emits` the ones its maxFPS gate let
 *    through, `starts`/`stops` the transitions. Those are what "the idle case does no per-frame
 *    work" is stated in, since a loop that runs and paints nothing moves no other counter here.
 *
 * Textures are named by the CACHE SLOT they came from (`standardLarger[1]`, `notes[3]`), which is
 * what lets two renderers with two separate ComposerCaches be compared at all, and what lets the
 * content part say which slot it expects instead of which object. The mock below records every
 * ComposerCache the renderers build so the harness can read those slots; the sizes that cache was
 * handed are read too, but as something to CHECK a derived geometry against rather than as the
 * geometry itself - see Geometry, which is also where the canvas sizes and the reported width come
 * in.
 */

const counters = vi.hoisted(() => ({
    constructed: {containers: 0, sprites: 0, graphics: 0},
    destroyed: {containers: 0, sprites: 0, graphics: 0},
    graphicsClears: 0,
    reset() {
        this.constructed.containers = 0
        this.constructed.sprites = 0
        this.constructed.graphics = 0
        this.destroyed.containers = 0
        this.destroyed.sprites = 0
        this.destroyed.graphics = 0
        this.graphicsClears = 0
    },
}))

const pixi = vi.hoisted(() => {
    let nextTextureId = 0

    //ids, not bare objects: two distinct `{}` textures would compare EQUAL under a structural
    //comparison, and the harness identifies a texture by looking it up in the cache it came from
    class FakeTexture {
        readonly textureId = nextTextureId++

        destroy() {}
    }

    type DestroyOptions = boolean | {children?: boolean, context?: boolean, texture?: boolean} | undefined

    /**
     * The one field of pixi's FederatedPointerEvent this renderer's handlers read. Registered
     * handlers are kept rather than dropped so a test can DRIVE one: the click handling is
     * production code that no scene description reaches, and the scroll offset it inverts is
     * otherwise stated in exactly one place - see the offset-inverse test.
     */
    interface FakePointerEvent {
        globalX: number
    }

    class FakeContainer {
        readonly kind: 'containers' | 'sprites' | 'graphics' = 'containers'
        children: FakeContainer[] = []
        parent: FakeContainer | null = null
        eventMode = 'none'
        interactiveChildren = true
        hitArea: unknown
        visible = true
        destroyed = false
        /**
         * Whether enableRenderGroup() was called on this container. Recorded rather than modelled:
         * a render group changes WHERE pixi applies the container's transform (a GPU uniform on the
         * group instead of a CPU rewrite of every descendant's vertices) and nothing about what the
         * scene holds, so there is nothing here for it to change - only the call to pin.
         */
        isRenderGroup = false
        x = 0
        y = 0
        zIndex = 0
        alpha = 1
        /** how a container rebuild is observed: removeChildren() is what a rebuild does first */
        clears = 0
        readonly listeners = new Map<string, ((event: FakePointerEvent) => void)[]>()

        constructor() {
            counters.constructed.containers++
        }

        addChild<T extends FakeContainer>(child: T): T {
            this.children.push(child)
            child.parent = this
            return child
        }

        addChildAt<T extends FakeContainer>(child: T, index: number): T {
            this.children.splice(index, 0, child)
            child.parent = this
            return child
        }

        removeChild<T extends FakeContainer>(child: T): T {
            const at = this.children.indexOf(child)
            if (at !== -1) this.children.splice(at, 1)
            child.parent = null
            return child
        }

        removeChildren(): FakeContainer[] {
            this.clears++
            const children = this.children
            this.children = []
            for (const child of children) child.parent = null
            return children
        }

        on(event: string, handler: (event: FakePointerEvent) => void) {
            const registered = this.listeners.get(event)
            if (registered) registered.push(handler)
            else this.listeners.set(event, [handler])
            return this
        }

        enableRenderGroup() {
            this.isRenderGroup = true
        }

        /** Deliver a pointer event to whatever this container registered for it. */
        emit(event: string, payload: FakePointerEvent) {
            for (const handler of this.listeners.get(event) ?? []) handler(payload)
        }

        //recursive, unlike the fake test/composerRenderLoop.test.ts carries: pixi's own
        //destroy({children: true}) tears down the whole subtree, and a no-op destroy would let a
        //pool that DROPS its views on the floor read exactly like one that reuses them
        destroy(options?: DestroyOptions) {
            if (this.destroyed) return
            this.destroyed = true
            counters.destroyed[this.kind]++
            const children = this.removeChildren()
            const destroyChildren = typeof options === 'boolean' ? options : options?.children
            if (destroyChildren) for (const child of children) child.destroy(options)
        }
    }

    class FakeGraphics extends FakeContainer {
        override readonly kind = 'graphics' as const
        /** every draw op since the last clear(), so a snapshot can compare the DRAWING, not just its existence */
        ops: unknown[] = []

        constructor() {
            super()
            counters.constructed.containers--
            counters.constructed.graphics++
        }

        clear() {
            counters.graphicsClears++
            this.clears++
            //a NEW array, so a snapshot taken before this call keeps the ops it saw
            this.ops = []
            return this
        }

        rect(x: number, y: number, width: number, height: number) {
            this.ops.push(['rect', x, y, width, height])
            return this
        }

        roundRect(x: number, y: number, width: number, height: number, radius: number) {
            this.ops.push(['roundRect', x, y, width, height, radius])
            return this
        }

        poly(points: number[]) {
            this.ops.push(['poly', points])
            return this
        }

        circle() {
            return this
        }

        moveTo() {
            return this
        }

        lineTo() {
            return this
        }

        fill(style: unknown) {
            this.ops.push(['fill', style])
            return this
        }

        stroke(style: unknown) {
            this.ops.push(['stroke', style])
            return this
        }
    }

    class FakeSprite extends FakeContainer {
        override readonly kind = 'sprites' as const
        texture: FakeTexture | undefined
        readonly anchor = {set: () => {}}

        constructor(texture: FakeTexture) {
            super()
            counters.constructed.containers--
            counters.constructed.sprites++
            this.texture = texture
        }
    }

    class FakeRectangle {
        constructor(_x: number, _y: number, _width: number, _height: number) {}
    }

    const applications: FakeApplication[] = []

    /**
     * pixi's Ticker, modelled down to the two things the renderer's loop actually depends on.
     *
     * (1) THE ORDER LISTENERS RUN IN. pixi's `_addListener` walks a linked list and inserts before
     * the first listener of a STRICTLY LOWER priority, so higher numbers run first and equal ones
     * run in insertion order (node_modules/pixi.js/lib/ticker/Ticker.mjs). That is what decides
     * whether a scroll callback added at the default priority mutates the scene before or after
     * `Application.render`, which TickerPlugin registers at UPDATE_PRIORITY.LOW (-25). A fake that
     * emitted in insertion order could not tell a frame applied late from one applied on time.
     *
     * (2) THE maxFPS GATE, transcribed verbatim including the `| 0` truncation of the delta and the
     * modulo re-anchor of `lastFrame`. It is a frame SKIP on top of the display's own rAF rather
     * than a clock, so what it produces on a fixed 16ms grid is an UNEVEN cadence - at 48 against
     * sinon's grid the gaps alternate 32/16/16, i.e. up to two display frames between two emitted
     * ones. Rounding that to "a frame is 16ms" is what makes a position assertion drift; see
     * Harness.msSinceLastFrame, which is how this file states the tolerance instead.
     *
     * What it does NOT model: `deltaTime`/`deltaMS`/`elapsedMS` and the minFPS clamp on them. The
     * renderer derives every position from the wall clock and reads none of those - see
     * ComposerRenderer.motionPositionAt, which says why.
     */
    class FakeTicker {
        started = false
        maxFPS = 0
        /** how many times start()/stop() actually changed the state */
        starts = 0
        stops = 0
        /** rAF callbacks taken - i.e. display frames, whether or not the gate let them through */
        frames = 0
        /** ticks that survived the gate and emitted to the listeners */
        emits = 0
        /** when the last emit happened, on the same clock performance.now() reads */
        lastEmitMs = Number.NaN
        destroyed = false
        readonly listeners: {
            fn: (ticker: FakeTicker) => void
            context: unknown
            priority: number
        }[] = []
        private requestId: number | null = null
        private lastFrame = 0

        add(fn: (ticker: FakeTicker) => void, context: unknown, priority = 0) {
            let at = this.listeners.length
            for (let i = 0; i < this.listeners.length; i++) {
                if (this.listeners[i].priority < priority) {
                    at = i
                    break
                }
            }
            this.listeners.splice(at, 0, {fn, context, priority})
            return this
        }

        remove(fn: (ticker: FakeTicker) => void, context: unknown) {
            for (let i = this.listeners.length - 1; i >= 0; i--) {
                const listener = this.listeners[i]
                if (listener.fn === fn && listener.context === context) this.listeners.splice(i, 1)
            }
            return this
        }

        start() {
            if (this.started) return
            this.started = true
            this.starts++
            if (this.requestId !== null || this.listeners.length === 0) return
            //pixi's _requestIfNeeded seeds lastFrame here, and only here - the re-request inside a
            //tick leaves it alone, which is what makes the gate a phase accumulator
            this.lastFrame = performance.now()
            this.requestId = requestAnimationFrame(this.tick)
        }

        stop() {
            if (!this.started) return
            this.started = false
            this.stops++
            if (this.requestId === null) return
            cancelAnimationFrame(this.requestId)
            this.requestId = null
        }

        //Ticker.destroy() begins with this.stop(), so an Application destroyed mid-motion stops
        //asking for frames whether or not its owner remembered to
        destroy() {
            this.stop()
            this.destroyed = true
            this.listeners.length = 0
        }

        private tick = () => {
            this.requestId = null
            if (!this.started) return
            this.frames++
            const now = performance.now()
            const minElapsed = this.maxFPS ? 1000 / this.maxFPS : 0
            let emit = true
            if (minElapsed) {
                const delta = (now - this.lastFrame) | 0
                if (delta < minElapsed) emit = false
                else this.lastFrame = now - (delta % minElapsed)
            }
            if (emit) {
                this.emits++
                this.lastEmitMs = now
                for (const listener of [...this.listeners]) listener.fn.call(listener.context, this)
            }
            if (this.started && this.requestId === null && this.listeners.length > 0) {
                this.requestId = requestAnimationFrame(this.tick)
            }
        }
    }

    class FakeApplication {
        renders = 0
        /**
         * The column container's x AS EACH RENDER SAW IT. One line, and it is what lets a test say
         * that the offset a frame computed is the offset that frame rendered - a claim no position
         * assertion can make, because they all read the container after the fact.
         */
        readonly renderedX: number[] = []
        readonly ticker = new FakeTicker()
        readonly canvas = document.createElement('canvas')
        readonly stage = new FakeContainer()
        /**
         * Every (width, height) this Application's renderer was resized to, in call order. It is
         * the only record of the size the CANVAS was actually given: init()'s options are handed to
         * a no-op below, and every later size arrives through resize().
         */
        readonly resizes: [number, number][] = []
        readonly renderer = {
            background: {color: 0},
            resize: (width: number, height: number) => {
                this.resizes.push([width, height])
            },
            generateTexture: () => new FakeTexture(),
        }

        constructor() {
            applications.push(this)
        }

        /**
         * TickerPlugin.init's two load-bearing lines, in the order it runs them: the `ticker` setter
         * registers `this.render` at UPDATE_PRIORITY.LOW UNCONDITIONALLY, and only then does
         * `autoStart` decide whether `start()` is called. Modelling that is what makes it possible
         * for this file to see the renderer removing that listener - which is how it keeps "one
         * render per frame that moved" rather than one per tick.
         */
        async init(options?: {autoStart?: boolean}) {
            this.initOptions = options
            this.ticker.add(this.render, this, -25)
            if (options?.autoStart) this.ticker.start()
        }

        initOptions: {autoStart?: boolean} | undefined

        start() {
            this.ticker.start()
        }

        stop() {
            this.ticker.stop()
        }

        render = () => {
            this.renders++
            this.renderedX.push(this.stage.children[0]?.x ?? Number.NaN)
        }

        //Application.destroy runs the plugin destroy hooks, and TickerPlugin.destroy destroys the
        //ticker - which stops it first
        destroy() {
            this.ticker.destroy()
        }
    }

    return {
        Application: FakeApplication,
        Container: FakeContainer,
        Graphics: FakeGraphics,
        Rectangle: FakeRectangle,
        Sprite: FakeSprite,
        Texture: FakeTexture,
        applications,
    }
})

vi.mock('pixi.js', () => pixi)

/**
 * Every ComposerCache a renderer builds, in construction order, tagged with the pixi Application it
 * was handed - which is how a cache is attributed to one of two renderers alive at the same time.
 * The real class is used; only its construction is observed.
 */
interface RecordedCache {
    cache: ComposerCache
    app: unknown
}

const caches = vi.hoisted((): RecordedCache[] => [])

vi.mock('$cmp/pages/Composer/ComposerCache', async importOriginal => {
    const actual = await importOriginal<typeof import('$cmp/pages/Composer/ComposerCache')>()
    class RecordingComposerCache extends actual.ComposerCache {
        constructor(props: ConstructorParameters<typeof actual.ComposerCache>[0]) {
            super(props)
            caches.push({cache: this, app: props.app})
        }
    }
    return {...actual, ComposerCache: RecordingComposerCache}
})

import {
    COMPOSER_NOTE_POSITIONS,
    ComposedSong,
    ComposerSettings,
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    NOTES_PER_COLUMN,
    TEMPO_CHANGERS,
    ThemeProvider,
} from './imports'
//the renderer's own rounding helper, used here to DERIVE the column geometry rather than read it
//back off the ComposerCache the renderer built - see Geometry
import {nearestEven} from '$core/utils/Utilities'
import {
    canonicalButtonForId,
    computeRowLayerStatuses,
    computeStrandedRows,
    displayButtonForId,
    noteIdToButton,
} from '$core/Songs/noteIds'
import {
    ComposerRenderer,
    isColumnVisible,
    type ColumnWindowGeometry,
    type ComposerRendererState,
} from '$cmp/pages/Composer/ComposerRenderer'

/**
 * 20, not the shipped default of 35, purely so the window (n/2 + 2 per side, strictly - so n + 3
 * columns for an even n) is 23 rather than 39 and the counts below stay readable. The window MATH
 * is pinned against isColumnVisible for every shipped option in its own test.
 */
const COLUMNS_PER_CANVAS = 20
/** Far enough from both ends of a 100-column song that the window is never clipped. */
const SELECTED = 40

/** The body rect beforeEach mocks, jsdom measuring nothing on its own. */
const BODY_WIDTH = 1920

/**
 * The notes canvas' pixel geometry, by ComposerRenderer.computeCanvasSize's own rule over that
 * rect, and the playhead at its centre.
 *
 * It is stated here rather than read off a renderer because the window definition is a function of
 * PIXELS now (see ColumnWindowGeometry: a canvas does not hold exactly columnsPerCanvas columns),
 * and several of the expectations below need to evaluate it with no renderer in hand. mount()'s
 * geometry() asserts the renderer reports this same width and derives this same column width, so
 * the duplication fails loudly there instead of quietly moving every window in this file.
 */
const CANVAS_WIDTH = nearestEven(BODY_WIDTH * 0.85 - 45)
const COLUMN_WIDTH = nearestEven(CANVAS_WIDTH / COLUMNS_PER_CANVAS)
const WINDOW_GEOMETRY: ColumnWindowGeometry = {
    width: CANVAS_WIDTH,
    columnWidth: COLUMN_WIDTH,
    playheadX: CANVAS_WIDTH / 2,
}

/** Note Id of a button on the game's default instrument. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/**
 * Two notes on two tracks in every column, on distinct display rows, plus a span every 8th column,
 * a tempo changer and two breakpoints. Uniform on purpose: every pooled view ends up needing the
 * same two note sprites, so the allocation test's warm-up saturates rather than trickling.
 */
function makeSong(): ComposedSong {
    const song = new ComposedSong('composer renderer', [INSTRUMENTS[0], INSTRUMENTS[1]])
    for (let column = 0; column < song.columns.length; column++) {
        song.addNoteAt(column, 0, idOf(column % 7), column % 8 === 0 ? 3 : 1)
        song.addNoteAt(column, 1, idOf((column % 5) + 7))
    }
    song.setTempoChangerAt(5, TEMPO_CHANGERS[1])
    song.breakpoints = [0, 42]
    song.selected = SELECTED
    return song
}

/**
 * A DIFFERENT song with the SAME NUMBER of graph mutations, so both sit at the same
 * structureVersion. That is what makes the song-swap row a test of the `columns` identity
 * comparison rather than of the version one - two freshly loaded songs really can both be at 0,
 * and a version-only diff would report "nothing changed" and keep painting the previous song.
 * The equal-version precondition is asserted in the row itself, so a drift in the counts fails
 * loudly instead of quietly turning this back into a version test.
 */
function makeOtherSong(): ComposedSong {
    const song = new ComposedSong('other song', [INSTRUMENTS[0], INSTRUMENTS[1]])
    for (let column = 0; column < song.columns.length; column++) {
        song.addNoteAt(column, 0, idOf((column + 3) % 7), 1)
        song.addNoteAt(column, 1, idOf(((column + 2) % 5) + 7))
    }
    song.setTempoChangerAt(9, TEMPO_CHANGERS[2])
    song.breakpoints = [0]
    song.selected = SELECTED
    return song
}

/**
 * Another song at the SAME structureVersion as makeSong's (asserted where it is used), differing in
 * the one quantity the maxSpan cache holds: makeSong's longest span is 3, this one's is 90. The
 * long note replaces one of the loop's per-column calls rather than being added after it, because
 * every graph mutation bumps the version and the two songs have to end up equal.
 *
 * idOf(12) is outside both the track-0 (0..6) and track-1 (7..11) id ranges the loop uses, so
 * nothing later in the song truncates the span.
 */
function makeEquallyVersionedLongSpanSong(): ComposedSong {
    const song = new ComposedSong('long span', [INSTRUMENTS[0], INSTRUMENTS[1]])
    for (let column = 0; column < song.columns.length; column++) {
        song.addNoteAt(column, 0, idOf(column % 7), 1)
        if (column === 0) song.addNoteAt(0, 1, idOf(12), 90)
        else song.addNoteAt(column, 1, idOf((column % 5) + 7))
    }
    song.setTempoChangerAt(5, TEMPO_CHANGERS[1])
    song.breakpoints = [0, 42]
    song.selected = SELECTED
    return song
}

/**
 * An instrument plus one of the default instrument's note ids that lands on NO button of that
 * instrument's own table - the pair that produces a STRANDED note, drawn at the canonical fallback
 * row and dimmed there. Searched for rather than named so this file carries no per-game list; both
 * shipped games have percussion whose table is narrower than the melodic default's.
 */
function strandingPair(): {instrument: (typeof INSTRUMENTS)[number], id: number, row: number} {
    const buttons = INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.length
    for (const instrument of INSTRUMENTS) {
        for (let button = 0; button < buttons; button++) {
            const id = idOf(button)
            const row = canonicalButtonForId(id)
            if (row !== -1 && noteIdToButton(instrument, id) === -1) return {instrument, id, row}
        }
    }
    throw new Error('no instrument in this game strands any of the default instrument note ids')
}

/** The first drawn column with no note on `row`, so a note added there is the row's only one. */
function drawnColumnWithoutRow(song: ComposedSong, row: number): number {
    for (let index = 0; index < song.columns.length; index++) {
        if (!isColumnVisible(index, song.selected, WINDOW_GEOMETRY)) continue
        const taken = song.columns[index].notes.some(
            note => displayButtonForId(song.instruments[note.trackIndex]?.name ?? '', note.id) === row
        )
        if (!taken) return index
    }
    throw new Error(`every drawn column already carries a note on row ${row}`)
}

/** The canvas's own props - everything on the renderer state that is not read off the song. */
interface Props {
    isPlaying: boolean
    isRecordingAudio: boolean
    currentLayer: number
    beatMarks: number
    selectedColumns: number[]
    /**
     * WHICH OF THE TWO PLAYBACK SCROLLS the renderer is in, and with it whether the playhead line
     * or the selected-column overlay marks the position. It is an AXIS the parts below choose a
     * value on rather than a section boundary:
     *  - OFF for the repaint table, the equivalence table and most of the content table, because
     *    with it off a playback tick applies itself inside update(), synchronously, which is what
     *    those measure - the diff, the pool and the per-column skip, none of which the glide
     *    changes. It is also the only mode where a selected overlay exists to be read.
     *  - ON for the glide part, where a tick only SCHEDULES and what reaches the screen does so on a
     *    frame; that part drives the clock itself.
     *  - BOTH for the mutual-exclusion part and the manual-scroll part. It does NOT mean "nothing
     *    animates": a drag and a wheel ease are continuous in either mode, which is what the second
     *    of those is for.
     */
    smoothScroll: boolean
    bpm: number
    lookaheadMs: number
}

/**
 * The composer's own defaults for the two numbers the glide is a function of, so the section that
 * exercises it is exercising the shipped arrangement rather than a convenient one. At these values
 * one column at tempo 1 lasts 273ms against a 250ms lookahead - the case where a single "current
 * glide" slot would very nearly hold, and a 1/4 column is where it stops holding.
 */
const BPM = 220
const LOOKAHEAD_MS = 250
/**
 * ComposerRenderer's SCROLL_EASE_MS, restated rather than imported - it is not exported, and a
 * shared constant would move both sides of every expectation together.
 */
const SCROLL_EASE_MS = 140

interface Context {
    song: ComposedSong
    props: Props
}

function makeContext(): Context {
    return {
        song: makeSong(),
        props: {
            isPlaying: true,
            isRecordingAudio: false,
            currentLayer: 0,
            beatMarks: 3,
            selectedColumns: [],
            smoothScroll: false,
            bpm: BPM,
            lookaheadMs: LOOKAHEAD_MS,
        },
    }
}

/** What one update() repainted. See this file's header for what observes each of these. */
interface Repainted {
    /** both Applications, asserted together - a row where they differ is a bug in the renderer */
    renders: {notes: number, timeline: number}
    /** how many columns' content was repainted */
    columnPaints: number
    /**
     * WHICH columns' content was repainted, ascending. The count above cannot see a repaint set
     * that is the right SIZE and the wrong SET, which is exactly the mistake a per-column skip
     * makes: an off-by-one on the touched range, a tail range dropped, the wrong side of a window
     * shift. Both readings come off the same channel (a paint clears that column's tail Graphics)
     * and push() asserts they agree, so a per-view reading that misses a paint fails instead of
     * quietly narrowing what the rows below compare against.
     */
    paintedColumns: number[]
    /** timeline content container rebuilds */
    timelineRebuilds: number
    /** pooled views constructed (the pool grew) and destroyed (the pool was thrown away) */
    viewsCreated: number
    viewsDestroyed: number
}

/**
 * The pixi fakes, structurally. Everything the harness reads off the scene goes through this, so
 * the readers below need no casts and a shape change in the fakes fails at the reader.
 */
interface SceneNode {
    kind: string
    children: SceneNode[]
    visible: boolean
    x: number
    y: number
    alpha: number
    clears: number
    ops?: unknown[]
    texture?: {textureId: number}
    emit: (event: string, payload: {globalX: number}) => void
}

/**
 * The geometry the drawing rules below are stated in.
 *
 * `canvasWidth` is the one value here that the renderer says about itself: it comes from the
 * onGeometryChange callback, the channel the Svelte template takes it from, because it is derived
 * from a DOM measurement this file does not re-do. Everything else is DERIVED from it, by the rule
 * the renderer states - `nearestEven(width / columnsPerCanvas)` for a column, `height /
 * NOTES_PER_COLUMN` for a display row - and then CROSS-CHECKED, in geometry() below, against the
 * two places the renderer put its own numbers: the sizes it resized each canvas to, and the sizes
 * it handed the ComposerCache the views draw from. A value read back off the cache and fed straight
 * into the reference would be endorsed rather than checked - a doubled column width, for instance,
 * shows 10 columns of a 20-column setting with the playhead pinned to the right edge, and every
 * comparison stated in terms of that same doubled width still agrees.
 *
 * The limit: this file does not re-derive computeCanvasSize, so a canvas width that is wrong in the
 * same way in the report, in the resize and in the cache is outside what these tests see. What is
 * inside is any DISAGREEMENT between those three, and anything derived from the reported width by a
 * rule stated here.
 */
interface Geometry {
    /** the width of both canvases, notes and timeline */
    canvasWidth: number
    /** the height of the notes canvas */
    height: number
    columnWidth: number
    /** one display row, i.e. height / NOTES_PER_COLUMN */
    rowHeight: number
    timelineHeight: number
}

/** A sprite that draws: the cache slot its texture came from, and where and how it draws it. */
interface PaintedSpriteData {
    /** cache slot, e.g. 'standard[0]' or 'notes[3]' */
    texture: string
    x: number
    y: number
    alpha: number
}

/**
 * A sprite slot of a column view. A hidden sprite draws nothing and reads as null - which is what
 * lets a pooled view keep a hidden overlay, or more note sprites than its current column needs,
 * without that being part of the scene.
 */
type PaintedSprite = PaintedSpriteData | null

/** A Graphics: where it sits, how it presents, and every op issued since its last clear(). */
interface PaintedGraphics {
    x: number
    y: number
    alpha: number
    visible: boolean
    ops: unknown[]
}

/**
 * One drawn column, in the terms the drawing rules are stated in rather than in pixi terms: the
 * view's own placement and presentation, then each of the children it owns.
 */
interface PaintedColumn {
    index: number
    /** the view container's placement - the rule is `columnWidth * index`, at y 0 */
    x: number
    y: number
    /**
     * The container's own presentation. A pooled view is released and re-acquired rather than
     * rebuilt, so these are where a release that hid or faded a view - without a paint that undoes
     * it - shows up.
     */
    alpha: number
    visible: boolean
    background: PaintedSprite
    overlay: PaintedSprite
    breakpoint: PaintedSprite
    /** one entry per SHOWN note sprite, in paint order */
    notes: PaintedSpriteData[]
    tails: PaintedGraphics
}

/**
 * A child of the timeline: a Graphics (its background, the tools-selection band, the viewport
 * outline) or a breakpoint marker Sprite. One shape for both kinds, since the timeline holds them
 * in one list and rebuilds it from scratch - there is no pool here, and so no hidden child to skip.
 */
interface PaintedTimelineChild {
    kind: string
    texture: string | null
    x: number
    y: number
    alpha: number
    visible: boolean
    /** empty for a Sprite */
    ops: unknown[]
}

/**
 * A container carrying no drawing of its own: one of the roots the drawn scene hangs off. Each
 * Application's stage is one, and so is the timeline's content container. Describing them is what
 * catches the whole scene being displaced, faded or hidden AT THE ROOT - a failure none of the
 * children below can show, because every one of them still reads correct relative to a parent that
 * is no longer where it was.
 */
interface PaintedRoot {
    x: number
    y: number
    alpha: number
    visible: boolean
}

/**
 * Everything on screen, as values - see this file's header for what this description carries and
 * what it leaves out, which is what decides what BOTH tables below can see.
 */
interface PaintedScene {
    notes: {
        /** the notes Application's stage, which the column container below hangs off */
        stage: PaintedRoot
        /** the column container's scroll offset - which column the canvas shows, and where */
        x: number
        y: number
        alpha: number
        visible: boolean
        /** what the notes Application clears to behind the scene */
        clearColor: number
        /**
         * The notes canvas element's whole inline style declaration - DOM rather than anything in
         * the pixi scene. Taken whole rather than one property at a time, so a declaration this
         * class did not use to write is a difference here as much as a changed opacity is.
         */
        canvasStyle: string
        /**
         * Which element the canvas is actually a child of, or DETACHED. The scene graph says what
         * would be drawn; this says whether it reaches the page at all.
         */
        canvasParent: string
        /** ascending column order; empty while the stage is hidden, which draws nothing */
        columns: PaintedColumn[]
        /**
         * The playhead: the fixed vertical line the columns scroll under, and the thing that makes
         * the scroll offset legible - a container x is only meaningful against where the line it is
         * positioning columns relative to actually is. A sibling of the column container on the
         * stage, so it is described beside the columns rather than among them.
         */
        playhead: PaintedTimelineChild
    }
    timeline: {
        /** same rule as the notes canvas above */
        canvasParent: string
        /** the timeline Application's stage: the content container and the viewport hang off it */
        stage: PaintedRoot
        /** the container the content below hangs off */
        container: PaintedRoot
        /** in draw order: the background, the tools-selection band if any, then the markers */
        content: PaintedTimelineChild[]
        /** the window outline, a persistent Graphics drawn over the content */
        viewport: PaintedTimelineChild
    }
}

interface Harness {
    context: Context
    /** Push the current song + props at the renderer and report what it repainted. */
    push(): Repainted
    /** The column indices isColumnVisible says are drawn right now, ascending. */
    drawnColumns(): number[]
    /** How many columns isColumnVisible says are drawn right now. */
    windowSize(): number
    /** The column indices the pool currently has on screen, derived from the containers' x. */
    attachedColumns(): number[]
    /** Everything on screen, as values. */
    paintedScene(): PaintedScene
    /** The kind of every child of every drawn column view, in the order pixi draws them. */
    columnChildKinds(): string[][]
    /**
     * WHERE THE CANVAS IS SCROLLED TO, in fractional columns: the container offset read back off
     * the scene and inverted through the same rule expectedNotesOffset states. Reading it this way
     * rather than off the renderer is what makes it a claim about what is drawn - the renderer's
     * own scrollPosition is private, and a schedule that advanced without moving the container
     * would be invisible to a reading that trusted it.
     */
    scrollPosition(): number
    /** How many times the notes Application has been asked to render, ever. */
    notesRenders(): number
    /** How many times the timeline Application has been asked to render, ever. */
    timelineRenders(): number
    /**
     * The notes Application's frame loop, as counters - see the FakeTicker. This is the whole of
     * what "no per-frame work" is stated in.
     */
    frameLoop(): {started: boolean, maxFPS: number, frames: number, emits: number, stops: number}
    /**
     * HOW STALE THE SCROLL POSITION IS: milliseconds since the last frame the ticker emitted. The
     * position can only be where that frame put it, so this is exactly the interval an expectation
     * stated at the current instant has to allow - and unlike a fixed frame length it follows the
     * maxFPS gate's uneven cadence instead of assuming it away.
     */
    msSinceLastFrame(): number
    /** Whether the renderer asked for the column container to be its own render group. */
    columnsAreARenderGroup(): boolean
    /** The geometry this renderer computed. */
    geometry(): Geometry
    /** The ComposerCache the views currently hold textures from. */
    currentCache(): ComposerCache
    /** Press a pointer onto the notes stage at a canvas x. */
    pressPointerOverNotes(globalX: number): void
    /** Move a pressed pointer across the notes stage to a canvas x. */
    movePointerOverNotes(globalX: number): void
    /** Release a pointer over the notes stage at a canvas x, the way a click on a column arrives. */
    releasePointerOverNotes(globalX: number): void
    /** A wheel event on the notes canvas ELEMENT, which is where that listener is registered. */
    wheelOverNotes(deltaY: number): void
    /**
     * The mini-timeline's own drag, which is a SECOND pointer surface with its own three handlers
     * and its own rule (absolute rather than anchored - see ComposerRenderer.handleTimelineSlide).
     * Everything else in this file reaches the timeline as scene description only.
     */
    pressPointerOverTimeline(globalX: number): void
    movePointerOverTimeline(globalX: number): void
    releasePointerOverTimeline(globalX: number): void
    /** A window-level pointerup, which is how a release outside the canvas reaches the renderer. */
    releasePointerOutsideTheCanvas(): void
    /**
     * A native pointercancel: the OS taking the gesture away (an edge swipe, palm rejection). pixi
     * delivers no event of its own for it, so this is the window listener's alone to handle.
     */
    cancelPointer(): void
    /** Every selectColumn the renderer has asked for, in call order. */
    selectColumnCalls: {index: number, ignoreAudio?: boolean}[]
    resize(): Promise<void>
    destroy(): void
}

/** Every texture the cache holds, by the slot it sits in. */
function textureSlots(cache: ComposerCache): Map<unknown, string> {
    const slots = new Map<unknown, string>()
    const lists: [string, unknown[]][] = [
        ['columns', cache.cache.columns],
        ['standard', cache.cache.standard],
        ['columnsLarger', cache.cache.columnsLarger],
        ['standardLarger', cache.cache.standardLarger],
        ['breakpoints', cache.cache.breakpoints],
    ]
    for (const [name, list] of lists) list.forEach((texture, i) => slots.set(texture, `${name}[${i}]`))
    for (const [key, texture] of Object.entries(cache.cache.notes)) slots.set(texture, `notes[${key}]`)
    return slots
}

/**
 * What a texture that belongs to no slot of the CURRENT cache reads as. A view holding one is
 * pointing at a texture the renderer has stopped maintaining (and, 500ms after a regeneration,
 * at a destroyed one).
 */
const NOT_IN_THE_CURRENT_CACHE = 'not-in-the-current-cache'

function nameTexture(slots: Map<unknown, string>, texture: {textureId: number} | undefined): string | null {
    if (!texture) return null
    return slots.get(texture) ?? NOT_IN_THE_CURRENT_CACHE
}

/** A sprite of a column view. Hidden reads as null - see PaintedSprite. */
function describeSprite(child: SceneNode, slots: Map<unknown, string>): PaintedSprite {
    if (!child.visible) return null
    return {
        texture: nameTexture(slots, child.texture) ?? 'none',
        x: child.x,
        y: child.y,
        alpha: child.alpha,
    }
}

function describeRoot(container: SceneNode): PaintedRoot {
    return {x: container.x, y: container.y, alpha: container.alpha, visible: container.visible}
}

function describeGraphics(child: SceneNode): PaintedGraphics {
    return {x: child.x, y: child.y, alpha: child.alpha, visible: child.visible, ops: [...(child.ops ?? [])]}
}

function describeTimelineChild(child: SceneNode, slots: Map<unknown, string>): PaintedTimelineChild {
    return {
        kind: child.kind,
        texture: nameTexture(slots, child.texture),
        x: child.x,
        y: child.y,
        alpha: child.alpha,
        visible: child.visible,
        ops: [...(child.ops ?? [])],
    }
}

function describeColumn(
    column: SceneNode,
    slots: Map<unknown, string>,
    columnWidth: number
): PaintedColumn {
    //the fixed slots ColumnView gives every view, in the order it adds them - background, selection
    //overlay, breakpoint marker, tail Graphics - then the note sprites it grows on demand. The kind
    //assertion is what makes a reordering fail HERE rather than silently shifting every field of
    //the record by one.
    const [background, overlay, marker, tails, ...notes] = column.children
    expect([background.kind, overlay.kind, marker.kind, tails.kind]).toEqual([
        'sprites',
        'sprites',
        'sprites',
        'graphics',
    ])
    const shownNotes: PaintedSpriteData[] = []
    for (const note of notes) {
        const described = describeSprite(note, slots)
        if (described) shownNotes.push(described)
    }
    return {
        index: Math.round(column.x / columnWidth),
        x: column.x,
        y: column.y,
        alpha: column.alpha,
        visible: column.visible,
        background: describeSprite(background, slots),
        overlay: describeSprite(overlay, slots),
        breakpoint: describeSprite(marker, slots),
        notes: shownNotes,
        tails: describeGraphics(tails),
    }
}

/**
 * Mount a renderer over the pixi fakes. Pass a context to mount a SECOND renderer at the state
 * another one is already in - that is the equivalence part's independent reference, and it shares
 * nothing with the first but the song and props objects it reads its state out of.
 */
async function mount(context: Context = makeContext()): Promise<Harness> {
    const notesEl = document.createElement('div')
    const timelineEl = document.createElement('div')
    document.body.append(notesEl, timelineEl)
    const state = (): ComposerRendererState => ({
        columns: context.song.columns,
        structureVersion: context.song.structureVersion,
        isPlaying: context.props.isPlaying,
        isRecordingAudio: context.props.isRecordingAudio,
        instruments: context.song.instruments,
        selected: context.song.selected,
        currentLayer: context.props.currentLayer,
        beatMarks: context.props.beatMarks,
        columnsPerCanvas: COLUMNS_PER_CANVAS,
        breakpoints: context.song.breakpoints,
        selectedColumns: context.props.selectedColumns,
        smoothScroll: context.props.smoothScroll,
        bpm: context.props.bpm,
        lookaheadMs: context.props.lookaheadMs,
    })
    const appsBefore = pixi.applications.length
    //the canvas width, taken from the callback the Svelte template takes it from - see Geometry
    let reportedWidth = 0
    const selectColumnCalls: {index: number, ignoreAudio?: boolean}[] = []
    const renderer = new ComposerRenderer(notesEl, timelineEl, state(), {
        selectColumn: (index, ignoreAudio) => {
            selectColumnCalls.push({index, ignoreAudio})
        },
        toggleBreakpoint: () => {},
        onGeometryChange: reported => {
            reportedWidth = reported.width
        },
    })
    await renderer.init()
    //REQUIRED: init()'s theme callback schedules the ComposerCache behind a 50ms debounce. Without
    //waiting it out there is no cache, drawNotesStage early-returns, and every counter here reads
    //0 - which looks exactly like a perfectly optimised renderer.
    await vi.advanceTimersByTimeAsync(120)

    //init() builds the notes Application first and the timeline one second; the shape assertions
    //below are what makes that ordering assumption fail loudly if it is ever reversed
    const [notesApp, timelineApp] = pixi.applications.slice(appsBefore)
    expect(notesApp.stage.children).toHaveLength(2)
    expect(timelineApp.stage.children).toHaveLength(2)
    const notesColumns = notesApp.stage.children[0]
    //the playhead is the notes stage's OTHER child, a persistent Graphics added AFTER the columns
    //so it draws over them; that order is the claim, since a line under the columns is invisible
    const playhead: SceneNode = notesApp.stage.children[1]
    expect(playhead.kind).toBe('graphics')
    const timelineContent = timelineApp.stage.children[0]
    //the viewport outline is the timeline stage's OTHER child, a persistent Graphics; it is the one
    //Graphics outside the pool that gets cleared, and columnPaints subtracts it by identity
    const viewport: SceneNode = timelineApp.stage.children[1]
    expect(viewport.kind).toBe('graphics')
    //jsdom measures nothing, so the canvas width comes from a mocked body rect through the
    //renderer's own computeCanvasSize. A zero here would make every timeline expectation below
    //compare zero against zero.
    expect(reportedWidth).toBeGreaterThan(0)

    const currentCache = (): ComposerCache => {
        for (let i = caches.length - 1; i >= 0; i--) {
            if (caches[i].app === notesApp) return caches[i].cache
        }
        throw new Error('this renderer has built no ComposerCache')
    }

    /** The size the renderer last gave this Application's canvas. */
    const lastResize = (app: {resizes: [number, number][]}): [number, number] => {
        const resize = app.resizes[app.resizes.length - 1]
        if (!resize) throw new Error('this Application was never resized')
        return resize
    }

    const geometry = (): Geometry => {
        const [notesWidth, height] = lastResize(notesApp)
        const [timelineWidth, timelineHeight] = lastResize(timelineApp)
        //THE CANVASES THE RENDERER SIZED, against the width it REPORTED. Every timeline rule below
        //is stated in terms of the reported width; a scene drawn full-width onto a narrower canvas
        //is a disagreement here rather than a scene that happens to look right in the description.
        expect([notesWidth, timelineWidth]).toEqual([reportedWidth, reportedWidth])
        //...and the column geometry, DERIVED from that width by the rule computeCanvasSize states,
        //rather than read back off the cache the renderer built - see Geometry
        const columnWidth = nearestEven(reportedWidth / COLUMNS_PER_CANVAS)
        //the module-level pair the window definition is evaluated against with no renderer in hand
        //(see WINDOW_GEOMETRY), pinned here against the renderer that is actually mounted
        expect([reportedWidth, columnWidth]).toEqual([CANVAS_WIDTH, COLUMN_WIDTH])
        const rowHeight = height / NOTES_PER_COLUMN
        //the cache is what the views actually draw from, so the derivation and the cache agreeing
        //is a claim in its own right: a divergence fails here instead of quietly substituting the
        //renderer's own number for the rule
        const cache = currentCache()
        expect({
            width: cache.width,
            height: cache.height,
            noteHeight: cache.noteHeight,
            timelineHeight: cache.timelineHeight,
        }).toEqual({width: columnWidth, height, noteHeight: rowHeight, timelineHeight})
        return {canvasWidth: reportedWidth, height, columnWidth, rowHeight, timelineHeight}
    }

    const measure = () => ({
        notesRenders: notesApp.renders,
        timelineRenders: timelineApp.renders,
        graphicsClears: counters.graphicsClears,
        viewportClears: viewport.clears,
        //the third Graphics outside the pool, subtracted by identity for the same reason the
        //viewport is: only a resize redraws it, and a resize is a row of the table below
        playheadClears: playhead.clears,
        timelineClears: timelineContent.clears,
        containersCreated: counters.constructed.containers,
        containersDestroyed: counters.destroyed.containers,
    })

    const columnIndex = (column: SceneNode) => Math.round(column.x / geometry().columnWidth)

    /** A view's tail Graphics - the fixed slot ColumnView gives every view, asserted as such. */
    const tailGraphicsOf = (column: SceneNode): SceneNode => {
        const tails = column.children[3]
        expect(tails.kind).toBe('graphics')
        return tails
    }

    /**
     * How many times each view's tail Graphics had been cleared - i.e. how many times that VIEW had
     * been painted - as of the start of the last push.
     *
     * Keyed by the Graphics OBJECT and not by column index, because a view outlives its index: it
     * is released into the free list when its column leaves the window and re-acquired for whatever
     * column needs one later. It cannot be painted while it is parked there (paintColumn only ever
     * paints a view it has just put in the on-screen map), so the value recorded while it was last
     * attached is still current when it comes back - which is what makes a returning view read as
     * "painted" exactly when the update that brought it back painted it.
     */
    const paintsPerView = new WeakMap<SceneNode, number>()

    const drawnColumns = (): number[] => {
        const drawn: number[] = []
        for (let i = 0; i < context.song.columns.length; i++) {
            if (isColumnVisible(i, context.song.selected, WINDOW_GEOMETRY)) drawn.push(i)
        }
        return drawn
    }

    return {
        context,
        push() {
            const before = measure()
            //the baseline, taken over the views ATTACHED NOW: it covers repaints that happened
            //outside a push() as well (a resize, a theme change - both debounced timers this file
            //drives forward), which would otherwise read as paints of the update below
            for (const column of notesColumns.children) {
                paintsPerView.set(tailGraphicsOf(column), tailGraphicsOf(column).clears)
            }
            renderer.update(state())
            const after = measure()
            const columnPaints =
                after.graphicsClears -
                before.graphicsClears -
                (after.viewportClears - before.viewportClears) -
                (after.playheadClears - before.playheadClears)
            const {columnWidth} = geometry()
            const paintedColumns: number[] = []
            for (const column of notesColumns.children) {
                const tails = tailGraphicsOf(column)
                //a view with no entry has never been attached at the start of a push - it was
                //constructed during this update, and its first paint is the one being measured
                if (tails.clears > (paintsPerView.get(tails) ?? 0)) {
                    paintedColumns.push(Math.round(column.x / columnWidth))
                }
            }
            paintedColumns.sort((a, b) => a - b)
            //the two readings of one thing, cross-checked: the global clear count says HOW MANY
            //columns were painted, the per-view walk says WHICH. They disagree on a paint this walk
            //cannot attribute - a column painted twice in one update, or a view painted and then
            //released before the walk sees it (the renderer releases BEFORE it paints, so that
            //ordering is a claim in its own right).
            expect(paintedColumns).toHaveLength(columnPaints)
            return {
                renders: {
                    notes: after.notesRenders - before.notesRenders,
                    timeline: after.timelineRenders - before.timelineRenders,
                },
                columnPaints,
                paintedColumns,
                timelineRebuilds: after.timelineClears - before.timelineClears,
                viewsCreated: after.containersCreated - before.containersCreated,
                viewsDestroyed: after.containersDestroyed - before.containersDestroyed,
            }
        },
        drawnColumns,
        windowSize() {
            return drawnColumns().length
        },
        attachedColumns() {
            return notesColumns.children.map(columnIndex)
        },
        paintedScene() {
            const slots = textureSlots(currentCache())
            const columnWidth = geometry().columnWidth
            return {
                notes: {
                    stage: describeRoot(notesApp.stage),
                    x: notesColumns.x,
                    y: notesColumns.y,
                    alpha: notesColumns.alpha,
                    visible: notesColumns.visible,
                    clearColor: notesApp.renderer.background.color,
                    //READ OUT OF THE DOM, not off the Application. Taking it from notesApp.canvas
                    //describes a canvas that may not be on the page at all: deleting the
                    //appendChild in init() renders the whole composer to a detached element - a
                    //blank screen - and every other assertion in this file still passes, because
                    //they all describe the scene graph rather than where it is mounted.
                    canvasParent: notesApp.canvas.parentElement === notesEl ? 'notes' : 'DETACHED',
                    canvasStyle: notesApp.canvas.style.cssText,
                    //a hidden stage draws nothing, so the views it still holds are not part of the
                    //scene. They are also what the pool deliberately keeps around while the audio
                    //recorder has the canvas hidden - see ComposerRenderer.drawNotesStage.
                    columns: !notesColumns.visible
                        ? []
                        : notesColumns.children.map(column => describeColumn(column, slots, columnWidth)),
                    //the line the columns scroll under. It is NOT gated on notesColumns.visible
                    //above: it hangs off the stage rather than off the column container, so hiding
                    //the columns for an audio recording leaves it drawn, and the rows that hide
                    //them are where a claim to the contrary would go unnoticed.
                    playhead: describeTimelineChild(playhead, slots),
                },
                timeline: {
                    //same rule as the notes canvas above
                    canvasParent: timelineApp.canvas.parentElement === timelineEl ? 'timeline' : 'DETACHED',
                    stage: describeRoot(timelineApp.stage),
                    container: describeRoot(timelineContent),
                    content: timelineContent.children.map(child =>
                        describeTimelineChild(child, slots)
                    ),
                    viewport: describeTimelineChild(viewport, slots),
                },
            }
        },
        columnChildKinds() {
            return notesColumns.children.map(column => column.children.map(child => child.kind))
        },
        scrollPosition() {
            const {canvasWidth, columnWidth} = geometry()
            return (canvasWidth / 2 - notesColumns.x) / columnWidth
        },
        notesRenders: () => notesApp.renders,
        timelineRenders: () => timelineApp.renders,
        frameLoop: () => ({
            started: notesApp.ticker.started,
            maxFPS: notesApp.ticker.maxFPS,
            frames: notesApp.ticker.frames,
            emits: notesApp.ticker.emits,
            stops: notesApp.ticker.stops,
        }),
        msSinceLastFrame() {
            const {lastEmitMs} = notesApp.ticker
            if (Number.isNaN(lastEmitMs)) throw new Error('the frame loop has never emitted')
            return performance.now() - lastEmitMs
        },
        columnsAreARenderGroup: () => notesColumns.isRenderGroup,
        geometry,
        currentCache,
        pressPointerOverNotes(globalX: number) {
            notesColumns.emit('pointerdown', {globalX})
        },
        movePointerOverNotes(globalX: number) {
            notesColumns.emit('pointermove', {globalX})
        },
        releasePointerOverNotes(globalX: number) {
            notesColumns.emit('pointerup', {globalX})
        },
        wheelOverNotes(deltaY: number) {
            notesApp.canvas.dispatchEvent(new WheelEvent('wheel', {deltaY}))
        },
        pressPointerOverTimeline(globalX: number) {
            timelineContent.emit('pointerdown', {globalX})
        },
        movePointerOverTimeline(globalX: number) {
            timelineContent.emit('pointermove', {globalX})
        },
        releasePointerOverTimeline(globalX: number) {
            timelineContent.emit('pointerup', {globalX})
        },
        releasePointerOutsideTheCanvas() {
            window.dispatchEvent(new Event('pointerup'))
        },
        cancelPointer() {
            window.dispatchEvent(new Event('pointercancel'))
        },
        selectColumnCalls,
        async resize() {
            window.dispatchEvent(new Event('resize'))
            //the same 50ms debounce as init()'s, plus room for the draw it ends in
            await vi.advanceTimersByTimeAsync(120)
        },
        destroy() {
            renderer.destroy()
            notesEl.remove()
            timelineEl.remove()
        },
    }
}

beforeEach(() => {
    //jsdom reports 0x0 for every element; without a real size the computed column width goes
    //negative and nothing below means anything
    vi.spyOn(document.body, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1920, 1080))
    //waits in this file are of two kinds and the fake clock covers both: the debounces (cache
    //regeneration, the delayed destruction of the previous cache, subscribeTheme's own), and - from
    //PART FIVE on - the notes Ticker's own rAF chain, since vi.useFakeTimers replaces
    //requestAnimationFrame and performance.now together. Driven, never slept through.
    vi.useFakeTimers()
})

afterEach(() => {
    //BEFORE the clock goes back to real: a fake ticker left running holds a pending rAF on the fake
    //clock, and a test that forgot to destroy its renderer would otherwise leak frames into the next
    //one's timeline
    for (const application of pixi.applications) application.ticker.destroy()
    vi.useRealTimers()
    vi.restoreAllMocks()
    pixi.applications.length = 0
    caches.length = 0
    counters.reset()
    document.body.replaceChildren()
})

// ---------------------------------------------------------------------------------------------
// THE DRAWING RULES, stated from the song and the props rather than read off the renderer.
// ---------------------------------------------------------------------------------------------

/** ComposerRenderer's counterLimit: the bar-group size beatMarks is expressed in. */
function barGroupSize(beatMarks: number): number {
    return beatMarks === 0 ? 12 : 4 * beatMarks
}

/**
 * The tail rectangles a column should carry, as draw ops.
 *
 * Deliberately NAIVE where the renderer is bounded: it considers every column from the start of the
 * song, while paintTails scans backwards only as far as the song's longest span. That difference is
 * the point - a bound that reaches one column too few silently drops the last bar of every
 * maximum-length span, and a reference that shared the bound could not see it.
 */
function expectedTails(context: Context, index: number, geometry: Geometry, accent: number): unknown[] {
    const {columnWidth, rowHeight} = geometry
    const {song, props} = context
    const tailHeight = Math.max(2, rowHeight * 0.22)
    const ops: unknown[] = []
    for (let start = 0; start <= index; start++) {
        for (const note of song.columns[start].notes) {
            //a span of 1 is a plain tap, and a span that ends before this column covers nothing here
            if (note.span <= 1) continue
            if (start + note.span <= index) continue
            const instrument = song.instruments[note.trackIndex]
            //a track that is not the current layer draws its tail only while its instrument is
            //visible; the current layer's is not subject to that
            const isCurrentLayer = note.trackIndex === props.currentLayer
            if (!isCurrentLayer && !instrument?.visible) continue
            const button = displayButtonForId(instrument?.name ?? '', note.id)
            if (button === -1) continue
            //centred in its display row, and a stub over the right 45% in the column the note
            //STARTS in so the bar reads as leaving the note icon
            const y = COMPOSER_NOTE_POSITIONS[button] * rowHeight + (rowHeight - tailHeight) / 2
            const x = index === start ? columnWidth * 0.55 : 0
            ops.push(
                ['rect', x, y, columnWidth - x, tailHeight],
                ['fill', {
                    color: isCurrentLayer ? accent : 0x888888,
                    alpha: isCurrentLayer ? 0.75 : 0.35,
                }]
            )
        }
    }
    return ops
}

/**
 * What the drawn window should look like: one record per column isColumnVisible calls drawn, in
 * ascending index order (which is the order the pool keeps its views in).
 *
 * The rules, in one place:
 *  - a column view sits at `columnWidth * index`, at y 0, fully opaque and shown - a view that came
 *    back out of the free list having been hidden, faded or displaced fails here;
 *  - its children all draw from the view's own origin, except a note sprite, which takes the y of
 *    the display row it is on;
 *  - every 4th column is drawn from the LARGER texture variants (the beat tick), and a column with
 *    a tempo changer takes that changer's texture instead of a bar one;
 *  - a bar-group's worth of columns takes slot 0 and the next takes slot 1, alternating;
 *  - the selection overlay is one sprite, and WHICH COLUMN IS "SELECTED" DEPENDS ON THE MODE: with
 *    smooth scrolling OFF it is `song.selected`, with it ON no column is (the playhead line marks
 *    the position instead - the two are mutually exclusive). The selected column then takes
 *    standard[2] at 0.8, a column in the tools selection that is NOT the selected one takes
 *    standard[3] at 0.4, and a column in neither shows none. So in ON mode a column that is both the
 *    playhead's and tools-selected takes standard[3] at 0.4, which is this file's statement of that
 *    decision;
 *  - a breakpoint column shows the marker;
 *  - one note sprite per display row that computeRowLayerStatuses gives a non-zero status, at that
 *    row's y, dimmed to 0.45 when every note contributing to the row is stranded on its own
 *    instrument;
 *  - and the tails above, in a Graphics that is itself shown and opaque - the per-bar alpha is in
 *    the fill ops, and a transparent Graphics would draw none of them.
 *
 * `accent` is a parameter rather than a live ThemeProvider read because the renderer paints the
 * pool in the accent its LAST REPAINT captured, which is not always the one the theme currently
 * holds - see the theme test at the bottom of this file.
 */
function expectedWindow(
    context: Context,
    geometry: Geometry,
    accent: number = ThemeProvider.get('accent').rgbNumber()
): PaintedColumn[] {
    const {song, props} = context
    const {columnWidth, height} = geometry
    const groupSize = barGroupSize(props.beatMarks)
    const drawn: PaintedColumn[] = []
    for (let index = 0; index < song.columns.length; index++) {
        if (!isColumnVisible(index, song.selected, WINDOW_GEOMETRY)) continue
        const column = song.columns[index]
        const larger = (index + 1) % 4 === 0
        const background =
            column.tempoChanger === 0
                ? `${larger ? 'standardLarger' : 'standard'}[${Number(index % (groupSize * 2) >= groupSize)}]`
                : `${larger ? 'columnsLarger' : 'columns'}[${column.tempoChanger}]`
        const isSelected = !props.smoothScroll && index === song.selected
        const isToolsSelected = props.selectedColumns.includes(index)
        const toolsOnly = isToolsSelected && !isSelected
        const stranded = computeStrandedRows(column.notes, song.instruments)
        const notes: PaintedSpriteData[] = []
        for (const [button, status] of computeRowLayerStatuses(
            column.notes,
            props.currentLayer,
            song.instruments
        )) {
            if (status === 0) continue
            notes.push({
                texture: `notes[${status}]`,
                x: 0,
                y: (COMPOSER_NOTE_POSITIONS[button] * height) / NOTES_PER_COLUMN,
                alpha: stranded.has(button) ? 0.45 : 1,
            })
        }
        drawn.push({
            index,
            x: columnWidth * index,
            y: 0,
            alpha: 1,
            visible: true,
            background: {texture: background, x: 0, y: 0, alpha: 1},
            overlay:
                isSelected || isToolsSelected
                    ? {
                          texture: toolsOnly ? 'standard[3]' : 'standard[2]',
                          x: 0,
                          y: 0,
                          alpha: toolsOnly ? 0.4 : 0.8,
                      }
                    : null,
            breakpoint: song.breakpoints.includes(index)
                ? {texture: 'breakpoints[1]', x: 0, y: 0, alpha: 1}
                : null,
            notes,
            tails: {
                x: 0,
                y: 0,
                alpha: 1,
                visible: true,
                ops: expectedTails(context, index, geometry, accent),
            },
        })
    }
    return drawn
}

/**
 * Where the notes container is scrolled to, from the state.
 *
 * A column view sits at `columnWidth * index` INSIDE the container (see expectedWindow), so the
 * container's own x is what decides which column the canvas shows where. The renderer puts the
 * START of the scrolled-to column under the playhead, and the playhead at the canvas' horizontal
 * centre - so what has been played is left of the line and what is coming is right of it.
 *
 * `song.selected` is the scroll position here because every scenario compared against this is AT
 * REST, and at rest the two are equal: the renderer's position settles onto a whole column, and that
 * column is the index it hands `selectColumn` - see ComposerRenderer's Motion type for the
 * invariant. What breaks the equality is a motion in flight - a glide between two ticks, a pointer
 * mid-drag, a wheel ease still running - and every part that drives one reads the position off the
 * scene (Harness.scrollPosition) and states it directly rather than through this.
 *
 * This is one of two statements the offset has to satisfy. The other is a CONSEQUENCE rather than a
 * restatement: ComposerRenderer.handleStageUp inverts the same offset to turn a click at x
 * into a column, so wherever this puts the selected column on the canvas, a click landing there has
 * to select nothing and a click one column-width right has to select the next column. That is
 * driven through the renderer in its own test below, so a matching mistake here and in the draw
 * path does not pass.
 */
function expectedNotesOffset(context: Context, geometry: Geometry): number {
    return geometry.canvasWidth / 2 - context.song.selected * geometry.columnWidth
}

function expectedSpriteChild(texture: string, x: number, y: number): PaintedTimelineChild {
    return {kind: 'sprites', texture, x, y, alpha: 1, visible: true, ops: []}
}

function expectedGraphicsChild(x: number, y: number, ops: unknown[]): PaintedTimelineChild {
    return {kind: 'graphics', texture: null, x, y, alpha: 1, visible: true, ops}
}

/**
 * Where a root the drawn scene hangs off belongs: the origin, opaque, shown. Every placement stated
 * anywhere else in this file is INSIDE one of these, so a root that has been displaced, faded or
 * hidden moves or blanks its whole subtree while each child of it still reads correct relative to
 * it. Stating the roots is what turns that into a failure instead of a scene that draws nowhere.
 */
const AT_ORIGIN: PaintedRoot = {x: 0, y: 0, alpha: 1, visible: true}

/**
 * The notes canvas element's inline style, built by writing the one declaration the rules put there
 * onto a throwaway element of the same kind. Comparing a whole declaration block, in the DOM's own
 * serialisation, is what makes a SECOND declaration - a display, a visibility, a transform, a
 * filter - a difference here rather than something a single-property reading walks past.
 *
 * The value is the one ComposerRenderer.applyNotesCanvasOpacity writes: the theme's background
 * alpha, floored at 0.8 by handleThemeChange.
 */
function expectedCanvasStyle(): string {
    const probe = document.createElement('canvas')
    probe.style.opacity = String(Math.max(ThemeProvider.get('primary').alpha(), 0.8))
    return probe.style.cssText
}

/**
 * The timeline, from the state. It is the composer's navigation affordance - the outline says which
 * part of the song the canvas is showing, the markers say where the breakpoints are - and it is
 * where a `selected` that the notes stage applied correctly can still end up misreported.
 *
 * The rules:
 *  - its stage and its content container are roots, so both sit AT_ORIGIN and everything below is
 *    stated relative to them;
 *  - the whole song spans the canvas width, so one song column is `canvasWidth / columns.length`
 *    wide here (a different quantity from the notes stage's columnWidth, which is a fixed size per
 *    column and scrolls);
 *  - the background covers the strip, in the timeline layer colour;
 *  - a tools selection is a band from its first column to its last;
 *  - a breakpoint marker sits at its column's position, taking the SHORT breakpoint texture - slot
 *    0, where the notes stage's in-column marker is slot 1. (The renderer anchors it at 0.5 so it
 *    reads as centred on the column; the fakes below do not model anchors, so what is compared is
 *    the position the sprite is anchored AT.)
 *  - the viewport outline is as wide as the number of columns the canvas shows, with its left edge
 *    at the FIRST column the canvas shows - the scrolled-to column less the columns that fit
 *    between the canvas' left edge and the playhead - drawn 1.5px down so its 3px stroke sits
 *    inside the strip. Both numbers come off the pixel geometry rather than off columnsPerCanvas,
 *    which is the same span ComposerRenderer.timelineViewport reports to the drag handler, so the
 *    rectangle the user grabs is the rectangle they see.
 */
function expectedTimeline(context: Context, geometry: Geometry): PaintedScene['timeline'] {
    const {canvasWidth, columnWidth, timelineHeight} = geometry
    const {song, props} = context
    const timelineColumnWidth = canvasWidth / song.columns.length
    const content: PaintedTimelineChild[] = [
        expectedGraphicsChild(0, 0, [
            ['rect', 0, 0, canvasWidth, timelineHeight],
            ['fill', {color: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber()}],
        ]),
    ]
    if (props.selectedColumns.length) {
        const from = props.selectedColumns[0] * timelineColumnWidth
        const to = props.selectedColumns[props.selectedColumns.length - 1] * timelineColumnWidth
        content.push(
            expectedGraphicsChild(0, 0, [
                ['rect', from, 0, to - from, timelineHeight],
                ['fill', {
                    color: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber(),
                    alpha: 0.6,
                }],
            ])
        )
    }
    for (const breakpoint of song.breakpoints) {
        //QUIRK, preserved from before the pool and stated at ComposerRenderer.drawTimelineStage: the
        //markers divide the canvas by `columns.length - 1` where every other value here divides by
        //`columns.length`
        const x = (canvasWidth / (song.columns.length - 1)) * breakpoint
        content.push(expectedSpriteChild('breakpoints[0]', x, 0))
    }
    //not COLUMNS_PER_CANVAS: the renderer rounds a column to an even number of pixels, so the canvas
    //shows a fraction more or less than the setting asks for
    const columnsOnScreen = canvasWidth / columnWidth
    return {
        //init() appends each Application's canvas to the element it was constructed with
        canvasParent: 'timeline',
        stage: AT_ORIGIN,
        container: AT_ORIGIN,
        content,
        viewport: expectedGraphicsChild(
            //the first column the canvas shows, in timeline coordinates. Written as ONE
            //multiplication of the difference, matching ComposerRenderer.timelineViewport: the
            //comparison against the renderer is exact and a timeline column is not a whole number
            //of pixels, so how the arithmetic associates moves the last bits of the result.
            timelineColumnWidth * (song.selected - canvasWidth / 2 / columnWidth),
            1.5,
            [
                ['roundRect', 0, 0, Math.floor(timelineColumnWidth * columnsOnScreen), timelineHeight - 3, 6],
                ['stroke', {
                    width: 3,
                    color: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
                    alpha: 0.8,
                }],
            ]
        ),
    }
}

/**
 * Everything on screen, from the song and the props.
 *
 * `visible: true` on the column container is a rule, not a formality. ComposerRenderer.drawNotesStage
 * hides it when there is no texture cache and while the audio recorder has the canvas; nothing
 * compared against this reference is in either state, since every harness here waits the cache out
 * at mount and no scenario records audio. A container that goes invisible anyway draws nothing at
 * all - the shape of failure that a scene full of correct-looking columns hides. `AT_ORIGIN` on the
 * two stages says the same thing one level up, about the roots those containers hang off.
 *
 * `clearColor` and `canvasStyle` are the two channels outside the pixi scene graph that blank the
 * notes canvas on their own: what the Application clears to behind the columns
 * (ComposerRenderer.handleThemeChange, from the theme's primary colour), and the canvas ELEMENT's
 * own inline style - see expectedCanvasStyle.
 *
 * `accent` is a parameter rather than a live ThemeProvider read because the renderer paints the pool
 * in the accent its LAST REPAINT captured, which is not always the one the theme currently holds -
 * see the theme test at the bottom of this file.
 */
/**
 * The playhead: a 2px red bar spanning the canvas' height, centred on the canvas' horizontal
 * middle, at the stage origin and never moved - and SHOWN ONLY WITH SMOOTH SCROLLING ON, which is
 * the other half of the mutual exclusion expectedWindow's overlay rule states.
 *
 * The DRAWING is the same in both modes and this says so: the rectangle is drawn once at init and
 * again on every resize, and the mode is carried by `visible` alone. A hidden line that had also
 * been cleared would read the same here as one that was never drawn, and a renderer that toggled
 * the geometry instead of the flag would pay a GraphicsContext rebuild per click.
 *
 * `isRecordingAudio` hides it too, and has to: the line is a SIBLING of the columns container
 * rather than a child, so hiding the columns for a recording leaves it standing on an empty
 * background. That is the whole of the second term here.
 *
 * Stating the geometry exactly rather than as "a line somewhere near the middle" is what makes it
 * meaningful beside the scroll offset: expectedNotesOffset says which column sits under this x, so
 * a playhead drawn at the wrong x would leave the offset formula right and the composer wrong.
 *
 * THREE SHAPES AND ONE FILL, in that order. The bar is centred ON the column boundary, so it
 * straddles it by 1.5px either side; each arrowhead is a triangle with its base flush against a
 * canvas edge and its apex pointing inwards along the bar, on the same centre. The single trailing
 * fill is a claim in its own right - three shapes filled together cannot drift apart in colour or
 * alpha the way three fills could.
 *
 * The COLOUR is the `accent` PARAMETER, the same one expectedWindow paints the current layer's span
 * tails in - not a literal, and not a live read. The line and the tails are recoloured by the same
 * call (recalculateCacheAndSizes), so a theme edit leaves both showing the old colour until that
 * debounce fires, and the theme test drives exactly that window. A literal here would keep passing
 * if the line stopped following the theme at all; a live read would keep passing if it recoloured
 * ahead of the pool.
 */
function expectedPlayhead(
    context: Context,
    geometry: Geometry,
    accent: number
): PaintedTimelineChild {
    const {canvasWidth, height} = geometry
    const centre = canvasWidth / 2
    return {
        ...expectedGraphicsChild(0, 0, [
            ['rect', centre - 1.5, 0, 3, height],
            ['poly', [centre - 6, 0, centre + 6, 0, centre, 8]],
            ['poly', [centre - 6, height, centre + 6, height, centre, height - 8]],
            ['fill', {color: accent, alpha: 0.9}],
        ]),
        visible: context.props.smoothScroll && !context.props.isRecordingAudio,
    }
}

function expectedScene(
    context: Context,
    geometry: Geometry,
    accent: number = ThemeProvider.get('accent').rgbNumber()
): PaintedScene {
    return {
        notes: {
            stage: AT_ORIGIN,
            x: expectedNotesOffset(context, geometry),
            y: 0,
            alpha: 1,
            visible: true,
            clearColor: ThemeProvider.get('primary').rgb().rgbNumber(),
            canvasStyle: expectedCanvasStyle(),
            //init() appends each Application's canvas to the element it was constructed with
            canvasParent: 'notes',
            columns: expectedWindow(context, geometry, accent),
            playhead: expectedPlayhead(context, geometry, accent),
        },
        timeline: expectedTimeline(context, geometry),
    }
}

interface RepaintCase {
    what: string
    /** runs BEFORE the baseline push, so its own repaint is never counted */
    setup?: (context: Context) => void
    /** ONE renderer, and (except for the song-swap row) ONE stable ComposedSong */
    change: (context: Context) => void
    renders: number
    /**
     * The columns repainted, ascending and exactly - or 'window' for "every drawn column", which is
     * what an unnarrowed repaint does.
     *
     * The four rows that state an exact set are the four ComposedSong mutators that mark a RANGE
     * rather than the whole song (#touchColumns: addNoteAt, removeNoteAt, setNoteSpan,
     * setTempoChangerAt), and the indices here are the ranges test/reactivePublish.test.ts's
     * `touches` column states from the model side. That pair is the whole of phase 4's correctness:
     * the model marks the columns a change can be seen on, and the renderer repaints exactly those.
     * Every other mutator ends in #touchAllColumns, so it stays 'window'.
     */
    columnPaints: number[] | 'window'
    timelineRebuilds: number
}

/**
 * A change no per-column counter can localise: the whole drawn window is repainted column by column
 * and the timeline content rebuilt. Either the change is not a graph edit at all (so
 * needsUnconditionalRepaint takes it), or it is one that marks every column.
 */
const FULL: Pick<RepaintCase, 'renders' | 'columnPaints' | 'timelineRebuilds'> = {
    renders: 1,
    columnPaints: 'window',
    timelineRebuilds: 1,
}

const REPAINTS: RepaintCase[] = [
    // ---- the negative rows, which are what make the rest mean anything ----------------------
    {
        what: 'nothing changed',
        change: () => {},
        renders: 0,
        columnPaints: [],
        timelineRebuilds: 0,
    },
    {
        //isPlaying flips on every play/stop and changes no pixel here; it is on the state object
        //only because the canvas needs it for its own DOM
        what: 'only isPlaying changed',
        change: context => {
            context.props.isPlaying = false
        },
        renders: 0,
        columnPaints: [],
        timelineRebuilds: 0,
    },
    // ---- the playback tick -------------------------------------------------------------------
    {
        //THE case this phase exists for: one column enters the window and is painted, one leaves
        //and is released, the two columns whose selection flag flipped get their overlay reset, and
        //the timeline content is not touched at all
        what: 'selected moves by one',
        change: context => {
            context.song.selected += 1
        },
        renders: 1,
        //the window is 29..51 at column 40 and 30..52 at 41, so 52 is the one that entered
        columnPaints: [52],
        timelineRebuilds: 0,
    },
    {
        //the same tick with the window already clamped at the song end: a column leaves and NONE
        //enters, so nothing is repainted at all - the acquire side is driven by the window, not by
        //the size of the step
        what: 'selected moves by one against the end of the song',
        setup: context => {
            context.song.selected = context.song.columns.length - 5
        },
        change: context => {
            context.song.selected += 1
        },
        renders: 1,
        columnPaints: [],
        timelineRebuilds: 0,
    },
    {
        //a jump larger than the window (wheel, drag, breakpoint navigation): every view is released
        //and re-acquired, which is the general form the +1 case is the cheapest instance of
        what: 'selected jumps past the whole window',
        change: context => {
            context.song.selected += 50
        },
        renders: 1,
        columnPaints: 'window',
        timelineRebuilds: 0,
    },
    // ---- edits to the graph ------------------------------------------------------------------
    // The four rows that state an exact set are the four #touchColumns mutators - see
    // RepaintCase.columnPaints. Everything below them marks the whole song and stays 'window'.
    {
        what: 'a note is added',
        change: context => void context.song.addNoteAt(41, 0, idOf(3)),
        renders: 1,
        //a span of 1 covers only the column that owns the note
        columnPaints: [41],
        timelineRebuilds: 1,
    },
    {
        what: 'a note is removed',
        //column 40, not 41: makeSong gives every 8th column a span of 3, and 41 has span 1 - so
        //[41] would read the same under the range rule and under a column-only one, and the row
        //would state nothing about #touchColumns
        change: context => context.song.removeNoteAt(40, 0, idOf(40 % 7)),
        renders: 1,
        columnPaints: [40, 41, 42],
        timelineRebuilds: 1,
    },
    {
        what: "a note's span changes",
        //makeSong gives column 40 a span of 3 (every 8th), so this grows it to 4 and the marked
        //range is the UNION of the two - [40, 40 + max(3, 4))
        change: context => void context.song.setNoteSpan(40, 0, idOf(40 % 7), 4),
        renders: 1,
        columnPaints: [40, 41, 42, 43],
        timelineRebuilds: 1,
    },
    {
        //a tempo changer decides one column's background texture and nothing else, so it marks one
        //column even though the same mutator can take a whole tools selection
        what: 'a tempo changer is set',
        change: context => context.song.setTempoChangerAt(41, TEMPO_CHANGERS[2]),
        renders: 1,
        columnPaints: [41],
        timelineRebuilds: 1,
    },
    {
        //note entry is not gated on isPlaying (the plan says so at its Design decisions), so a
        //keypress during playback produces a structure change and a moved playhead in ONE update.
        //The narrowed repaint has to apply both: the edited column and the entering one are
        //painted, and the two columns whose selection flag moved (40 and 41) get their overlay
        //written - which is not a paint, and so is not in this list. The content half has the
        //matching row.
        what: 'a note is added while selected also moved',
        change: context => {
            context.song.addNoteAt(41, 0, idOf(3))
            context.song.selected += 1
        },
        renders: 1,
        columnPaints: [41, 52],
        timelineRebuilds: 1,
    },
    {
        what: 'a column is added',
        change: context => context.song.addColumns(1, 40),
        ...FULL,
    },
    {
        what: 'a column is removed',
        change: context => context.song.removeColumns(1, 40),
        ...FULL,
    },
    {
        /**
         * THE VERSION COLLISION, constructed deliberately - `addColumns(1, 40)` above does not
         * produce one, and a version-only, identity-blind skip passes that row.
         *
         * addColumns SPLICES `#columns` in place, so the array identity does not move and
         * needsUnconditionalRepaint's `previous.columns !== next.columns` does not fire: this is a
         * NARROWED repaint over column objects that have shifted one index right, while
         * #touchAllColumns advanced every counter by exactly 1. Both collisions the row is built on
         * are asserted, so a drift in makeSong fails loudly instead of quietly turning this into a
         * row that proves nothing.
         */
        what: 'a column is inserted, colliding two views\' paint keys',
        change: context => {
            const song = context.song
            const paintedAt40 = song.columns[40]
            const paintedVersionAt40 = paintedAt40.version
            const paintedVersionAt41 = song.columns[41].version
            song.addColumns(1, 39)
            //index 40 now holds a BRAND-NEW column, at a version BELOW the one its view painted -
            //which is the case a `>` comparison never repaints, leaving the old occupant's notes on
            //screen for good
            expect(song.columns[40]).not.toBe(paintedAt40)
            expect(song.columns[40].notes).toHaveLength(0)
            expect(paintedAt40.notes.length).toBeGreaterThan(0)
            expect(song.columns[40].version).toBeLessThan(paintedVersionAt40)
            //...and index 41 holds the object that WAS at 40, at exactly the version index 41's
            //view painted: equal numbers, different columns, which is what the object half of the
            //paint key is for
            expect(song.columns[41]).toBe(paintedAt40)
            expect(song.columns[41].version).toBe(paintedVersionAt41)
        },
        ...FULL,
    },
    {
        //the mirror of the row above, so an insert-only implementation cannot pass: index 34 comes
        //to hold the object that was at 35, at exactly the version index 34's view painted
        what: 'a column is removed, colliding a view\'s paint key',
        change: context => {
            const song = context.song
            const paintedAt34 = song.columns[34]
            const paintedVersionAt34 = paintedAt34.version
            song.removeColumns(1, 34)
            expect(song.columns[34]).not.toBe(paintedAt34)
            expect(song.columns[34].version).toBe(paintedVersionAt34)
            expect(song.columns[34].notes).not.toEqual(paintedAt34.notes)
        },
        ...FULL,
    },
    {
        //undo installs a whole column array - a fresh one, so both halves of the columns/version
        //pair move here
        what: 'undo restores a previous column array',
        change: context => {
            context.song.restoreColumns(context.song.columns.slice(0, 60).map(column => column.clone()))
        },
        ...FULL,
    },
    // ---- everything else the painted output depends on ----------------------------------------
    {
        what: 'a breakpoint is toggled',
        change: context => context.song.toggleBreakpoint(41),
        ...FULL,
    },
    {
        //decides note-icon textures (bit 0 of the layer status) and which tails get the accent
        what: 'the current layer changes',
        change: context => {
            context.props.currentLayer = 1
        },
        ...FULL,
    },
    {
        //InstrumentSettingsPopup edits the live InstrumentData IN PLACE and setInstrument publishes
        //a clone of it, so a value comparison between two captures compares the mutated object
        //against its own copy. The array identity is the only thing that moves.
        what: 'an instrument is hidden',
        change: context => {
            context.song.setInstrument(1, context.song.instruments[1].set({visible: false}))
        },
        ...FULL,
    },
    {
        what: "an instrument's icon changes",
        change: context => {
            context.song.setInstrument(1, context.song.instruments[1].set({icon: 'border'}))
        },
        ...FULL,
    },
    {
        //no structure bump, no song change - only the tools panel's own array moves
        what: 'the tools selection changes',
        change: context => {
            context.props.selectedColumns = [38, 39, 40, 41]
        },
        ...FULL,
    },
    {
        //the bar-group grouping. It reached the draw path only through the settings OBJECT before
        //this phase, whose identity never changes on a settings edit - so a diffing update() could
        //not have seen it, and the canvas's $effect would have stopped depending on it entirely
        what: 'the beat marks setting changes',
        change: context => {
            context.props.beatMarks = 4
        },
        ...FULL,
    },
    {
        //R1's live toggle, from the STOPPED state and on an exact column, which is the case that
        //moves neither the scroll position nor any per-column counter. Without smoothScroll in
        //needsUnconditionalRepaint, update()'s tail returns here and the canvas keeps showing the
        //mode it is no longer in - the line stays drawn and the overlay stays missing. The mode's
        //two visible consequences are compared in the content part; this is how much it repainted.
        what: 'smooth scrolling is turned on while stopped',
        setup: context => {
            context.props.isPlaying = false
        },
        change: context => {
            context.props.smoothScroll = true
        },
        ...FULL,
    },
    {
        //...and back off again, from a renderer that has been in the other mode from the start, so
        //neither direction can be the one that happens to work
        what: 'smooth scrolling is turned off while stopped',
        setup: context => {
            context.props.isPlaying = false
            context.props.smoothScroll = true
        },
        change: context => {
            context.props.smoothScroll = false
        },
        ...FULL,
    },
    {
        what: 'the whole song is replaced',
        change: context => {
            context.song = makeOtherSong()
        },
        ...FULL,
    },
    {
        //ISOLATES the `columns` identity comparison, which the row above does not: a real song load
        //also swaps the instrument roster and the breakpoints, and either of those identities would
        //catch it on its own. Here the replacement BORROWS both arrays and is built to the same
        //structureVersion (see makeOtherSong), leaving the column graph as the only thing that
        //moved - the state two freshly loaded songs are in, where the version says 0 on both sides.
        what: 'only the column graph is swapped, at an equal structure version',
        change: context => {
            const other = makeOtherSong()
            expect(other.structureVersion).toBe(context.song.structureVersion)
            other.instruments = context.song.instruments
            other.breakpoints = context.song.breakpoints
            context.song = other
        },
        ...FULL,
    },
    // ---- the stage that paints nothing --------------------------------------------------------
    {
        //the audio recorder hides the canvas. Nothing is painted, every view goes back to the free
        //list, and the baseline is dropped - which is what the row below depends on
        what: 'audio recording starts',
        change: context => {
            context.props.isRecordingAudio = true
        },
        renders: 1,
        columnPaints: [],
        timelineRebuilds: 1,
    },
    {
        //the first paintable update after a non-painting one must be a FULL repaint: there is no
        //moment to diff against, because the last thing update() was handed never reached the screen
        what: 'audio recording ends',
        setup: context => {
            context.props.isRecordingAudio = true
        },
        change: context => {
            context.props.isRecordingAudio = false
        },
        ...FULL,
    },
]

function expectedColumnPaints(testCase: RepaintCase, harness: Harness): number[] {
    return testCase.columnPaints === 'window' ? harness.drawnColumns() : testCase.columnPaints
}

describe('ComposerRenderer repaints from a diff of two moments, on one stable song', () => {
    for (const testCase of REPAINTS) {
        const columns = Array.isArray(testCase.columnPaints)
            ? `[${testCase.columnPaints.join(',')}]`
            : testCase.columnPaints
        const expected =
            `renders=${testCase.renders} columns=${columns}`
            + ` timeline=${testCase.timelineRebuilds}`
        it(`${testCase.what}: ${expected}`, async () => {
            const harness = await mount()
            try {
                testCase.setup?.(harness.context)
                //the baseline push: whatever init() and setup did is behind us, and the renderer's
                //painted state now holds the pre-change moment
                harness.push()
                testCase.change(harness.context)
                const repainted = harness.push()
                const paintedColumns = expectedColumnPaints(testCase, harness)
                expect(repainted).toEqual({
                    renders: {notes: testCase.renders, timeline: testCase.renders},
                    columnPaints: paintedColumns.length,
                    paintedColumns,
                    timelineRebuilds: testCase.timelineRebuilds,
                    //the pool is warm after the baseline push, so no row may grow it or throw it
                    //away - a released view is reused, never destroyed
                    viewsCreated: 0,
                    viewsDestroyed: 0,
                })
            } finally {
                harness.destroy()
            }
        })
    }
})

/**
 * The reference is a SECOND ComposerRenderer, mounted at the state the first one reached by being
 * driven through the change. It has its own pool, its own ComposerCache and no history at all, so
 * anything the incremental path left behind on a reused view is a difference here rather than a
 * value both sides happen to share. (Textures compare across the two caches because the scene names
 * them by cache slot - see textureSlots.)
 *
 * An earlier version of this part produced its reference by toggling isRecordingAudio on the SAME
 * renderer, which hides the stage without releasing or destroying the pool - so the "rebuild"
 * repainted through the very views the incremental path had just left behind, and every stale
 * property compared equal to itself. Measured: with ColumnView.paint no longer hiding the note
 * sprites a shorter column does not need, that version passed every test in this file.
 */
describe('every repaint leaves the scene a freshly mounted renderer paints in one go', () => {
    for (const testCase of REPAINTS) {
        it(testCase.what, async () => {
            const harness = await mount()
            let reference: Harness | null = null
            try {
                testCase.setup?.(harness.context)
                harness.push()
                testCase.change(harness.context)
                harness.push()
                const incremental = harness.paintedScene()
                //the window the pool acquired against, re-derived from the exported definition
                //rather than from the renderer's own closed form
                const visible: number[] = []
                for (let i = 0; i < harness.context.song.columns.length; i++) {
                    if (isColumnVisible(i, harness.context.song.selected, WINDOW_GEOMETRY)) visible.push(i)
                }
                if (!harness.context.props.isRecordingAudio) {
                    expect(harness.attachedColumns()).toEqual(visible)
                }
                reference = await mount(harness.context)
                expect(incremental).toEqual(reference.paintedScene())
            } finally {
                reference?.destroy()
                harness.destroy()
            }
        })
    }
})

/**
 * WHAT was painted, against the rules rather than against another run of the same code.
 *
 * The scenarios drive the renderer INCREMENTALLY - through playback ticks, scrolls and edits - and
 * then compare the scene it arrived at against expectedScene(), which knows only the song and the
 * props. Every content decision in the draw path is in that comparison: where the container is
 * scrolled to, where each view sits and whether it is shown, the cache slot each background comes
 * from, which rows carry a note sprite and with which texture, position and alpha, the selection
 * overlay, the breakpoint marker, every tail rectangle's geometry and colour, and the timeline's
 * markers and viewport outline.
 */
interface WindowCase {
    what: string
    /**
     * The scroll mode to mount in, defaulting to OFF - see Props.smoothScroll for why that is the
     * default and which rows are worth running the other way round.
     */
    smoothScroll?: boolean
    /** drives the renderer to the state under test; every push here is a real update() */
    drive: (harness: Harness) => void
}

/**
 * A column LEAVES the drawn window, something that is not the column graph changes while it is
 * parked, and an edit brings it back - i.e. through the narrowed repaint, where the per-column skip
 * is the thing deciding whether it is painted.
 *
 * This is the sequence the phase-4 skip is easiest to get wrong on, and none of the scrolling rows
 * below reach it. A released view keeps every pixel it painted and waits outside the scene graph,
 * where an unconditional repaint - which repaints the WINDOW - cannot reach it. Its column's own
 * counter has not moved either, so a skip that could consult a parked view's key would skip it on
 * the way back in and leave the old layer's note textures, the old roster's dimming, a missing
 * breakpoint marker, a stale overlay or the wrong bar grouping on screen indefinitely. Two things
 * rule that out, and these rows pass against either alone: a returning column has no view in the
 * on-screen map, so it is acquired and painted by its acquirer before any key is consulted, and
 * ComposerRenderer.releaseColumnView nulls the key as well. The whole scene is compared against the
 * rules afterwards, so whichever kind of staleness it would be shows up.
 */
function parkedAcross(what: string, change: (harness: Harness) => void): WindowCase {
    return {
        what: `after a drawn column was parked across a change to ${what}`,
        drive: harness => {
            const song = harness.context.song
            const returnTo = song.selected
            //away, far enough that no view of the original window survives in the on-screen map
            song.selected += 50
            harness.push()
            change(harness)
            harness.push()
            //...and back, on an update that also edits the graph: that is what selects the narrowed
            //repaint rather than the playback fast path
            song.selected = returnTo
            song.addNoteAt(returnTo, 0, idOf(3))
            harness.push()
        },
    }
}

const WINDOWS: WindowCase[] = [
    {
        what: 'as mounted',
        drive: () => {},
    },
    {
        what: 'after one playback tick',
        drive: harness => {
            harness.context.song.selected += 1
            harness.push()
        },
    },
    {
        what: 'after twenty playback ticks',
        drive: harness => {
            for (let tick = 0; tick < 20; tick++) {
                harness.context.song.selected += 1
                harness.push()
            }
        },
    },
    {
        //The narrowed repaint's selection fix-up, from the side that bites. An edit arrives in the
        //same update() as a moved playhead (note entry is not gated on isPlaying), and the loop
        //repaints only the edited column - so both the column that LOST the selection and the one
        //that GAINED it are painted by paintSelectionOverlay afterwards, not by the loop. Deleting
        //either call leaves the whole suite green without this row: the REPAINTS counters do not
        //move (an overlay is not a column paint), so only a content comparison can see it.
        what: 'after an edit arrived in the same update as a moved playhead',
        drive: harness => {
            const edited = harness.context.song.selected + 3
            harness.context.song.addNoteAt(edited, 0, idOf(edited % 7))
            harness.context.song.selected += 1
            harness.push()
        },
    },
    {
        what: 'after scrolling forward, backward and jumping',
        drive: harness => {
            for (const step of [1, 1, -1, -1, -1, 30, -60, 4]) {
                harness.context.song.selected = Math.max(0, harness.context.song.selected + step)
                harness.push()
            }
        },
    },
    {
        //the row the pool's own bookkeeping is easiest to get wrong on: a column that had two note
        //sprites now needs one, and the surplus sprite has to stop being shown
        what: 'after a note is removed from a drawn column',
        drive: harness => {
            harness.context.song.removeNoteAt(41, 0, idOf(41 % 7))
            harness.push()
        },
    },
    {
        what: 'after a note is added to a drawn column',
        drive: harness => {
            harness.context.song.addNoteAt(41, 0, idOf(3))
            harness.push()
        },
    },
    {
        what: 'with a tools selection covering part of the window',
        drive: harness => {
            harness.context.props.selectedColumns = [36, 37, 38, 39, 40, 41]
            harness.push()
        },
    },
    {
        what: 'with the second layer current',
        drive: harness => {
            harness.context.props.currentLayer = 1
            harness.push()
        },
    },
    {
        what: 'with the second instrument hidden',
        drive: harness => {
            const song = harness.context.song
            //a span on the track about to be hidden: a tail belonging to a track that is neither
            //the current layer nor visible is not drawn at all, and makeSong puts spans only on
            //track 0. Painted DIM first (another track's visible tail), then gone.
            song.setNoteSpan(38, 1, idOf((38 % 5) + 7), 5)
            harness.push()
            song.setInstrument(1, song.instruments[1].set({visible: false}))
            harness.push()
        },
    },
    {
        //a display row whose every contributing note is stranded on its own instrument is DIMMED.
        //Nothing in makeSong strands, so the row has to be built: a third track on an instrument
        //whose table does not carry the id, in a column no other note shares that row in.
        what: 'with a row whose only note is stranded on its own instrument',
        drive: harness => {
            const song = harness.context.song
            const {instrument, id, row} = strandingPair()
            song.addInstrument(instrument)
            const column = drawnColumnWithoutRow(song, row)
            song.addNoteAt(column, 2, id)
            harness.push()
            //the scenario is worth nothing if nothing ended up stranded, and two empty sets compare
            //equal - so the precondition is asserted rather than assumed
            expect(computeStrandedRows(song.columns[column].notes, song.instruments)).toEqual(
                new Set([row])
            )
        },
    },
    {
        what: 'with the bar groups regrouped',
        drive: harness => {
            harness.context.props.beatMarks = 4
            harness.push()
        },
    },
    {
        what: 'with a breakpoint and a tempo changer on drawn columns',
        drive: harness => {
            harness.context.song.toggleBreakpoint(38)
            harness.context.song.setTempoChangerAt(41, TEMPO_CHANGERS[2])
            harness.push()
        },
    },
    {
        what: 'with a span reaching the window from far off-screen',
        drive: harness => {
            //idOf(12) is a note id makeSong never uses, so nothing truncates the span
            harness.context.song.addNoteAt(0, 1, idOf(12), 90)
            harness.push()
        },
    },
    {
        what: 'with a span grown after it was first painted',
        drive: harness => {
            harness.context.song.addNoteAt(24, 1, idOf(12), 1)
            harness.push()
            harness.context.song.setNoteSpan(24, 1, idOf(12), 30)
            harness.push()
        },
    },
    {
        what: 'after the song was replaced under a warm pool',
        drive: harness => {
            harness.context.song = makeOtherSong()
            harness.push()
        },
    },
    {
        //the structure and the playhead moving in ONE update - a keypress during playback. The
        //repaint table has the matching row for how much it repainted; this is what it looks like,
        //and it is where the two selection overlays the narrowed repaint writes are compared: 40
        //has to have lost the flag without being repainted, 41 to have gained it.
        what: 'after a note was added in the same update that moved the playhead',
        drive: harness => {
            harness.context.song.addNoteAt(41, 0, idOf(3))
            harness.context.song.selected += 1
            harness.push()
        },
    },
    {
        /**
         * A span edited from OUTSIDE the drawn window, whose bars are inside it.
         *
         * A per-column skip that is right about a column's own notes and wrong about its TAILS is
         * invisible until this happens - which is what a user dragging a duration slider on a note
         * that has scrolled off the left edge does. It works only because
         * ComposedSong.#touchColumns marks the range a span COVERS, the union of the old and the
         * new on a shrink; a narrowing of that rule to "the column that owns the note" leaves every
         * in-window bar of the old span on screen.
         */
        what: 'after a span reaching into the window was shortened from off-screen',
        drive: harness => {
            const song = harness.context.song
            const tailOpsAt = (index: number) =>
                harness.paintedScene().notes.columns.find(column => column.index === index)?.tails
                    .ops.length
            //column 5 is far outside the window (29..51); the span covers 5..44. idOf(12) is a note
            //id makeSong never uses, so nothing truncates it, and makeSong's own spans (every 8th
            //column, 3 long) reach 42 at the furthest - so column 44's bars come from this note
            //alone.
            song.addNoteAt(5, 1, idOf(12), 40)
            harness.push()
            expect(tailOpsAt(44)).toBeGreaterThan(0)
            song.setNoteSpan(5, 1, idOf(12), 1)
            harness.push()
            expect(tailOpsAt(44)).toBe(0)
        },
    },
    {
        //the two index-shifting edits, for their CONTENT: both splice the live array in place, so
        //they reach the narrowed repaint with column objects at new indexes and every counter one
        //higher. The repaint table's two rows assert the collisions they are built on; this is
        //where a column drawn at another column's position shows up as pixels.
        what: 'after a column was inserted mid-song',
        drive: harness => {
            harness.context.song.addColumns(1, 39)
            harness.push()
        },
    },
    {
        what: 'after a column was removed mid-song',
        drive: harness => {
            harness.context.song.removeColumns(1, 34)
            harness.push()
        },
    },
    parkedAcross('the current layer', harness => {
        harness.context.props.currentLayer = 1
    }),
    parkedAcross('the instrument roster', harness => {
        const song = harness.context.song
        song.setInstrument(1, song.instruments[1].set({visible: false}))
    }),
    parkedAcross('the breakpoints', harness => {
        //45 is inside the window that comes back and is not the column the return edits
        harness.context.song.toggleBreakpoint(45)
    }),
    parkedAcross('the tools selection', harness => {
        harness.context.props.selectedColumns = [44, 45, 46]
    }),
    parkedAcross('the bar grouping', harness => {
        harness.context.props.beatMarks = 4
    }),
    {
        //THE MUTUAL EXCLUSION, against the whole scene rather than against either mark separately:
        //expectedScene in this mode expects the playhead visible and NO column carrying standard[2],
        //and it is built from the song and the props alone. One row is enough for the resting scene
        //- the other rows differ from this one in how the renderer was DRIVEN there, which the mode
        //does not change.
        what: 'as mounted, with smooth scrolling on',
        smoothScroll: true,
        drive: () => {},
    },
    {
        //THE BOTH-AT-ONCE CASE, and the only scenario in this file that builds a tools selection.
        //The selection covers the column the playhead is on, so this is where R1's precedence
        //decision is written down: with no selected overlay to win, that column takes the tools
        //overlay (standard[3] at 0.4) and the line crosses it.
        what: 'with a tools selection covering the playhead, with smooth scrolling on',
        smoothScroll: true,
        drive: harness => {
            harness.context.props.selectedColumns = [36, 37, 38, 39, 40, 41]
            expect(harness.context.props.selectedColumns).toContain(harness.context.song.selected)
            harness.push()
        },
    },
]

describe('the painted scene is what the drawing rules say it is', () => {
    for (const testCase of WINDOWS) {
        it(testCase.what, async () => {
            const context = makeContext()
            context.props.smoothScroll = testCase.smoothScroll ?? false
            const harness = await mount(context)
            try {
                testCase.drive(harness)
                const painted = harness.paintedScene()
                //non-vacuous: expectedScene is built from the song and the props alone, so an empty
                //or truncated reading fails against it rather than passing quietly
                expect(painted).toEqual(expectedScene(harness.context, harness.geometry()))
            } finally {
                harness.destroy()
            }
        })
    }
})

/**
 * The claims the tables above cannot make on their own.
 */
describe('span tails are found by a bounded backward scan, exactly', () => {
    /** Which drawn columns have any tail bar, by column index. */
    function columnsWithTails(harness: Harness): number[] {
        return harness
            .paintedScene()
            .notes.columns.filter(column => column.tails.ops.length > 0)
            .map(column => column.index)
    }

    it('the last column a MAXIMUM-length span covers still draws its bar', async () => {
        const harness = await mount()
        try {
            //the bound is `index - maxSpan + 1`, and it has to be exactly that. A note whose span is
            //the song's longest and whose LAST covered column is the one being painted starts at
            //precisely that bound, so one column tighter drops the final bar of every
            //maximum-length span - the conservative direction, which draws too little rather than
            //too much and therefore looks like nothing at all.
            //(idOf(12) is a note id makeSong never uses, so nothing truncates the span; 8 becomes
            //the longest span in the song, over makeSong's 3.)
            harness.context.song.addNoteAt(30, 1, idOf(12), 8)
            harness.push()
            //30 + 8 - 1 = 37 is the last column the span covers, and 30 is exactly `37 - 8 + 1`
            expect(columnsWithTails(harness)).toContain(37)
            //...and the bound does not reach past the span either: nothing covers 38
            expect(columnsWithTails(harness)).not.toContain(38)
        } finally {
            harness.destroy()
        }
    })

    it('the bound follows the SONG, not just its version: a swap to an equally versioned song', async () => {
        const harness = await mount()
        try {
            harness.push()
            //the maxSpan cache is keyed on (columns identity, structureVersion), the same pair and
            //for the same reason as update()'s diff. Dropping the VERSION half is caught by the
            //content part's 'with a span grown after it was first painted' scenario among others;
            //this is the other half - two songs really can sit at the same version, and a cache that
            //only compared versions would keep the previous song's bound (3) and drop every bar of
            //the 90-column span below.
            const longer = makeEquallyVersionedLongSpanSong()
            expect(longer.structureVersion).toBe(harness.context.song.structureVersion)
            harness.context.song = longer
            harness.push()
            expect(columnsWithTails(harness)).toEqual(harness.attachedColumns())
        } finally {
            harness.destroy()
        }
    })

    it('shortening a span clears the bars it used to draw', async () => {
        const harness = await mount()
        try {
            harness.context.song.setNoteSpan(32, 0, idOf(32 % 7), 6)
            harness.push()
            expect(columnsWithTails(harness)).toContain(36)
            harness.context.song.setNoteSpan(32, 0, idOf(32 % 7), 1)
            harness.push()
            expect(columnsWithTails(harness)).not.toContain(36)
        } finally {
            harness.destroy()
        }
    })
})

describe('the pooled column views', () => {
    it('a steady-state playback tick constructs and destroys nothing', async () => {
        const harness = await mount()
        try {
            //warm the pool past the point where any view still has to grow its note-sprite array
            for (let tick = 0; tick < 20; tick++) {
                harness.context.song.selected += 1
                harness.push()
            }
            counters.reset()
            //THE WITNESS: every measured tick has to actually paint. Without it this test passes
            //when the renderer paints nothing at all - no cache, a hidden stage, an empty window -
            //because zero constructions is exactly what doing nothing produces.
            const ticks = 25
            for (let tick = 0; tick < ticks; tick++) {
                harness.context.song.selected += 1
                //one column leaves the window and one enters, and the entering one - the last of
                //the drawn range, since the step is forward and the window is nowhere near the end
                //of the song - is the one painted
                const drawn = harness.drawnColumns()
                expect(harness.push()).toEqual({
                    renders: {notes: 1, timeline: 1},
                    columnPaints: 1,
                    paintedColumns: [drawn[drawn.length - 1]],
                    timelineRebuilds: 0,
                    viewsCreated: 0,
                    viewsDestroyed: 0,
                })
            }
            expect(counters.constructed).toEqual({containers: 0, sprites: 0, graphics: 0})
            expect(counters.destroyed).toEqual({containers: 0, sprites: 0, graphics: 0})
            //...and what it painted over those 25 ticks is still the whole scene, correctly
            expect(harness.paintedScene()).toEqual(expectedScene(harness.context, harness.geometry()))
        } finally {
            harness.destroy()
        }
    })

    it('hold a fixed child layout, in the order pixi draws them', async () => {
        const harness = await mount()
        try {
            harness.push()
            for (const kinds of harness.columnChildKinds()) {
                //background, selection overlay and breakpoint marker, then one tail Graphics, then
                //the note sprites - hidden ones included, which is what separates this from the
                //same destructuring in describeColumn. `zIndex` decides nothing here: pixi only
                //sorts a container's children when the PARENT sets sortableChildren, and nothing in
                //this renderer does.
                expect(kinds.slice(0, 4)).toEqual(['sprites', 'sprites', 'sprites', 'graphics'])
                expect(kinds.slice(4).every(kind => kind === 'sprites')).toBe(true)
                expect(kinds.filter(kind => kind === 'graphics')).toHaveLength(1)
            }
        } finally {
            harness.destroy()
        }
    })

    it('stay in ascending column order however the window got there', async () => {
        const harness = await mount()
        try {
            //forward, backward and a jump: the release/acquire pass reaches the same arrangement
            //from every direction, which is what makes the pooled scene graph the tree a full
            //rebuild would have built
            for (const step of [1, 1, -1, -1, -1, 30, -60, 4]) {
                harness.context.song.selected = Math.max(0, harness.context.song.selected + step)
                harness.push()
                const attached = harness.attachedColumns()
                expect(attached).toEqual([...attached].sort((a, b) => a - b))
            }
        } finally {
            harness.destroy()
        }
    })

    it('are thrown away, not reused, when the texture cache is regenerated', async () => {
        const harness = await mount()
        try {
            harness.push()
            const before = harness.currentCache()
            const dropped = harness.push()
            expect(dropped.viewsDestroyed).toBe(0)
            counters.reset()
            await harness.resize()
            //every view held textures from the previous ComposerCache, which is destroyed 500ms
            //after the new one is built - a surviving pool would be pointing at destroyed GPU
            //resources. So: destroyed, rebuilt, and repainted from the NEW cache's textures.
            expect(harness.currentCache()).not.toBe(before)
            expect(counters.destroyed.containers).toBe(harness.windowSize())
            expect(counters.constructed.containers).toBe(harness.windowSize())
            const textures = harness
                .paintedScene()
                .notes.columns.flatMap(column =>
                    [column.background, column.overlay, column.breakpoint, ...column.notes].flatMap(
                        sprite => (sprite ? [sprite.texture] : [])
                    )
                )
            expect(textures).not.toContain(NOT_IN_THE_CURRENT_CACHE)
            //and the geometry moved with it, so the scene is repainted against the new sizes. This
            //is also what makes the line above mean something: an empty reading contains nothing.
            expect(harness.paintedScene()).toEqual(expectedScene(harness.context, harness.geometry()))
        } finally {
            harness.destroy()
        }
    })

    it('are destroyed on teardown, including the ones parked outside the scene graph', async () => {
        const harness = await mount()
        try {
            //release most of the window into the free list, where app.destroy({children: true})
            //cannot reach it - a released view has no parent at all
            harness.context.song.selected += 50
            harness.push()
            counters.reset()
        } finally {
            harness.destroy()
        }
        //the whole pool: the window on screen plus everything on the free list
        expect(counters.destroyed.containers).toBeGreaterThanOrEqual(COLUMNS_PER_CANVAS + 3)
    })
})

describe('the drawn window', () => {
    it('is the closed form of isColumnVisible, over the columnsPerCanvas options the setting offers', () => {
        //the renderer derives first/last in closed form instead of filtering the whole song through
        //isColumnVisible on every draw.
        //The list is READ OUT OF THE SETTING rather than copied here: an option added there is
        //covered on the day it is added, which is what lets isColumnVisible's docstring name this
        //test as what keeps the definition and the closed form agreeing.
        const options = ComposerSettings.data.columnsPerCanvas.options
        //...and the value the rest of this file drives the renderer with is one of them, so those
        //rows exercise a configuration the composer can be put into
        expect(options).toContain(COLUMNS_PER_CANVAS)
        const columns = 200
        for (const perCanvas of options) {
            //the same rule computeCanvasSize applies, so the odd options - where columnWidth's
            //rounding leaves the canvas holding a non-integer number of columns - are covered
            const columnWidth = nearestEven(CANVAS_WIDTH / perCanvas)
            const playheadX = CANVAS_WIDTH / 2
            const geometry: ColumnWindowGeometry = {width: CANVAS_WIDTH, columnWidth, playheadX}
            //WINDOW_BLEED_COLUMNS, restated rather than imported, for the same reason the closed
            //form below is restated: a shared constant would move both sides together
            const bleed = 2 * columnWidth
            //FRACTIONAL positions among the integer ones: the window is a function of a gliding
            //scroll now, and every column-counting shortcut that is exact on integers is exactly
            //what stops agreeing halfway between two columns
            for (const position of [0, 0.5, 1, 7, 40, 40.25, 40.5, 99.75, 150, 198, 199]) {
                const low = position - (playheadX + bleed) / columnWidth - 1
                const high = position + (CANVAS_WIDTH + bleed - playheadX) / columnWidth
                const first = Math.max(0, Math.floor(low) + 1)
                const last = Math.min(columns - 1, Math.ceil(high) - 1)
                const closedForm: number[] = []
                for (let i = first; i <= last; i++) closedForm.push(i)
                const definition: number[] = []
                for (let i = 0; i < columns; i++) {
                    if (isColumnVisible(i, position, geometry)) definition.push(i)
                }
                expect(closedForm).toEqual(definition)
            }
        }
    })
})

/**
 * The scroll offset's SECOND statement, and a consequence rather than a restatement.
 *
 * expectedNotesOffset says where the container belongs as a formula, which a draw path that made
 * the same mistake would agree with. This says what the composer has to DO: whatever x the offset
 * puts the selected column at, ComposerRenderer.handleStageUp - which inverts it through
 * columnAtCanvasX, the one helper every pointer path in the class shares - has to read a pointer
 * there as the selected column. The x is taken off the painted scene (the container's offset plus the view's own
 * x) rather than recomputed, so the two meet on the canvas instead of on paper.
 */
describe('the notes scroll offset and the click handler are inverses', () => {
    /** The record for one drawn column, or a failure saying which column was missing. */
    function drawnColumn(scene: PaintedScene, index: number): PaintedColumn {
        const column = scene.notes.columns.find(drawn => drawn.index === index)
        if (!column) throw new Error(`column ${index} is not drawn`)
        return column
    }

    it('a click on the drawn selected column selects nothing, and one column either way selects the neighbour', async () => {
        const harness = await mount()
        try {
            harness.push()
            const {columnWidth} = harness.geometry()
            const selected = harness.context.song.selected
            const scene = harness.paintedScene()
            //canvas coordinates, which is what a pointer event carries: where the container was
            //scrolled to, plus where the view sits inside it
            const middleOfSelected = scene.notes.x + drawnColumn(scene, selected).x + columnWidth / 2

            harness.releasePointerOverNotes(middleOfSelected)
            //a click on the column already selected asks for no move at all
            expect(harness.selectColumnCalls).toEqual([])

            harness.releasePointerOverNotes(middleOfSelected + columnWidth)
            harness.releasePointerOverNotes(middleOfSelected - columnWidth)
            //...and one column either way lands on the neighbour, undefined `ignoreAudio` being
            //what makes a clicked column play
            expect(harness.selectColumnCalls).toEqual([
                {index: selected + 1, ignoreAudio: undefined},
                {index: selected - 1, ignoreAudio: undefined},
            ])
        } finally {
            harness.destroy()
        }
    })
})

describe('a theme edit reaches the pool as one repaint', () => {
    it('a column entering the window before that repaint takes the accent the window already has', async () => {
        const harness = await mount()
        const previousAccent = ThemeProvider.get('accent').hex()
        const previousAccentNumber = ThemeProvider.get('accent').rgbNumber()
        try {
            //a span on the CURRENT layer long enough that every drawn column carries an accent-
            //coloured bar, including the one that is about to enter the window - without it the
            //entering column has no tail and there is nothing for a wrong accent to show up on.
            //(idOf(12) is a note id makeSong never uses, so nothing truncates the span.)
            harness.context.song.addNoteAt(0, 0, idOf(12), 90)
            harness.push()
            expect(
                harness.paintedScene().notes.columns.every(column => column.tails.ops.length > 0)
            ).toBe(true)
            //a theme edit reaches this class through subscribeTheme's own 50ms debounce, and the
            //repaint it ends in is behind a SECOND one (recalculateCacheAndSizes'). In between, the
            //renderer holds the new theme while every column on screen is painted in the old one -
            //and a playback tick in that window repaints exactly one column.
            ThemeProvider.set('accent', '#123456')
            await vi.advanceTimersByTimeAsync(60)
            expect(ThemeProvider.get('accent').rgbNumber()).not.toBe(previousAccentNumber)
            harness.context.song.selected += 1
            expect(harness.push().columnPaints).toBe(1)
            expect(harness.paintedScene()).toEqual(
                expectedScene(harness.context, harness.geometry(), previousAccentNumber)
            )
            //...and the debounced repaint moves the whole window to the new accent at once
            await vi.advanceTimersByTimeAsync(60)
            expect(harness.paintedScene()).toEqual(
                expectedScene(harness.context, harness.geometry(), ThemeProvider.get('accent').rgbNumber())
            )
        } finally {
            harness.destroy()
            //ThemeProvider is a singleton shared by every test in this file
            ThemeProvider.set('accent', previousAccent)
        }
    })
})

/**
 * The two notes-canvas channels that sit outside the pixi scene graph, DRIVEN rather than assumed.
 *
 * expectedScene states both from ThemeProvider, and ComposerRenderer writes both in
 * handleThemeChange - but init() also writes them once, from the same expressions, so in a scenario
 * where the theme never moves a live channel and a frozen one read the same. This moves the value
 * they come from, so the reading has to follow it.
 */
describe('the notes canvas clear colour and inline style follow the theme', () => {
    it('a primary change moves both, and the scene comes back correct on the other side', async () => {
        const harness = await mount()
        const previousPrimary = ThemeProvider.get('primary').toString()
        try {
            harness.push()
            const before = harness.paintedScene()
            //an alpha under applyNotesCanvasOpacity's 0.8 floor moves the CSS declaration, and a
            //different colour moves what the Application clears to behind the columns
            ThemeProvider.set('primary', 'rgba(20, 30, 40, 0.5)')
            //subscribeTheme's own debounce, then recalculateCacheAndSizes' - the second is what
            //rebuilds the texture cache and repaints the pool, so this waits both out
            await vi.advanceTimersByTimeAsync(200)
            const after = harness.paintedScene()
            expect(after.notes.clearColor).not.toBe(before.notes.clearColor)
            expect(after.notes.canvasStyle).not.toBe(before.notes.canvasStyle)
            expect(after).toEqual(expectedScene(harness.context, harness.geometry()))
        } finally {
            harness.destroy()
            //ThemeProvider is a singleton shared by every test in this file
            ThemeProvider.set('primary', previousPrimary)
        }
    })
})

/**
 * The per-column counters NARROW a repaint; they do not trigger one. The structure version is the
 * entry condition and the counters only decide how much of the window it costs.
 *
 * That split is what lets phase 4 assume every counter it reads is accompanied by a structure bump,
 * which is the contract test/reactivePublish.test.ts pins from the model side - every #touchColumns
 * and #touchAllColumns pass there is paired with a #bumpStructure.
 */
describe('the entry condition is the structure version, not the per-column counters', () => {
    it('a counter that moves without a structure bump repaints nothing', async () => {
        const harness = await mount()
        try {
            harness.push()
            //bumping a counter by hand, which no mutator does without also bumping the structure
            for (const column of harness.context.song.columns) column.version++
            expect(harness.push()).toEqual({
                renders: {notes: 0, timeline: 0},
                columnPaints: 0,
                paintedColumns: [],
                timelineRebuilds: 0,
                viewsCreated: 0,
                viewsDestroyed: 0,
            })
        } finally {
            harness.destroy()
        }
    })
})

/**
 * The drawn columns carrying the SELECTED overlay: overlay slot 2 at alpha 0.8, which is what
 * ColumnView.paintSelection draws for a selected column and never for a tools-only one (slot 3 at
 * 0.4). A hidden overlay reads as null, which is what an unselected column has.
 *
 * Returned as a LIST rather than as the one column, because "no column carries it" is the correct
 * state with smooth scrolling on and has to be assertable rather than a thrown error.
 */
function selectedColumnsOf(harness: Harness): number[] {
    return harness
        .paintedScene()
        .notes.columns.filter(
            column => column.overlay?.texture === 'standard[2]' && column.overlay.alpha === 0.8
        )
        .map(column => column.index)
}

/**
 * The one column carrying it, for the snap-mode scenarios. Throws when that is not exactly one drawn
 * column, so "the overlay went missing entirely" fails here rather than reading as "it did not
 * move".
 */
function selectedColumnOf(harness: Harness): number {
    const carrying = selectedColumnsOf(harness)
    if (carrying.length !== 1) {
        throw new Error(`${carrying.length} drawn columns carry the selection overlay, expected 1`)
    }
    return carrying[0]
}

// ---------------------------------------------------------------------------------------------
// PART FIVE: THE GLIDE.
//
// Everything above drives the renderer with smooth scrolling OFF, where a playback tick applies
// itself inside update() and the scroll position is `selected` by assignment. This part turns it on,
// which splits those two apart: update() only SCHEDULES, an animation frame is what moves the
// canvas, and between two ticks the scroll position is a fraction that `selected` never takes.
//
// WHAT IT IS AIMED AT, since "the canvas moves smoothly" is not something a test can look at:
//  - the SCHEDULE being an absolute timeline rather than a chase. A glide that eased toward a
//    target would pass a test that only checked the endpoints and be wrong in between, so the rows
//    below read the position at fractions of a column and state where it belongs;
//  - the LOOKAHEAD, which is the difference between the playhead marking what is being heard and
//    the playhead running a quarter second ahead of it. It is invisible at the endpoints too - the
//    column is right either way - and shows up only as WHEN the travel starts;
//  - tempo changers, whose whole point here is that the speed changes with them;
//  - the queue, which only does anything when more segments are in flight than one, i.e. when
//    columns are shorter than the lookahead. A two-slot implementation passes every tempo-1 row;
//  - the line and the overlay being MUTUALLY EXCLUSIVE, which is what keeps one mark on the canvas
//    rather than two disagreeing ones.
//
// The clock is driven, never slept through: vi.useFakeTimers replaces requestAnimationFrame and
// performance.now together, so advancing the timers by N ms both fires the frames that would have
// happened and moves the clock those frames read. The frames themselves come off the notes
// Application's Ticker (see the FakeTicker), whose maxFPS gate lets through only some of them.
describe('the smooth scroll', () => {
    /** msPerBeat at BPM, by the arithmetic Composer.svelte's playback loop and the renderer share. */
    const columnMs = (changer: number) => Math.round((60000 / BPM) * changer)
    const WHOLE = columnMs(1)
    const QUARTER = columnMs(0.25)

    /**
     * Assert the playhead is where `expected` says, to within the frame it was last moved on.
     *
     * The position can only be read where a frame put it, so an expectation stated at an arbitrary
     * instant is satisfied by the last EMITTED frame at or before it - never after. The interval is
     * therefore `[expected - the travel since that frame, expected]`, taken from the ticker's own
     * record of when it last emitted rather than from a nominal frame length. That matters because
     * the cap is a frame-SKIP gate: against a fixed 16ms rAF grid, 48fps emits at 32/16/16ms, so a
     * "one frame is 16ms" tolerance is wrong by a factor of two exactly when it is asked to be
     * tight. Reading the real interval also keeps it tight at any tempo - at 1/4 a fixed tolerance
     * loose enough for the worst gap would accept half the column.
     */
    function expectPosition(harness: Harness, expected: number, columnDurationMs: number) {
        const position = harness.scrollPosition()
        const staleness = harness.msSinceLastFrame() / columnDurationMs
        expect(position).toBeLessThanOrEqual(expected + Number.EPSILON * 64)
        expect(position).toBeGreaterThanOrEqual(expected - staleness - Number.EPSILON * 64)
    }

    async function mountGliding() {
        const context = makeContext()
        context.props.smoothScroll = true
        //playback has not started yet: the renderer must see isPlaying go false -> true, which is
        //the update togglePlay produces and the one that schedules the first column's travel
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        return harness
    }

    /** Press play: the update where isPlaying flips with `selected` where it already was. */
    function startPlaying(harness: Harness) {
        harness.context.props.isPlaying = true
        return harness.push()
    }

    /** One playback tick: what handlePlaybackTick does to the state, and nothing else. */
    function tick(harness: Harness) {
        harness.context.song.selected += 1
        return harness.push()
    }

    it("holds still for the lookahead, then travels one column over that column's length", async () => {
        const harness = await mountGliding()
        try {
            expect(harness.scrollPosition()).toBe(SELECTED)
            //pressing play schedules; it paints nothing, because nothing has moved yet
            expect(startPlaying(harness).columnPaints).toBe(0)
            expect(harness.scrollPosition()).toBe(SELECTED)

            //THE LOOKAHEAD. Column SELECTED's notes were scheduled to sound LOOKAHEAD_MS from now,
            //so until then the playhead belongs where it is - a canvas that started moving at once
            //would be a quarter second ahead of the music for the whole song.
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS - 32)
            expect(harness.scrollPosition()).toBe(SELECTED)

            //...and from there it travels one whole column over one whole column's worth of time.
            //Read at the halfway point rather than only at the ends: an ease, or a chase toward a
            //target, agrees at both ends and disagrees here.
            await vi.advanceTimersByTimeAsync(32 + WHOLE / 2)
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, SELECTED + 1, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('travels a quarter-length column four times as fast', async () => {
        const harness = await mountGliding()
        try {
            //the column the FIRST glide runs through, so the two halves below are the same journey
            //at two tempos rather than two different journeys
            harness.context.song.setTempoChangerAt(SELECTED, TEMPO_CHANGERS[2])
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + QUARTER / 2)
            //half a 1/4 column takes an eighth of a whole one, and the playhead is half way
            expectPosition(harness, SELECTED + 0.5, QUARTER)
            await vi.advanceTimersByTimeAsync(QUARTER / 2)
            expectPosition(harness, SELECTED + 1, QUARTER)
            //...and it does NOT run on past the column it was given: with no further tick the
            //schedule has run out, and holding is what a late tick has to look like
            await vi.advanceTimersByTimeAsync(WHOLE)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
        } finally {
            harness.destroy()
        }
    })

    /**
     * REPLACES 'keeps the overlay on the column the playhead is inside, not on the one selected'.
     *
     * That test's premise was that the overlay lags `selected` by the lookahead during a glide, so
     * that the highlight and the line agree. There is no overlay to lag any more: with smooth
     * scrolling on the line is the only mark, and the two are mutually exclusive. What the deleted
     * test was really protecting - the mark not running a lookahead ahead of the music - is carried
     * by the position assertions in the rows above, which state where the LINE is at fractions of a
     * column.
     */
    it('draws no selection overlay at all, before, during and after a tick', async () => {
        const harness = await mountGliding()
        try {
            expect(selectedColumnsOf(harness)).toEqual([])
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            expect(selectedColumnsOf(harness)).toEqual([])

            //THE TICK, which moves `selected` to the next column while the playhead is still inside
            //this one - it is a lookahead short of the boundary. Neither column may acquire it.
            tick(harness)
            expect(harness.context.song.selected).toBe(SELECTED + 1)
            expect(selectedColumnsOf(harness)).toEqual([])

            //...and the playhead crossing the boundary does not produce one either
            await vi.advanceTimersByTimeAsync(WHOLE / 2 + LOOKAHEAD_MS)
            expect(harness.scrollPosition()).toBeGreaterThan(SELECTED + 1)
            expect(selectedColumnsOf(harness)).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    /**
     * The POSITIVE half of R1's mode gate. Everything else states where the line is NOT: the scene
     * comparisons run in snap mode and expect it hidden, and the row above expects no overlay. A
     * renderer that hid the line in both modes would satisfy all of them and leave the composer
     * with no mark at all while gliding.
     *
     * The recording flag is here rather than in the repaint table because the table runs in snap
     * mode, where the line is already hidden and the second term changes nothing.
     */
    it('draws the line at the canvas centre, and hides it with the stage while audio records', async () => {
        const harness = await mountGliding()
        try {
            const {canvasWidth, height} = harness.geometry()
            const drawn = () => harness.paintedScene().notes.playhead
            expect(drawn().visible).toBe(true)
            //AT THE CENTRE, which is what makes it agree with the container offset: the offset puts
            //the start of the scrolled-to column here, so a line drawn anywhere else marks a column
            //the composer is not on while every other value in the scene stays right.
            expect(drawn().ops).toEqual([
                ['rect', canvasWidth / 2 - 1.5, 0, 3, height],
                //the arrowheads, each based on a canvas edge and pointing inwards along the bar
                ['poly', [canvasWidth / 2 - 6, 0, canvasWidth / 2 + 6, 0, canvasWidth / 2, 8]],
                ['poly', [canvasWidth / 2 - 6, height, canvasWidth / 2 + 6, height, canvasWidth / 2, height - 8]],
                //ONE fill for all three, so the bar and its arrows cannot drift apart in colour
                ['fill', {color: ThemeProvider.get('accent').rgbNumber(), alpha: 0.9}],
            ])

            harness.context.props.isRecordingAudio = true
            harness.push()
            //The line is a SIBLING of the columns container, so hiding the columns for a recording
            //has no reach over it - without a term of its own the recording shows an empty
            //background with a red line standing in the middle of it, and a still one at that,
            //since applyScrollPosition returns before touching anything while that flag is set.
            expect(drawn().visible).toBe(false)
            //hidden, not cleared: the drawing survives, so bringing the stage back costs no
            //GraphicsContext rebuild
            expect(drawn().ops).toHaveLength(4)
        } finally {
            harness.destroy()
        }
    })

    it('truncates the segment a tick arrives EARLY inside, so the line does not lag the music', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            //100ms EARLY, which is what Composer.svelte's `delayOffset` drift term produces in the
            //real app - every tick there is scheduled against the measured error of the last one,
            //so a tick landing exactly on the nominal cadence is the exception rather than the
            //rule. Every other row in this part ticks on the nominal cadence, which is the one
            //case the truncation branch cannot fire in.
            await vi.advanceTimersByTimeAsync(WHOLE - 100)
            tick(harness)

            //The new segment starts one lookahead from the tick, and the old one is cut back to end
            //there. Without the cut the playhead is still travelling through the previous column
            //when the next one's travel begins, so it arrives at the boundary late and stays late -
            //measured at a third of a column behind the music, for the rest of the song.
            //past the truncated segment's end by more than one emitted frame, so the reading cannot
            //be a stale frame rather than a lagging playhead - at 30fps an emitted frame is 33ms,
            //which on a 273ms column is 0.12 of one, against the third of a column an untruncated
            //segment leaves behind
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + 100)
            expect(harness.scrollPosition()).toBeGreaterThanOrEqual(SELECTED + 1)
        } finally {
            harness.destroy()
        }
    })

    it('runs a continuous timeline when columns are shorter than the lookahead', async () => {
        const harness = await mountGliding()
        try {
            //1/4 columns at 220bpm last 68ms against a 250ms lookahead, so by the time the first
            //one is heard the loop has already ticked past three more. THIS is what a single
            //"current glide" slot cannot hold: each tick would overwrite the pending one and the
            //playhead would skip the columns in between.
            for (let index = SELECTED; index < SELECTED + 8; index++) {
                harness.context.song.setTempoChangerAt(index, TEMPO_CHANGERS[2])
            }
            startPlaying(harness)
            //four ticks arrive inside the lookahead window, before the playhead has moved at all
            for (let i = 0; i < 4; i++) {
                await vi.advanceTimersByTimeAsync(QUARTER)
                tick(harness)
            }
            expect(harness.context.song.selected).toBe(SELECTED + 4)
            //four ticks have been taken and the playhead has not finished the FIRST column: the
            //queue is holding the other three rather than the last one having overwritten them
            expect(harness.scrollPosition()).toBeLessThan(SELECTED + 1)

            //...and then the playhead WALKS the columns it was given, one at a time and in order.
            //Sampled finely and reduced to the sequence of columns the line passed THROUGH rather
            //than to four readings at column boundaries: a reading taken at a boundary is a coin
            //flip on how stale the last frame is (the cap emits unevenly - see expectPosition),
            //while a skipped column is what the queue exists to rule out and shows up here
            //directly.
            const seen: number[] = [Math.floor(harness.scrollPosition())]
            //five columns' worth of sampling for four columns of travel: the cap emits unevenly,
            //so the frame that lands ON the final boundary may be up to one frame late
            for (let step = 0; step < 5 * 8; step++) {
                await vi.advanceTimersByTimeAsync(QUARTER / 8)
                const at = Math.floor(harness.scrollPosition())
                if (seen[seen.length - 1] !== at) seen.push(at)
            }
            expect(seen).toEqual([
                SELECTED,
                SELECTED + 1,
                SELECTED + 2,
                SELECTED + 3,
                SELECTED + 4,
            ])
        } finally {
            harness.destroy()
        }
    })

    it('carries the pool along with the glide, not with the state', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            const before = harness.attachedColumns()
            //two whole columns of travel, ticked on the beat so the schedule's predictions and its
            //corrections agree and the timeline is one unbroken run
            await vi.advanceTimersByTimeAsync(WHOLE)
            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE)
            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE)

            //THE WINDOW IS A FUNCTION OF THE GLIDE, stated through the exported definition at the
            //fractional position the canvas is actually at - not at `selected`, which by now is a
            //lookahead ahead of it. A pool advanced from the state instead would hold a window
            //shifted by that much and every column in it would still be painted correctly.
            const position = harness.scrollPosition()
            expect(position).toBeGreaterThan(before[0])
            const visible: number[] = []
            for (let i = 0; i < harness.context.song.columns.length; i++) {
                if (isColumnVisible(i, position, WINDOW_GEOMETRY)) visible.push(i)
            }
            expect(harness.attachedColumns()).toEqual(visible)
            expect(harness.attachedColumns()).not.toEqual(before)

            //...and the CONTENT of the window is what a renderer that never glided paints for the
            //same columns. Let the schedule run out first, which parks the playhead on an exact
            //column boundary (see scrollPositionAt), so the reference can be mounted at a state
            //that names it and the two scenes are comparable whole rather than column by column.
            await vi.advanceTimersByTimeAsync(WHOLE * 2)
            const parked = harness.scrollPosition()
            expect(Number.isInteger(parked)).toBe(true)
            const glided = harness.paintedScene()

            //the reference stays in the SAME MODE, which it did not have to before R1 made the mode
            //decide two things about the scene. It still cannot glide: mount() never calls update(),
            //so syncScrollSchedule never runs on it and it draws once from init() at
            //`scrollPosition = initialState.selected`, which is the column named on the line below.
            harness.context.song.selected = parked
            const reference = await mount(harness.context)
            try {
                expect(glided).toEqual(reference.paintedScene())
            } finally {
                reference.destroy()
            }
        } finally {
            harness.destroy()
        }
    })

    it('snaps to the selected column when playback stops mid-column', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            harness.context.props.isPlaying = false
            harness.push()
            //PAUSING EASES, it does not jump. The position is still the fraction the playhead had
            //reached at the moment of the pause, and the 140ms ease is what carries it to a column.
            expect(harness.scrollPosition()).toBeGreaterThan(SELECTED)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            //...and it lands BACKWARD, on the column the line was inside - the last one whose notes
            //were played - rather than forward on `selected`, which the transport had advanced to a
            //lookahead before its notes would have been heard.
            expect(harness.scrollPosition()).toBe(SELECTED)
            //...and STILL no overlay, because the mode is keyed on the SETTING and not on whether
            //the song is playing. A stopped composer with smooth scrolling on shows the line on the
            //column it is parked at and no highlight; that is a deliberate consequence of R1's
            //mutual exclusion rather than an oversight of the stopped case.
            expect(selectedColumnsOf(harness)).toEqual([])

            //...and no frame moves it afterwards, which is the loop actually being stopped rather
            //than running against an empty schedule
            await vi.advanceTimersByTimeAsync(WHOLE * 2)
            expect(harness.scrollPosition()).toBe(SELECTED)
        } finally {
            harness.destroy()
        }
    })

    it('pauses onto the last column that was PLAYED, not the one the transport had reached', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            //one tick, so `selected` is a column ahead of the line - which is the ordinary state
            //during playback, not an edge case: the transport advances a lookahead before the
            //notes it announces are heard. Pausing here is where snapping to `selected` would jump
            //the canvas FORWARD onto a column nothing has played yet.
            await vi.advanceTimersByTimeAsync(WHOLE)
            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.context.song.selected).toBe(SELECTED + 1)
            const midColumn = harness.scrollPosition()
            expect(midColumn).toBeGreaterThan(SELECTED)
            expect(midColumn).toBeLessThan(SELECTED + 1)

            harness.selectColumnCalls.length = 0
            harness.context.props.isPlaying = false
            harness.push()
            //the composer is told to go back to the column the line is inside, with ignoreAudio -
            //a pause that sounded a note would be its own bug - and the app state follows the
            //canvas rather than the canvas being dragged to the state
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED, ignoreAudio: true}])
            //...and it EASES there rather than arriving, which is the whole point of the branch
            expect(harness.scrollPosition()).toBe(midColumn)

            harness.context.song.selected = SELECTED
            harness.push()
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.scrollPosition()).toBe(SELECTED)
            //and the selectColumn round-trip it made itself did not undo the ease on the way past
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('snaps for a jump, and resumes gliding on the next tick', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)

            //a breakpoint jump, a click, the wheel: `selected` moving by anything but one column
            harness.context.song.selected = 60
            harness.push()
            expect(harness.scrollPosition()).toBe(60)

            //...and the jump re-anchors the SCHEDULE and not only the position: the playhead
            //travels on through column 60, which is the column it would skip outright if the next
            //tick's segment were the only thing in the queue
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            expectPosition(harness, 60.5, WHOLE)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, 61, WHOLE)

            //THE STALL A JUMP COSTS, stated rather than smoothed over. A click does not reset the
            //playback loop's own timer, so the next tick arrives at a moment unrelated to the
            //anchor this jump created - here a full column later, while the column it announces is
            //only heard a lookahead after that. The playhead waits at the line for the difference
            //instead of running ahead of the music or stepping back to meet it.
            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.scrollPosition()).toBe(61)

            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS - WHOLE / 2 + WHOLE / 2)
            expectPosition(harness, 61.5, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('leaves the glide running when an edit lands mid-column', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            const midColumn = harness.scrollPosition()
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            //note entry is not gated on isPlaying, so this is a real state an edit arrives in. It
            //takes the repaint path, which draws at the position the glide has reached - a path
            //that redrew from `selected` would snap the canvas forward under the user's hand.
            harness.context.song.addNoteAt(SELECTED + 3, 0, idOf(11))
            harness.push()
            expect(harness.scrollPosition()).toBeCloseTo(midColumn, 5)

            //...and the glide carries on from there rather than having been cleared
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, SELECTED + 1, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('snaps and stops when the setting is turned off mid-column', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            //the toggle is the whole point of the setting existing - it has to be comparable
            //against the snapping scroll WITHOUT a reload, from any moment
            harness.context.props.smoothScroll = false
            harness.push()
            expect(harness.scrollPosition()).toBe(SELECTED)

            //...and a tick from there applies itself inside update(), synchronously, which is the
            //behaviour every other part of this file is driving
            tick(harness)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            await vi.advanceTimersByTimeAsync(WHOLE * 2)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
        } finally {
            harness.destroy()
        }
    })

    it('stops requesting frames once the renderer is destroyed', async () => {
        const harness = await mountGliding()
        startPlaying(harness)
        await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
        const rendersBefore = harness.notesRenders()
        //the glide IS running at this point, so the count below is a stopped loop rather than one
        //that was never started
        await vi.advanceTimersByTimeAsync(WHOLE / 4)
        expect(harness.notesRenders()).toBeGreaterThan(rendersBefore)

        harness.destroy()
        const rendersAtDestroy = harness.notesRenders()
        //a loop that outlived destroy() would go on rendering into a destroyed Application, which
        //is the leak the {#key columnsPerCanvas} remount makes routine rather than exotic
        await vi.advanceTimersByTimeAsync(WHOLE * 4)
        expect(harness.notesRenders()).toBe(rendersAtDestroy)
    })
})

// ---------------------------------------------------------------------------------------------
// PART SIX: THE FRAME LOOP.
//
// Everything above reads what the renderer PAINTED. This reads how often it was asked to, which is
// the other half of the same code and the half a scene description cannot see: a loop that renders
// sixty times a second and a loop that renders four leave the same pixels behind.
//
// The loop is the notes Application's own pixi Ticker (see the FakeTicker for what is modelled and
// why). What is stated here:
//  - IDLE, which is the requirement that costs the most to get wrong and the cheapest to satisfy
//    by accident: a renderer that never started the loop passes every scene comparison above;
//  - the CAP, as the value and as the emit count a second of motion produces, because setting it on
//    the wrong ticker looks identical from the value alone;
//  - the loop STOPPING at the end of every kind of motion, not only at destroy();
//  - ONE render per frame that moved and NONE on a frame that did not, which is what makes the cap
//    mean anything - pixi's own render listener would render on every tick regardless;
//  - the TIMELINE staying off the per-frame path while still following the canvas.
describe('the frame loop', () => {
    const columnMs = (changer: number) => Math.round((60000 / BPM) * changer)
    const WHOLE = columnMs(1)

    async function mountGliding() {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        return harness
    }

    it('asks for the column container to be its own render group', async () => {
        const harness = await mount()
        try {
            //ONE LINE in init(), and the largest single item in the per-frame budget: without it
            //pixi walks every descendant of the moved container and repacks each renderable's
            //vertices, on every frame. Nothing in the painted scene changes either way, which is
            //exactly why it needs a statement of its own here.
            expect(harness.columnsAreARenderGroup()).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('does no per-frame work at all while the song is stopped and nothing is being dragged', async () => {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            harness.push()
            const before = {
                renders: harness.notesRenders(),
                timelineRenders: harness.timelineRenders(),
                clears: counters.graphicsClears,
            }
            await vi.advanceTimersByTimeAsync(1000)
            //ALL FIVE, because each catches a different sloppy loop: `started` catches one armed at
            //init, `frames` catches an rAF requested but gated to nothing, the two render counts
            //catch a callback that renders unconditionally, and the clear count catches one that
            //repaints columns. A loop that ran and did nothing moves only the middle two.
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.frameLoop().frames).toBe(0)
            expect(harness.notesRenders()).toBe(before.renders)
            expect(harness.timelineRenders()).toBe(before.timelineRenders)
            expect(counters.graphicsClears).toBe(before.clears)
        } finally {
            harness.destroy()
        }
    })

    it('caps the loop, and a second of gliding emits fewer frames than the display offers', async () => {
        const harness = await mountGliding()
        try {
            expect(harness.frameLoop().maxFPS).toBe(30)
            //...and the cap is on the ticker the renderer actually runs. The value alone cannot say
            //that: setting it on the timeline's ticker, or running a private rAF beside this one,
            //leaves it reading 30 while the frames arrive at the display's rate. Under the fake
            //clock a display frame is every 16ms, so 62 arrive in a second and the gate lets fewer
            //through - near 30 but not exactly, because it is a frame SKIP against that grid rather
            //than a clock (see expectPosition).
            harness.context.props.isPlaying = true
            harness.push()
            const before = harness.frameLoop()
            await vi.advanceTimersByTimeAsync(1000)
            const after = harness.frameLoop()
            const frames = after.frames - before.frames
            const emits = after.emits - before.emits
            expect(frames).toBeGreaterThan(58)
            //bounded on BOTH sides: a gate that let everything through would read ~62, and one that
            //had stopped emitting would read 0. Neither bound is the cap restated - they bracket it.
            expect(emits).toBeGreaterThan(24)
            expect(emits).toBeLessThan(36)
        } finally {
            harness.destroy()
        }
    })

    it('renders once per frame that moved the canvas, and not at all on one that did not', async () => {
        const harness = await mountGliding()
        try {
            harness.context.props.isPlaying = true
            harness.push()
            //THE GLIDE: every emitted frame moves the position, so every one renders exactly once.
            //Two renders per frame is what pixi's own registered render listener produces on top of
            //this class's; zero would mean the loop is not the thing painting.
            const glideStart = {loop: harness.frameLoop(), renders: harness.notesRenders()}
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE)
            const glideEnd = {loop: harness.frameLoop(), renders: harness.notesRenders()}
            const moved = glideEnd.renders - glideStart.renders
            const emitted = glideEnd.loop.emits - glideStart.loop.emits
            expect(moved).toBeGreaterThan(0)
            expect(moved).toBeLessThanOrEqual(emitted)

            //THE STALL: the schedule has run out and is waiting for a late tick, so the loop keeps
            //asking for frames (the tick's segment starts a lookahead in the future and has to be
            //picked up by something) - and the position is clamped, so none of them may render.
            //Measured from AFTER the playhead has reached that clamp, since the frame that puts it
            //there is a frame that moved and renders for that reason.
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            const stallStart = {loop: harness.frameLoop(), renders: harness.notesRenders()}
            await vi.advanceTimersByTimeAsync(WHOLE * 2)
            const stallEnd = {loop: harness.frameLoop(), renders: harness.notesRenders()}
            expect(stallEnd.loop.emits).toBeGreaterThan(stallStart.loop.emits)
            expect(stallEnd.renders).toBe(stallStart.renders)
        } finally {
            harness.destroy()
        }
    })

    it('renders the scene at the offset the frame that rendered it computed', async () => {
        const harness = await mountGliding()
        try {
            harness.context.props.isPlaying = true
            harness.push()
            const notesApp = pixi.applications[pixi.applications.length - 2]
            const before = notesApp.renderedX.length
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE)
            const rendered = notesApp.renderedX.slice(before)
            expect(rendered.length).toBeGreaterThan(0)
            //the offset each render SAW, against the offset the scene holds now. A frame that moved
            //the container after asking for the render - or a callback ordered after pixi's own
            //render listener - costs one frame of lag on every frame and is invisible to every
            //position assertion above, because those all read the container after the fact.
            const {canvasWidth, columnWidth} = harness.geometry()
            const positions = rendered.map(x => (canvasWidth / 2 - x) / columnWidth)
            expect(positions[positions.length - 1]).toBe(harness.scrollPosition())
            //...and they only ever move forward, which is what says each render saw its OWN frame's
            //offset rather than the previous one's
            for (let i = 1; i < positions.length; i++) {
                expect(positions[i]).toBeGreaterThan(positions[i - 1])
            }
        } finally {
            harness.destroy()
        }
    })

    it('stops the loop when playback stops, and leaves nothing running behind it', async () => {
        const harness = await mountGliding()
        try {
            harness.context.props.isPlaying = true
            harness.push()
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE / 2)
            expect(harness.frameLoop().started).toBe(true)

            harness.context.props.isPlaying = false
            harness.push()
            //the pause hands the position to an EASE rather than snapping it, so the loop is still
            //running here - what this test is about is that it stops once that ease is done, which
            //is the same requirement one motion later than it used to be
            expect(harness.frameLoop().started).toBe(true)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.frameLoop().started).toBe(false)
            const after = {loop: harness.frameLoop(), renders: harness.notesRenders()}
            await vi.advanceTimersByTimeAsync(1000)
            //a full second: no further rAF taken, no further emit, no further render
            expect(harness.frameLoop().frames).toBe(after.loop.frames)
            expect(harness.frameLoop().emits).toBe(after.loop.emits)
            expect(harness.notesRenders()).toBe(after.renders)
        } finally {
            harness.destroy()
        }
    })

    it('keeps the timeline off the per-frame path while still following the canvas', async () => {
        const harness = await mountGliding()
        try {
            //A LONG SONG, because the saving is a function of how slowly the outline moves and
            //makeSong's 100 columns are not slow: the whole song spans the timeline's width, so at
            //100 columns the outline travels 16px per column against the ~8 frames a column gets at
            //30fps, and a per-pixel gate fires on every one of them. At 400 it travels 4px, which is
            //where the gate starts saving - and 400 is also the shipped default's neighbourhood.
            harness.context.song.addColumns(300, harness.context.song.columns.length - 1)
            harness.push()
            harness.context.props.isPlaying = true
            harness.push()
            const before = {
                loop: harness.frameLoop(),
                notes: harness.notesRenders(),
                timeline: harness.timelineRenders(),
                viewportX: harness.paintedScene().timeline.viewport.x,
            }
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE)
            const after = {
                notes: harness.notesRenders(),
                timeline: harness.timelineRenders(),
                viewportX: harness.paintedScene().timeline.viewport.x,
            }
            //THE WHOLE SONG spans the timeline's width, so its outline moves a fraction of a pixel
            //per frame while the notes container moves several whole ones. Rendering it on every
            //frame draws the same pixels again, and it is half of all the render() calls a glide
            //makes.
            expect(after.timeline - before.timeline).toBeLessThan(after.notes - before.notes)
            //...and the RULE rather than the ratio, which is what keeps this from turning into a
            //number tuned to this song's geometry: the gate renders when the outline's ROUNDED x
            //moves, so over any interval it can render at most once per whole pixel the outline
            //travelled, plus the one that starts it. On a longer song the same rule saves far more
            //(the outline moves 4px per column on a 400-column one against 16px here); on this one
            //it is still the difference between rendering per frame and rendering per pixel.
            const travelled = after.viewportX - before.viewportX
            expect(after.timeline - before.timeline).toBeLessThanOrEqual(Math.ceil(travelled) + 1)
            //...and the other direction, which is the one an over-eager gate breaks: a column of
            //travel MUST move the outline and MUST reach the canvas. "Never render the timeline"
            //satisfies the lines above and freezes the outline while the notes scroll.
            expect(travelled).toBeGreaterThan(0)
            expect(after.timeline).toBeGreaterThan(before.timeline)
        } finally {
            harness.destroy()
        }
    })
})

// ---------------------------------------------------------------------------------------------
// PART SEVEN: MANUAL SCROLLING.
//
// A drag and a wheel, which are about INPUT and not about playback - so both are run in BOTH scroll
// modes. `smoothScroll` decides whether a playback TICK glides; it has never decided whether the
// canvas follows a finger, and the rows below are what keeps that distinction from quietly
// collapsing back into "smoothScroll means nothing animates".
//
// What each row is aimed at is written at the row. Between them they cover the three ways this can
// go wrong that no scene comparison can see: motion that is quantised rather than continuous, a
// motion FOUGHT by the selectColumn round-trip it makes itself, and a motion that never settles -
// which leaves the composer permanently half a column off `selected`, and every click, edit and
// jump downstream reasons in terms of `selected`.
describe('manual scrolling', () => {
    for (const smoothScroll of [false, true]) {
        const mode = smoothScroll ? 'with smooth scrolling on' : 'with smooth scrolling off'

        async function mountManual() {
            const context = makeContext()
            context.props.smoothScroll = smoothScroll
            //stopped: this part is about input, and a running transport would be a second writer of
            //the position competing with the one under test
            context.props.isPlaying = false
            const harness = await mount(context)
            harness.push()
            return harness
        }

        /** Advance far enough for at least one capped frame to have been emitted. */
        const frame = () => vi.advanceTimersByTimeAsync(64)

        /** The canvas x of the middle of a drawn column, which is what a pointer event carries. */
        function canvasXOfColumn(harness: Harness, index: number): number {
            const {columnWidth} = harness.geometry()
            const scene = harness.paintedScene()
            const column = scene.notes.columns.find(drawn => drawn.index === index)
            if (!column) throw new Error(`column ${index} is not drawn`)
            return scene.notes.x + column.x + columnWidth / 2
        }

        it(`${mode}, a drag moves the canvas by the pointer's real distance, not a column at a time`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                //A THIRD of a column. The old handler returned early below a whole column of
                //accumulated movement, so the canvas did not move at all until a full column had
                //been dragged and then jumped that whole column at once.
                harness.movePointerOverNotes(start - columnWidth / 3)
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1 / 3, 6)
                //...and it keeps following, at two thirds and past a whole column, so the motion is
                //continuous rather than quantised on some finer grid
                harness.movePointerOverNotes(start - (columnWidth * 2) / 3)
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 2 / 3, 6)
                harness.movePointerOverNotes(start - (columnWidth * 4) / 3)
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 4 / 3, 6)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a drag is not yanked back by the selectColumn round-trip it makes itself`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * 1.5)
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1.5, 6)
                //the drag calls selectColumn with the FLOOR of the position - the column under the
                //line - at most once per column crossed
                expect(harness.selectColumnCalls).toEqual([
                    {index: SELECTED + 1, ignoreAudio: true},
                ])

                //AND NOW THE UPDATE THAT CALL PRODUCES. Svelte flushes it in a microtask, i.e.
                //between two pointermove events, and without the drag guard in syncScrollSchedule
                //it lands on the snap path and assigns the position from `selected` - an integer -
                //once per column crossed, which is the canvas stuttering back to the boundary the
                //finger just left.
                harness.context.song.selected = SELECTED + 1
                harness.push()
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1.5, 6)

                //...and the drawn window follows the CANVAS rather than the state, which is a
                //different claim: a pool advanced from `selected` holds a window half a column off
                //and every column in it still reads correct
                const position = harness.scrollPosition()
                const visible: number[] = []
                for (let i = 0; i < harness.context.song.columns.length; i++) {
                    if (isColumnVisible(i, position, WINDOW_GEOMETRY)) visible.push(i)
                }
                expect(harness.attachedColumns()).toEqual(visible)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a drag settles onto a whole column when the pointer comes up`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                //1.6, deliberately PAST the half: at 1.4 round and floor both give 1 and the row
                //cannot tell them apart, so it read as a guard while pinning nothing. Past the half
                //they disagree, and the disagreement is the whole claim.
                harness.movePointerOverNotes(start - columnWidth * 1.6)
                await frame()
                harness.releasePointerOverNotes(start - columnWidth * 1.6)
                //ROUND, not floor: 1.6 settles FORWARD to 2, where a floor-settle would give back
                //0.6 of a column - up to a whole one on every release, which reads as sticky
                const last = harness.selectColumnCalls[harness.selectColumnCalls.length - 1]
                expect(last).toEqual({index: SELECTED + 2, ignoreAudio: true})
                //that call's own update, flushed back where Svelte flushes it: a microtask later,
                //which is inside the 140ms ease rather than after it
                harness.context.song.selected = SELECTED + 2
                harness.push()

                //the ease the release starts has to finish before the position is whole; leaving
                //the composer parked on a fraction is what this rules out
                await vi.advanceTimersByTimeAsync(400)
                expect(harness.scrollPosition()).toBe(SELECTED + 2)
                //...and the loop is stopped again, which is the idle requirement after a gesture
                expect(harness.frameLoop().started).toBe(false)
                //THE MARK ENDS UP ON THE SETTLED COLUMN TOO, in whichever form the mode has one.
                //The position alone cannot say that: the overlay is painted from `overlayColumn`
                //by a different path, and a settle that moved the canvas while leaving the
                //highlight on the column the drag started from reads identically above.
                if (smoothScroll) expect(selectedColumnsOf(harness)).toEqual([])
                else expect(selectedColumnOf(harness)).toBe(SELECTED + 2)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a drag released outside the canvas settles, and the canvas moves again`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * 1.6)
                await frame()
                //NO pixi pointerup: the pointer came up somewhere the stage never sees, so the
                //window listener is the only thing that can end this gesture. Without it the drag
                //is not merely un-settled - a `dragging` motion is what syncScrollSchedule returns
                //at, so the canvas stops following `selected` for the life of the renderer and the
                //capped loop runs forever.
                harness.releasePointerOutsideTheCanvas()
                await vi.advanceTimersByTimeAsync(400)
                expect(harness.scrollPosition()).toBe(SELECTED + 2)
                expect(harness.frameLoop().started).toBe(false)
                //...and the canvas is following the state again, which is the half a settle
                //assertion on its own cannot see
                harness.context.song.selected = SELECTED + 5
                harness.push()
                expect(harness.scrollPosition()).toBe(SELECTED + 5)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a pointer the OS takes away does not freeze the canvas`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * 1.6)
                await frame()
                //An edge swipe, palm rejection, a second finger starting a system gesture: the
                //stream ends in a pointercancel and NO pointerup of any kind. pixi registers no DOM
                //listener for cancel at all (EventSystem._addEvents), so neither the stage handler
                //nor a window pointerup can rescue this one.
                harness.cancelPointer()
                await vi.advanceTimersByTimeAsync(400)
                expect(harness.scrollPosition()).toBe(SELECTED + 2)
                expect(harness.frameLoop().started).toBe(false)
                harness.context.song.selected = SELECTED + 5
                harness.push()
                expect(harness.scrollPosition()).toBe(SELECTED + 5)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, dragging past the end of the song and back moves the canvas at once`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const lastColumn = harness.context.song.columns.length - 1
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                //TWO COLUMNS PAST THE END. The position clamps, and the anchor is re-taken at the
                //clamp - without that the offset is still measured from the press, so dragging back
                //spends the whole overshoot before the canvas moves at all.
                const overshoot = lastColumn - SELECTED + 2
                harness.movePointerOverNotes(start - columnWidth * overshoot)
                await frame()
                expect(harness.scrollPosition()).toBe(lastColumn)
                harness.movePointerOverNotes(start - columnWidth * (overshoot - 1))
                await frame()
                //one column back for one column of pointer travel, not zero
                expect(harness.scrollPosition()).toBeCloseTo(lastColumn - 1, 6)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a wheel during a drag leaves the drag alone`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * 1.6)
                await frame()
                //A MOUSE WHEEL WITH THE BUTTON HELD, which is an ordinary thing to do. An ease
                //entered from under a held pointer replaces the `dragging` motion, and then the
                //release is no longer a drag: handleStageUp takes its CLICK path and calls
                //selectColumn WITHOUT ignoreAudio, so the gesture the user performed as a drag ends
                //by sounding a note.
                harness.wheelOverNotes(100)
                harness.releasePointerOverNotes(start - columnWidth * 1.6)
                await vi.advanceTimersByTimeAsync(400)
                expect(harness.selectColumnCalls).toEqual([
                    {index: SELECTED + 1, ignoreAudio: true},
                    {index: SELECTED + 2, ignoreAudio: true},
                ])
                expect(harness.scrollPosition()).toBe(SELECTED + 2)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a press that never moves is a click and selects the column under it`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const neighbour = canvasXOfColumn(harness, SELECTED) + columnWidth
                harness.pressPointerOverNotes(neighbour)
                //inside DRAG_SLOP_PX, which is what keeps a jittery click a click. The old
                //discriminator was a WHOLE COLUMN of movement, so a 0.9-column drag released as a
                //click and jumped the canvas to wherever the pointer happened to be.
                harness.movePointerOverNotes(neighbour + 2)
                await frame()
                harness.releasePointerOverNotes(neighbour + 2)
                expect(harness.selectColumnCalls).toEqual([
                    //no ignoreAudio: a clicked column sounds
                    {index: SELECTED + 1, ignoreAudio: undefined},
                ])
                expect(harness.scrollPosition()).toBe(SELECTED)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, the wheel eases to the next column rather than jumping to it`, async () => {
            const harness = await mountManual()
            try {
                harness.wheelOverNotes(100)
                expect(harness.selectColumnCalls).toEqual([
                    {index: SELECTED + 1, ignoreAudio: true},
                ])
                //STRICTLY BETWEEN, on the very next frame: a "set the target and jump there"
                //implementation passes every endpoint assertion and fails this one
                await frame()
                const midway = harness.scrollPosition()
                expect(midway).toBeGreaterThan(SELECTED)
                expect(midway).toBeLessThan(SELECTED + 1)

                //AND NOW THE UPDATE THAT SELECTCOLUMN PRODUCES, the same round-trip the drag row
                //models: Svelte flushes it a microtask later, i.e. in the middle of the 140ms ease.
                //syncScrollSchedule keeps a running ease alive only while `selected` is still its
                //own target; without that test it rests, which assigns the position from `selected`
                //and replaces the ease with the instant jump it exists to avoid.
                harness.context.song.selected = SELECTED + 1
                harness.push()
                expect(harness.scrollPosition()).toBeGreaterThanOrEqual(midway)
                expect(harness.scrollPosition()).toBeLessThan(SELECTED + 1)
                expect(harness.frameLoop().started).toBe(true)

                await vi.advanceTimersByTimeAsync(400)
                expect(harness.scrollPosition()).toBe(SELECTED + 1)
                expect(harness.frameLoop().started).toBe(false)
            } finally {
                harness.destroy()
            }
        })

        /**
         * THE MINI-TIMELINE'S OWN DRAG, which is a second pointer surface with a different rule:
         * absolute rather than anchored, because the whole song spans the strip. It had no
         * behavioural test at all until these four rows - gutting all three handlers left every
         * other test in this file green, because nothing outside them ever emitted a pointer event
         * on that container.
         *
         * The drawn rectangle is read off the SCENE rather than recomputed, so the thing these
         * press on is the thing the user sees.
         */
        function drawnViewport(harness: Harness): {x: number, width: number} {
            const {viewport} = harness.paintedScene().timeline
            const rect = viewport.ops.find(
                (op): op is [string, number, number, number, number, number] =>
                    Array.isArray(op) && op[0] === 'roundRect'
            )
            if (!rect) throw new Error('the timeline viewport drew no rectangle')
            return {x: viewport.x, width: rect[3]}
        }

        /** Where on the timeline strip a column sits, by the proportion the renderer maps with. */
        function timelineXOfColumn(harness: Harness, column: number): number {
            const {canvasWidth} = harness.geometry()
            return (canvasWidth / harness.context.song.columns.length) * column
        }

        it(`${mode}, pressing the timeline navigates to the column under the pointer`, async () => {
            const harness = await mountManual()
            try {
                //the press IS the navigation on this surface, unlike the stage's - which is why it
                //enters the drag at once rather than waiting for a slop
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10))
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(10, 6)
                expect(harness.selectColumnCalls).toEqual([{index: 10, ignoreAudio: true}])
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a timeline drag moves the canvas continuously, not a column at a time`, async () => {
            const harness = await mountManual()
            try {
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10))
                await frame()
                //HALF A COLUMN of the strip. The throttled version this replaced floored the
                //position, so the canvas could only sit on whole columns however finely the pointer
                //moved - and on a 100-column song one timeline pixel is a sixteenth of a column.
                harness.movePointerOverTimeline(timelineXOfColumn(harness, 10.5))
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(10.5, 6)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, grabbing the timeline's viewport rectangle keeps it under the pointer`, async () => {
            const harness = await mountManual()
            try {
                const viewport = drawnViewport(harness)
                //INSIDE the rectangle and deliberately off its centre. Pressing what is already on
                //screen must not move the canvas: the grab records the offset to the rectangle's
                //centre and holds it, where centring the rectangle on the pointer instead would
                //jump the canvas by the distance from that centre - about 6 columns here.
                harness.pressPointerOverTimeline(viewport.x + viewport.width * 0.25)
                await frame()
                //to within the half-pixel the rectangle's floored width costs at the grab point
                expect(harness.scrollPosition()).toBeCloseTo(SELECTED, 1)
                expect(harness.selectColumnCalls).toEqual([])
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a timeline release settles onto a whole column and stops the loop`, async () => {
            const harness = await mountManual()
            try {
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10.6))
                await frame()
                expect(harness.frameLoop().started).toBe(true)
                harness.releasePointerOverTimeline(timelineXOfColumn(harness, 10.6))
                await vi.advanceTimersByTimeAsync(400)
                //ROUND, like the stage's settle, and the same reason
                expect(harness.scrollPosition()).toBe(11)
                const last = harness.selectColumnCalls[harness.selectColumnCalls.length - 1]
                expect(last).toEqual({index: 11, ignoreAudio: true})
                expect(harness.frameLoop().started).toBe(false)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a burst of wheel events composes into one glide rather than fighting`, async () => {
            const harness = await mountManual()
            try {
                //three events inside one frame, which is what a real wheel produces: they arrive at
                //about 10ms intervals and the frame is 21ms at the cap
                harness.wheelOverNotes(100)
                harness.wheelOverNotes(100)
                harness.wheelOverNotes(100)
                //each step is measured from the running ease's own TARGET. Measured from the
                //CURRENT position instead, all three would aim at the same column and the burst
                //would move one column in total; read off `this.state.selected`, which Svelte
                //refreshes a microtask later, it would move one as well.
                expect(harness.selectColumnCalls).toEqual([
                    {index: SELECTED + 1, ignoreAudio: true},
                    {index: SELECTED + 2, ignoreAudio: true},
                    {index: SELECTED + 3, ignoreAudio: true},
                ])

                //MONOTONIC on the way there, which is the cheapest statement that catches an ease
                //restarted with a fresh one-column target from the current position: that reverses
                //direction, and both endpoints still agree
                let previous = harness.scrollPosition()
                for (let step = 0; step < 20; step++) {
                    await frame()
                    const position = harness.scrollPosition()
                    expect(position).toBeGreaterThanOrEqual(previous)
                    previous = position
                }
                expect(harness.scrollPosition()).toBe(SELECTED + 3)
            } finally {
                harness.destroy()
            }
        })
    }

    /**
     * THE ROWS ABOVE ALL MOUNT STOPPED, deliberately: they are about input, and a running transport
     * is a second writer of the position. These are the ones where that second writer is the point.
     *
     * What they cover that nothing above can: the transport moves the position between a press and
     * the drag it becomes, it owns a queue a gesture has to take away from it, and it runs a
     * LOOKAHEAD ahead of the playhead - so `selected` and the line are about a column apart, and
     * every input measured against the wrong one of the two is wrong by a column.
     */
    async function mountPlaying() {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        harness.context.props.isPlaying = true
        harness.push()
        return harness
    }

    const columnMs = (changer: number) => Math.round((60000 / BPM) * changer)
    const WHOLE_COLUMN_MS = columnMs(1)

    it('grabbing the canvas mid-glide does not give back the travel since the press', async () => {
        const harness = await mountPlaying()
        try {
            const {columnWidth} = harness.geometry()
            //into the column's travel, so the playhead is on a fraction rather than a boundary
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE_COLUMN_MS / 2)
            harness.pressPointerOverNotes(CANVAS_WIDTH / 2)
            //A HESITATION between the press and the first real move, which is what an ordinary grab
            //looks like. The glide keeps writing the position through all of it, so the position
            //the drag has to be anchored on is the one on SCREEN when the drag starts - not the one
            //the press landed on. Anchoring on the press hands all of this back in one frame, which
            //is a visible backward jerk at the start of every drag begun on a playing song.
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS * 0.4)
            const before = harness.scrollPosition()
            harness.movePointerOverNotes(CANVAS_WIDTH / 2 - 5)
            await vi.advanceTimersByTimeAsync(64)
            //FORWARD by exactly the pointer's 5px and by nothing else
            expect(harness.scrollPosition()).toBeCloseTo(before + 5 / columnWidth, 6)
        } finally {
            harness.destroy()
        }
    })

    it('an edit during a drag settle does not resurrect the pre-drag schedule', async () => {
        const harness = await mountPlaying()
        try {
            const {columnWidth} = harness.geometry()
            await vi.advanceTimersByTimeAsync(LOOKAHEAD_MS + WHOLE_COLUMN_MS / 2)
            harness.pressPointerOverNotes(CANVAS_WIDTH / 2)
            harness.movePointerOverNotes(CANVAS_WIDTH / 2 - columnWidth * 20.6)
            await vi.advanceTimersByTimeAsync(64)
            //the drag's own selectColumn, flushed back as Svelte would flush it
            harness.context.song.selected = 61
            harness.push()
            //LONG ENOUGH FOR THE PRE-DRAG SEGMENT TO EXPIRE. Nothing clears it while the drag runs
            //- syncScrollSchedule returns at its first statement for the whole gesture - so by now
            //the queue, if the gesture did not take it away, describes a column 20 back.
            await vi.advanceTimersByTimeAsync(400)
            harness.releasePointerOverNotes(CANVAS_WIDTH / 2 - columnWidth * 20.6)

            //AN ORDINARY EDIT, LANDING INSIDE THE 140ms SETTLE EASE: a note entered during playback
            //(note entry is not gated on isPlaying), a tempo-changer key, a layer change. It moves
            //no column and no `selected`, so it takes syncScrollSchedule's "the glide carries on"
            //branch - whose only question is whether anything is scheduled.
            harness.push()
            await vi.advanceTimersByTimeAsync(64)
            //TWO failures this catches, and they look nothing alike. A queue the gesture did not
            //take away is non-empty, so that branch re-enters `playback` on it and the next frame
            //reads a segment for column 40 - the canvas jumps twenty columns backward while the
            //music plays 61. And a branch that entered `playback` on an EMPTY queue instead would
            //leave the position wherever the ease had got to with the loop running against nothing
            //to travel through, which is the idle requirement broken while the song plays.
            expect(harness.scrollPosition()).toBe(61)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('while playing with smooth scrolling on, the wheel steps from the transport, not the playhead', async () => {
        const harness = await mountPlaying()
        try {
            //ONE TICK, then a moment into the next column: `selected` is 41 and the playhead is
            //still inside 40, because the schedule runs a lookahead behind the state by
            //construction. That gap is the whole of this row.
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS)
            harness.context.song.selected = SELECTED + 1
            harness.push()
            await vi.advanceTimersByTimeAsync(32)
            expect(harness.scrollPosition()).toBeLessThan(SELECTED + 1)

            harness.selectColumnCalls.length = 0
            harness.wheelOverNotes(100)
            //MEASURED FROM `selected`, not from the line. Rounding the playhead gives 40, so a
            //forward step from there asks for 41 - the column the transport is ALREADY on, an
            //unchanged write that notifies nothing: the user scrolls forward during playback and
            //nothing happens at all, for as long as the playhead is in the first half of the
            //column.
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED + 2, ignoreAudio: true}])

            harness.selectColumnCalls.length = 0
            harness.wheelOverNotes(-100)
            //...and backward is the same error in the other direction, which is why both are here:
            //from the line it would ask for 39, jumping the transport TWO columns back for one
            //wheel notch.
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED, ignoreAudio: true}])
        } finally {
            harness.destroy()
        }
    })

    it('while playing with smooth scrolling on, the wheel re-anchors the glide instead of easing', async () => {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            harness.push()
            harness.context.props.isPlaying = true
            harness.push()
            await vi.advanceTimersByTimeAsync(250 + 60)

            //BACKWARDS, so the move is unambiguously a jump: `selected` advancing by exactly one
            //while playing is a playback TICK by definition, and the renderer cannot tell a wheel
            //that produced one from the transport that would have
            harness.wheelOverNotes(-100)
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED - 1, ignoreAudio: true}])
            //the transport owns the position here, so the wheel moves `selected` and stops. The
            //update that produces is a discontinuity, which re-anchors the playhead on the new
            //column AT ONCE rather than easing the canvas toward music that has already jumped.
            harness.context.song.selected = SELECTED - 1
            harness.push()
            expect(harness.scrollPosition()).toBe(SELECTED - 1)
        } finally {
            harness.destroy()
        }
    })
})
