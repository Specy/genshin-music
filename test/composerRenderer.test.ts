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
 * Eight parts, because they fail on different mistakes:
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
 *    of a column over a driven clock. It fails on a chase-toward-a-target implementation, on
 *    travel that does not start at the tick that announced its column, and on a queue that drops
 *    segments.
 *  - PART SIX, THE FRAME LOOP, reads how often the renderer ASKED to render rather than what it
 *    painted - the half a scene description cannot see. It fails on a loop that runs while idle, on
 *    a private rAF beside the capped ticker, and on a render per tick rather than per frame that
 *    moved.
 *  - PART SEVEN, MANUAL SCROLLING, drives a drag, a wheel and the mini-timeline in BOTH scroll
 *    modes. It fails on quantised motion, on a gesture fought by its own selectColumn round-trip,
 *    on one that never settles, and on a gesture nothing ends.
 *  - PART EIGHT, THE MOMENTUM COAST, drives the Flick / Coast / Catch physics a stage-drag
 *    release earns while smooth scrolling is on and the song is stopped. It fails on a landing
 *    the closed form did not fix at release, on a Coast reachable in snap mode or during playback
 *    or a recording, on a Catch whose release clicks, and on a publish stream that sounds a
 *    column or repeats one.
 *
 * BOTH tables read the same description of the scene (Harness.paintedScene), so WHAT THAT
 * DESCRIPTION CARRIES is what either of them can see. It carries, for every child of a pooled
 * column view and of the timeline: the cache slot its texture came from, its x, its y, its alpha
 * and whether it is shown at all. It carries the placement and presentation of every container
 * those children hang off, up to and including the Application's stage - a scene displaced, faded
 * or hidden at its ROOT is a scene every child of which still reads correct. That includes the
 * TIMELINE STRIP, the root carrying the mini-timeline's offset down the shared canvas, which is
 * what says the timeline is drawn on the canvas at all and where. And it carries the two things
 * outside the pixi scene graph that blank the canvas on their own: what the Application clears to
 * behind the columns, and the canvas ELEMENT's whole inline style.
 *
 * Deliberate omissions, each of them somewhere a defect can sit unseen. What a hidden object still
 * holds: a hidden sprite reads as absent, which is what lets a pooled view keep more note sprites
 * than its column needs. (The TIMELINE canvas' clear colour used to be one of these and is now
 * COVERED rather than dropped: there is one canvas and one clear colour, stated above, and the
 * strip's own background op states the rest.) Pixels: nothing rasterises, so two textures differ by the cache slot they came
 * from rather than by what they look like. And whatever the fakes below do not model at all - the
 * readers can only report what those objects hold, so a pixi property the fakes never gave them is
 * invisible here by construction.
 *
 * Known unpinned areas, as of the close of phase 3 - written down because a list of what a guard
 * does NOT cover ages better than a claim that it covers everything, and each of these was found by
 * mutating the code and watching this file stay green:
 *  - computeCanvasSize()'s inPreview BRANCH. `canvasWidth` is what the renderer reports through
 *    onGeometryChange and the heights are what it passed to resize(); geometry() cross-checks the
 *    cache against them, so an INCONSISTENCY fails, but a size wrong the same way in all three is
 *    endorsed HERE. The non-preview formula is not unguarded any more: test/composerCanvasCss.test.ts
 *    re-derives `85vw - 45px`, `45vh`, both row-height scales and both roundings against the CSS
 *    placeholder, so mutating any of them fails there (and, through the canvas width, ~200 rows
 *    here). What survives everything is the four PREVIEW factors - 0.8/0.55 on width, 0.8/0.6 on
 *    height, and the 900px body-width they switch on: composerCanvasCssSize returns null in preview
 *    on purpose, so that matrix never reaches the branch, and no harness here mounts with
 *    `inPreview`. Each of the four can be changed with the whole suite green.
 *  - the pixi interaction wiring on the root containers, EXCEPT the two hitareas, which 'what the
 *    notes stage answers a pointer on' and 'which surface a pointer on the merged canvas reaches'
 *    state between them - including both of the timeline's clauses, the one that keeps its own drag
 *    alive outside the canvas and the one that defers to a press on the notes surface. `eventMode`
 *    and `interactiveChildren` are still unread, so a container routing nothing at all reads here
 *    the same as one routing everything. What ORDERS the two hitareas is pixi's own reverse walk,
 *    which the fakes do not model: mount() states the child order that decides it instead.
 *  - the Application constructor options other than `autoStart`, which FakeApplication.init() reads
 *    because the ticker's behaviour hangs off it. resolution, autoDensity, antialias and the
 *    initial canvas size are still discarded and so invisible.
 *  - what a render group actually CHANGES. FakeContainer.enableRenderGroup records the call and the
 *    scene it produces is identical either way, which is the point of the real one - so what is
 *    pinned is that the renderer asks for it, not that pixi then moves the transform to the GPU.
 *  - teardown: nothing requires the Application to be destroyed, though destroy()'s own comment
 *    calls that a hard requirement against a WebGL leak on remount.
 *  - the rules this file imports from production rather than restating - nearestEven,
 *    computeGridRowLayerStatuses, computeGridStrandedMarks, gridRowForNumber, isColumnVisible. A
 *    defect inside one of those is followed by the reference rather than caught, EXCEPT where a
 *    second, independent statement pins it (the closed-form window range does this for
 *    isColumnVisible; 'one Note Id, one row, whatever the track's instrument' does it for the
 *    canonical placement, stating the rows in game.json's own terms instead of the helper's).
 *  - an edit to a column entirely OUTSIDE the drawn window. It is correct because the column is
 *    painted on the way in, but nothing here drives that.
 *  - a wrong skip whose stale content happens to equal the correct content. Invisible by
 *    construction, since the scene is compared as values - and harmless for the same reason.
 *  - over-repainting BEYOND the marked set. Only the counts can see it, and only on the rows that
 *    state an exact painted set rather than 'window'.
 *  - the SPLIT between the notes region and the timeline band is what the renderer REPORTS, and
 *    geometry() cross-checks it against the one resize() and against the cache - so an
 *    inconsistency fails, but a split wrong the same way in all three is endorsed. Before the two
 *    canvases were merged the timeline's height was read off a SECOND resize() call, which was an
 *    independent reading; the report replaces it.
 *  - the strip's background before the FIRST cache exists. drawTimelineStage draws the bar
 *    unconditionally and gates only the selection band and the markers on cacheData, but every
 *    harness here waits the cache out at mount, so no scene is ever read in that window and moving
 *    the bar back inside the gate is endorsed. What that costs in the app is the mini-timeline
 *    showing the Application's clear colour for the ~50ms of the cache debounce.
 *  - WHERE App.css ACTUALLY PUTS THE THREE TIMELINE BUTTONS. They are absolutely positioned HTML
 *    floating over the composer canvas, and the renderer holds the drawn strip clear of them by
 *    reproducing their footprint in px (composerCanvasGeometry's TIMELINE_INSET_LEFT/RIGHT) - so
 *    'which surface a pointer on the merged canvas reaches' does now state that the strip declines
 *    `0..80` and `W-41.6..W`, which is the renderer's half of the claim. What it cannot state is
 *    that the stylesheet lays the buttons out in exactly those bands: jsdom performs no layout.
 *    test/composerCanvasCss.test.ts covers as much of the other half as can be covered without a
 *    browser - the declared `2.2rem`/`0.2rem`/`flex-shrink` against those constants, and the two
 *    inline `margin-left` overrides in ComposerCanvas.svelte, read as text, that the 80px and the
 *    41.6px each rest on.
 *  - the render count was a PAIR (one per Application) and is now one number. Every row asserted
 *    the same value twice, so no row's claim changed - but the equality of the two incidentally
 *    proved the gated timeline render had fired on the rows where it was 1, and nothing states that
 *    now. What replaces it is the gate test in PART SIX, which reads the outline's x per frame.
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
 *    it is 0 are what make the rest mean something. ONE number: the composer has one Application
 *    since the mini-timeline moved onto the notes canvas.
 *  - and, for the parts that drive a MOTION rather than an update, the Application's fake
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
    constructed: {containers: 0, sprites: 0, graphics: 0, texts: 0},
    destroyed: {containers: 0, sprites: 0, graphics: 0, texts: 0},
    graphicsClears: 0,
    reset() {
        this.constructed.containers = 0
        this.constructed.sprites = 0
        this.constructed.graphics = 0
        this.constructed.texts = 0
        this.destroyed.containers = 0
        this.destroyed.sprites = 0
        this.destroyed.graphics = 0
        this.destroyed.texts = 0
        this.graphicsClears = 0
    },
}))

const pixi = vi.hoisted(() => {
    let nextTextureId = 0

    //ids, not bare objects: two distinct `{}` textures would compare EQUAL under a structural
    //comparison, and the harness identifies a texture by looking it up in the cache it came from
    class FakeTexture {
        readonly textureId = nextTextureId++
        /**
         * The draw ops the Graphics this texture was rasterised FROM carried, snapshotted at
         * generateTexture. Nothing in the scene descriptions reads it - a sprite is still named by
         * the cache slot its texture sits in - and it exists for the one claim a slot name cannot
         * make: that two slots hold DIFFERENT PICTURES. The off-scale ♯/♭ variants are the case
         * (ADR-0007 phase D): they differ from the plain icon only by the glyph drawn into them.
         */
        readonly ops: unknown[]

        constructor(ops: unknown[] = []) {
            this.ops = [...ops]
        }

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
        /**
         * Recorded rather than modelled, exactly like isRenderGroup: what a mask DOES is a stencil
         * pass on the GPU and a prune in pixi's own hit testing, neither of which exists here. What
         * this holds is which node the renderer pointed at, which is the half a defect can move.
         */
        mask: unknown = null
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

        moveTo(x: number, y: number) {
            this.ops.push(['moveTo', x, y])
            return this
        }

        lineTo(x: number, y: number) {
            this.ops.push(['lineTo', x, y])
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

    /**
     * pixi's Text, modelled as the thing the Pro View's row-label strip does to it and nothing more:
     * a container that carries a string, a style object and an anchor. PART NINE never reads a label
     * (nothing rasterises here, so a Text's whole visible output is its own texture), and the earlier
     * parts never construct one - what this exists for is to let a PRO renderer mount at all.
     */
    class FakeText extends FakeContainer {
        override readonly kind = 'text' as const
        text: string
        style: Record<string, unknown>
        readonly anchor = {set: () => {}}

        constructor(options?: {text?: string, style?: Record<string, unknown>}) {
            super()
            counters.constructed.containers--
            counters.constructed.texts++
            this.text = options?.text ?? ''
            this.style = {...options?.style}
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
            generateTexture: (options?: {target?: {ops?: unknown[]}}) =>
                new FakeTexture(options?.target?.ops ?? []),
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
        Text: FakeText,
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
    CANONICAL_NOTE_IDS,
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
//the CANVAS placement rules (ADR-0004 under ADR-0007): a row is gridRowForNumber's answer for the
//note's OWN track at its own Basepoint, so the oracles below take the *Grid* helpers.
//computeButtonLayerStatuses, keyed by the Buttons of the keyboard on screen, belongs to the composer
//KEYBOARD and deliberately does not appear in this file.
//
//Every song here sits at the default Basepoint C, so a note's number equals the Sounding Pitch of
//the button it is entered from; the helpers below still go through the real conversion rather than
//assuming that, because "C makes the two axes coincide" is a property of the fixture, not a rule.
import {
    computeGridRowLayerStatuses,
    computeGridStrandedMarks,
    effectiveTrackPitch,
    gridRowForNumber,
    nominalToNumber,
    numberToButton,
} from '$core/Songs/noteIds'
//the note icon's cache key, which is where the OFF-SCALE hint lives: one texture per (layer
//status, accidental), so the sprite that carries the ♯/♭ is the note's own sprite
import {noteTextureKey} from '$cmp/pages/Composer/ComposerCache'
import {
    ComposerRenderer,
    COMPOSER_PLAYHEAD_CONFIG,
    isColumnVisible,
    type ColumnWindowGeometry,
    type ComposerRendererState,
} from '$cmp/pages/Composer/ComposerRenderer'
//the slicing thresholds themselves, so the timing rows below state the CONTRACT (work is yielded,
//the sprite appears once the slices have run) instead of hard-coding whatever the knobs are today
import {COMPOSER_TIMELINE_MINIMAP_CONFIG} from '$cmp/pages/Composer/composerTimelineMinimap'
//the two ends of the canvas the three DOM timeline buttons stand on, which the renderer holds the
//drawn strip clear of. Imported rather than restated for the same reason nearestEven is: they are
//the definition, and test/composerCanvasCss.test.ts is what pins them against App.css.
import {
    TIMELINE_INSET_LEFT,
    TIMELINE_INSET_RIGHT,
    composerNotesRegionY,
} from '$cmp/pages/Composer/composerCanvasGeometry'
//PART NINE's rules, imported for the same reason nearestEven and the insets are: they ARE the axis
//and the framing, pinned in test/proViewGeometry.test.ts against the spec, so restating them here
//would be restating a definition rather than checking one. What PART NINE checks is the INPUT
//machinery that reads them - which cell a pointer resolves to, and what moves the camera.
import {
    editableZone,
    lockedCameraY,
    proRowHeight,
    numberAtY,
    proStripWidth,
    proViewAxis,
    rowForNumber,
    type ProViewAxis,
} from '$cmp/pages/Composer/proViewGeometry'
import {songNumberSpan} from '$cmp/pages/Composer/proViewNotes'
//the ONE long-press timing, shared by the composer keyboard and the Pro View canvas (spec §12)
import {COMPOSER_LONG_PRESS_MS} from '$cmp/pages/Composer/composerInput'

/**
 * 20, not the shipped default of 35, purely so the window (n/2 + 2 per side, strictly - so n + 3
 * columns for an even n) is 23 rather than 39 and the counts below stay readable. The window MATH
 * is pinned against isColumnVisible for every shipped option in its own test.
 */
const COLUMNS_PER_CANVAS = 20
/** Far enough from both ends of a 100-column song that the window is never clipped. */
const SELECTED = 40

/**
 * The pointerId every single-gesture row here presses with, and the one a SECOND concurrent pointer
 * presses with.
 *
 * They exist because the two canvases became one: pixi dispatches per pointerId and per mouse button
 * against a single EventBoundary now, so a second finger - or a right-button press during a
 * left-button drag - is delivered to the same containers as the gesture already running. Two ids are
 * the whole of what tells "this move continues my drag" from "this move belongs to somebody else".
 */
const PRIMARY_POINTER = 1
const SECOND_POINTER = 2

/** The body rect beforeEach mocks, jsdom measuring nothing on its own. */
const BODY_WIDTH = 1920

/**
 * The notes region's pixel geometry, by ComposerRenderer.computeCanvasSize's own rule over that
 * rect, and the playhead at its centre. The canvas is exactly this wide and TALLER: it carries the
 * mini-timeline band below the notes region, which Geometry states.
 *
 * It is stated here rather than read off a renderer because the window definition is a function of
 * PIXELS now (see ColumnWindowGeometry: a canvas does not hold exactly columnsPerCanvas columns),
 * and several of the expectations below need to evaluate it with no renderer in hand. mount()'s
 * geometry() asserts the renderer reports this same width and derives this same column width, so
 * the duplication fails loudly there instead of quietly moving every window in this file.
 */
//1920 is a DESKTOP body (> COMPOSER_MOBILE_MAX_WIDTH), so this is the desktop half of
//composerCanvasSize's formula: the canvas fills the window - `100vw` less `.tool`'s own `4vw`
//column - rather than the `85vw - 45px` card the layout used before the sidebar became permanent.
//Restated rather than imported, like every other number in this block, so that changing the
//formula fails here instead of moving the whole file's window definition with it.
const CANVAS_WIDTH = nearestEven(BODY_WIDTH * 0.96 - 177.6)
const COLUMN_WIDTH = nearestEven(CANVAS_WIDTH / COLUMNS_PER_CANVAS)
const WINDOW_GEOMETRY: ColumnWindowGeometry = {
    width: CANVAS_WIDTH,
    columnWidth: COLUMN_WIDTH,
    playheadX: CANVAS_WIDTH / 2,
}

/** Nominal Id of a button on the game's default instrument — a Song-Grid row name, never a stored value. */
function idOf(button: number): number {
    return INSTRUMENTS_DATA[INSTRUMENTS[0]].notes[button].midi
}

/** What a track of `instrument` STORES for that grid row at Basepoint C (ADR-0007 §4). */
function numberOn(instrument: (typeof INSTRUMENTS)[number], nominal: number): number {
    return nominalToNumber(instrument, 'C', nominal)
}

/** numberOn for the two-track songs below: track 0 is INSTRUMENTS[0], track 1 is INSTRUMENTS[1]. */
function numberOf(button: number, track: 0 | 1): number {
    return numberOn(INSTRUMENTS[track], idOf(button))
}

/**
 * Two notes on two tracks in every column, on distinct display rows, plus a span every 8th column,
 * a tempo changer and two breakpoints. Uniform on purpose: every pooled view ends up needing the
 * same two note sprites, so the allocation test's warm-up saturates rather than trickling.
 */
function makeSong(): ComposedSong {
    const song = new ComposedSong('composer renderer', [INSTRUMENTS[0], INSTRUMENTS[1]])
    for (let column = 0; column < song.columns.length; column++) {
        song.addNoteAt(column, 0, numberOf(column % 7, 0), column % 8 === 0 ? 3 : 1)
        song.addNoteAt(column, 1, numberOf((column % 5) + 7, 1))
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
        song.addNoteAt(column, 0, numberOf((column + 3) % 7, 0), 1)
        song.addNoteAt(column, 1, numberOf(((column + 2) % 5) + 7, 1))
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
 * Button 12 is outside both the track-0 (0..6) and track-1 (7..11) button ranges the loop uses, so
 * nothing later in the song truncates the span.
 */
function makeEquallyVersionedLongSpanSong(): ComposedSong {
    const song = new ComposedSong('long span', [INSTRUMENTS[0], INSTRUMENTS[1]])
    for (let column = 0; column < song.columns.length; column++) {
        song.addNoteAt(column, 0, numberOf(column % 7, 0), 1)
        if (column === 0) song.addNoteAt(0, 1, numberOf(12, 1), 90)
        else song.addNoteAt(column, 1, numberOf((column % 5) + 7, 1))
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
function strandingPair(): {instrument: (typeof INSTRUMENTS)[number], number: number, row: number} {
    const buttons = INSTRUMENTS_DATA[INSTRUMENTS[0]].notes.length
    for (const instrument of INSTRUMENTS) {
        for (let button = 0; button < buttons; button++) {
            //the number the DEFAULT track stores for that button; the question is whether the
            //candidate instrument can voice it, which is what "stranded on its own track" means
            const number = numberOf(button, 0)
            const placement = gridRowForNumber(instrument, 'C', number)
            if (placement.row !== -1 && placement.stranded) {
                return {instrument, number, row: placement.row}
            }
        }
    }
    throw new Error('no instrument in this game strands any of the default instrument Note Numbers')
}

/**
 * AN OFF-SCALE NUMBER and where it lands (ADR-0007 phase D): a Note Number whose virtual nominal
 * falls BETWEEN two Song-Grid rows, so gridRowForNumber puts it on the nearest one and signs the
 * accidental. `sign` picks which way it sits off that row.
 *
 * Derived from the grid's own ends rather than from a note table, and game-agnostically so: one
 * semitone past the lowest canonical id can only be flat of the lowest row, one past the highest can
 * only be sharp of the highest, whatever ladder the game's grid is. The strandedness is asserted
 * rather than assumed - a game whose instruments sounded past the grid would break the premise, and
 * the row is worth nothing if the note is voiced.
 */
function offScalePair(sign: -1 | 1): {
    instrument: (typeof INSTRUMENTS)[number]
    number: number
    row: number
} {
    const virtual = sign < 0
        ? Math.min(...CANONICAL_NOTE_IDS) - 1
        : Math.max(...CANONICAL_NOTE_IDS) + 1
    for (const instrument of INSTRUMENTS) {
        const placement = gridRowForNumber(instrument, 'C', virtual)
        if (placement.row === -1 || !placement.stranded || placement.accidental !== sign) continue
        return {instrument, number: virtual, row: placement.row}
    }
    throw new Error(`no instrument in this game leaves ${virtual} off-scale`)
}

/** The first drawn column with no note on `row`, so a note added there is the row's only one. */
function drawnColumnWithoutRow(song: ComposedSong, row: number): number {
    for (let index = 0; index < song.columns.length; index++) {
        if (!isColumnVisible(index, song.selected, WINDOW_GEOMETRY)) continue
        //by the canvas' own placement rule: the note's row on ITS OWN track
        const taken = song.columns[index].notes.some(note => {
            const instrument = song.instruments[note.trackIndex]
            return gridRowForNumber(
                instrument?.name ?? '',
                effectiveTrackPitch(instrument, song.pitch),
                note.id
            ).row === row
        })
        if (!taken) return index
    }
    throw new Error(`every drawn column already carries a note on row ${row}`)
}

/**
 * THE PAIR OF NOTE IDS ADR-0004 IS ABOUT, on the game's widest SUB-GRID instrument - one whose own
 * table is narrower than the Song Grid, so its buttons pack against 0 instead of lining up with the
 * grid's rows:
 *  - `playableId`, an id it CAN play whose own button index is NOT the id's canonical row. This one
 *    value is the whole defect: placing by own button drew it at COMPOSER_NOTE_POSITIONS[ownButton],
 *    a different row from the one the same id takes on a full-size track, and one that could collide
 *    with - or silently un-dim - this same instrument's stranded ids;
 *  - `strandedId`, an id it cannot play at all, which the canvas draws dimmed at the id's own row.
 *
 * WIDEST rather than first so this lands on the melodic sub-grid instrument the ADR was written
 * from (genshin NightwindHorn, 14 notes: id 60 sits at its own button 0 rather than canonical row 7,
 * and ids 72-83 strand) rather than on the 8-note drums, while still being a SEARCH - this file
 * carries no per-game instrument list. Sky resolves it to Bells.
 */
function subGridPair(): {
    instrument: (typeof INSTRUMENTS)[number]
    playableId: number
    ownButton: number
    strandedId: number
} {
    const candidates = INSTRUMENTS.map(instrument => ({
        instrument,
        //index INTO CANONICAL_NOTE_IDS is the canonical row, by game.json's positional pairing -
        //stated here rather than taken from gridRowForNumber, which is what production places by
        playableId: CANONICAL_NOTE_IDS.find(
            (id, row) => ![-1, row].includes(numberToButton(instrument, 'C', numberOn(instrument, id)))
        ),
        strandedId: CANONICAL_NOTE_IDS.find(
            id => numberToButton(instrument, 'C', numberOn(instrument, id)) === -1
        ),
        width: INSTRUMENTS_DATA[instrument].notes.length,
    }))
        .filter(candidate => candidate.playableId !== undefined && candidate.strandedId !== undefined)
        //stable, so instruments of equal width keep INSTRUMENTS order and the pick is deterministic
        .sort((a, b) => b.width - a.width)
    const best = candidates[0]
    if (!best) throw new Error('no instrument in this game has a sub-grid table')
    return {
        instrument: best.instrument,
        playableId: best.playableId!,
        ownButton: numberToButton(best.instrument, 'C', numberOn(best.instrument, best.playableId!)),
        strandedId: best.strandedId!,
    }
}

/** The canvas's own props - everything on the renderer state that is not read off the song. */
interface Props {
    isPlaying: boolean
    /** performance.now()-domain start of the selected playback column */
    playbackColumnStartMs: number
    /** unchanged for transport ticks; incremented for play/manual re-anchors */
    playbackAnchorGeneration: number
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
     *  - BOTH for the mutual-exclusion part and the manual-scroll part. Those rows state each mode's
     *    own motion rules explicitly rather than assuming that manual input is always continuous.
     */
    smoothScroll: boolean
    bpm: number
}

/**
 * The composer's shipped default bpm, so the glide section exercises the shipped arrangement
 * rather than a convenient one: one column at tempo 1 lasts 273ms, a 1/4 column 68ms, a 1/8
 * column 34ms - the last being where ticks outpace the emitted frames consuming them.
 */
const BPM = 220
/**
 * ComposerRenderer's SCROLL_EASE_MS, restated rather than imported - it is not exported, and a
 * shared constant would move both sides of every expectation together.
 */
const SCROLL_EASE_MS = 140
/** ComposerRenderer's hardware-idle wheel settle timeout, independently restated like the ease. */
const WHEEL_SETTLE_IDLE_MS = 100
/**
 * ComposerRenderer's Flick/Coast constants, restated rather than imported for the same reason as
 * SCROLL_EASE_MS above. PART EIGHT also restates the two closed forms built from them - where a
 * release LANDS and when the Coast ARRIVES - so a drift in any one of these fails there as a
 * wrong destination or a wrong arrival instant rather than moving both sides of the expectation
 * together.
 */
const FLICK_WINDOW_MS = 100
const FLICK_MIN_SPEED_PX_PER_MS = 0.4
const FLICK_MAX_SPEED_PX_PER_MS = 3
const COAST_DECAY_PER_MS = 0.0035
const COAST_ARRIVAL_PX = 0.5

interface Context {
    song: ComposedSong
    props: Props
}

function makeContext(): Context {
    return {
        song: makeSong(),
        props: {
            isPlaying: true,
            playbackColumnStartMs: performance.now(),
            playbackAnchorGeneration: 0,
            isRecordingAudio: false,
            currentLayer: 0,
            beatMarks: 3,
            selectedColumns: [],
            smoothScroll: false,
            bpm: BPM,
        },
    }
}

/** What one update() repainted. See this file's header for what observes each of these. */
interface Repainted {
    /**
     * How many times the Application was asked to render, which is the did-this-update-do-anything-
     * at-all channel. It was a PAIR while the timeline had a canvas of its own, and every row of
     * every table asserted the same number twice - so nothing is lost by collapsing it, except the
     * incidental proof that the gated timeline render had fired (recorded in the header's list of
     * what is not pinned).
     */
    renders: number
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
    /** what pixi would stencil this node against, set by production code and never by the fakes */
    mask?: unknown
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
 *
 * `stripWidth` is the one field with no second reading at all: the renderer does NOT report the
 * strip's insets through onGeometryChange - App.css positions the buttons and the renderer derives
 * the strip's bounds from the same two constants - so this is derived from the reported canvas width
 * and those constants, and nothing here can catch both sides moving together. What can is
 * test/composerCanvasCss.test.ts, which checks those constants against the stylesheet's own
 * `2.2rem`/`0.2rem`.
 */
interface Geometry {
    /** the canvas' width - the notes region spans all of it */
    canvasWidth: number
    /** the DRAWN STRIP's width: the canvas less the two ends the three DOM buttons stand on */
    stripWidth: number
    /** the canvas' whole height: `height + timelinePadding * 2 + timelineHeight` */
    canvasHeight: number
    /** the height of the NOTES REGION, which is the top part of the canvas */
    height: number
    columnWidth: number
    /** one display row, i.e. height / NOTES_PER_COLUMN */
    rowHeight: number
    /** the band of app background above and below the strip - one row of it sits under the notes */
    timelinePadding: number
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
         * would be drawn; this says whether it reaches the page at all. There is ONE canvas since
         * the timeline moved onto it, so this covers the timeline too - the strip's own place on
         * that canvas is `timeline.strip` below.
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
        /** the shared stage, the same object notes.stage describes - the strip hangs off it */
        stage: PaintedRoot
        /**
         * THE STRIP'S PLACE ON THE CANVAS: the root carrying the whole mini-timeline's offset, so
         * everything below it stays in strip-local coordinates. It is what says the timeline is on
         * the canvas at ALL, and where - the reading that replaced the timeline canvas' own
         * `canvasParent` when the two canvases were merged.
         */
        strip: PaintedRoot
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
    /** How many times the Application has been asked to render, ever. */
    renders(): number
    /** Texture of the completed static sprite nested under the timeline background. */
    timelineMinimapTexture(): object | null
    /**
     * The column container's x as each render saw it - see FakeApplication.renderedX. Read through
     * the harness rather than by indexing pixi.applications, so a test cannot silently pick up a
     * leaked Application instead of this one's.
     */
    renderedX(): number[]
    /**
     * The Application's frame loop, as counters - see the FakeTicker. This is the whole of
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
    /**
     * WHETHER A POINT ON THE NOTES CANVAS IS ROUTED to the stage's three handlers at all, by asking
     * the hitarea the renderer installed. Everything else here reaches those handlers by emitting
     * straight at the container, which is the shape of a pointer that has ALREADY been routed - so
     * this is the only reading that can see the margins where the song has run out being dead.
     *
     * Canvas coordinates in, the same as every other pointer helper takes; the container's own
     * offset is subtracted here because that is what pixi does to produce the local point it hands
     * to `contains`.
     */
    pointerReachesNotesStage(canvasX: number, canvasY?: number): boolean
    /**
     * The twin of the above for the mini-timeline strip, which shares the canvas and is hit-tested
     * FIRST. Canvas coordinates in; both the strip's own offset onto the canvas and the content
     * container's are subtracted here, because that is what pixi's hitPruneFn does (it inverts the
     * container's world transform before calling `contains`). Defaults to the middle of the strip.
     */
    pointerReachesTimelineStrip(canvasX: number, canvasY?: number): boolean
    /**
     * Press a pointer onto the notes stage at a canvas x.
     *
     * `pointerId` defaults to PRIMARY_POINTER, so every row that is about ONE gesture reads as it
     * always did; passing SECOND_POINTER is how the concurrent-pointer rows put a second finger (or
     * a second mouse button - pixi dispatches a pointerdown for each) on the canvas.
     */
    pressPointerOverNotes(globalX: number, pointerId?: number): void
    /** Move a pressed pointer across the notes stage to a canvas x. */
    movePointerOverNotes(globalX: number, pointerId?: number): void
    /** Release a pointer over the notes stage at a canvas x, the way a click on a column arrives. */
    releasePointerOverNotes(globalX: number, pointerId?: number): void
    /**
     * A cancelable wheel event on the notes canvas ELEMENT, which is where that listener is
     * registered. Returns whether the renderer prevented the browser's parallel page scroll.
     */
    wheelOverNotes(deltaY: number, deltaMode?: number): boolean
    /**
     * The mini-timeline's own drag, which is a SECOND pointer surface with its own three handlers
     * and its own rule (absolute rather than anchored - see ComposerRenderer.handleTimelineSlide).
     * Everything else in this file reaches the timeline as scene description only.
     */
    pressPointerOverTimeline(globalX: number, pointerId?: number): void
    movePointerOverTimeline(globalX: number, pointerId?: number): void
    releasePointerOverTimeline(globalX: number, pointerId?: number): void
    /**
     * A window-level pointerup, which is how a release outside the canvas reaches the renderer.
     *
     * With NO id it dispatches a plain Event, which names no pointer - the shape a `blur` has, and
     * the one that must cancel whatever is running. With an id it names that pointer, which is how
     * the concurrent rows state that a second finger's release does not end the first one's drag.
     */
    releasePointerOutsideTheCanvas(pointerId?: number): void
    /**
     * A native pointercancel: the OS taking the gesture away (an edge swipe, palm rejection). pixi
     * delivers no event of its own for it, so this is the window listener's alone to handle.
     */
    cancelPointer(): void
    /** Every selectColumn the renderer has asked for, in call order. */
    selectColumnCalls: {index: number, ignoreAudio?: boolean}[]
    /** Gesture releases which must re-anchor playback even when they restate the same floor. */
    forceAnchorCalls: number[]
    resize(body?: {width: number, height: number}): Promise<void>
    /**
     * The geometry as it stood the instant init() resolved - BEFORE the 50ms cache debounce, which
     * is the other thing that reports it. It is the only reading that can tell the two apart.
     */
    geometryAtInit(): {width: number, height: number, timelinePadding: number, timelineHeight: number}
    /**
     * Where the strip sat the instant init() resolved, for the same reason as the above: init()
     * positions it, and recalculateCacheAndSizes positions it again 50ms later, so this is the only
     * reading that can tell the two apart.
     */
    stripYAtInit(): number
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
    const canvasEl = document.createElement('div')
    document.body.append(canvasEl)
    const state = (): ComposerRendererState => ({
        columns: context.song.columns,
        structureVersion: context.song.structureVersion,
        isPlaying: context.props.isPlaying,
        playbackColumnStartMs: context.props.playbackColumnStartMs,
        playbackAnchorGeneration: context.props.playbackAnchorGeneration,
        isRecordingAudio: context.props.isRecordingAudio,
        instruments: context.song.instruments,
        songPitch: context.song.pitch,
        selected: context.song.selected,
        currentLayer: context.props.currentLayer,
        beatMarks: context.props.beatMarks,
        columnsPerCanvas: COLUMNS_PER_CANVAS,
        breakpoints: context.song.breakpoints,
        selectedColumns: context.props.selectedColumns,
        smoothScroll: context.props.smoothScroll,
        bpm: context.props.bpm,
    })
    const appsBefore = pixi.applications.length
    //the canvas geometry, taken from the callback the Svelte template takes it from - see Geometry.
    //The template needs all four: the width sizes the wrapper, and the other three are where it
    //absolutely positions the three timeline buttons over the strip the canvas draws.
    let reportedWidth = 0
    let reportedHeight = 0
    let reportedPadding = 0
    let reportedTimelineHeight = 0
    const selectColumnCalls: {index: number, ignoreAudio?: boolean}[] = []
    const forceAnchorCalls: number[] = []
    const renderer = new ComposerRenderer(canvasEl, state(), {
        selectColumn: (index, ignoreAudio, forceAnchor) => {
            selectColumnCalls.push({index, ignoreAudio})
            if (forceAnchor) forceAnchorCalls.push(index)
        },
        toggleBreakpoint: () => {},
        onGeometryChange: reported => {
            reportedWidth = reported.width
            reportedHeight = reported.height
            reportedPadding = reported.timelinePadding
            reportedTimelineHeight = reported.timelineHeight
        },
    })
    await renderer.init()
    //TAKEN BEFORE THE DEBOUNCE BELOW, which is the whole point of it: recalculateCacheAndSizes
    //reports the same four numbers 50ms later, so a reading taken after the wait cannot tell
    //init()'s own notifyGeometry() from that one. The Svelte template renders the timeline controls
    //only once this report has arrived, so what this pins is that they arrive with the canvas
    //rather than 50ms after it.
    const reportedAtInit = {
        width: reportedWidth,
        height: reportedHeight,
        timelinePadding: reportedPadding,
        timelineHeight: reportedTimelineHeight,
    }
    //...and WHAT THE CANVAS LOOKS LIKE at that same instant, for the same reason. Three separate
    //things now decide this 50ms window and no reading taken after it can see any of them: init()
    //reports the geometry the three DOM buttons are placed from, drawTimelineStage paints the
    //strip's background bar whether or not a cache exists, and init() positions the strip. Drop the
    //last of those and the bar and the viewport outline paint across the TOP of the canvas until
    //the debounce fires - on every mount and every {#key columnsPerCanvas} remount - while the
    //buttons sit correctly 489px lower. See 'the strip is under the notes region before the cache
    //debounce'.
    const [appAtInit] = pixi.applications.slice(appsBefore)
    const stripYAtInit = appAtInit.stage.children[2].y
    //REQUIRED: init()'s theme callback schedules the ComposerCache behind a 50ms debounce. Without
    //waiting it out there is no cache, drawNotesStage early-returns, and every counter here reads
    //0 - which looks exactly like a perfectly optimised renderer.
    //50ms cache debounce plus six 16ms minimap callbacks: five bounded 64-column slices for the
    //three 100-column passes, then one separate texture-install callback.
    await vi.advanceTimersByTimeAsync(180)

    //ONE Application, whose stage carries the whole composer in THIS order, every index of which is
    //load-bearing:
    //  [0] the column container, because FakeApplication.render pushes children[0].x into renderedX
    //      - the only channel for "the frame rendered the offset it computed" - and because it has
    //      to be UNDER the playhead;
    //  [1] the playhead, a persistent Graphics added AFTER the columns so it draws over them; a line
    //      under the columns is invisible;
    //  [2] the timeline strip, LAST, because pixi's EventBoundary walks children in REVERSE and
    //      returns on the first hit - so being last is what makes the strip decide a pointer before
    //      the notes container sees it. Draw order is free (the two regions never overlap in y), so
    //      hit order is the whole of why it is here.
    const [app] = pixi.applications.slice(appsBefore)
    expect(app.stage.children).toHaveLength(3)
    const notesColumns = app.stage.children[0]
    const playhead: SceneNode = app.stage.children[1]
    expect(playhead.kind).toBe('graphics')
    const strip = app.stage.children[2]
    expect(strip.kind).toBe('containers')
    expect(strip.children).toHaveLength(3)
    const timelineContent = strip.children[0]
    //the viewport outline is the strip's SECOND child, a persistent Graphics; it is the one
    //Graphics outside the pool that gets cleared, and columnPaints subtracts it by identity
    const viewport: SceneNode = strip.children[1]
    expect(viewport.kind).toBe('graphics')
    //...and [2] is the outline's CLIP - a Graphics that never renders, because pixi takes a mask out
    //of the build while it is one. A sibling and not a child of the outline, which is moved every
    //frame; see initViewportClip. What this file can see of it is the shape it is cut to and that
    //the outline points at it - not that pixi then stencils anything, which needs a GPU.
    const viewportClip: SceneNode = strip.children[2]
    expect(viewportClip.kind).toBe('graphics')
    expect(viewport.mask).toBe(viewportClip)
    //jsdom measures nothing, so the canvas width comes from a mocked body rect through the
    //renderer's own computeCanvasSize. A zero here would make every timeline expectation below
    //compare zero against zero.
    expect(reportedWidth).toBeGreaterThan(0)

    const currentCache = (): ComposerCache => {
        for (let i = caches.length - 1; i >= 0; i--) {
            if (caches[i].app === app) return caches[i].cache
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
        const [canvasWidth, canvasHeight] = lastResize(app)
        //THE CANVAS THE RENDERER SIZED, against the width it REPORTED. Every timeline rule below
        //is stated in terms of the reported width; a scene drawn full-width onto a narrower canvas
        //is a disagreement here rather than a scene that happens to look right in the description.
        expect(canvasWidth).toBe(reportedWidth)
        //THE SPLIT, reported rather than read back off the one resize. With two canvases the notes
        //height and the timeline height were two independent readings and their disagreement was
        //the check; with one canvas there is a single resize, so the renderer REPORTS where the
        //split falls and this is what puts the reading back to three-numbers-must-agree - the
        //report, the resize, and the cache below.
        const height = reportedHeight
        const timelineHeight = reportedTimelineHeight
        expect(height + reportedPadding * 2 + timelineHeight).toBe(canvasHeight)
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
        return {
            canvasWidth: reportedWidth,
            //DERIVED ONLY - see Geometry. The renderer reports no inset, so this is the reported
            //canvas width less the two constants it draws the strip inside of.
            stripWidth: reportedWidth - TIMELINE_INSET_LEFT - TIMELINE_INSET_RIGHT,
            canvasHeight,
            height,
            columnWidth,
            rowHeight,
            timelinePadding: reportedPadding,
            timelineHeight,
        }
    }

    const measure = () => ({
        renders: app.renders,
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
                renders: after.renders - before.renders,
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
                    stage: describeRoot(app.stage),
                    x: notesColumns.x,
                    y: notesColumns.y,
                    alpha: notesColumns.alpha,
                    visible: notesColumns.visible,
                    clearColor: app.renderer.background.color,
                    //READ OUT OF THE DOM, not off the Application. Taking it from app.canvas
                    //describes a canvas that may not be on the page at all: deleting the
                    //appendChild in init() renders the whole composer to a detached element - a
                    //blank screen - and every other assertion in this file still passes, because
                    //they all describe the scene graph rather than where it is mounted.
                    canvasParent: app.canvas.parentElement === canvasEl ? 'canvas' : 'DETACHED',
                    canvasStyle: app.canvas.style.cssText,
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
                    stage: describeRoot(app.stage),
                    strip: describeRoot(strip),
                    container: describeRoot(timelineContent),
                    content: !strip.visible
                        ? []
                        : timelineContent.children.map(child =>
                            describeTimelineChild(child, slots)
                        ),
                    viewport: !strip.visible
                        ? expectedGraphicsChild(0, 0, [])
                        : describeTimelineChild(viewport, slots),
                },
            }
        },
        /**
         * The outline's clip, DELIBERATELY OUTSIDE paintedScene: a mask draws nothing, so a scene
         * description that carried it would be describing pixels that never exist. What it is worth
         * asserting is the shape it cuts and that the outline is the node pointed at it.
         */
        viewportClip: () => ({
            clipsTheOutline: viewport.mask === viewportClip,
            ops: [...(viewportClip.ops ?? [])],
        }),
        columnChildKinds() {
            return notesColumns.children.map(column => column.children.map(child => child.kind))
        },
        scrollPosition() {
            const {canvasWidth, columnWidth} = geometry()
            return (canvasWidth / 2 - notesColumns.x) / columnWidth
        },
        renders: () => app.renders,
        timelineMinimapTexture() {
            const background = timelineContent.children[0]
            const sprite = background?.children.find(child => child.kind === 'sprites')
            return sprite?.texture ?? null
        },
        renderedX: () => app.renderedX,
        frameLoop: () => ({
            started: app.ticker.started,
            maxFPS: app.ticker.maxFPS,
            frames: app.ticker.frames,
            emits: app.ticker.emits,
            stops: app.ticker.stops,
        }),
        msSinceLastFrame() {
            const {lastEmitMs} = app.ticker
            if (Number.isNaN(lastEmitMs)) throw new Error('the frame loop has never emitted')
            return performance.now() - lastEmitMs
        },
        columnsAreARenderGroup: () => notesColumns.isRenderGroup,
        geometry,
        currentCache,
        pointerReachesNotesStage(canvasX: number, canvasY = geometry().height / 2) {
            const hitArea = notesColumns.hitArea as {contains(x: number, y: number): boolean}
            return hitArea.contains(canvasX - notesColumns.x, canvasY - notesColumns.y)
        },
        pointerReachesTimelineStrip(
            canvasX: number,
            canvasY = strip.y + geometry().timelineHeight / 2
        ) {
            const hitArea = timelineContent.hitArea as {contains(x: number, y: number): boolean}
            return hitArea.contains(
                canvasX - strip.x - timelineContent.x,
                canvasY - strip.y - timelineContent.y
            )
        },
        pressPointerOverNotes(globalX: number, pointerId = PRIMARY_POINTER) {
            notesColumns.emit('pointerdown', {globalX, pointerId})
        },
        movePointerOverNotes(globalX: number, pointerId = PRIMARY_POINTER) {
            notesColumns.emit('pointermove', {globalX, pointerId})
        },
        releasePointerOverNotes(globalX: number, pointerId = PRIMARY_POINTER) {
            notesColumns.emit('pointerup', {globalX, pointerId})
        },
        wheelOverNotes(deltaY: number, deltaMode = WheelEvent.DOM_DELTA_PIXEL) {
            const event = new WheelEvent('wheel', {deltaY, deltaMode, cancelable: true})
            app.canvas.dispatchEvent(event)
            return event.defaultPrevented
        },
        pressPointerOverTimeline(globalX: number, pointerId = PRIMARY_POINTER) {
            timelineContent.emit('pointerdown', {globalX, pointerId})
        },
        movePointerOverTimeline(globalX: number, pointerId = PRIMARY_POINTER) {
            timelineContent.emit('pointermove', {globalX, pointerId})
        },
        releasePointerOverTimeline(globalX: number, pointerId = PRIMARY_POINTER) {
            timelineContent.emit('pointerup', {globalX, pointerId})
        },
        releasePointerOutsideTheCanvas(pointerId?: number) {
            //a plain Event where no id is asked for, which is what the renderer's own `blur` branch
            //receives - an event that names NO pointer must cancel whatever is running
            window.dispatchEvent(
                pointerId === undefined
                    ? new Event('pointerup')
                    : new PointerEvent('pointerup', {pointerId})
            )
        },
        cancelPointer() {
            window.dispatchEvent(new Event('pointercancel'))
        },
        selectColumnCalls,
        forceAnchorCalls,
        geometryAtInit: () => reportedAtInit,
        stripYAtInit: () => stripYAtInit,
        /**
         * A window resize, optionally MOVING THE BODY the renderer measures itself against.
         *
         * Without `body` this only re-runs the path: computeCanvasSize() reads document.body's rect,
         * which beforeEach pins at 1920x1080, so every size it recomputes is the size already in
         * hand and no geometry claim about the resize path means anything. Both of the obligations
         * the merged canvas introduced - assigning width/height BEFORE renderer.resize(), which
         * reads them through canvasHeight(), and repositioning the strip AFTER - survive deletion
         * unless the size actually changes. See 'follows the body it is measured against'.
         */
        async resize(body?: {width: number, height: number}) {
            if (body) {
                vi.spyOn(document.body, 'getBoundingClientRect')
                    .mockReturnValue(new DOMRect(0, 0, body.width, body.height))
            }
            window.dispatchEvent(new Event('resize'))
            //the same 50ms debounce as init()'s, plus room for the draw it ends in
            await vi.advanceTimersByTimeAsync(180)
        },
        destroy() {
            renderer.destroy()
            canvasEl.remove()
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
            //a tail sits on the SAME canonical row as the note sprite it leaves - the instrument
            //above decides only whether the tail is drawn at all, never where
            const row = gridRowForNumber(
                instrument?.name ?? '',
                effectiveTrackPitch(instrument, song.pitch),
                note.id
            ).row
            if (row === -1) continue
            //centred in its Song Grid row, and a stub over the right 45% in the column the note
            //STARTS in so the bar reads as leaving the note icon
            const y = COMPOSER_NOTE_POSITIONS[row] * rowHeight + (rowHeight - tailHeight) / 2
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
 *  - one note sprite per Song Grid row that computeGridRowLayerStatuses gives a non-zero status, at
 *    that row's y, dimmed to 0.45 when every note contributing to the row is stranded on its own
 *    instrument, and taking the ♯/♭ VARIANT of its icon texture when those notes are also OFF-SCALE
 *    (ADR-0007 phase D: the hint is baked into the note's own texture, so it is the sprite's
 *    identity that carries it and not a second child). A row is the note ID's canonical slot on
 *    EVERY track (ADR-0004), so two tracks on differently-sized instruments carrying one id
 *    contribute to one row rather than two;
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
        const stranded = computeGridStrandedMarks(column.notes, song.instruments, song.pitch)
        const notes: PaintedSpriteData[] = []
        for (const [row, status] of computeGridRowLayerStatuses(
            column.notes,
            props.currentLayer,
            song.instruments,
            song.pitch
        )) {
            if (status === 0) continue
            const mark = stranded.get(row)
            notes.push({
                texture: `notes[${noteTextureKey(status, mark ?? 0)}]`,
                x: 0,
                y: (COMPOSER_NOTE_POSITIONS[row] * height) / NOTES_PER_COLUMN,
                alpha: mark === undefined ? 1 : 0.45,
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
 * mid-drag, a wheel gesture or its settle still running - and every part that drives one reads it off
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
 *  - the STRIP between them is the one root that is deliberately not at the origin: it carries the
 *    whole mini-timeline down to `height + timelinePadding`, i.e. the padding row below the notes
 *    region, AND right to `TIMELINE_INSET_LEFT`, which is what keeps everything under it - the
 *    content, the hitarea's bounds, the outline's 1.5px inset - written in strip-local coordinates;
 *  - the whole song spans the STRIP, which is the canvas less the two ends the three DOM timeline
 *    buttons stand on (App.css positions them; composerCanvasGeometry states their footprint). So
 *    one song column is `stripWidth / columns.length` wide here - a different quantity from the
 *    notes stage's columnWidth, which is a fixed size per column and scrolls;
 *  - what deliberately stays CANVAS-based even on this stage is anything answering "how much of the
 *    song is the canvas showing": `columnsOnScreen` below, and the `canvasWidth / 2 / columnWidth`
 *    half of the outline's x. Those describe the notes region, and scaling them by the inset too
 *    would make the outline claim a different set of columns than the canvas holds;
 *  - the background covers the whole BAND - the canvas' full width, starting one left inset
 *    before the strip's own origin - in the timeline layer colour, so the three DOM buttons stand
 *    on it rather than on gaps in it;
 *  - a tools selection covers every selected cell, including the final one;
 *  - breakpoints are one timeline column wide with a three-pixel floor, at their columns' leading
 *    edges and clamped at the strip's right edge. Their opaque colour is the exact transformed
 *    composer accent used by the notes canvas' cached breakpoint sprites;
 *  - the viewport outline is as wide as the number of columns the canvas shows, with its left edge
 *    at the FIRST column the canvas shows - the scrolled-to column less the columns that fit
 *    between the canvas' left edge and the playhead - drawn 1.5px down so its 3px stroke sits
 *    inside the strip. Both numbers come off the pixel geometry rather than off columnsPerCanvas,
 *    which is the same span ComposerRenderer.timelineViewport reports to the drag handler, so the
 *    rectangle the user grabs is the rectangle they see.
 */
function expectedTimeline(context: Context, geometry: Geometry): PaintedScene['timeline'] {
    const {canvasWidth, stripWidth, height, columnWidth, timelinePadding, timelineHeight} = geometry
    const {song, props} = context
    const timelineColumnWidth = stripWidth / song.columns.length
    if (context.props.isRecordingAudio) {
        return {
            stage: AT_ORIGIN,
            strip: {
                x: TIMELINE_INSET_LEFT,
                y: height + timelinePadding,
                alpha: 1,
                visible: false,
            },
            container: AT_ORIGIN,
            content: [],
            viewport: expectedGraphicsChild(0, 0, []),
        }
    }
    const content: PaintedTimelineChild[] = [
        //the BAND, which is the canvas' full width and not the strip's: the minimap and everything
        //else in this container are inset by the DOM buttons' footprints, and the background runs
        //under those buttons rather than leaving the clear colour showing in the gaps around them
        expectedGraphicsChild(0, 0, [
            ['rect', -TIMELINE_INSET_LEFT, 0, canvasWidth, timelineHeight],
            ['fill', {color: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber()}],
        ]),
    ]
    if (props.selectedColumns.length) {
        const from = props.selectedColumns[0] * timelineColumnWidth
        const to = (props.selectedColumns[props.selectedColumns.length - 1] + 1) * timelineColumnWidth
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
    if (song.breakpoints.length) {
        const ops: unknown[] = []
        const breakpointWidth = Math.min(Math.max(3, timelineColumnWidth), stripWidth)
        for (const breakpoint of song.breakpoints) {
            ops.push([
                'rect',
                Math.min(timelineColumnWidth * breakpoint, stripWidth - breakpointWidth),
                0,
                breakpointWidth,
                timelineHeight,
            ])
        }
        ops.push(['fill', {
            color: ThemeProvider.get('composer_accent').rotate(20).darken(0.5).rgb().rgbNumber(),
            alpha: 1,
        }])
        content.push(expectedGraphicsChild(0, 0, ops))
    }
    //not COLUMNS_PER_CANVAS: the renderer rounds a column to an even number of pixels, so the canvas
    //shows a fraction more or less than the setting asks for
    const columnsOnScreen = canvasWidth / columnWidth
    return {
        stage: AT_ORIGIN,
        //the one root that is NOT at the origin - see this function's rules. Its x is THE assertion
        //that pins which container carries the inset: every coordinate below is strip-local because
        //this one is not.
        strip: {
            x: TIMELINE_INSET_LEFT,
            y: height + timelinePadding,
            alpha: 1,
            visible: !context.props.isRecordingAudio,
        },
        container: AT_ORIGIN,
        content,
        viewport: expectedGraphicsChild(
            //the first column the canvas shows, in timeline coordinates. Written as ONE
            //multiplication of the difference, matching ComposerRenderer.timelineViewport: the
            //comparison against the renderer is exact and a timeline column is not a whole number
            //of pixels, so how the arithmetic associates moves the last bits of the result.
            //THE TWO SPACES MIX HERE deliberately: the first factor is a STRIP column width, the
            //subtrahend is how many CANVAS columns fit left of the playhead - see the rules above.
            timelineColumnWidth * (song.selected - canvasWidth / 2 / columnWidth),
            1.5,
            [
                [
                    'roundRect',
                    0,
                    0,
                    Math.floor(timelineColumnWidth * columnsOnScreen),
                    timelineHeight - 3,
                    6,
                ],
                [
                    'moveTo',
                    Math.floor(timelineColumnWidth * columnsOnScreen) / 2,
                    0,
                ],
                [
                    'lineTo',
                    Math.floor(timelineColumnWidth * columnsOnScreen) / 2,
                    timelineHeight - 3,
                ],
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
 * The playhead: a 2px red bar spanning the NOTES REGION's height - which is where the canvas ended
 * before the mini-timeline moved onto it, and running the bar any lower would put it through the
 * strip - centred on the canvas' horizontal middle, at the stage origin and never moved - and SHOWN ONLY WITH SMOOTH SCROLLING ON, which is
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
    const {canvasWidth, columnWidth, height} = geometry
    const centre = canvasWidth / 2
    const ops = COMPOSER_PLAYHEAD_CONFIG.variant.compressed === 'rectangle'
        ? [
            [
                'roundRect',
                centre,
                1.5,
                columnWidth,
                height - 3,
                COMPOSER_PLAYHEAD_CONFIG.borderRadius ?? 4,
            ],
            ['stroke', {width: 3, color: accent, alpha: 0.9}],
        ]
        : [
            ['rect', centre - 1.5, 0, 3, height],
            ['poly', [centre - 6, 0, centre + 6, 0, centre, 8]],
            ['poly', [centre - 6, height, centre + 6, height, centre, height - 8]],
            ['fill', {color: accent, alpha: 0.9}],
        ]
    return {
        ...expectedGraphicsChild(0, 0, ops),
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
            //init() appends the one Application's canvas to the element it was constructed with
            canvasParent: 'canvas',
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
        change: context => void context.song.addNoteAt(41, 0, numberOf(3, 0)),
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
        change: context => context.song.removeNoteAt(40, 0, numberOf(40 % 7, 0)),
        renders: 1,
        columnPaints: [40, 41, 42],
        timelineRebuilds: 1,
    },
    {
        what: "a note's span changes",
        //makeSong gives column 40 a span of 3 (every 8th), so this grows it to 4 and the marked
        //range is the UNION of the two - [40, 40 + max(3, 4))
        change: context => void context.song.setNoteSpan(40, 0, numberOf(40 % 7, 0), 4),
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
            context.song.addNoteAt(41, 0, numberOf(3, 0))
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
        timelineRebuilds: 0,
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
                    renders: testCase.renders,
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
            song.addNoteAt(returnTo, 0, numberOf(3, 0))
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
            harness.context.song.addNoteAt(edited, 0, numberOf(edited % 7, 0))
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
            harness.context.song.removeNoteAt(41, 0, numberOf(41 % 7, 0))
            harness.push()
        },
    },
    {
        what: 'after a note is added to a drawn column',
        drive: harness => {
            harness.context.song.addNoteAt(41, 0, numberOf(3, 0))
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
            song.setNoteSpan(38, 1, numberOf((38 % 5) + 7, 1), 5)
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
            const {instrument, number, row} = strandingPair()
            song.addInstrument(instrument)
            const column = drawnColumnWithoutRow(song, row)
            song.addNoteAt(column, 2, number)
            harness.push()
            //the scenario is worth nothing if nothing ended up stranded, and two empty maps compare
            //equal - so the precondition is asserted rather than assumed. 0 is "stranded, but on
            //its own row": this note's number IS a grid id, it simply has no button here
            expect(computeGridStrandedMarks(song.columns[column].notes, song.instruments, song.pitch))
                .toEqual(new Map([[row, 0]]))
        },
    },
    ...([1, -1] as const).map(sign => ({
        //ADR-0007 phase D: a strand whose number falls BETWEEN two grid rows draws on the nearest
        //one with a ♯/♭ hint baked into its icon, so it reads as off the scale rather than merely
        //un-voiced. Both signs, because the two are different textures.
        what: `with a row whose only note is off-scale ${sign > 0 ? 'above' : 'below'} it`,
        drive: (harness: Harness) => {
            const song = harness.context.song
            const {instrument, number, row} = offScalePair(sign)
            song.addInstrument(instrument)
            const column = drawnColumnWithoutRow(song, row)
            song.addNoteAt(column, 2, number)
            harness.push()
            expect(computeGridStrandedMarks(song.columns[column].notes, song.instruments, song.pitch))
                .toEqual(new Map([[row, sign]]))
        },
    })),
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
            //numberOf(12, 1) is a Note Number makeSong never uses, so nothing truncates the span
            harness.context.song.addNoteAt(0, 1, numberOf(12, 1), 90)
            harness.push()
        },
    },
    {
        what: 'with a span grown after it was first painted',
        drive: harness => {
            harness.context.song.addNoteAt(24, 1, numberOf(12, 1), 1)
            harness.push()
            harness.context.song.setNoteSpan(24, 1, numberOf(12, 1), 30)
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
            harness.context.song.addNoteAt(41, 0, numberOf(3, 0))
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
            //column 5 is far outside the window (29..51); the span covers 5..44. numberOf(12, 1) is a note
            //id makeSong never uses, so nothing truncates it, and makeSong's own spans (every 8th
            //column, 3 long) reach 42 at the furthest - so column 44's bars come from this note
            //alone.
            song.addNoteAt(5, 1, numberOf(12, 1), 40)
            harness.push()
            expect(tailOpsAt(44)).toBeGreaterThan(0)
            song.setNoteSpan(5, 1, numberOf(12, 1), 1)
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
 * ADR-0004, stated INDEPENDENTLY of the helper the renderer places with.
 *
 * The table above compares the scene against computeGridRowLayerStatuses/computeGridStrandedMarks, so
 * a defect inside either is followed rather than caught - the header says so. This states the rows
 * the other way round, from game.json's two positionally-paired lists: row N of the Song Grid holds
 * Note Id CANONICAL_NOTE_IDS[N] and draws at COMPOSER_NOTE_POSITIONS[N]. A canvas that went back to
 * placing by the track's own instrument button fails here even if both helpers agreed with it.
 */
describe('the canvas places every note at its Note Id row, on every track', () => {
    /** Where a Note Id's sprite belongs, by game.json alone. */
    function rowY(id: number, geometry: Geometry): number {
        const row = CANONICAL_NOTE_IDS.indexOf(id)
        expect(row).not.toBe(-1)
        return (COMPOSER_NOTE_POSITIONS[row] * geometry.height) / NOTES_PER_COLUMN
    }

    it('a sub-grid track and a full-size track put one id on ONE row, and a stranded id dims on its own', async () => {
        const {instrument, playableId, ownButton, strandedId} = subGridPair()
        //NON-VACUOUS, and the reason this test exists: the two placement rules DISAGREE about this
        //id. Before ADR-0004 the sub-grid track drew it at its own button's row, which is a
        //different y - so every expectation below held only for the full-size track.
        expect(COMPOSER_NOTE_POSITIONS[ownButton]).not.toBe(
            COMPOSER_NOTE_POSITIONS[CANONICAL_NOTE_IDS.indexOf(playableId)]
        )
        const context = makeContext()
        //track 0 full-size (and the current layer), track 1 the sub-grid instrument. A song of its
        //own rather than makeSong's, so each column below carries only the notes under test.
        const song = new ComposedSong('canonical placement', [INSTRUMENTS[0], instrument])
        song.selected = SELECTED
        //each track stores the number ITS instrument enters that grid row at (ADR-0007)
        song.addNoteAt(SELECTED - 2, 0, numberOn(INSTRUMENTS[0], playableId))
        song.addNoteAt(SELECTED - 1, 1, numberOn(instrument, playableId))
        song.addNoteAt(SELECTED, 0, numberOn(INSTRUMENTS[0], playableId))
        song.addNoteAt(SELECTED, 1, numberOn(instrument, playableId))
        song.addNoteAt(SELECTED + 1, 1, numberOn(instrument, strandedId))
        context.song = song
        const harness = await mount(context)
        try {
            const geometry = harness.geometry()
            const columns = harness.paintedScene().notes.columns
            const notesAt = (index: number): PaintedSpriteData[] => {
                const column = columns.find(painted => painted.index === index)
                if (!column) throw new Error(`column ${index} is not drawn`)
                return column.notes
            }
            const y = rowY(playableId, geometry)
            //the full-size track, where own button and canonical row agree - the row both rules give
            expect(notesAt(SELECTED - 2)).toEqual([{texture: 'notes[1]', x: 0, y, alpha: 1}])
            //...and the SAME y from the sub-grid track, whose own button says otherwise. notes[4] is
            //the circle icon of a visible track that is not the current layer
            expect(notesAt(SELECTED - 1)).toEqual([{texture: 'notes[4]', x: 0, y, alpha: 1}])
            //both tracks in one column: ONE sprite, carrying both layers' bits (1 | 1<<2). Two
            //sprites here would be the two coordinate systems the ADR collapsed, still on screen
            expect(notesAt(SELECTED)).toEqual([{texture: 'notes[5]', x: 0, y, alpha: 1}])
            //an id the sub-grid instrument cannot play: drawn at the row the ID owns, dimmed
            expect(notesAt(SELECTED + 1)).toEqual([
                {texture: 'notes[4]', x: 0, y: rowY(strandedId, geometry), alpha: 0.45},
            ])
            //a stranded id no longer lands on a row a healthy note of the same track could take
            expect(rowY(strandedId, geometry)).not.toBe(y)
        } finally {
            harness.destroy()
        }
    })

    it('a span tail starts on the same row its note sprite does', async () => {
        const {instrument, playableId} = subGridPair()
        const context = makeContext()
        const song = new ComposedSong('canonical tails', [INSTRUMENTS[0], instrument])
        song.selected = SELECTED
        //on the sub-grid track, where a tail placed by own button would part company with its head
        song.addNoteAt(SELECTED, 1, numberOn(instrument, playableId), 3)
        context.song = song
        const harness = await mount(context)
        try {
            const geometry = harness.geometry()
            const rowHeight = geometry.rowHeight
            const tailHeight = Math.max(2, rowHeight * 0.22)
            const columns = harness.paintedScene().notes.columns
            const head = columns.find(painted => painted.index === SELECTED)!.notes[0]
            //the tail is centred in the row its head sits at the top of
            const tailY = head.y + (rowHeight - tailHeight) / 2
            for (const index of [SELECTED, SELECTED + 1, SELECTED + 2]) {
                const ops = columns.find(painted => painted.index === index)!.tails.ops
                //a stub over the right 45% in the column the note starts in, full width after
                const x = index === SELECTED ? geometry.columnWidth * 0.55 : 0
                expect(ops[0]).toEqual(['rect', x, tailY, geometry.columnWidth - x, tailHeight])
            }
        } finally {
            harness.destroy()
        }
    })
})

/**
 * ADR-0007 PHASE D, the half the scene table cannot state on its own.
 *
 * The table compares the painted texture against `noteTextureKey`, so it would follow the production
 * key straight into a variant that drew nothing at all. These rows say the other two things: that
 * the three variants are three DIFFERENT PICTURES (the hint is ink on the canvas, not a second name
 * for the same icon), and that a note which stops being off-scale stops carrying it - the end of the
 * un-strand flow, on the surface the user watches.
 */
describe('an off-scale note draws the accidental hint into its own icon', () => {
    /** The draw ops behind the plain / sharp / flat variants of one layer status. */
    function variants(harness: Harness, status: number): {plain: unknown[], sharp: unknown[], flat: unknown[]} {
        const notes = harness.currentCache().cache.notes as unknown as Record<string, {ops: unknown[]}>
        const at = (accidental: -1 | 0 | 1) => {
            const texture = notes[noteTextureKey(status, accidental)]
            if (!texture) throw new Error(`the cache holds no ${noteTextureKey(status, accidental)} icon`)
            return texture.ops
        }
        return {plain: at(0), sharp: at(1), flat: at(-1)}
    }

    it('the sharp and the flat variant each draw MORE than the plain icon, and differ from each other', async () => {
        const harness = await mount()
        try {
            //status 1 is the current layer's filled note - the icon nearly every drawn note takes
            const {plain, sharp, flat} = variants(harness, 1)
            //the glyph goes ON TOP, so each variant opens with every op the plain icon has
            expect(sharp.slice(0, plain.length)).toEqual(plain)
            expect(flat.slice(0, plain.length)).toEqual(plain)
            expect(sharp.length).toBeGreaterThan(plain.length)
            expect(flat.length).toBeGreaterThan(plain.length)
            //...and the two hints are not the same picture, which is what makes the SIGN readable
            expect(sharp).not.toEqual(flat)
        } finally {
            harness.destroy()
        }
    })

    it('draws the hint in the theme\'s own readable ink for the layer colour it sits on', async () => {
        //BOTH THEMES, without mounting two: the canvas takes its colours from the theme, and the
        //ink here is whatever ThemeProvider says is readable over `composer_main_layer` - so a
        //light theme and a dark one get opposite glyph colours from this one expression, and
        //neither can come out as the fill the glyph is drawn over.
        const harness = await mount()
        try {
            const {plain, sharp} = variants(harness, 1)
            const glyph = sharp.slice(plain.length)
            const strokes = glyph.filter(op => Array.isArray(op) && op[0] === 'stroke')
            expect(strokes.length).toBeGreaterThan(0)
            const ink = (strokes[0] as [string, {color: number}])[1].color
            expect(ink).not.toBe(ThemeProvider.get('composer_main_layer').rgbNumber())
            expect(ink).toBe(
                ThemeProvider
                    .getTextColorFromBackground(ThemeProvider.get('composer_main_layer'))
                    .rgbNumber()
            )
        } finally {
            harness.destroy()
        }
    })

    it('an off-scale note is one sprite, on the nearest row, dimmed and marked', async () => {
        const {instrument, number, row} = offScalePair(1)
        const context = makeContext()
        const song = new ComposedSong('off-scale', [instrument])
        song.selected = SELECTED
        song.addNoteAt(SELECTED, 0, number)
        context.song = song
        const harness = await mount(context)
        try {
            const geometry = harness.geometry()
            const notes = harness.paintedScene().notes.columns
                .find(column => column.index === SELECTED)!.notes
            //ONE sprite: the hint rides the note's own icon, so an off-scale note costs the canvas
            //nothing a voiced one does not
            expect(notes).toEqual([{
                texture: `notes[${noteTextureKey(1, 1)}]`,
                x: 0,
                y: (COMPOSER_NOTE_POSITIONS[row] * geometry.height) / NOTES_PER_COLUMN,
                alpha: 0.45,
            }])
        } finally {
            harness.destroy()
        }
    })

    it.runIf(INSTRUMENTS.some(name =>
        INSTRUMENTS_DATA[name].notes.some(note => note.pitched && note.sounding !== note.midi)
    ))('an instrument swap that UN-STRANDS the note takes the hint off it', async () => {
        //THE UN-STRAND FLOW, END TO END ON THE CANVAS, and the composer smoke pass in miniature:
        //a tuned instrument's Sounding Pitch stored on an untuned track is off-scale there - drawn
        //on its nearest row, dimmed, marked. Swapping the track to the instrument that owns that
        //pitch passes the number through untouched and gives it a button, so the same note becomes
        //an ordinary voiced one on the row that button's nominal id prints.
        const tuned = INSTRUMENTS.find(name =>
            INSTRUMENTS_DATA[name].notes.some(note => note.pitched && note.sounding !== note.midi))!
        const reflavored = INSTRUMENTS_DATA[tuned].notes.find(note =>
            note.pitched && note.sounding !== note.midi && !CANONICAL_NOTE_IDS.includes(note.sounding))
        if (!reflavored) return
        const host = INSTRUMENTS.find(name => numberToButton(name, 'C', reflavored.sounding) === -1)!
        const before = gridRowForNumber(host, 'C', reflavored.sounding)
        expect(before.stranded).toBe(true)
        expect(before.accidental).not.toBe(0)

        const context = makeContext()
        const song = new ComposedSong('un-strand by swap', [host])
        song.selected = SELECTED
        song.addNoteAt(SELECTED, 0, reflavored.sounding)
        context.song = song
        const harness = await mount(context)
        try {
            const geometry = harness.geometry()
            const rowY = (row: number) => (COMPOSER_NOTE_POSITIONS[row] * geometry.height) / NOTES_PER_COLUMN
            const notesAt = () => harness.paintedScene().notes.columns
                .find(column => column.index === SELECTED)!.notes
            expect(notesAt()).toEqual([{
                texture: `notes[${noteTextureKey(1, before.accidental)}]`,
                x: 0,
                y: rowY(before.row),
                alpha: 0.45,
            }])

            //the swap, exactly as the layer panel makes it: a fresh entry carrying the new name
            song.setInstrument(0, song.instruments[0].clone().set({name: tuned}))
            harness.push()

            //the stored number survived the swap, which is what makes this an un-strand and not a
            //rewrite - and the sprite is now plain, opaque, and on the tuned button's own row
            expect(song.columns[SELECTED].notes[0].id).toBe(reflavored.sounding)
            expect(notesAt()).toEqual([{
                texture: 'notes[1]',
                x: 0,
                y: rowY(CANONICAL_NOTE_IDS.indexOf(reflavored.midi)),
                alpha: 1,
            }])
        } finally {
            harness.destroy()
        }
    })
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
            //(numberOf(12, 1) is a Note Number makeSong never uses, so nothing truncates the span; 8 becomes
            //the longest span in the song, over makeSong's 3.)
            harness.context.song.addNoteAt(30, 1, numberOf(12, 1), 8)
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
            harness.context.song.setNoteSpan(32, 0, numberOf(32 % 7, 0), 6)
            harness.push()
            expect(columnsWithTails(harness)).toContain(36)
            harness.context.song.setNoteSpan(32, 0, numberOf(32 % 7, 0), 1)
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
                    renders: 1,
                    columnPaints: 1,
                    paintedColumns: [drawn[drawn.length - 1]],
                    timelineRebuilds: 0,
                    viewsCreated: 0,
                    viewsDestroyed: 0,
                })
            }
            expect(counters.constructed).toEqual({containers: 0, sprites: 0, graphics: 0, texts: 0})
            expect(counters.destroyed).toEqual({containers: 0, sprites: 0, graphics: 0, texts: 0})
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

/**
 * THE MARGINS WHERE THE SONG HAS RUN OUT. The columns start AT the playhead rather than at the left
 * edge, so the canvas is wider than the strip they occupy wherever the scroll cannot go any further:
 * the left half at position 0, the right half at the last column, and both at once on any song
 * shorter than the screen - which is every song that has just been created. Those margins used to
 * answer no pointer at all, so a finger landing on them did nothing while the wheel over the very
 * same pixels scrolled (that listener is on the canvas ELEMENT and never consulted a hitarea).
 *
 * Stated through the hitarea rather than by emitting at the container, because emitting IS the
 * routed pointer - every other pointer test in this file starts after the decision this one is
 * about. The last row closes the loop by doing both: routed first, then driven.
 */
describe('what the notes stage answers a pointer on', () => {
    /** Advance far enough for at least one capped frame to have been emitted. */
    const frame = () => vi.advanceTimersByTimeAsync(64)

    async function mountStopped(prepare?: (song: ComposedSong) => void) {
        const context = makeContext()
        //stopped: a running transport is a second writer of the scroll position, and every row here
        //needs the canvas to still be where `selected` put it when the hitarea is asked
        context.props.isPlaying = false
        prepare?.(context.song)
        const harness = await mount(context)
        harness.push()
        return harness
    }

    /** Where the drawn columns begin and end ON THE CANVAS - the strip the hitarea used to be. */
    function columnStrip(harness: Harness): {left: number, right: number} {
        const {columnWidth} = harness.geometry()
        const left = harness.paintedScene().notes.x
        return {left, right: left + harness.context.song.columns.length * columnWidth}
    }

    it('the empty canvas before the first column, which is the left half of it at position 0', async () => {
        const harness = await mountStopped(song => (song.selected = 0))
        try {
            const strip = columnStrip(harness)
            //the margin exists at all - without this the row below would pass on a canvas that had
            //no empty part to answer for
            expect(strip.left).toBeGreaterThan(0)
            expect(harness.scrollPosition()).toBe(0)
            expect(harness.pointerReachesNotesStage(strip.left / 2)).toBe(true)
            //and the very first pixel of the canvas, since the bound is the canvas and not a margin
            expect(harness.pointerReachesNotesStage(0)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('the empty canvas after the last column, which is the right half of it at the end', async () => {
        const harness = await mountStopped(song => (song.selected = song.columns.length - 1))
        try {
            const {canvasWidth} = harness.geometry()
            const strip = columnStrip(harness)
            expect(strip.right).toBeLessThan(canvasWidth)
            expect(harness.pointerReachesNotesStage((strip.right + canvasWidth) / 2)).toBe(true)
            expect(harness.pointerReachesNotesStage(canvasWidth)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('a song shorter than the screen, which is surrounded by margin at the only position it has', async () => {
        //six columns of a twenty-column canvas: the motivating case, since a song is created long
        //before it is long, and until it fills the screen most of the canvas is margin
        const harness = await mountStopped(song => {
            song.removeColumns(song.columns.length - 6, 6)
            song.selected = 0
        })
        try {
            const {canvasWidth} = harness.geometry()
            const strip = columnStrip(harness)
            expect(harness.context.song.columns).toHaveLength(6)
            expect(strip.right).toBeLessThan(canvasWidth)
            expect(harness.pointerReachesNotesStage(strip.left / 2)).toBe(true)
            expect(harness.pointerReachesNotesStage((strip.right + canvasWidth) / 2)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('the columns themselves, and every height of the canvas', async () => {
        const harness = await mountStopped()
        try {
            const {canvasWidth, height} = harness.geometry()
            const strip = columnStrip(harness)
            //the playhead: this song is far longer than the screen and scrolled to its middle, so
            //the line has a column under it - asserted, since the strip runs off both edges here
            const overAColumn = canvasWidth / 2
            expect(overAColumn).toBeGreaterThan(strip.left)
            expect(overAColumn).toBeLessThan(strip.right)
            expect(harness.pointerReachesNotesStage(overAColumn, 0)).toBe(true)
            expect(harness.pointerReachesNotesStage(overAColumn, height)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('NOT a point off the canvas, while no pointer is down', async () => {
        //THE REASON THE BOUND SURVIVED. pixi registers its pointerup on globalThis rather than on
        //the canvas element, so releasing a button anywhere else in the composer is hit-tested
        //against this container too; answering it would reach handleStageUp as a click and both
        //select and SOUND whichever end column the clamp landed on.
        const harness = await mountStopped()
        try {
            const {canvasWidth, height} = harness.geometry()
            expect(harness.pointerReachesNotesStage(-1)).toBe(false)
            expect(harness.pointerReachesNotesStage(canvasWidth + 1)).toBe(false)
            expect(harness.pointerReachesNotesStage(canvasWidth / 2, -1)).toBe(false)
            expect(harness.pointerReachesNotesStage(canvasWidth / 2, height + 1)).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('everything, once a pointer is down, so a drag that leaves the canvas still ends', async () => {
        const harness = await mountStopped()
        try {
            const {canvasWidth, height} = harness.geometry()
            harness.pressPointerOverNotes(canvasWidth / 2)
            expect(harness.pointerReachesNotesStage(-1000)).toBe(true)
            expect(harness.pointerReachesNotesStage(canvasWidth + 1000, height + 1000)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('and a drag begun in the margin scrolls, on the same three handlers a drag over a column uses', async () => {
        const harness = await mountStopped(song => (song.selected = 0))
        try {
            const {columnWidth} = harness.geometry()
            //the press lands where nothing is drawn, which is the whole point of the row
            const start = columnStrip(harness).left / 2
            expect(harness.pointerReachesNotesStage(start)).toBe(true)

            harness.pressPointerOverNotes(start)
            harness.movePointerOverNotes(start - columnWidth * 2)
            await frame()
            //dragging leftwards from a standstill at column 0 pulls the song forwards under the
            //line, exactly as it would have from a press two columns to the right of here
            expect(harness.scrollPosition()).toBe(2)
            expect(harness.selectColumnCalls).toEqual([{index: 2, ignoreAudio: true}])
        } finally {
            harness.destroy()
        }
    })
})

/**
 * WHICH SURFACE A POINTER ON THE MERGED CANVAS REACHES - the regression net for the timeline moving
 * onto the notes canvas, and the thing none of the other pointer helpers in this file can see: they
 * emit straight at a container, which is the shape of a pointer that has ALREADY been routed.
 *
 * There is one EventBoundary now. pixi's hitTestRecursive walks a container's children in REVERSE
 * and returns on the first hit, and the strip is the stage's LAST child (mount() asserts that
 * order), so the strip is asked first and the notes container is reached only when it declined.
 * Every row below is an instance of that one sentence.
 */
describe('which surface a pointer on the merged canvas reaches', () => {
    async function mountStoppedComposer() {
        const context = makeContext()
        //stopped, for the same reason the notes-stage rows above are: a running transport is a
        //second writer of the scroll position
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        return harness
    }

    it('a point in the notes region reaches the stage and not the strip', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height} = harness.geometry()
            const x = canvasWidth / 2
            expect(harness.pointerReachesNotesStage(x, height / 2)).toBe(true)
            expect(harness.pointerReachesTimelineStrip(x, height / 2)).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('a point on the strip reaches the strip and NOT the stage, which is what keeps a scrub silent', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height, timelinePadding, timelineHeight} = harness.geometry()
            const x = canvasWidth / 2
            const y = height + timelinePadding + timelineHeight / 2
            expect(harness.pointerReachesTimelineStrip(x, y)).toBe(true)
            //THE GUARD: handleStageUp calls selectColumn WITHOUT ignoreAudio, so a release that
            //reached the notes stage as well as the strip would SOUND a column on every scrub
            expect(harness.pointerReachesNotesStage(x, y)).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it("the notes stage's bound is the notes region, not the canvas", async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height, canvasHeight} = harness.geometry()
            const x = canvasWidth / 2
            //the last row of the notes region is inside...
            expect(harness.pointerReachesNotesStage(x, height)).toBe(true)
            //...and the first row below it is not, though the CANVAS runs on for another
            //`timelinePadding * 2 + timelineHeight` px
            expect(harness.pointerReachesNotesStage(x, height + 1)).toBe(false)
            expect(canvasHeight).toBeGreaterThan(height + 1)
        } finally {
            harness.destroy()
        }
    })

    it('the reclaimed padding is part of the timeline hit area, with no dead row below it', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height, canvasHeight, timelinePadding, timelineHeight} = harness.geometry()
            const x = canvasWidth / 2
            expect(timelinePadding).toBe(0)
            const firstTimelinePixel = height + 0.5
            expect(harness.pointerReachesNotesStage(x, firstTimelinePixel)).toBe(false)
            expect(harness.pointerReachesTimelineStrip(x, firstTimelinePixel)).toBe(true)
            expect(canvasHeight).toBe(height + timelineHeight)
            expect(harness.pointerReachesTimelineStrip(x, canvasHeight - 0.5)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it('while a press owns the notes surface the strip answers nothing, anywhere', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height, timelinePadding, timelineHeight} = harness.geometry()
            const stripY = height + timelinePadding + timelineHeight / 2
            harness.pressPointerOverNotes(canvasWidth / 2)
            //THE DEFERRAL. The strip is hit-tested BEFORE the notes container, so without it a stage
            //drag whose pointer wanders down into the strip is claimed here and the drag freezes
            //until the pointer comes back up.
            expect(harness.pointerReachesTimelineStrip(canvasWidth / 2, stripY)).toBe(false)
            //...including at the strip's own left edge, which without the deferral would answer.
            //NOT x=0: that is inside the buttons' footprint now and would be declined for the inset
            //reason, so this row would keep passing with the deferral deleted.
            expect(harness.pointerReachesTimelineStrip(TIMELINE_INSET_LEFT + 10, stripY)).toBe(false)
            //...while the stage answers everywhere, which is how a drag that leaves the canvas ends
            expect(harness.pointerReachesNotesStage(canvasWidth / 2, stripY)).toBe(true)
            expect(harness.pointerReachesNotesStage(-1000, -1000)).toBe(true)
        } finally {
            harness.destroy()
        }
    })

    it("the strip's hitarea stops where the buttons begin, at both ends", async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height, timelinePadding, timelineHeight} = harness.geometry()
            const y = height + timelinePadding + timelineHeight / 2
            //THE CLAIM: a press where a DOM button stands must not ALSO scrub the song. The button
            //itself swallows the press (pixi listens on the canvas element and the button is a DOM
            //sibling over it), but the 3.2px padding/gaps around the buttons fall through to
            //the canvas - and these bounds are what decline them.
            expect(harness.pointerReachesTimelineStrip(TIMELINE_INSET_LEFT - 1, y)).toBe(false)
            expect(harness.pointerReachesTimelineStrip(TIMELINE_INSET_LEFT, y)).toBe(true)
            expect(
                harness.pointerReachesTimelineStrip(canvasWidth - TIMELINE_INSET_RIGHT, y)
            ).toBe(true)
            expect(
                harness.pointerReachesTimelineStrip(canvasWidth - TIMELINE_INSET_RIGHT + 1, y)
            ).toBe(false)
            //...and the notes stage does not pick any of them up either, on its own `y` bound - so
            //those pixels reach no handler at all, which is what pressing the inert
            //`.timeline-wrapper` row did before the two canvases were merged
            for (const x of [
                TIMELINE_INSET_LEFT - 1,
                TIMELINE_INSET_LEFT,
                canvasWidth - TIMELINE_INSET_RIGHT,
                canvasWidth - TIMELINE_INSET_RIGHT + 1,
            ]) {
                expect(harness.pointerReachesNotesStage(x, y)).toBe(false)
            }
        } finally {
            harness.destroy()
        }
    })

    it('the strip is drawn at the inset the buttons occupy', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, stripWidth} = harness.geometry()
            const {strip, content} = harness.paintedScene().timeline
            //THE BAND IS THE CANVAS' and the STRIP is what the buttons leave. The background rect
            //starts one left inset BEFORE the container's origin and runs the whole canvas, so the
            //band has no gaps under the three buttons; everything else here is strip-local.
            const background = content[0]
            expect(background.kind).toBe('graphics')
            const rect = background.ops.find(
                (op): op is [string, number, number, number, number] =>
                    Array.isArray(op) && op[0] === 'rect'
            )
            expect(strip.x).toBe(TIMELINE_INSET_LEFT)
            expect(rect?.[1]).toBe(-TIMELINE_INSET_LEFT)
            expect(rect?.[3]).toBe(canvasWidth)
            expect(stripWidth).toBe(canvasWidth - TIMELINE_INSET_LEFT - TIMELINE_INSET_RIGHT)
            //...AS A LITERAL, not only as the imported constants. Every other assertion in this file
            //is written in terms of TIMELINE_INSET_LEFT/RIGHT, which makes them all invariant under
            //the two being SWAPPED - a swap that would draw the strip from 41.6, underneath both
            //left-hand buttons, and leave 80px of dead canvas at the right where one button stands.
            //80 is the left band because two buttons stand there and one stands at the right.
            expect(strip.x).toBe(80)
            //toBeCloseTo and not toBe: 41.6 is not representable, so the subtraction lands a few
            //ulps off it. 10 decimals is far tighter than any real drift and far looser than that.
            expect(canvasWidth - stripWidth - strip.x).toBeCloseTo(41.6, 10)
            //121.6px = 3 x 2.2rem of button + 5 x 0.2rem, from the controls' two horizontal padding
            //edges and its gaps: three spacers around the left pair, two around the right button.
            expect(TIMELINE_INSET_LEFT + TIMELINE_INSET_RIGHT).toBe(121.6)
        } finally {
            harness.destroy()
        }
    })

    it("the viewport outline is clipped to the strip, so it cannot reach into the buttons' bands", async () => {
        const harness = await mountStoppedComposer()
        try {
            const {stripWidth, timelineHeight} = harness.geometry()
            //THE CLAIM: timelineViewport()'s x is `stripColumnWidth * (scrollPosition -
            //playheadX / columnWidth)`, which is NEGATIVE for the first half-canvas of columns of
            //every song - the state a freshly created one opens in - and runs past stripWidth at the
            //other end. Nothing else on the strip is masked, so before the strip was inset that
            //overflow ran off the edge of the canvas; now it would run into the two bands the DOM
            //buttons stand on and show through the 3.2px of bare canvas beside each button.
            const clip = harness.viewportClip()
            expect(clip.clipsTheOutline).toBe(true)
            //the strip's own rectangular shape, matching the background bar
            expect(clip.ops[0]).toEqual(['rect', 0, 0, stripWidth, timelineHeight])
            //WHAT THIS CANNOT SEE: that pixi then stencils anything. jsdom has no GPU, and the fakes
            //record the mask rather than applying it - so this pins the wiring and the shape, and
            //the clipping itself rests on pixi's own StencilMask.
        } finally {
            harness.destroy()
        }
    })

    it('while a timeline drag runs the strip answers everything, anywhere', async () => {
        const harness = await mountStoppedComposer()
        try {
            const {canvasWidth, height} = harness.geometry()
            harness.pressPointerOverTimeline(canvasWidth / 2)
            expect(harness.pointerReachesTimelineStrip(-1000, -1000)).toBe(true)
            expect(harness.pointerReachesTimelineStrip(canvasWidth + 1000, height / 2)).toBe(true)
            //...and the notes stage is kept out of it by the CHILD ORDER rather than by a clause of
            //its own: pixi walks the stage's children in reverse and returns on the first hit, the
            //strip is the last child (mount() states it), so this container is never asked while
            //the line above answers. A mirror guard in testStageHitarea would be unreachable code.
            harness.releasePointerOverTimeline(canvasWidth / 2)
        } finally {
            harness.destroy()
        }
    })
})

/**
 * A SECOND CONCURRENT POINTER, which merging the two canvases made reachable for the first time.
 *
 * While the timeline had a canvas of its own the two surfaces had an EventBoundary each, and pixi
 * registers pointerdown on the canvas ELEMENT (node_modules/pixi.js/lib/events/EventSystem.mjs -
 * pointerdown/touchstart on domElement; only pointermove and pointerup are global), so a press on
 * one canvas could not be delivered to the other's containers at all. One canvas is one boundary,
 * and the two ownership guards the merge added are both stated over a hit-tested POINT - `contains`
 * is handed no pointerId - so each of them routes a second press exactly as if it were the first
 * one's continuation:
 *
 *  - a running scrub makes the strip answer the WHOLE canvas, so a press on the note grid was
 *    routed to handleTimelineDown and teleported the scrub to it - measured at 93 columns;
 *  - a held stage press makes the strip DECLINE everything, so a press meant for the strip was
 *    routed to handleStageDown and overwrote the live drag's anchor - measured at 7 columns
 *    backwards for a 10px forward nudge.
 *
 * The guards that reject it therefore live in the handlers, keyed on pointerId, and these rows are
 * what pin them. A second pointer is ordinary on a phone (a second thumb) and ordinary on a desktop
 * too: pixi dispatches a pointerdown per mouse BUTTON, so a right-click during a left-button drag
 * is one.
 */
describe('a second concurrent pointer cannot corrupt the gesture already running', () => {
    async function mountStoppedGliding() {
        const context = makeContext()
        //stopped, so the scroll position has exactly one writer - the gesture under test
        context.props.isPlaying = false
        //continuous rather than column-quantised, so a corrupted anchor shows as itself instead of
        //being rounded back onto the column it should have stayed on
        context.props.smoothScroll = true
        const harness = await mount(context)
        harness.push()
        return harness
    }

    //a drag writes its position into the motion and the FRAME applies it, so nothing below can be
    //read straight after the move that caused it - the same wait the manual-scrolling part uses
    const aFrame = () => vi.advanceTimersByTimeAsync(64)

    it('a press on the note grid does not teleport a running timeline scrub', async () => {
        const harness = await mountStoppedGliding()
        try {
            const {stripWidth, height} = harness.geometry()
            //A scrubs the far right of the STRIP - which stops TIMELINE_INSET_RIGHT short of the
            //canvas' own edge, so `canvasWidth - 10` would be past the end and clamp to the last
            //column for the wrong reason: the last column of the 100-column song
            harness.pressPointerOverTimeline(TIMELINE_INSET_LEFT + stripWidth - 1, PRIMARY_POINTER)
            await aFrame()
            const afterA = harness.scrollPosition()
            expect(harness.selectColumnCalls.at(-1)).toEqual({index: 99, ignoreAudio: true})

            //B goes down in the MIDDLE OF THE NOTE GRID, hundreds of px above the strip. The strip
            //is hit-tested first and answers it, because A's scrub makes it answer everything - so
            //this really is dispatched to the timeline handlers rather than to the notes'.
            expect(harness.pointerReachesTimelineStrip(100, height / 2)).toBe(true)
            harness.pressPointerOverTimeline(100, SECOND_POINTER)
            //...and is ignored: the canvas has not moved and no further column was asked for
            expect(harness.scrollPosition()).toBe(afterA)
            expect(harness.selectColumnCalls.at(-1)).toEqual({index: 99, ignoreAudio: true})

            //B's moves are ignored too, so the scrub is not merely un-teleported but still A's.
            //The frame wait is load-bearing: a move writes into the motion and the FRAME applies
            //it, so a reading taken straight after the move sees the previous frame either way.
            harness.movePointerOverTimeline(140, SECOND_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBe(afterA)
            //...and A still owns it: its own move moves the canvas, to the column the strip's
            //midpoint stands for on a song that spans it
            harness.movePointerOverTimeline(TIMELINE_INSET_LEFT + stripWidth / 2, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(50, 5)
        } finally {
            harness.destroy()
        }
    })

    it("a second pointer's release does not settle the scrub the first is still holding", async () => {
        const harness = await mountStoppedGliding()
        try {
            const {canvasWidth, stripWidth} = harness.geometry()
            //the strip's own midpoint and quarter, in canvas coordinates - the fractions of the
            //SONG they stand for are what the assertions below read
            const stripHalf = TIMELINE_INSET_LEFT + stripWidth / 2
            const stripQuarter = TIMELINE_INSET_LEFT + stripWidth / 4
            harness.pressPointerOverTimeline(stripHalf, PRIMARY_POINTER)
            harness.releasePointerOverTimeline(canvasWidth - 10, SECOND_POINTER)
            //STILL DRAGGING: A's next move is still applied, which it would not be if B's release
            //had taken the motion out of `dragging` - handleTimelineSlide returns when it has
            harness.movePointerOverTimeline(stripQuarter, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(25, 5)
            //...and the same through the WINDOW listener, which hears every pointer on the page and
            //would otherwise undo the guard the pixi handlers apply
            harness.releasePointerOutsideTheCanvas(SECOND_POINTER)
            harness.movePointerOverTimeline(stripHalf, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(50, 5)
        } finally {
            harness.destroy()
        }
    })

    it('a press meant for the strip does not re-anchor a running stage drag', async () => {
        const harness = await mountStoppedGliding()
        try {
            const {columnWidth, height, timelinePadding, timelineHeight} = harness.geometry()
            //A drags the notes region 100px to the left: 100 / columnWidth columns forward
            harness.pressPointerOverNotes(800, PRIMARY_POINTER)
            harness.movePointerOverNotes(700, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 100 / columnWidth, 5)

            //B taps the mini-timeline. A's press makes the strip decline everything, so this is
            //dispatched to the NOTES container - the routing here is the harness's own hit test,
            //not a reading of the source.
            const stripY = height + timelinePadding + timelineHeight / 2
            expect(harness.pointerReachesTimelineStrip(120, stripY)).toBe(false)
            expect(harness.pointerReachesNotesStage(120, stripY)).toBe(true)
            harness.pressPointerOverNotes(120, SECOND_POINTER)

            //A nudges 10px further. Measured against B's x the canvas runs 7 columns BACKWARDS;
            //measured against its own press it moves the 10px it was given.
            harness.movePointerOverNotes(690, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 110 / columnWidth, 5)
            //...and B's own moves move nothing at all
            harness.movePointerOverNotes(400, SECOND_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 110 / columnWidth, 5)
        } finally {
            harness.destroy()
        }
    })

    it("a second pointer's release does not end a stage drag, or sound a column", async () => {
        const harness = await mountStoppedGliding()
        try {
            const {columnWidth} = harness.geometry()
            harness.pressPointerOverNotes(800, PRIMARY_POINTER)
            harness.movePointerOverNotes(700, PRIMARY_POINTER)
            await aFrame()
            const before = harness.selectColumnCalls.length
            //B releases over the notes. handleStageUp's CLICK path calls selectColumn WITHOUT
            //ignoreAudio - it SOUNDS the column - so a release that is not this gesture's reaching
            //it is audible, not merely wrong.
            harness.releasePointerOverNotes(120, SECOND_POINTER)
            expect(harness.selectColumnCalls.slice(before)).toEqual([])
            //...and A's drag survives it
            harness.movePointerOverNotes(690, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 110 / columnWidth, 5)
        } finally {
            harness.destroy()
        }
    })

    it('a release naming NO pointer still cancels the gesture, which is what blur is', async () => {
        const harness = await mountStoppedGliding()
        try {
            harness.pressPointerOverNotes(800, PRIMARY_POINTER)
            harness.movePointerOverNotes(700, PRIMARY_POINTER)
            await aFrame()
            //THE SHAPE `blur` ARRIVES IN, and a pointercancel the browser gives no id for. Filtering
            //it by owner the way the rows above filter a named release would strand the motion in
            //`dragging` for good - which is the failure the window listener exists to prevent.
            harness.releasePointerOutsideTheCanvas()
            //long enough for the settle's own ease to arrive, so the reading below is a resting
            //position rather than a moment of one
            await vi.advanceTimersByTimeAsync(600)
            const settled = harness.scrollPosition()
            expect(settled).toBe(Math.round(settled))
            //the drag is over, so a further move from the SAME pointer writes nothing
            harness.movePointerOverNotes(600, PRIMARY_POINTER)
            await aFrame()
            expect(harness.scrollPosition()).toBe(settled)
        } finally {
            harness.destroy()
        }
    })
})

/**
 * THE GATE THAT KEEPS THE VIEWPORT OUTLINE OFF THE PER-FRAME PATH, as the error it is allowed to
 * hold.
 *
 * syncTimelineViewport skips the WRITE on any frame whose rounded x matches the last one written -
 * assigning `viewportGraphics.x` dirties the stage batcher and makes pixi re-upload its whole
 * attribute buffer, so a frame that would move the outline by a fraction of a pixel is worth
 * skipping. The price is that the scene holds a stale x, and the size of that staleness is a
 * property of the ROUNDING: two positions that round to the same integer can be almost 1.0 apart.
 *
 * Both bounds below are the claim. `< 1` is what the gate's rounding permits and is what a wider
 * quantiser (a floor, a `Math.round(x / 2) * 2`) would break; `> 0.5` is what makes the row a
 * measurement rather than a hope, and is what the docstring used to claim before it was measured.
 */
describe("the timeline outline's staleness is bounded by the gate's own rounding", () => {
    it('trails the canvas by less than a pixel, and by more than half of one', async () => {
        const context = makeContext()
        context.props.isPlaying = false
        context.props.smoothScroll = true
        const harness = await mount(context)
        try {
            //A SONG WHOSE COLUMNS ARE FINER THAN THE STRIP'S PIXELS - 400 of them across ~1588px -
            //which is the only shape the gate ever skips a frame on: on a short song the outline
            //moves several whole pixels per frame and every frame writes.
            harness.context.song.addColumns(300, harness.context.song.columns.length - 1)
            harness.push()
            const {canvasWidth, stripWidth, columnWidth} = harness.geometry()
            const total = harness.context.song.columns.length
            //the SONG spans the strip, which is the canvas less the DOM buttons' two footprints...
            const relativeColumnWidth = stripWidth / total
            //...while this one stays canvas-based: it is how many columns the notes region shows
            const columnsOnScreen = canvasWidth / columnWidth

            let worst = 0
            const start = canvasWidth / 2
            harness.pressPointerOverNotes(start)
            for (let step = 1; step <= 600; step++) {
                //3px a move: fine enough that consecutive frames land inside the same rounded
                //pixel, which is what makes the gate skip at all
                harness.movePointerOverNotes(start - step * 3)
                await vi.advanceTimersByTimeAsync(21)
                //THE TRUTH, recomputed from where the CANVAS actually is (read off the column
                //container, not off the renderer) through timelineViewport's own rule
                const truth =
                    relativeColumnWidth * (harness.scrollPosition() - columnsOnScreen / 2)
                worst = Math.max(worst, Math.abs(harness.paintedScene().timeline.viewport.x - truth))
            }
            harness.releasePointerOverNotes(start - 1800)
            expect(worst).toBeLessThan(1)
            expect(worst).toBeGreaterThan(0.5)
        } finally {
            harness.destroy()
        }
    })
})

/**
 * THE GEOMETRY THE ONE CANVAS REPORTS, and the resize that moves it.
 *
 * The report is what the Svelte template builds the three timeline controls out of - it places them
 * at `top: height + timelinePadding`, `height: timelineHeight`, over a strip `width` wide, and does
 * not render them at all until it has one - so WHEN it arrives and whether it FOLLOWS the body are
 * both visible to a user rather than internal bookkeeping.
 */
describe('the geometry the merged canvas reports', () => {
    it('arrives with the canvas rather than 50ms after it', async () => {
        const harness = await mount()
        try {
            //the other reporter is recalculateCacheAndSizes, behind a 50ms debounce. A renderer that
            //left the report to that one renders the composer with no mini-timeline controls at all
            //for those 50ms, on every mount and every {#key columnsPerCanvas} remount.
            const atInit = harness.geometryAtInit()
            expect(atInit.width).toBeGreaterThan(0)
            expect(atInit.height).toBeGreaterThan(0)
            expect(atInit.timelinePadding).toBe(0)
            expect(atInit.timelineHeight).toBeGreaterThan(0)
            //...and it is the geometry the settled renderer is actually showing, so it is a box the
            //buttons can be placed in rather than a first guess that then moves under them
            const settled = harness.geometry()
            expect(atInit).toEqual({
                width: settled.canvasWidth,
                height: settled.height,
                timelinePadding: settled.timelinePadding,
                timelineHeight: settled.timelineHeight,
            })
        } finally {
            harness.destroy()
        }
    })

    it('the strip is under the notes region before the cache debounce, not across the top', async () => {
        const harness = await mount()
        try {
            //THE OTHER HALF OF THAT 50ms WINDOW. The report above is what puts the three DOM buttons
            //on screen at once; this is where the canvas has drawn the bar they float over. Both
            //have to be right together, and only one of them is a number the template can see - the
            //strip's y is scene state, so nothing outside this file can notice it being wrong.
            //
            //The default (y = 0) is a whole notes region away from the truth, so a renderer that
            //left this to recalculateCacheAndSizes paints the mini-timeline bar and the viewport
            //outline ACROSS THE TOP of the canvas, over the first note rows, for those 50ms - on
            //every mount and every {#key columnsPerCanvas} remount - while the buttons sit at the
            //bottom. drawTimelineStage draws the bar with no cache in hand, so there is nothing else
            //keeping the strip empty until the debounce catches up.
            const {height, timelinePadding} = harness.geometryAtInit()
            expect(harness.stripYAtInit()).toBe(height + timelinePadding)
            //...and it is the same place the settled renderer keeps it, so this is the strip's one
            //position rather than a first guess that then moves
            expect(harness.paintedScene().timeline.strip.y).toBe(harness.stripYAtInit())
        } finally {
            harness.destroy()
        }
    })

    it('follows the body it is measured against, canvas and strip together', async () => {
        const harness = await mount()
        try {
            const before = harness.geometry()
            //ONLY THE HEIGHT MOVES. geometry() cross-checks the reported width against the
            //module-level CANVAS_WIDTH/COLUMN_WIDTH the whole file's window definition is evaluated
            //against, so a narrower body would fail there rather than say anything here. The height
            //is where the merge's two new obligations live anyway: canvasHeight() is stated against
            //`this.height`, and so are the strip's own y and the `top` the three DOM buttons get.
            await harness.resize({width: 1920, height: 700})
            const after = harness.geometry()
            expect(after.height).toBeLessThan(before.height)
            //HALF THE CLAIM IS INSIDE geometry(): it asserts that `height + timelinePadding * 2 +
            //timelineHeight` is the size the canvas was actually RESIZED to. Putting
            //renderer.resize() back above the width/height assignments - it reads them through
            //canvasHeight() - sizes the canvas from the PREVIOUS notes region and fails there.
            //The other half is the scene: dropping positionTimelineStrip() from the resize path
            //leaves timelineStrip.y at the old notes height, drawn over the bottom note rows, and
            //fails on `timeline.strip.y` here.
            expect(harness.paintedScene()).toEqual(expectedScene(harness.context, after))
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
            //(numberOf(12, 0) is a Note Number makeSong never uses, so nothing truncates the span.)
            harness.context.song.addNoteAt(0, 0, numberOf(12, 0), 90)
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
                renders: 0,
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
//  - AUDIO-TRUTH: an update carrying `selected = i` carries the performance-clock instant at which
//    its audio starts, so travel waits for a future anchor and catches up from a late callback.
//    A hold or an offset at the start is invisible at the endpoints (the column is right either
//    way) and puts the line out of time with the music for the whole song;
//  - tempo changers, whose whole point here is that the speed changes with them;
//  - the queue, whose CHAIN is what keeps the timeline contiguous when ticks jitter against the
//    frames consuming it - a single "current glide" slot jumps the line when a tick lands inside
//    the previous segment's prediction;
//  - the line and the overlay being MUTUALLY EXCLUSIVE, which is what keeps one mark on the canvas
//    rather than two disagreeing ones.
//
// The clock is driven, never slept through: vi.useFakeTimers replaces requestAnimationFrame and
// performance.now together, so advancing the timers by N ms both fires the frames that would have
// happened and moves the clock those frames read. The frames themselves come off the notes
// Application's Ticker (see the FakeTicker), whose maxFPS gate lets through only some of them.
describe('the smooth scroll', () => {
    /** A column's length at BPM, by the arithmetic the transport and the renderer share. */
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

    /** Press play: a fresh anchor whose selected column starts at the supplied performance time. */
    function startPlaying(harness: Harness, startMs = performance.now()) {
        harness.context.props.playbackAnchorGeneration += 1
        harness.context.props.playbackColumnStartMs = startMs
        harness.context.props.isPlaying = true
        return harness.push()
    }

    /** One transport advance: generation unchanged, with its audio-true boundary supplied. */
    function tick(harness: Harness, startMs = performance.now()) {
        harness.context.props.playbackColumnStartMs = startMs
        harness.context.song.selected += 1
        return harness.push()
    }

    /** A manual re-anchor: generation changes even when the numeric move is exactly +1. */
    function jump(harness: Harness, selected: number, startMs = performance.now()) {
        harness.context.props.playbackAnchorGeneration += 1
        harness.context.props.playbackColumnStartMs = startMs
        harness.context.song.selected = selected
        return harness.push()
    }

    it("waits for a 50ms play anchor, then travels one column over that column's length", async () => {
        const harness = await mountGliding()
        try {
            expect(harness.scrollPosition()).toBe(SELECTED)
            const startsAt = performance.now() + 50
            //pressing play schedules; it paints nothing, because nothing has moved yet
            expect(startPlaying(harness, startsAt).columnPaints).toBe(0)
            expect(harness.scrollPosition()).toBe(SELECTED)

            //The UI state lands before the scheduled audio anchor. Frames taken inside that margin
            //must leave the line at the column start rather than leading what the listener hears.
            await vi.advanceTimersByTimeAsync(48)
            expect(harness.scrollPosition()).toBe(SELECTED)

            //Once the explicit boundary passes it travels one whole column over one whole column's
            //worth of time. Read at the
            //halfway point rather than only at the ends: an ease, or a chase toward a target,
            //agrees at both ends and disagrees here.
            await vi.advanceTimersByTimeAsync(WHOLE / 2 + 2)
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
            await vi.advanceTimersByTimeAsync(QUARTER / 2)
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
     * That test's premise was a second mark that had to be held in agreement with the line. There
     * is no second mark: with smooth scrolling on the line is the only one, and the two are
     * mutually exclusive. What the deleted test was really protecting - the mark staying with the
     * music - is carried by the position assertions in the rows above, which state where the LINE
     * is at fractions of a column.
     */
    it('draws no selection overlay at all, before, during and after a tick', async () => {
        const harness = await mountGliding()
        try {
            expect(selectedColumnsOf(harness)).toEqual([])
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(selectedColumnsOf(harness)).toEqual([])

            //THE TICK, driven here while the line is still mid-column (jitter magnified): it moves
            //`selected` on while the playhead has the previous column's travel to give up. Neither
            //column may acquire an overlay at that instant.
            tick(harness)
            expect(harness.context.song.selected).toBe(SELECTED + 1)
            expect(selectedColumnsOf(harness)).toEqual([])

            //...and the playhead travelling on through the next column does not produce one either
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
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
            const {canvasWidth, columnWidth, height} = harness.geometry()
            const centre = canvasWidth / 2
            const drawn = () => harness.paintedScene().notes.playhead
            expect(drawn().visible).toBe(true)
            //AT THE CENTRE, which is what makes it agree with the container offset: the offset puts
            //the start of the scrolled-to column here, so a line drawn anywhere else marks a column
            //the composer is not on while every other value in the scene stays right.
            const expectedOps = COMPOSER_PLAYHEAD_CONFIG.variant.compressed === 'rectangle'
                ? [
                    [
                        'roundRect',
                        centre,
                        1.5,
                        columnWidth,
                        height - 3,
                        COMPOSER_PLAYHEAD_CONFIG.borderRadius ?? 4,
                    ],
                    ['stroke', {width: 3, color: ThemeProvider.get('accent').rgbNumber(), alpha: 0.9}],
                ]
                : [
                    ['rect', centre - 1.5, 0, 3, height],
                    ['poly', [centre - 6, 0, centre + 6, 0, centre, 8]],
                    ['poly', [centre - 6, height, centre + 6, height, centre, height - 8]],
                    ['fill', {color: ThemeProvider.get('accent').rgbNumber(), alpha: 0.9}],
                ]
            expect(drawn().ops).toEqual(expectedOps)

            harness.context.props.isRecordingAudio = true
            harness.push()
            //The line is a SIBLING of the columns container, so hiding the columns for a recording
            //has no reach over it - without a term of its own the recording shows an empty
            //background with a red line standing in the middle of it, and a still one at that,
            //since applyScrollPosition returns before touching anything while that flag is set.
            expect(drawn().visible).toBe(false)
            //hidden, not cleared: the drawing survives, so bringing the stage back costs no
            //GraphicsContext rebuild
            expect(drawn().ops).toEqual(expectedOps)
        } finally {
            harness.destroy()
        }
    })

    it('catches up fractionally when a boundary callback reaches the renderer late', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            const boundary = performance.now() + WHOLE
            //The audio boundary passes, but worker wake + Svelte delivery arrive 100ms later.
            await vi.advanceTimersByTimeAsync(WHOLE + 100)
            tick(harness, boundary)

            //On the next emitted frame the segment is already callback-lateness + frame-time into
            //the selected column. Anchoring at callback arrival would be only one frame into it.
            await vi.advanceTimersByTimeAsync(32)
            const elapsed = performance.now() - boundary
            expectPosition(harness, SELECTED + 1 + elapsed / WHOLE, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('walks short columns one at a time, in order, when ticks arrive with jitter', async () => {
        const harness = await mountGliding()
        try {
            //1/8 columns at 220bpm last 34ms - one to two emitted frames each - and the ticks
            //below land ±12ms off their boundaries, the way timer wakes and Svelte flushes skew
            //them in the real app. Alternating the jitter makes every other tick land INSIDE the
            //previous segment's prediction (the truncation seam) and every other one land past it
            //(the clamp-and-wait seam), so both seams are crossed repeatedly at speed.
            for (let index = SELECTED; index < SELECTED + 8; index++) {
                harness.context.song.setTempoChangerAt(index, TEMPO_CHANGERS[3])
            }
            startPlaying(harness)
            const EIGHTH = columnMs(0.125)

            //Sampled finely and reduced to the sequence of columns the line passed THROUGH rather
            //than to readings at the boundaries: a reading taken at a boundary is a coin flip on
            //how stale the last frame is (the cap emits unevenly - see expectPosition), while a
            //skipped or revisited column is exactly what a dropped or replaced segment produces
            //and shows up here directly.
            const seen: number[] = [Math.floor(harness.scrollPosition())]
            const sampleFor = async (ms: number) => {
                for (let elapsed = 0; elapsed < ms; elapsed += 4) {
                    await vi.advanceTimersByTimeAsync(4)
                    const at = Math.floor(harness.scrollPosition())
                    if (seen[seen.length - 1] !== at) seen.push(at)
                }
            }
            for (let i = 0; i < 6; i++) {
                await sampleFor(i % 2 === 0 ? EIGHTH + 12 : EIGHTH - 12)
                tick(harness)
            }
            //stop sampling INSIDE the last ticked column, so the trailing clamp at its far
            //boundary does not append the never-reached next column's floor
            await sampleFor(EIGHTH - 8)
            expect(seen).toEqual([
                SELECTED,
                SELECTED + 1,
                SELECTED + 2,
                SELECTED + 3,
                SELECTED + 4,
                SELECTED + 5,
                SELECTED + 6,
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
            //fractional position the canvas is actually at - not at `selected`, which is a whole
            //column while the line is partway through it. A pool advanced from the state instead
            //would hold a window shifted by that fraction and every column in it would still be
            //painted correctly.
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
                const drawn = reference.paintedScene()
                // THE OUTLINE'S x ALONE is compared through the gate's own rule rather than
                // exactly, and this is the only place in the file where the difference is visible.
                // syncTimelineViewport skips the WRITE on a frame that would not move the outline
                // by a whole pixel, so a position reached by GLIDING holds the last x whose
                // rounding differed while the reference's was written exactly by draw(). Round-equal
                // is the gate's statement of itself, and the strict inequality below is its
                // consequence - two numbers with the same rounding are less than a pixel apart.
                //
                // Nothing about the PIXELS changed when the two canvases were merged: the gate used
                // to skip the timeline Application's render instead, so the drawn outline lagged by
                // the same fraction while the scene description held the exact value. This states
                // what is on screen where it used to state what had been computed.
                const withoutOutlineX = (scene: PaintedScene): PaintedScene => ({
                    ...scene,
                    timeline: {
                        ...scene.timeline,
                        viewport: {...scene.timeline.viewport, x: 0},
                    },
                })
                expect(withoutOutlineX(glided)).toEqual(withoutOutlineX(drawn))
                expect(Math.round(glided.timeline.viewport.x)).toBe(
                    Math.round(drawn.timeline.viewport.x)
                )
                expect(
                    Math.abs(glided.timeline.viewport.x - drawn.timeline.viewport.x)
                ).toBeLessThan(1)
            } finally {
                reference.destroy()
            }
        } finally {
            harness.destroy()
        }
    })

    it('settles on the selected column when playback stops mid-column', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            harness.context.props.isPlaying = false
            harness.push()
            //PAUSING EASES, it does not jump. The position is still the fraction the playhead had
            //reached at the moment of the pause, and the 140ms ease is what carries it to a column.
            expect(harness.scrollPosition()).toBeGreaterThan(SELECTED)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            //...and it lands on `selected` - which during audio-true playback is the very column
            //the line was inside, the one being heard when the pause landed - giving back only the
            //fraction of it already travelled.
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

    it('pauses without publishing: the settle target is the column already selected', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            //one tick, then partway into its column - the ordinary state a pause lands in: the
            //line is a fraction inside the very column `selected` names, because `selected` is
            //audio-true.
            await vi.advanceTimersByTimeAsync(WHOLE)
            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.context.song.selected).toBe(SELECTED + 1)
            const midColumn = harness.scrollPosition()
            expect(midColumn).toBeGreaterThan(SELECTED + 1)
            expect(midColumn).toBeLessThan(SELECTED + 2)

            harness.selectColumnCalls.length = 0
            harness.context.props.isPlaying = false
            harness.push()
            //NO selectColumn round-trip: the column the line is inside IS the selected one, so
            //the pause has nothing to tell the composer that its state does not already hold -
            //the settle target never differs from `selected`, which is why the branch publishes
            //nothing at all.
            expect(harness.selectColumnCalls).toEqual([])
            //...and it EASES there rather than arriving, which is the whole point of the branch:
            //halting a mid-column glide dead is still a jump
            expect(harness.scrollPosition()).toBe(midColumn)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('keeps the mark on the column under the line at every instant of a snapping drag', async () => {
        //SNAP MODE. The mark and the canvas are two different writes on two different clocks here:
        //the drag puts the new position in the motion (a frame applies it) and asks Svelte for the
        //new `selected` (an update applies the mark). Whichever lands first shows the pair
        //disagreeing, and on a drag that is once per column crossed - which is what reads as the
        //highlight flickering a column behind the canvas.
        const context = makeContext()
        context.props.smoothScroll = false
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            harness.push()
            const {columnWidth, canvasWidth} = harness.geometry()
            const start = canvasWidth / 2

            harness.pressPointerOverNotes(start)
            //three columns of travel, checked at both orderings of the two writes
            for (let step = 1; step <= 3; step++) {
                harness.movePointerOverNotes(start - columnWidth * step)
                //Svelte handing `selected` back, BEFORE any frame - the instant the two writes are
                //furthest apart, and the one the bug was visible in
                const asked = harness.selectColumnCalls.at(-1)
                if (asked) harness.context.song.selected = asked.index
                harness.push()
                expect(selectedColumnOf(harness)).toBe(harness.scrollPosition())
                //...and after the frame, which is the other order
                //three display frames on this file's 16ms fake clock, so the capped ticker has
                //emitted at least once whatever the gate skipped
                await vi.advanceTimersByTimeAsync(48)
                expect(selectedColumnOf(harness)).toBe(harness.scrollPosition())
            }
        } finally {
            harness.destroy()
        }
    })

    it('settles on the last column when the song runs out - the end is the ordinary pause', async () => {
        const harness = await mountGliding()
        try {
            const last = harness.context.song.columns.length - 1
            //1/8 columns at the end - the fastest cadence the settings admit, where an
            //end-of-song case computed from anything but `selected` would be magnified across
            //eight 34ms columns
            for (let index = last - 8; index <= last; index++) {
                harness.context.song.setTempoChangerAt(index, TEMPO_CHANGERS[3])
            }
            harness.context.song.selected = last - 8
            harness.push()
            startPlaying(harness)

            //run to the end on the audio-true cadence: each tick lands at its column's boundary
            const EIGHTH = columnMs(0.125)
            for (let i = 0; i < 8; i++) {
                await vi.advanceTimersByTimeAsync(EIGHTH)
                tick(harness)
            }
            expect(harness.context.song.selected).toBe(last)
            //let the last column's own travel finish: the playhead reaches the far boundary of
            //the song and holds there, which is where the music is while its final column sounds
            await vi.advanceTimersByTimeAsync(EIGHTH * 2)
            expect(harness.scrollPosition()).toBe(last + 1)

            //THE SONG ENDS. The transport's onFinished stops playback with `selected` still on
            //the last column - the last column the song reached IS the selected one, so the end
            //needs no case of its own: the ordinary pause settle eases back onto it, publishing
            //nothing.
            harness.selectColumnCalls.length = 0
            harness.context.props.isPlaying = false
            harness.push()
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.scrollPosition()).toBe(last)
            expect(harness.selectColumnCalls).toEqual([])
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('snaps for a jump but waits for its exact future boundary before gliding', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)

            //a breakpoint jump, a click, the wheel: `selected` moving by anything but one column
            const startsAt = performance.now() + 50
            jump(harness, 60, startsAt)
            expect(harness.scrollPosition()).toBe(60)

            //The target is immediate user feedback; movement through it starts with its audio.
            await vi.advanceTimersByTimeAsync(48)
            expect(harness.scrollPosition()).toBe(60)
            await vi.advanceTimersByTimeAsync(WHOLE / 2 + 2)
            expectPosition(harness, 60.5, WHOLE)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, 61, WHOLE)

            //A LATE TICK, stated rather than smoothed over. Ticks normally land at their column's
            //boundary; this one is held back half a column - a stalled flush, a busy main thread.
            //The playhead waits AT the boundary for it instead of extrapolating past the schedule
            //it was given or stepping back to meet the delay.
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.scrollPosition()).toBe(61)

            tick(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, 61.5, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('treats a generation-bumped manual +1 as a discontinuity, not a transport tick', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            const startsAt = performance.now() + 50
            jump(harness, SELECTED + 1, startsAt)
            //Numeric delta alone would append to the old half-finished segment and leave the line
            //there. The generation says this is an anchor, so it snaps to the requested column.
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            await vi.advanceTimersByTimeAsync(48)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            await vi.advanceTimersByTimeAsync(WHOLE / 2 + 2)
            expectPosition(harness, SELECTED + 1.5, WHOLE)
        } finally {
            harness.destroy()
        }
    })

    it('leaves the glide running when an edit lands mid-column', async () => {
        const harness = await mountGliding()
        try {
            startPlaying(harness)
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            const midColumn = harness.scrollPosition()
            expectPosition(harness, SELECTED + 0.5, WHOLE)

            //note entry is not gated on isPlaying, so this is a real state an edit arrives in. It
            //takes the repaint path, which draws at the position the glide has reached - a path
            //that redrew from `selected` would snap the canvas forward under the user's hand.
            harness.context.song.addNoteAt(SELECTED + 3, 0, numberOf(11, 0))
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
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
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
        await vi.advanceTimersByTimeAsync(WHOLE / 2)
        const rendersBefore = harness.renders()
        //the glide IS running at this point, so the count below is a stopped loop rather than one
        //that was never started
        await vi.advanceTimersByTimeAsync(WHOLE / 4)
        expect(harness.renders()).toBeGreaterThan(rendersBefore)

        harness.destroy()
        const rendersAtDestroy = harness.renders()
        //a loop that outlived destroy() would go on rendering into a destroyed Application, which
        //is the leak the {#key columnsPerCanvas} remount makes routine rather than exotic
        await vi.advanceTimersByTimeAsync(WHOLE * 4)
        expect(harness.renders()).toBe(rendersAtDestroy)
    })
})

// ---------------------------------------------------------------------------------------------
// THE STATIC TIMELINE MINIMAP.
//
// paintedScene intentionally describes the timeline overlays but not the raster contents of a
// generated texture. These identity/timing rows cover the renderer half of that omitted surface:
// generation yields across callbacks, playback freezes the installed sprite, and stopping resumes
// only the latest pending state with one atomic swap/render.
// ---------------------------------------------------------------------------------------------
describe('the static timeline minimap', () => {
    it('yields the first sprite to idle slices instead of painting it inline', async () => {
        const context = makeContext()
        //Mount while playing: no generation may start, so this begins with no previous sprite.
        const harness = await mount(context)
        try {
            expect(harness.timelineMinimapTexture()).toBeNull()
            context.props.isPlaying = false
            harness.push()

            //Nothing is painted inline: the job is handed to an idle callback, so no sprite can
            //exist before one has run. (Not "several callbacks" any more — how many the job takes
            //is maxColumnsPerIdleSlice against this song's columns × the background/tail/head
            //passes, and that is a tuning knob. What must hold at every setting is that the work
            //is YIELDED and the sprite appears only once the slices have run.)
            await vi.advanceTimersByTimeAsync(COMPOSER_TIMELINE_MINIMAP_CONFIG.fallbackDelayMs - 1)
            expect(harness.timelineMinimapTexture()).toBeNull()

            const columnUnits = context.song.columns.length * 3
            const slices =
                Math.ceil(columnUnits / COMPOSER_TIMELINE_MINIMAP_CONFIG.maxColumnsPerIdleSlice) + 1
            await vi.advanceTimersByTimeAsync(
                COMPOSER_TIMELINE_MINIMAP_CONFIG.fallbackDelayMs * (slices + 1)
            )
            expect(harness.timelineMinimapTexture()).not.toBeNull()
        } finally {
            harness.destroy()
        }
    })

    it('keeps the completed sprite frozen through playback and swaps once after stopping', async () => {
        const context = makeContext()
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            const before = harness.timelineMinimapTexture()
            expect(before).not.toBeNull()

            context.props.isPlaying = true
            harness.push()
            context.song.addNoteAt(10, 0, numberOf(14, 0), 2)
            harness.push()
            const rendersAfterEdit = harness.renders()

            await vi.advanceTimersByTimeAsync(1000)
            expect(harness.timelineMinimapTexture()).toBe(before)
            expect(harness.renders()).toBe(rendersAfterEdit)

            context.props.isPlaying = false
            harness.push()
            const rendersBeforeIdleSwap = harness.renders()
            await vi.advanceTimersByTimeAsync(112)
            expect(harness.timelineMinimapTexture()).not.toBe(before)
            expect(harness.renders() - rendersBeforeIdleSwap).toBe(1)
        } finally {
            harness.destroy()
        }
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

    it('takes no frames at all while audio is recording', async () => {
        const harness = await mountGliding()
        try {
            harness.context.props.isPlaying = true
            harness.push()
            await vi.advanceTimersByTimeAsync(32)
            expect(harness.frameLoop().started).toBe(true)

            //AudioRecorder captures in real time, so a main-thread stall is a dropout in the file
            //the user is recording. Nothing the frames computed could reach the screen anyway -
            //applyScrollPosition returns before touching the scene while this is set, and the
            //columns are hidden - so before this branch existed the loop ran for the whole length
            //of a recording producing nothing: measured at 62 rAF callbacks and 29 emits a second
            //on this file's 60Hz fake clock.
            harness.context.props.isRecordingAudio = true
            harness.push()
            expect(harness.frameLoop().started).toBe(false)

            const before = {loop: harness.frameLoop(), notes: harness.renders()}
            //...and the TRANSPORT keeps running through a recording - it is playing the song into
            //the file - so the ticks have to stay silent too, not just the moment the flag is set
            for (let i = 0; i < 4; i++) {
                await vi.advanceTimersByTimeAsync(WHOLE)
                harness.context.song.selected += 1
                harness.push()
            }
            await vi.advanceTimersByTimeAsync(1000)
            const after = harness.frameLoop()
            expect(after.started).toBe(false)
            expect(after.frames - before.loop.frames).toBe(0)
            expect(after.emits - before.loop.emits).toBe(0)

            //and coming out of a recording brings the canvas back, at the column the transport
            //reached rather than wherever the schedule had been left
            harness.context.props.isRecordingAudio = false
            harness.push()
            expect(harness.scrollPosition()).toBe(harness.context.song.selected)
            expect(harness.renders()).toBeGreaterThan(before.notes)
        } finally {
            harness.destroy()
        }
    })

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
                renders: harness.renders(),
                clears: counters.graphicsClears,
            }
            await vi.advanceTimersByTimeAsync(1000)
            //ALL FOUR, because each catches a different sloppy loop: `started` catches one armed at
            //init, `frames` catches an rAF requested but gated to nothing, the render count catches
            //a callback that renders unconditionally, and the clear count catches one that repaints
            //columns. A loop that ran and did nothing moves only the middle two.
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.frameLoop().frames).toBe(0)
            expect(harness.renders()).toBe(before.renders)
            expect(counters.graphicsClears).toBe(before.clears)
        } finally {
            harness.destroy()
        }
    })

    it('caps only playback, and a second of gliding emits fewer frames than the display offers', async () => {
        const harness = await mountGliding()
        try {
            //The stopped composer is uncapped so manual dragging, wheeling, easing and coasting can
            //follow every display frame. Starting playback installs the cap before starting its
            //glide; stopping playback removes it again.
            expect(harness.frameLoop().maxFPS).toBe(0)
            harness.context.props.isPlaying = true
            harness.push()
            expect(harness.frameLoop().maxFPS).toBe(48)
            //...and the cap is on the ticker the renderer actually runs. The value alone cannot say
            //that: running a private rAF beside this one leaves it reading 48 while the frames
            //arrive at the display's rate. Under the fake
            //clock a display frame is every 16ms, so 62 arrive in a second and the gate lets fewer
            //through - not 48 exactly, because it is a frame SKIP against that grid rather than a
            //clock (see expectPosition).
            const before = harness.frameLoop()
            await vi.advanceTimersByTimeAsync(1000)
            const after = harness.frameLoop()
            const frames = after.frames - before.frames
            const emits = after.emits - before.emits
            expect(frames).toBeGreaterThan(58)
            //bounded on BOTH sides: a gate that let everything through would read ~62, and one that
            //had stopped emitting would read 0. Neither bound is the cap restated - they bracket it.
            expect(emits).toBeGreaterThan(40)
            expect(emits).toBeLessThan(52)

            harness.context.props.isPlaying = false
            harness.push()
            expect(harness.frameLoop().maxFPS).toBe(0)
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
            const glideStart = {loop: harness.frameLoop(), renders: harness.renders()}
            await vi.advanceTimersByTimeAsync(WHOLE)
            const glideEnd = {loop: harness.frameLoop(), renders: harness.renders()}
            const moved = glideEnd.renders - glideStart.renders
            const emitted = glideEnd.loop.emits - glideStart.loop.emits
            expect(moved).toBeGreaterThan(0)
            expect(moved).toBeLessThanOrEqual(emitted)

            //THE STALL: the schedule has run out and is waiting for a late tick, so the loop keeps
            //asking for frames (the tick's segment has to be picked up by one the moment it
            //lands) - and the position is clamped, so none of them may render.
            //Measured from AFTER the playhead has reached that clamp, since the frame that puts it
            //there is a frame that moved and renders for that reason.
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            const stallStart = {loop: harness.frameLoop(), renders: harness.renders()}
            await vi.advanceTimersByTimeAsync(WHOLE * 2)
            const stallEnd = {loop: harness.frameLoop(), renders: harness.renders()}
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
            const before = harness.renderedX().length
            await vi.advanceTimersByTimeAsync(WHOLE)
            const rendered = harness.renderedX().slice(before)
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
            await vi.advanceTimersByTimeAsync(WHOLE / 2)
            expect(harness.frameLoop().started).toBe(true)

            harness.context.props.isPlaying = false
            harness.push()
            //the pause hands the position to an EASE rather than snapping it, so the loop is still
            //running here - what this test is about is that it stops once that ease is done, which
            //is the same requirement one motion later than it used to be
            expect(harness.frameLoop().started).toBe(true)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.frameLoop().started).toBe(false)
            //Stopping also releases the pending static minimap build. Let its bounded idle slices
            //finish before taking the long-idle baseline; its one atomic swap/render is legitimate
            //stopped work, not a frame loop left behind.
            await vi.advanceTimersByTimeAsync(200)
            const after = {loop: harness.frameLoop(), renders: harness.renders()}
            await vi.advanceTimersByTimeAsync(1000)
            //a full second: no further rAF taken, no further emit, no further render
            expect(harness.frameLoop().frames).toBe(after.loop.frames)
            expect(harness.frameLoop().emits).toBe(after.loop.emits)
            expect(harness.renders()).toBe(after.renders)
        } finally {
            harness.destroy()
        }
    })

    it('keeps the timeline outline off the per-frame write path while still following the canvas', async () => {
        const harness = await mountGliding()
        try {
            //A LONG SONG, because the saving is a function of how slowly the outline moves and
            //makeSong's 100 columns are not slow: the whole song spans the timeline's width, so at
            //100 columns the outline travels 16px per column, which a per-pixel gate has to write
            //nearly every frame of. At 400 it travels 4px per column, which is where the gate
            //starts saving - and 400 is also the shipped default's neighbourhood.
            harness.context.song.addColumns(300, harness.context.song.columns.length - 1)
            harness.push()
            harness.context.props.isPlaying = true
            harness.push()
            //SAMPLED PER FRAME, because the two canvases became one: the gate used to skip a second
            //Application's render() and could be counted off that Application, and it now skips the
            //WRITE of `viewportGraphics.x` - which is what puts the Graphics in the stage render
            //group's update list and dirties the shared batcher. So what is counted here is how
            //often the outline MOVED, against how often the canvas did.
            let outlineWrites = 0
            let scrollChanges = 0
            let lastX = harness.paintedScene().timeline.viewport.x
            let lastScroll = harness.scrollPosition()
            const startX = lastX
            const until = performance.now() + WHOLE
            while (performance.now() < until) {
                await vi.advanceTimersByTimeAsync(16)
                const x = harness.paintedScene().timeline.viewport.x
                const scroll = harness.scrollPosition()
                if (x !== lastX) outlineWrites++
                if (scroll !== lastScroll) scrollChanges++
                lastX = x
                lastScroll = scroll
            }
            //THE WHOLE SONG spans the timeline's width, so its outline moves a fraction of a pixel
            //per frame while the notes container moves several whole ones. Writing it on every one
            //of those frames re-uploads the stage batcher's whole attribute buffer to draw the same
            //pixels again.
            expect(outlineWrites).toBeLessThan(scrollChanges)
            //...and the RULE rather than the ratio, which is what keeps this from turning into a
            //number tuned to this song's geometry: the gate writes when the outline's ROUNDED x
            //moves, so over any interval it can write at most once per whole pixel the outline
            //travelled, plus the one that starts it.
            const travelled = lastX - startX
            expect(outlineWrites).toBeLessThanOrEqual(Math.ceil(travelled) + 1)
            //...and the other direction, which is the one an over-eager gate breaks: a column of
            //travel MUST move the outline. "Never move the outline" satisfies the lines above and
            //freezes it while the notes scroll.
            expect(travelled).toBeGreaterThan(0)
            expect(outlineWrites).toBeGreaterThan(0)
            //...and the CONTENT container is not rebuilt per frame either - only draw() does that,
            //and a glide never reaches draw()
            expect(harness.push().timelineRebuilds).toBe(0)
        } finally {
            harness.destroy()
        }
    })
})

// ---------------------------------------------------------------------------------------------
// PART SEVEN: MANUAL SCROLLING.
//
// A drag and a wheel, which are about INPUT and not about playback - and `smoothScroll` decides how
// they move the canvas, so every row runs in BOTH modes and the two modes make DIFFERENT claims:
//   ON  - the drag follows the pointer continuously, wheel deltas move directly, both settle with
//         an ease when their input ends, and the position spends most of a gesture between columns;
//   OFF - the drag steps a whole column at a time, the wheel and every settle arrive at once, and
//         the position is a whole column at every instant.
// This REVERSES an earlier round in which manual motion was continuous in both modes and only a
// playback tick was gated on the setting. The rows below are what keeps the two modes from
// collapsing into each other in either direction; where the two claims are opposites they are
// written out as separate rows rather than parametrised, so both sit readable side by side.
//
// What each row is aimed at is written at the row. Between them they cover the four ways this can
// go wrong that no scene comparison can see: motion quantised where it should be continuous, motion
// continuous where it should be quantised, a motion FOUGHT by the selectColumn round-trip it makes
// itself, and a motion that never settles - which leaves the composer permanently half a column off
// `selected`, and every click, edit and jump downstream reasons in terms of `selected`.
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

        if (smoothScroll) {
            it(`${mode}, a drag moves the canvas by the pointer's real distance, not a column at a time`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    const start = canvasXOfColumn(harness, SELECTED)
                    harness.pressPointerOverNotes(start)
                    //A THIRD of a column. The old handler returned early below a whole column of
                    //accumulated movement, so the canvas did not move at all until a full column
                    //had been dragged and then jumped that whole column at once.
                    harness.movePointerOverNotes(start - columnWidth / 3)
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1 / 3, 6)
                    //...and it keeps following, at two thirds and past a whole column, so the
                    //motion is continuous rather than quantised on some finer grid
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
        } else {
            it(`${mode}, a drag moves the canvas a whole column at a time`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    const start = canvasXOfColumn(harness, SELECTED)
                    harness.pressPointerOverNotes(start)
                    //A THIRD of a column: well past DRAG_SLOP_PX, so this IS a drag - but short of
                    //the half, so the NEAREST whole column is still the one it started on and the
                    //canvas has not moved. `toBe` and not `toBeCloseTo` throughout: the exactness
                    //is the claim, and a continuous drag lands on 1/3 here.
                    harness.movePointerOverNotes(start - columnWidth / 3)
                    await frame()
                    expect(harness.scrollPosition()).toBe(SELECTED)
                    expect(harness.selectColumnCalls).toEqual([])
                    //past the half, so it steps a whole column at once
                    harness.movePointerOverNotes(start - (columnWidth * 2) / 3)
                    await frame()
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                    //that call's round-trip, flushed where Svelte flushes it. Without it
                    //`state.selected` stays on the press column and the "at most once per column
                    //crossed" test below compares against a stale value, so every later move
                    //re-issues the same call and the count says nothing.
                    harness.context.song.selected = SELECTED + 1
                    harness.push()
                    //...and then HOLDS that column across the next two thirds of travel rather than
                    //creeping through it, which is what "a column at a time" means and what a
                    //quantiser applied only to the selectColumn argument would fail
                    harness.movePointerOverNotes(start - (columnWidth * 4) / 3)
                    await frame()
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                    harness.movePointerOverNotes(start - (columnWidth * 5) / 3)
                    await frame()
                    expect(harness.scrollPosition()).toBe(SELECTED + 2)
                } finally {
                    harness.destroy()
                }
            })
        }

        it(`${mode}, a drag is not yanked back by the selectColumn round-trip it makes itself`, async () => {
            const harness = await mountManual()
            try {
                const {columnWidth} = harness.geometry()
                const start = canvasXOfColumn(harness, SELECTED)
                //1.6 rather than 1.5 while snapping: 1.5 sits exactly on the rounding boundary,
                //where this row could not tell a step from a stall.
                const travel = smoothScroll ? 1.5 : 1.6
                const dragged = smoothScroll ? SELECTED + 1.5 : SELECTED + 2
                //the drag calls selectColumn with the FLOOR of the position - the column under the
                //line - at most once per column crossed. Snapping, the position is already whole,
                //so that floor is the identity and the two agree at every instant.
                const selectedByDrag = Math.floor(dragged)
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * travel)
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(dragged, 6)
                expect(harness.selectColumnCalls).toEqual([
                    {index: selectedByDrag, ignoreAudio: true},
                ])

                //AND NOW THE UPDATE THAT CALL PRODUCES. Svelte flushes it in a microtask, i.e.
                //between two pointermove events, and without the drag guard in syncScrollSchedule
                //it lands on the snap path and assigns the position from `selected` - an integer -
                //once per column crossed, which is the canvas stuttering back to the boundary the
                //finger just left.
                harness.context.song.selected = selectedByDrag
                harness.push()
                expect(harness.scrollPosition()).toBeCloseTo(dragged, 6)

                //THE GESTURE IS STILL LIVE, which is what that guard really buys while snapping:
                //there the canvas and `selected` already agree, so a rest() on this update would be
                //invisible to the assertion above - but it clears `motion`, and the next pointermove
                //then re-anchors while `pointer.x` is still the press x, applies the whole offset a
                //second time and runs the drag away. One more move is what says which happened.
                harness.movePointerOverNotes(start - columnWidth * (travel + 1.6))
                await frame()
                expect(harness.scrollPosition()).toBeCloseTo(
                    smoothScroll ? SELECTED + 3.1 : SELECTED + 3,
                    6
                )

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
                if (!smoothScroll) {
                    //ALREADY THERE. Snapping, the drag has been writing that same rounded position
                    //all along, so the release has nothing left to move - which is exactly why the
                    //settle below has to be asserted with no timer advance at all.
                    expect(harness.scrollPosition()).toBe(SELECTED + 2)
                }
                harness.releasePointerOverNotes(start - columnWidth * 1.6)
                //ROUND, not floor: 1.6 settles FORWARD to 2, where a floor-settle would give back
                //0.6 of a column - up to a whole one on every release, which reads as sticky
                const last = harness.selectColumnCalls[harness.selectColumnCalls.length - 1]
                expect(last).toEqual({index: SELECTED + 2, ignoreAudio: true})
                //that call's own update, flushed back where Svelte flushes it: a microtask later,
                //which is inside the 140ms ease rather than after it
                harness.context.song.selected = SELECTED + 2
                harness.push()

                if (smoothScroll) {
                    //the ease the release starts has to finish before the position is whole;
                    //leaving the composer parked on a fraction is what this rules out
                    await vi.advanceTimersByTimeAsync(400)
                } else {
                    //NO TIMER ADVANCE. Snapping, the settle is instantaneous and the loop is
                    //already stopped; waiting 400ms first would pass just as well against an
                    //implementation that still eased, so the wait is the assertion's whole point.
                    expect(harness.scrollPosition()).toBe(SELECTED + 2)
                    expect(harness.frameLoop().started).toBe(false)
                    await vi.advanceTimersByTimeAsync(400)
                }
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
                if (!smoothScroll) {
                    //before any timer advance, which is what separates "arrived at once" from
                    //"eased, and we waited long enough not to notice"
                    expect(harness.scrollPosition()).toBe(SELECTED + 2)
                    expect(harness.frameLoop().started).toBe(false)
                }
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
                if (!smoothScroll) {
                    //instant, as everywhere else this mode settles
                    expect(harness.scrollPosition()).toBe(SELECTED + 2)
                    expect(harness.frameLoop().started).toBe(false)
                }
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
                //one column back for one column of pointer travel, not zero. Both readings are
                //integral at the clamp, so this row does NOT pin "quantise the write, never the
                //anchor" - that rule is only observable across a mid-gesture mode flip.
                if (smoothScroll) expect(harness.scrollPosition()).toBeCloseTo(lastColumn - 1, 6)
                else expect(harness.scrollPosition()).toBe(lastColumn - 1)
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
                //Snapping, the drag itself already asked for column 42 (1.6 rounds up), so the two
                //calls are the drag's and the settle's restatement of it. NOT to be "cleaned up"
                //by having settleStageDrag skip an unchanged index: that would key off
                //`this.state.selected`, which lags by a microtask, so the skip would fire in the
                //app and not in this harness - a behaviour no test can state.
                expect(harness.selectColumnCalls).toEqual([
                    {index: smoothScroll ? SELECTED + 1 : SELECTED + 2, ignoreAudio: true},
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

        if (smoothScroll) {
            it(`${mode}, wheel deltas move directly until idle, then settle to the nearest column`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    //Two sub-column hardware deltas separated by a frame. They add directly just
                    //like pointer moves; there is no target and no easing curve.
                    harness.wheelOverNotes(columnWidth * 0.3)
                    expect(harness.selectColumnCalls).toEqual([])
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 0.3, 6)
                    harness.wheelOverNotes(columnWidth * 0.45)
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 0.75, 6)
                    expect(harness.frameLoop().started).toBe(true)

                    //The second event RESET the timeout: 128ms have passed since the first but only
                    //64 since the last, so a timer measured from gesture start would already settle.
                    expect(harness.selectColumnCalls).toEqual([])
                    //No physics is added. The only delayed action is the grid settle after the
                    //hardware has emitted nothing for the whole idle window: round + ordinary ease.
                    await vi.advanceTimersByTimeAsync(WHEEL_SETTLE_IDLE_MS - 65)
                    expect(harness.selectColumnCalls).toEqual([])
                    await vi.advanceTimersByTimeAsync(32)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                    await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 64)
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    expect(harness.frameLoop().started).toBe(false)
                } finally {
                    harness.destroy()
                }
            })
        } else {
            it(`${mode}, the wheel jumps a whole column at once rather than easing`, async () => {
                const harness = await mountManual()
                try {
                    const framesBefore = harness.frameLoop().frames
                    harness.wheelOverNotes(100)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                    //ARRIVED, before any frame at all - the exact inverse of the ON row's "strictly
                    //between on the very next frame"
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    expect(harness.frameLoop().started).toBe(false)
                    await frame()
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)

                    //the same selectColumn round-trip the ON row models. Here it must move nothing:
                    //the settle already put the canvas on the column the update is about to name.
                    harness.context.song.selected = SELECTED + 1
                    harness.push()
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)

                    await vi.advanceTimersByTimeAsync(400)
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    //NO ANIMATION FRAMES WERE TAKEN. Every position assertion above would pass
                    //against an implementation that eased for 140ms and finished; only the frame
                    //count says it never animated, and it is what catches an easeTo gated at some
                    //of its call sites and not at the one this path reaches.
                    expect(harness.frameLoop().frames).toBe(framesBefore)
                    expect(harness.frameLoop().started).toBe(false)
                } finally {
                    harness.destroy()
                }
            })
        }

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

        /**
         * Where on the CANVAS a column of the song sits, by the proportion the renderer maps with.
         *
         * The inset is the whole of the difference between the two spaces: the pointer helpers emit
         * `globalX`, which is canvas space, while the scene the strip draws (and `drawnViewport`
         * below reads) is strip-local. A press derived from strip geometry without this term lands
         * 80px left of what it was aimed at.
         */
        function timelineXOfColumn(harness: Harness, column: number): number {
            const {stripWidth} = harness.geometry()
            return (
                TIMELINE_INSET_LEFT +
                (stripWidth / harness.context.song.columns.length) * column
            )
        }

        it(`${mode}, pressing the timeline navigates to the column under the pointer`, async () => {
            const harness = await mountManual()
            try {
                //the press IS the navigation on this surface, unlike the stage's - which is why it
                //enters the drag at once rather than waiting for a slop
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10))
                await frame()
                if (smoothScroll) expect(harness.scrollPosition()).toBeCloseTo(10, 6)
                else expect(harness.scrollPosition()).toBe(10)
                expect(harness.selectColumnCalls).toEqual([{index: 10, ignoreAudio: true}])
            } finally {
                harness.destroy()
            }
        })

        if (smoothScroll) {
            it(`${mode}, a timeline drag moves the canvas continuously, not a column at a time`, async () => {
                const harness = await mountManual()
                try {
                    harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10))
                    await frame()
                    //HALF A COLUMN of the strip. The throttled version this replaced floored the
                    //position, so the canvas could only sit on whole columns however finely the
                    //pointer moved - and on a 100-column song one timeline pixel is a sixteenth of
                    //a column.
                    harness.movePointerOverTimeline(timelineXOfColumn(harness, 10.5))
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(10.5, 6)
                } finally {
                    harness.destroy()
                }
            })
        } else {
            it(`${mode}, a timeline drag moves the canvas a whole column at a time`, async () => {
                const harness = await mountManual()
                try {
                    //THE SECOND DRAG SURFACE, snapping with the first. Leaving this one continuous
                    //would make the setting mean "snap here, glide there".
                    harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10))
                    await frame()
                    expect(harness.scrollPosition()).toBe(10)
                    //the press's own round-trip, so the "once per column crossed" test below
                    //compares against a `selected` that is not still on the mount column
                    harness.context.song.selected = 10
                    harness.push()
                    //short of the half: the nearest column has not changed, so nothing moves
                    harness.movePointerOverTimeline(timelineXOfColumn(harness, 10.4))
                    await frame()
                    expect(harness.scrollPosition()).toBe(10)
                    expect(harness.selectColumnCalls).toEqual([{index: 10, ignoreAudio: true}])
                    //past it: one whole column at once
                    harness.movePointerOverTimeline(timelineXOfColumn(harness, 10.6))
                    await frame()
                    expect(harness.scrollPosition()).toBe(11)
                    harness.context.song.selected = 11
                    harness.push()
                    //...and then holds it rather than creeping
                    harness.movePointerOverTimeline(timelineXOfColumn(harness, 10.9))
                    await frame()
                    expect(harness.scrollPosition()).toBe(11)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: 10, ignoreAudio: true},
                        {index: 11, ignoreAudio: true},
                    ])
                } finally {
                    harness.destroy()
                }
            })
        }

        it(`${mode}, grabbing the timeline's viewport rectangle keeps it under the pointer`, async () => {
            const harness = await mountManual()
            try {
                const viewport = drawnViewport(harness)
                //INSIDE the rectangle and deliberately off its centre. Pressing what is already on
                //screen must not move the canvas: the grab records the offset to the rectangle's
                //centre and holds it, where centring the rectangle on the pointer instead would
                //jump the canvas by the distance from that centre - about 6 columns here.
                //`drawnViewport` reads the SCENE, which is strip-local, and the press emits a
                //canvas-space `globalX` - so the inset has to be added back. Without it the press
                //lands 80px left of the rectangle, `onSlider` is false and the canvas jumps, which
                //the `selectColumnCalls` assertion below is what catches.
                harness.pressPointerOverTimeline(
                    TIMELINE_INSET_LEFT + viewport.x + viewport.width * 0.25
                )
                await frame()
                //to within the half-pixel the rectangle's floored width costs at the grab point -
                //which is exactly the slop rounding absorbs, so snapping can assert it exactly
                if (smoothScroll) expect(harness.scrollPosition()).toBeCloseTo(SELECTED, 1)
                else expect(harness.scrollPosition()).toBe(SELECTED)
                expect(harness.selectColumnCalls).toEqual([])
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a drag past either end of the strip clamps onto the end column`, async () => {
            const harness = await mountManual()
            try {
                //A DRAG THAT LEAVES THE STRIP ENTIRELY, which handleTimelineSlide clamps rather
                //than letting the position run off the song. The drag keeps receiving moves out
                //there because a running scrub makes the hitarea answer everywhere - that clause
                //and this clamp are what make the gesture survive a finger that overshoots.
                //Not the only way to reach the end columns: the strip is inset clear of the three
                //DOM buttons now, so tapping them works too - the row after this states that.
                const last = harness.context.song.columns.length - 1
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 50))
                await frame()
                harness.movePointerOverTimeline(-500)
                await frame()
                expect(harness.scrollPosition()).toBe(0)
                harness.movePointerOverTimeline(harness.geometry().canvasWidth + 500)
                await frame()
                expect(harness.scrollPosition()).toBe(last)
                harness.releasePointerOverTimeline(harness.geometry().canvasWidth + 500)
                await vi.advanceTimersByTimeAsync(400)
                expect(harness.scrollPosition()).toBe(last)
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a press at a canvas x scrubs to the column DRAWN at that x`, async () => {
            const harness = await mountManual()
            try {
                //THE INVERSE PROPERTY, which is what the inset has to preserve: the mapping the
                //renderer draws a column with and the mapping it reads a press through are the same
                //one. Converting one of them and not the other is an 80px error - about five
                //columns here - that every other row in this part is blind to, because they all
                //derive their press x from the same helper.
                //
                //COLUMNS 0 AND 99 are the new claim. The strip is drawn clear of the three DOM
                //buttons now, so its ends are canvas nobody stands over and the song's first and
                //last columns can be TAPPED rather than only dragged onto.
                //
                //THE ORDER IS CHOSEN so that every press lands OUTSIDE the viewport rectangle the
                //previous one left drawn - the canvas shows ~19.9 columns, so consecutive targets
                //are kept more than ten columns apart. A press inside that rectangle takes
                //handleTimelineDown's `onSlider` path and deliberately moves nothing, which is the
                //row above this one, not this one.
                for (const column of [99, 0, 50, 25, 1]) {
                    harness.pressPointerOverTimeline(timelineXOfColumn(harness, column))
                    await frame()
                    if (smoothScroll) expect(harness.scrollPosition()).toBeCloseTo(column, 6)
                    else expect(harness.scrollPosition()).toBe(column)
                    harness.releasePointerOverTimeline(timelineXOfColumn(harness, column))
                    await vi.advanceTimersByTimeAsync(400)
                }
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, the viewport rectangle sits where the strip's own column width puts it`, async () => {
            const harness = await mountManual()
            try {
                const {canvasWidth, stripWidth, columnWidth} = harness.geometry()
                const {viewport, strip} = harness.paintedScene().timeline
                //STRIP-LOCAL, and the strip is what carries the inset - so the outline is inside
                //the inset bar rather than 80px left of it. The first factor is a strip column
                //width and the second a count of CANVAS columns, which is the mix expectedTimeline
                //documents and the one an over-eager conversion of `columnsOnScreen` would break.
                const stripColumnWidth = stripWidth / harness.context.song.columns.length
                expect(strip.x).toBe(TIMELINE_INSET_LEFT)
                expect(viewport.x).toBeCloseTo(
                    stripColumnWidth * (SELECTED - canvasWidth / 2 / columnWidth),
                    6
                )
            } finally {
                harness.destroy()
            }
        })

        it(`${mode}, a timeline release settles onto a whole column and stops the loop`, async () => {
            const harness = await mountManual()
            try {
                harness.pressPointerOverTimeline(timelineXOfColumn(harness, 10.6))
                await frame()
                //the ticker runs during a drag in EITHER mode - the Ticker rule is keyed on the
                //motion, not on how far each frame moves the canvas
                expect(harness.frameLoop().started).toBe(true)
                if (!smoothScroll) {
                    //10.6 rounded up at the press, so the release has nothing left to move
                    expect(harness.scrollPosition()).toBe(11)
                }
                harness.releasePointerOverTimeline(timelineXOfColumn(harness, 10.6))
                if (!smoothScroll) {
                    //instant, before any timer advance
                    expect(harness.scrollPosition()).toBe(11)
                    expect(harness.frameLoop().started).toBe(false)
                }
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

        if (smoothScroll) {
            it(`${mode}, a wheel burst follows its total hardware distance and coalesces to one frame`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    const before = harness.renders()
                    //Three raw events, 0.4 columns each. They are not three logical steps or three
                    //new easing targets: they add to one 1.2-column hardware movement.
                    expect(harness.wheelOverNotes(columnWidth * 0.4)).toBe(true)
                    harness.wheelOverNotes(columnWidth * 0.4)
                    harness.wheelOverNotes(columnWidth * 0.4)
                    expect(harness.scrollPosition()).toBe(SELECTED) //the frame owns painting
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1.2, 6)
                    expect(harness.renders() - before).toBe(1)

                    await vi.advanceTimersByTimeAsync(WHEEL_SETTLE_IDLE_MS + SCROLL_EASE_MS + 64)
                    expect(harness.scrollPosition()).toBe(SELECTED + 1)
                    expect(harness.frameLoop().started).toBe(false)
                } finally {
                    harness.destroy()
                }
            })

            it(`${mode}, even the first tiny trackpad delta moves the canvas without a threshold`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    harness.wheelOverNotes(10)
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 10 / columnWidth, 6)
                    expect(harness.selectColumnCalls).toEqual([])

                    //A later delta continues from the undrawn motion position, not from selected or
                    //the previous frame, and crossing the floor selects what is now underneath.
                    harness.wheelOverNotes(columnWidth)
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(
                        SELECTED + 1 + 10 / columnWidth,
                        6
                    )
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                    ])
                } finally {
                    harness.destroy()
                }
            })

            it(`${mode}, line-mode deltas are normalised to pixels and remain fractional`, async () => {
                const harness = await mountManual()
                try {
                    const {columnWidth} = harness.geometry()
                    harness.wheelOverNotes(3, WheelEvent.DOM_DELTA_LINE)
                    await frame()
                    expect(harness.scrollPosition()).toBeCloseTo(
                        SELECTED + (3 * 16) / columnWidth,
                        6
                    )
                } finally {
                    harness.destroy()
                }
            })
        } else {
            it(`${mode}, a wheel burst preserves the integral one-column-per-event rule`, async () => {
                const harness = await mountManual()
                try {
                    const framesBefore = harness.frameLoop().frames
                    harness.wheelOverNotes(100)
                    harness.wheelOverNotes(100)
                    harness.wheelOverNotes(100)
                    expect(harness.selectColumnCalls).toEqual([
                        {index: SELECTED + 1, ignoreAudio: true},
                        {index: SELECTED + 2, ignoreAudio: true},
                        {index: SELECTED + 3, ignoreAudio: true},
                    ])
                    expect(harness.scrollPosition()).toBe(SELECTED + 3)
                    await vi.advanceTimersByTimeAsync(400)
                    expect(harness.frameLoop().frames).toBe(framesBefore)
                    expect(harness.frameLoop().started).toBe(false)
                } finally {
                    harness.destroy()
                }
            })
        }
    }

    /**
     * THE MODE ITSELF, rather than one behaviour at a time.
     *
     * The rows in the loop above each pin one gesture in one mode. These pin the PROPERTY the mode
     * is supposed to be - "with smooth scrolling off the canvas is on a whole column, always" - and
     * the relation between the two modes, so a smooth path added later has to break one of them
     * rather than merely not having a row of its own.
     */
    async function mountIn(smoothScroll: boolean) {
        const context = makeContext()
        context.props.smoothScroll = smoothScroll
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        return harness
    }

    const aFrame = () => vi.advanceTimersByTimeAsync(64)

    it('with smooth scrolling off, the scroll position is a whole column at every sample', async () => {
        const harness = await mountIn(false)
        try {
            const {columnWidth} = harness.geometry()
            const start = CANVAS_WIDTH / 2
            const seen: number[] = []
            const sample = () => seen.push(harness.scrollPosition())
            //ONE LONG MIXED GESTURE - press, six moves across three columns, a wheel, a release -
            //sampled after every step AND after every frame in between. Deliberately on offsets
            //that are not multiples of a column, so a continuous implementation lands on fractions.
            harness.pressPointerOverNotes(start)
            sample()
            for (const travel of [0.2, 0.45, 0.8, 1.35, 2.1, 2.7]) {
                harness.movePointerOverNotes(start - columnWidth * travel)
                sample()
                await aFrame()
                sample()
            }
            harness.wheelOverNotes(100)
            sample()
            await aFrame()
            sample()
            harness.releasePointerOverNotes(start - columnWidth * 2.7)
            sample()
            await vi.advanceTimersByTimeAsync(400)
            sample()
            //CATCHES ANY SMOOTH MOTION IN THIS MODE FROM ANY SOURCE, including one added after this
            //change: a new eased path, a third drag surface, a future "scroll to breakpoint" slide.
            //An endpoint-only assertion sees none of them, because every ease has finished by the
            //time the gesture is over.
            expect(seen.every(Number.isInteger)).toBe(true)
            //...and it did move, so the row is not passing on a canvas that never went anywhere
            expect(new Set(seen).size).toBeGreaterThan(1)
        } finally {
            harness.destroy()
        }
    })

    it('the two scroll modes place the same drag a stated distance apart', async () => {
        const glide = await mountIn(true)
        const snap = await mountIn(false)
        try {
            const {columnWidth} = glide.geometry()
            const start = CANVAS_WIDTH / 2
            //0.7 of a column: deliberately off a boundary, so the two modes MUST disagree
            for (const harness of [glide, snap]) {
                harness.pressPointerOverNotes(start)
                harness.movePointerOverNotes(start - columnWidth * 0.7)
                await aFrame()
            }
            const on = glide.scrollPosition()
            const off = snap.scrollPosition()
            //THE RELATION, as one equation: the snapping drag sits exactly where the gliding one
            //would settle to from the same pointer. That is what makes the release a no-op rather
            //than a jump, and it is what a floor or a trunc would fail.
            expect(off).toBe(Math.round(on))
            //...and the two really are different here, so neither mode has collapsed into the
            //other. The likeliest way that happens is the gate wired to `isPlaying && smoothScroll`
            //rather than to the setting alone - `transportOwned` is a live idiom in this file - and
            //these rows mount STOPPED, where that mistake makes snap mode glide.
            expect(off).not.toBe(on)
        } finally {
            glide.destroy()
            snap.destroy()
        }
    })

    it('with smooth scrolling off, a drag renders once per column crossed, not once per frame', async () => {
        const harness = await mountIn(false)
        try {
            const {columnWidth} = harness.geometry()
            const start = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(start)
            const before = harness.renders()
            //THREE COLUMNS over twelve moves and twelve frames. A quantiser applied only to the
            //value handed to selectColumn - leaving the canvas itself following the finger - passes
            //every position assertion sampled on a column boundary, and only a render count sees
            //it: it would render on nearly every one of these frames.
            for (let step = 1; step <= 12; step++) {
                harness.movePointerOverNotes(start - (columnWidth * 3 * step) / 12)
                await aFrame()
            }
            expect(harness.scrollPosition()).toBe(SELECTED + 3)
            expect(harness.renders() - before).toBeLessThanOrEqual(4)
        } finally {
            harness.destroy()
        }
    })

    it('turning smooth scrolling off mid-wheel settles on its last published column at once', async () => {
        const harness = await mountIn(true)
        try {
            const {columnWidth} = harness.geometry()
            harness.wheelOverNotes(columnWidth * 0.6)
            await aFrame()
            //STRICTLY BETWEEN two columns, with the hardware-driven wheel gesture still open.
            const midway = harness.scrollPosition()
            expect(midway).toBeGreaterThan(SELECTED)
            expect(midway).toBeLessThan(SELECTED + 1)
            expect(harness.frameLoop().started).toBe(true)

            harness.context.props.smoothScroll = false
            harness.push()
            //NO TIMER ADVANCE: snap mode has no fractional wheel motion, and the pending idle
            //callback is cancelled rather than waking the gesture later.
            expect(harness.scrollPosition()).toBe(SELECTED)
            expect(harness.frameLoop().started).toBe(false)
            await vi.advanceTimersByTimeAsync(WHEEL_SETTLE_IDLE_MS + SCROLL_EASE_MS + 64)
            expect(harness.scrollPosition()).toBe(SELECTED)
        } finally {
            harness.destroy()
        }
    })

    it('turning smooth scrolling off mid-drag puts the canvas and the mark on one whole column', async () => {
        const harness = await mountIn(true)
        try {
            const {columnWidth} = harness.geometry()
            const start = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(start)
            harness.movePointerOverNotes(start - columnWidth * 1.6)
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(SELECTED + 1.6, 6)
            //the drag's own selectColumn, flushed as Svelte flushes it, plus the mode flip - which
            //is reachable in the app with a second touch on the settings panel
            harness.context.song.selected = SELECTED + 1
            harness.context.props.smoothScroll = false
            harness.push()
            await aFrame()
            //THE GESTURE CONTINUES: the anchor is what the finger grabbed and is not re-taken. Only
            //the grid changes, and the guard that returns for the whole drag has to re-quantise the
            //live position on its way out or the canvas sits on 1.6 until the next pointermove.
            //FLOOR here and not the round every later move uses: 1.6 lands on 41 rather than 42,
            //because 41 is the column the drag already handed to selectColumn and so the one the
            //mark is on. Rounding instead puts the canvas one column past the highlight.
            expect(harness.scrollPosition()).toBe(SELECTED + 1)
            //...AND THE MARK IS ON THAT SAME COLUMN. The overlay comes back on in this update and
            //is painted by a different path than the position, so the position alone cannot say it.
            expect(selectedColumnOf(harness)).toBe(SELECTED + 1)
            //and the drag is still live, still anchored where the finger grabbed, now rounding
            harness.movePointerOverNotes(start - columnWidth * 2.6)
            await aFrame()
            expect(harness.scrollPosition()).toBe(SELECTED + 3)
        } finally {
            harness.destroy()
        }
    })

    /**
     * THE ROWS ABOVE ALL MOUNT STOPPED, deliberately: they are about input, and a running transport
     * is a second writer of the position. These are the ones where that second writer is the point.
     *
     * What they cover that nothing above can: the transport moves the position between a press and
     * the drag it becomes, it owns a queue a gesture has to take away from it, and during a glide
     * the line is a FRACTION into `selected`'s column - so the line ROUNDS to the wrong column for
     * the whole second half of every column, and an input measured off it instead of off
     * `selected` is wrong by one exactly then.
     */
    async function mountPlaying() {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        harness.context.props.playbackAnchorGeneration += 1
        harness.context.props.playbackColumnStartMs = performance.now()
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
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS / 2)
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
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS / 2)
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
            //ONE TICK, then deep into its column: `selected` is 41 and the line is a fraction
            //past 41.5, because the line travels THROUGH the sounding column. In the second half
            //of a column the line ROUNDS to the next one - that rounding gap is the whole of
            //this row.
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS)
            harness.context.props.playbackColumnStartMs = performance.now()
            harness.context.song.selected = SELECTED + 1
            harness.push()
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS * 0.7)
            expect(harness.scrollPosition()).toBeGreaterThan(SELECTED + 1.5)
            expect(harness.scrollPosition()).toBeLessThan(SELECTED + 2)

            harness.selectColumnCalls.length = 0
            harness.wheelOverNotes(100)
            //MEASURED FROM `selected`, not from the line. Rounding the playhead gives 42, so a
            //forward step from there would ask for 43 - skipping the column between - while a
            //step from `selected` asks for 42, the column after the one sounding.
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED + 2, ignoreAudio: true}])

            harness.selectColumnCalls.length = 0
            harness.wheelOverNotes(-100)
            //...and backward is the same error in the other direction, which is why both are
            //here: from the line it would ask for 41, the column the transport is ALREADY on -
            //an unchanged write that notifies nothing, a backward notch that does nothing at all
            //for the whole second half of every column.
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
            harness.context.props.playbackAnchorGeneration += 1
            harness.context.props.playbackColumnStartMs = performance.now()
            harness.context.props.isPlaying = true
            harness.push()
            await vi.advanceTimersByTimeAsync(60)

            //BACKWARDS, so this row's move is visibly a jump even without the generation field.
            harness.wheelOverNotes(-100)
            expect(harness.selectColumnCalls).toEqual([{index: SELECTED - 1, ignoreAudio: true}])
            //the transport owns the position here, so the wheel moves `selected` and stops. The
            //update that produces is a discontinuity, which re-anchors the playhead on the new
            //column AT ONCE rather than easing the canvas toward music that has already jumped.
            harness.context.props.playbackAnchorGeneration += 1
            harness.context.props.playbackColumnStartMs = performance.now()
            harness.context.song.selected = SELECTED - 1
            harness.push()
            expect(harness.scrollPosition()).toBe(SELECTED - 1)
        } finally {
            harness.destroy()
        }
    })
})

// ---------------------------------------------------------------------------------------------
// PART EIGHT: THE MOMENTUM COAST.
//
// A stage-drag release can now EARN a motion: released at speed (a FLICK), the canvas keeps
// travelling on its own (a COAST) toward a landing column fixed at the instant of release, and a
// press on the moving canvas (a CATCH) is the grab itself. Everything else in PART SEVEN keeps
// holding word for word - which is most of what this part is for. The rows here state:
//  - the PHYSICS as closed forms restated beside the gestures (see coastLanding and
//    coastDurationMs): the trailing-window chord, the speed cap, travel = v/λ, round, clamp -
//    so the landing is an EQUALITY, not a tendency;
//  - the GATE: a Coast exists only with smooth scrolling on, the song stopped and no recording
//    running. Playing, snapping and recording releases settle exactly as PART SEVEN says, and the
//    snap-mode integral-position invariant stays true against a genuinely fast release;
//  - the SELECTION rule: Coasted columns are selected once each, with ignoreAudio, floor by
//    floor as the line crosses them - the drag's own rule - and NOTHING is published at entry;
//  - the COLLISIONS: the wheel takes over from the visible column, an external `selected` move
//    abandons the Coast where its own round-trip does not, the mode's death settles on the last
//    PUBLISHED column rather than teleporting to the landing, and a pointercancel never Flicks.
describe('the momentum coast', () => {
    /**
     * Smooth scrolling on, transport stopped, nothing recording - the ONLY state a release may
     * Coast in, by settleStageDrag's gate. The rows that want the gate CLOSED flip exactly one of
     * the three and keep the gesture identical, so what they pin is the gate and not a weaker
     * throw.
     */
    async function mountFlickable() {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        harness.push()
        return harness
    }

    /** Advance far enough for at least one capped frame to have been emitted. */
    const aFrame = () => vi.advanceTimersByTimeAsync(64)

    const WHOLE_COLUMN_MS = Math.round(60000 / BPM)

    /** The last selectColumn the renderer asked for - the publish a flush hands back. */
    function lastCall(harness: Harness): {index: number, ignoreAudio?: boolean} {
        const call = harness.selectColumnCalls.at(-1)
        if (!call) throw new Error('selectColumn was never called')
        return call
    }

    /**
     * The renderer's last publish, flushed back the way Svelte flushes it - a microtask later,
     * i.e. mid-motion. The same house idiom as PART SEVEN's drag rows: without it `selected`
     * goes stale and the survival tests below compare against the wrong side.
     */
    function flushPublished(harness: Harness) {
        harness.context.song.selected = lastCall(harness).index
        harness.push()
    }

    /**
     * WHERE A RELEASE LANDS, by the renderer's closed form restated: cap the trailing-window
     * speed, convert screen px to columns, take the whole v/λ of travel an exponential decay
     * from speed v has in it, round to a whole column and clamp to the song. `forwardPxPerMs`
     * is signed with the SONG's direction: positive is the pointer travelling LEFT, which
     * scrolls the song forward.
     */
    function coastLanding(position: number, forwardPxPerMs: number, columns: number): number {
        const capped = Math.min(Math.abs(forwardPxPerMs), FLICK_MAX_SPEED_PX_PER_MS)
        const travel = (Math.sign(forwardPxPerMs) * capped) / COLUMN_WIDTH / COAST_DECAY_PER_MS
        return Math.min(Math.max(Math.round(position + travel), 0), columns - 1)
    }

    /**
     * WHEN A COAST ARRIVES, by the other closed form: the instant the remainder decays to
     * COAST_ARRIVAL_PX, from which the position IS the landing exactly. Every "wait it out"
     * below waits this plus frame slack, so a duration computed wrongly fails as a position
     * that has not arrived rather than as a flaky margin.
     */
    function coastDurationMs(from: number, to: number): number {
        return (
            Math.log((Math.abs(to - from) * COLUMN_WIDTH) / COAST_ARRIVAL_PX) / COAST_DECAY_PER_MS
        )
    }

    /**
     * A THROW: press at the playhead, drag LEFT in `steps` sampled moves of `stepPx` every
     * `stepMs`, release on the last move's own coordinate with no frame in between - so the
     * trailing-window chord is exactly (steps·stepPx)/(steps·stepMs) px/ms and the release
     * position is exactly the drag's last write. Callers keep steps·stepMs inside
     * FLICK_WINDOW_MS, so the press seed anchors the chord and nothing ages out.
     */
    async function throwLeft(harness: Harness, steps: number, stepPx: number, stepMs: number) {
        const start = CANVAS_WIDTH / 2
        harness.pressPointerOverNotes(start)
        for (let step = 1; step <= steps; step++) {
            await vi.advanceTimersByTimeAsync(stepMs)
            harness.movePointerOverNotes(start - stepPx * step)
        }
        harness.releasePointerOverNotes(start - stepPx * steps)
    }

    it('a fast release keeps travelling, publishes each column once, and lands where the formula says', async () => {
        const harness = await mountFlickable()
        try {
            //40px every 20ms: a 2px/ms chord over a 60ms gesture, all of it inside the window.
            //Release position 41.5, so round-settle would give 42 and the Coast is unmistakable.
            await throwLeft(harness, 3, 40, 20)
            const releasePosition = SELECTED + 1.5
            const to = coastLanding(releasePosition, 2, harness.context.song.columns.length)
            //2px/ms decaying at 0.0035/ms is 571px of travel, which is 8 columns at the desktop
            //canvas' 84px column (it was 9 at the 80px one the narrower canvas gave)
            expect(to).toBe(SELECTED + 8)
            //ENTRY PUBLISHES NOTHING: unlike the ease, whose callers select the target on the way
            //in, the Coast's floors arrive one frame crossing at a time
            const publishedAtRelease = harness.selectColumnCalls.length
            await aFrame()
            const first = harness.scrollPosition()
            //...and the canvas is TRAVELLING with the pointer gone
            expect(first).toBeGreaterThan(releasePosition)
            expect(first).toBeLessThan(to)
            //the publish's own round-trip, flushed where Svelte flushes it, does not yank the
            //Coast back - the discriminator's surviving half, stated in full in its own row below
            flushPublished(harness)
            expect(harness.scrollPosition()).toBe(first)
            expect(harness.frameLoop().started).toBe(true)
            //monotonic on the way there, which is what catches a restarted or re-aimed curve
            let previous = first
            for (let step = 0; step < 5; step++) {
                await aFrame()
                const position = harness.scrollPosition()
                expect(position).toBeGreaterThan(previous)
                previous = position
            }
            //ARRIVAL: exactly the precomputed whole column, no correction hop, loop stopped
            await vi.advanceTimersByTimeAsync(coastDurationMs(releasePosition, to) + 96)
            expect(harness.scrollPosition()).toBe(to)
            expect(harness.frameLoop().started).toBe(false)
            //ONCE PER COLUMN CROSSED, ignoreAudio on every one, ending on the landing itself.
            //The first crossing is 42: the drag already published floor(41.5) = 41 itself.
            const published = harness.selectColumnCalls.slice(publishedAtRelease)
            const crossings: {index: number, ignoreAudio?: boolean}[] = []
            for (let index = SELECTED + 2; index <= to; index++) {
                crossings.push({index, ignoreAudio: true})
            }
            expect(published).toEqual(crossings)
            //...and the canvas follows the state again, which is the half of "at rest" a settle
            //assertion on its own cannot see
            harness.context.song.selected = to
            harness.push()
            harness.context.song.selected = 30
            harness.push()
            expect(harness.scrollPosition()).toBe(30)
        } finally {
            harness.destroy()
        }
    })

    it('a slow release settles exactly as it always did: round plus the SCROLL_EASE_MS ease', async () => {
        const harness = await mountFlickable()
        try {
            const start = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(start)
            //fast INTO the gesture, so what decides below is the trailing window and not the
            //gesture's history...
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 1.6)
            //...then a slow tail: 4px every 50ms is 0.08px/ms, five times under the threshold
            await vi.advanceTimersByTimeAsync(50)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 1.6 - 4)
            await vi.advanceTimersByTimeAsync(50)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 1.6 - 8)
            const before = harness.selectColumnCalls.length
            const positionAtRelease = harness.scrollPosition()
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 1.6 - 8)
            //ROUND, once, at the release - and no publish stream follows it
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: SELECTED + 2, ignoreAudio: true},
            ])
            flushPublished(harness)
            //...and the 140ms ease carries it there: strictly between on the next frame, arrived
            //when the ease is done - PART SEVEN's release, byte for byte
            await aFrame()
            const midway = harness.scrollPosition()
            expect(midway).toBeGreaterThan(positionAtRelease)
            expect(midway).toBeLessThan(SELECTED + 2)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.scrollPosition()).toBe(SELECTED + 2)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('a drag that pauses before releasing does not coast, however fast it once was', async () => {
        const harness = await mountFlickable()
        try {
            const start = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(start)
            //5px/ms across two moves - the exact speed the pointercancel row proves would coast
            //if released at once
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH)
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 2)
            //...then the hand stills, long enough for every sample to age out of the window -
            //drag-pause-release measures ~0, not the speed the gesture once had
            await vi.advanceTimersByTimeAsync(FLICK_WINDOW_MS + 50)
            const before = harness.selectColumnCalls.length
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 2)
            //the settle, AT ONCE: the position was already whole, so there is nothing to ease and
            //the loop stops dead - no timer advance before these two
            expect(harness.scrollPosition()).toBe(SELECTED + 2)
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: SELECTED + 2, ignoreAudio: true},
            ])
            flushPublished(harness)
            //...and nothing keeps travelling afterwards
            await vi.advanceTimersByTimeAsync(2500)
            expect(harness.scrollPosition()).toBe(SELECTED + 2)
            expect(harness.selectColumnCalls.slice(before)).toHaveLength(1)
        } finally {
            harness.destroy()
        }
    })

    it('the threshold: a release just under 0.4px/ms settles, just over it coasts', async () => {
        const harness = await mountFlickable()
        try {
            const start = CANVAS_WIDTH / 2
            const columns = harness.context.song.columns.length
            //JUST UNDER: 0.38px/ms over 50ms - 19px, well past DRAG_SLOP_PX, so this IS a drag
            //and what rejects the Coast is the threshold and nothing earlier
            const under = (FLICK_MIN_SPEED_PX_PER_MS - 0.02) * 50
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(50)
            harness.movePointerOverNotes(start - under)
            const beforeUnder = harness.selectColumnCalls.length
            harness.releasePointerOverNotes(start - under)
            //today's settle: one rounded call, back onto the column the press was on
            expect(harness.selectColumnCalls.slice(beforeUnder)).toEqual([
                {index: SELECTED, ignoreAudio: true},
            ])
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 64)
            expect(harness.scrollPosition()).toBe(SELECTED)
            expect(harness.frameLoop().started).toBe(false)

            //JUST OVER: 0.42px/ms over the same 50ms, and the same shape of gesture coasts.
            //0.42px/ms is 120px, about 1.4 columns of travel, so the landing is two columns out
            //where the settle above went back to zero.
            const over = (FLICK_MIN_SPEED_PX_PER_MS + 0.02) * 50
            const releasePosition = SELECTED + over / COLUMN_WIDTH
            const to = coastLanding(releasePosition, FLICK_MIN_SPEED_PX_PER_MS + 0.02, columns)
            expect(to).toBe(SELECTED + 2)
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(50)
            harness.movePointerOverNotes(start - over)
            const beforeOver = harness.selectColumnCalls.length
            harness.releasePointerOverNotes(start - over)
            //no publish at entry - the floors arrive on frames
            expect(harness.selectColumnCalls.slice(beforeOver)).toEqual([])
            await vi.advanceTimersByTimeAsync(coastDurationMs(releasePosition, to) + 96)
            expect(harness.scrollPosition()).toBe(to)
            expect(harness.frameLoop().started).toBe(false)
            //the two crossings, once each, silent
            expect(harness.selectColumnCalls.slice(beforeOver)).toEqual([
                {index: SELECTED + 1, ignoreAudio: true},
                {index: SELECTED + 2, ignoreAudio: true},
            ])
        } finally {
            harness.destroy()
        }
    })

    it('a ludicrous flick travels exactly what the 3px/ms cap travels, not further', async () => {
        const harness = await mountFlickable()
        try {
            const start = CANVAS_WIDTH / 2
            const columns = harness.context.song.columns.length
            harness.pressPointerOverNotes(start)
            //five columns in 10ms: a 40px/ms chord, thirteen times over the cap - the shape a
            //touch driver's interpolated sample pair produces
            await vi.advanceTimersByTimeAsync(10)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 5)
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 5)
            const releasePosition = SELECTED + 5
            const capped = coastLanding(releasePosition, 40, columns)
            //the 3px/ms cap decaying at 0.0035/ms is 857px, 10 columns at the desktop canvas'
            //84px column (it was 11 at the 80px one the narrower canvas gave)
            expect(capped).toBe(SELECTED + 15)
            //...and the cap is what separates that from the end of the song: uncapped, v/λ is
            //136 columns of travel and the landing clamps to the last column
            const uncapped = Math.min(
                Math.round(releasePosition + 40 / COLUMN_WIDTH / COAST_DECAY_PER_MS),
                columns - 1
            )
            expect(uncapped).toBe(columns - 1)
            await vi.advanceTimersByTimeAsync(coastDurationMs(releasePosition, capped) + 96)
            expect(harness.scrollPosition()).toBe(capped)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('a flick against either end of the song lands ON the end column, never outside it', async () => {
        const harness = await mountFlickable()
        try {
            const columns = harness.context.song.columns.length
            const last = columns - 1
            const start = CANVAS_WIDTH / 2
            //NEAR THE END, THROWN FORWARD: the closed form says eight columns past the song and
            //the clamp says the last column
            harness.context.song.selected = last - 4
            harness.push()
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(20)
            harness.movePointerOverNotes(start - COLUMN_WIDTH)
            harness.releasePointerOverNotes(start - COLUMN_WIDTH)
            expect(coastLanding(last - 3, 4, columns)).toBe(last)
            //sampled the whole way in: never past the end, and parked exactly on it
            const duration = coastDurationMs(last - 3, last)
            const seen: number[] = []
            for (let elapsed = 0; elapsed <= duration + 96; elapsed += 64) {
                await aFrame()
                seen.push(harness.scrollPosition())
            }
            expect(seen.every(position => position <= last)).toBe(true)
            expect(harness.scrollPosition()).toBe(last)
            expect(harness.frameLoop().started).toBe(false)

            //COLUMN 0, THROWN BACKWARD - the mirror, and the sign convention with it: the
            //pointer travelling RIGHT throws the song backward
            harness.context.song.selected = 4
            harness.push()
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(20)
            harness.movePointerOverNotes(start + COLUMN_WIDTH)
            harness.releasePointerOverNotes(start + COLUMN_WIDTH)
            expect(coastLanding(3, -4, columns)).toBe(0)
            const seenBack: number[] = []
            for (let elapsed = 0; elapsed <= duration + 96; elapsed += 64) {
                await aFrame()
                seenBack.push(harness.scrollPosition())
            }
            expect(seenBack.every(position => position >= 0)).toBe(true)
            expect(harness.scrollPosition()).toBe(0)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('a press mid-Coast is the Catch: the canvas freezes at once, and a still release never clicks', async () => {
        const harness = await mountFlickable()
        try {
            //the canonical 2px/ms throw: coasting toward SELECTED + 9
            await throwLeft(harness, 3, 40, 20)
            await vi.advanceTimersByTimeAsync(320)
            const grabbed = harness.scrollPosition()
            expect(grabbed).toBeGreaterThan(SELECTED + 1.5)
            expect(grabbed).toBeLessThan(SELECTED + 9)
            const callsAtPress = harness.selectColumnCalls.length
            //THE GRAB: no slop wait - the fact of the press stops the canvas on the position the
            //last frame painted, and 200ms of frames move it nowhere
            harness.pressPointerOverNotes(CANVAS_WIDTH / 2)
            await vi.advanceTimersByTimeAsync(200)
            expect(harness.scrollPosition()).toBe(grabbed)
            //...and the held canvas publishes nothing while it is held
            expect(harness.selectColumnCalls).toHaveLength(callsAtPress)

            //A RELEASE THAT NEVER MOVED. Everywhere else that is a click, which SOUNDS the
            //column under it - selectColumn WITHOUT ignoreAudio. A Catch releases as the drag
            //its press already entered: one silent rounded settle, the ratified exception.
            harness.releasePointerOverNotes(CANVAS_WIDTH / 2)
            const target = Math.round(grabbed)
            expect(harness.selectColumnCalls.slice(callsAtPress)).toEqual([
                {index: target, ignoreAudio: true},
            ])
            //the "sounds a note" observable, over the whole gesture: the click path never ran
            expect(harness.selectColumnCalls.every(call => call.ignoreAudio === true)).toBe(true)
            flushPublished(harness)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 64)
            expect(harness.scrollPosition()).toBe(target)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it("a Catch thrown back the other way coasts with the new throw's speed alone", async () => {
        const harness = await mountFlickable()
        try {
            //forward Coast under way...
            await throwLeft(harness, 3, 40, 20)
            await vi.advanceTimersByTimeAsync(320)
            const grabbed = harness.scrollPosition()
            const press = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(press)
            //...caught, then thrown BACK: 80px right every 20ms, a -4px/ms chord the cap trims
            //to -3. The press reseeded the samples, so the forward throw's speed is gone.
            await vi.advanceTimersByTimeAsync(20)
            harness.movePointerOverNotes(press + COLUMN_WIDTH)
            await vi.advanceTimersByTimeAsync(20)
            harness.movePointerOverNotes(press + COLUMN_WIDTH * 2)
            const releasePosition = grabbed - 2
            const to = coastLanding(releasePosition, -4, harness.context.song.columns.length)
            harness.releasePointerOverNotes(press + COLUMN_WIDTH * 2)
            //REVERSED, and landing by the NEW chord alone: velocities REPLACE. Were the first
            //throw's +2px/ms still in the sum the landing would sit columns away from this one,
            //and the equality below is what would fail.
            expect(to).toBeLessThan(releasePosition)
            await aFrame()
            expect(harness.scrollPosition()).toBeLessThan(releasePosition)
            await vi.advanceTimersByTimeAsync(coastDurationMs(releasePosition, to) + 96)
            expect(harness.scrollPosition()).toBe(to)
            expect(harness.frameLoop().started).toBe(false)
        } finally {
            harness.destroy()
        }
    })

    it('the wheel catches a running Coast and follows its hardware delta without added physics', async () => {
        const harness = await mountFlickable()
        try {
            await throwLeft(harness, 3, 40, 20)
            const to = SELECTED + 9 //where this throw's Coast is headed - pinned in the first row
            await vi.advanceTimersByTimeAsync(320)
            const atWheel = harness.scrollPosition()
            expect(atWheel).toBeLessThan(to - 1) //mid-flight, so the step below is a takeover
            const directPosition = atWheel - 1
            const crossed = Math.floor(directPosition)
            const target = Math.round(directPosition)
            const before = harness.selectColumnCalls.length
            harness.wheelOverNotes(-COLUMN_WIDTH)
            //The Coast is gone immediately, and the selected column is the floor the exact
            //one-column hardware delta put under the line - no old landing participates.
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: crossed, ignoreAudio: true},
            ])
            flushPublished(harness)
            //The next frame applies that exact delta rather than evaluating another motion curve.
            await aFrame()
            expect(harness.scrollPosition()).toBeCloseTo(directPosition, 6)

            //Only after the hardware goes quiet does the ordinary nearest-column ease begin.
            await vi.advanceTimersByTimeAsync(
                WHEEL_SETTLE_IDLE_MS + SCROLL_EASE_MS + 64
            )
            expect(harness.scrollPosition()).toBe(target)
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.selectColumnCalls.at(-1)).toEqual({index: target, ignoreAudio: true})
        } finally {
            harness.destroy()
        }
    })

    it("an external `selected` move abandons the Coast; the Coast's own round-trip does not", async () => {
        const harness = await mountFlickable()
        try {
            await throwLeft(harness, 3, 40, 20)
            await vi.advanceTimersByTimeAsync(320)
            //THE DISCRIMINATOR'S SURVIVING HALF: an update carrying exactly the column the Coast
            //last published is its own selectColumn coming back through Svelte, and the Coast
            //rides through it
            flushPublished(harness)
            const surviving = harness.scrollPosition()
            expect(harness.frameLoop().started).toBe(true)
            await aFrame()
            expect(harness.scrollPosition()).toBeGreaterThan(surviving)

            //ANY OTHER `selected` is an external jump - a breakpoint button, an undo, a shortcut
            //- and the Coast is abandoned for the snap those paths expect: at once, silently
            const before = harness.selectColumnCalls.length
            harness.context.song.selected = 70
            harness.push()
            expect(harness.scrollPosition()).toBe(70)
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.selectColumnCalls.slice(before)).toEqual([])
            //...and stays abandoned: nothing coasts on toward the old landing afterwards
            await vi.advanceTimersByTimeAsync(2500)
            expect(harness.scrollPosition()).toBe(70)
        } finally {
            harness.destroy()
        }
    })

    it('turning smooth scrolling off mid-Coast settles on the last published column, not the landing', async () => {
        const harness = await mountFlickable()
        try {
            await throwLeft(harness, 3, 40, 20)
            const to = SELECTED + 9
            await vi.advanceTimersByTimeAsync(320)
            flushPublished(harness)
            const published = harness.context.song.selected
            //mid-flight, so the two candidate landings genuinely differ: settling on the TARGET
            //here would teleport the canvas across every column in between
            expect(published).toBeLessThan(to)
            harness.context.props.smoothScroll = false
            harness.push()
            //NO TIMER ADVANCE: the mode has no eased motion, so the death is instantaneous - and
            //it lands on the column the rest of the composer already agrees on
            expect(harness.scrollPosition()).toBe(published)
            expect(harness.frameLoop().started).toBe(false)
            await vi.advanceTimersByTimeAsync(1000)
            expect(harness.scrollPosition()).toBe(published)
        } finally {
            harness.destroy()
        }
    })

    it('a fast release while the song plays settles: the transport outranks momentum', async () => {
        const context = makeContext()
        context.props.smoothScroll = true
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            harness.push()
            harness.context.props.playbackAnchorGeneration += 1
            harness.context.props.playbackColumnStartMs = performance.now()
            harness.context.props.isPlaying = true
            harness.push()
            //mid-glide, mid-column: the state a drag on a playing song actually starts from
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS / 2)
            const start = CANVAS_WIDTH / 2
            harness.pressPointerOverNotes(start)
            //a column every 16ms - a 5px/ms chord, fresh to the last sample
            for (let step = 1; step <= 5; step++) {
                await vi.advanceTimersByTimeAsync(16)
                harness.movePointerOverNotes(start - COLUMN_WIDTH * step)
            }
            await aFrame()
            const releasePosition = harness.scrollPosition()
            const before = harness.selectColumnCalls.length
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 5)
            //NO Coast for it: one rounded settle, exactly the release every drag on a playing
            //song has always had
            const target = Math.round(releasePosition)
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: target, ignoreAudio: true},
            ])
            expect(harness.forceAnchorCalls).toContain(target)
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 32)
            expect(harness.scrollPosition()).toBe(target)
            //no publish stream followed - the landing would be ten columns on had this coasted
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: target, ignoreAudio: true},
            ])
            //...and the transport takes the position back: the settle's flush is a discontinuity
            //that re-anchors the glide at its supplied boundary
            harness.context.props.playbackAnchorGeneration += 1
            harness.context.props.playbackColumnStartMs = performance.now()
            harness.context.song.selected = target
            harness.push()
            expect(harness.scrollPosition()).toBe(target)
            await vi.advanceTimersByTimeAsync(WHOLE_COLUMN_MS / 2)
            const resumed = harness.scrollPosition()
            expect(resumed).toBeGreaterThan(target)
            expect(resumed).toBeLessThan(target + 1)
        } finally {
            harness.destroy()
        }
    })

    it('a pointercancel with fresh fast samples never coasts; the same gesture pointerup-released does', async () => {
        const harness = await mountFlickable()
        try {
            const start = CANVAS_WIDTH / 2
            const columns = harness.context.song.columns.length
            //FIRST, THE CONTROL: this exact gesture released properly coasts - so the settle
            //below is the cancel's doing, not the samples falling short of the threshold
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH)
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 2)
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 2)
            const controlTo = coastLanding(SELECTED + 2, 5, columns)
            expect(controlTo).toBeGreaterThan(SELECTED + 2)
            await vi.advanceTimersByTimeAsync(coastDurationMs(SELECTED + 2, controlTo) + 96)
            expect(harness.scrollPosition()).toBe(controlTo)
            harness.context.song.selected = controlTo
            harness.push()

            //NOW THE SAME THROW ENDED BY THE OS - an edge swipe, palm rejection. pixi hears no
            //event for it at all, so this is the window listener's alone: the gesture was
            //interrupted, its velocity is not a throw the user made, and it settles.
            harness.pressPointerOverNotes(start)
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH)
            await vi.advanceTimersByTimeAsync(16)
            harness.movePointerOverNotes(start - COLUMN_WIDTH * 2)
            const before = harness.selectColumnCalls.length
            harness.cancelPointer()
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: controlTo + 2, ignoreAudio: true},
            ])
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 64)
            expect(harness.scrollPosition()).toBe(controlTo + 2)
            expect(harness.frameLoop().started).toBe(false)
            //...and stays: no Coast wakes up later, nothing further is published
            await vi.advanceTimersByTimeAsync(2500)
            expect(harness.scrollPosition()).toBe(controlTo + 2)
            expect(harness.selectColumnCalls.slice(before)).toHaveLength(1)
            //and the canvas follows the state again - the OS taking the pointer froze nothing
            harness.context.song.selected = controlTo + 5
            harness.push()
            expect(harness.scrollPosition()).toBe(controlTo + 5)
        } finally {
            harness.destroy()
        }
    })

    it('with smooth scrolling off a fast release never coasts, and every sample is a whole column', async () => {
        const context = makeContext()
        context.props.smoothScroll = false
        context.props.isPlaying = false
        const harness = await mount(context)
        try {
            harness.push()
            const start = CANVAS_WIDTH / 2
            const seen: number[] = []
            const sample = () => seen.push(harness.scrollPosition())
            harness.pressPointerOverNotes(start)
            sample()
            //a real throw's cadence - a column every 16ms is 5px/ms, fresh to the last sample -
            //where the existing invariant row's mixed gesture is not reliably over the threshold
            for (let step = 1; step <= 3; step++) {
                await vi.advanceTimersByTimeAsync(16)
                harness.movePointerOverNotes(start - COLUMN_WIDTH * step)
                sample()
            }
            const before = harness.selectColumnCalls.length
            harness.releasePointerOverNotes(start - COLUMN_WIDTH * 3)
            sample()
            //arrived AT ONCE, loop stopped, one restated settle - the shape every snap release
            //has, asserted before any timer advance
            expect(harness.scrollPosition()).toBe(SELECTED + 3)
            expect(harness.frameLoop().started).toBe(false)
            expect(harness.selectColumnCalls.slice(before)).toEqual([
                {index: SELECTED + 3, ignoreAudio: true},
            ])
            //...and nothing smooth wakes up afterwards: sampled across the whole stretch the
            //Coast would have run, the integral-position invariant holds against a genuine Flick
            for (let step = 0; step < 20; step++) {
                await aFrame()
                sample()
            }
            expect(seen.every(Number.isInteger)).toBe(true)
            expect(new Set(seen).size).toBeGreaterThan(1)
            expect(harness.scrollPosition()).toBe(SELECTED + 3)
            expect(harness.selectColumnCalls.slice(before)).toHaveLength(1)
        } finally {
            harness.destroy()
        }
    })

    it('a recording started mid-Coast rests the canvas, and nothing resumes when it ends', async () => {
        const harness = await mountFlickable()
        try {
            await throwLeft(harness, 3, 40, 20)
            await vi.advanceTimersByTimeAsync(320)
            flushPublished(harness)
            const published = harness.context.song.selected
            const before = harness.selectColumnCalls.length
            //RECORDING OUTRANKS EVERYTHING: the Coast is dropped and the loop stops dead - a
            //frame taken here is a stall in the file the user is recording
            harness.context.props.isRecordingAudio = true
            harness.push()
            expect(harness.frameLoop().started).toBe(false)
            const idle = harness.frameLoop()
            await vi.advanceTimersByTimeAsync(1000)
            expect(harness.frameLoop().frames).toBe(idle.frames)
            expect(harness.frameLoop().emits).toBe(idle.emits)
            //...and coming out of it parks on `selected` - the column the Coast last published,
            //the one the rest of the composer agrees on - with no Coast waking back up
            harness.context.props.isRecordingAudio = false
            harness.push()
            expect(harness.scrollPosition()).toBe(published)
            expect(harness.frameLoop().started).toBe(false)
            await vi.advanceTimersByTimeAsync(2500)
            expect(harness.scrollPosition()).toBe(published)
            expect(harness.selectColumnCalls.slice(before)).toEqual([])
        } finally {
            harness.destroy()
        }
    })
})

describe('Playhead variant config', () => {
    const originalVariant = {...COMPOSER_PLAYHEAD_CONFIG.variant}

    afterEach(() => {
        COMPOSER_PLAYHEAD_CONFIG.variant = {...originalVariant}
    })

    //ONE VARIANT PER VIEW (spec §6): the Compressed View ships the rectangle around the sounding
    //column and the Pro View the line - see PART NINE for the pro side. These two drive the
    //compressed harness through both settings, because the drawing itself is shared.
    it('ships the rectangle in the Compressed View and the line in the Pro View', () => {
        expect(COMPOSER_PLAYHEAD_CONFIG.variant).toEqual({compressed: 'rectangle', pro: 'line'})
    })

    it('draws a rectangle wrapping the whole column when variant is rectangle', async () => {
        COMPOSER_PLAYHEAD_CONFIG.variant = {...originalVariant, compressed: 'rectangle'}
        const harness = await mount()
        try {
            const {canvasWidth, columnWidth, height} = harness.geometry()
            const centre = canvasWidth / 2
            const playhead = harness.paintedScene().notes.playhead
            expect(playhead.ops).toEqual([
                ['roundRect', centre, 1.5, columnWidth, height - 3, 4],
                ['stroke', {width: 3, color: ThemeProvider.get('accent').rgbNumber(), alpha: 0.9}],
            ])
        } finally {
            harness.destroy()
        }
    })

    it('draws a line with arrows when variant is line', async () => {
        COMPOSER_PLAYHEAD_CONFIG.variant = {...originalVariant, compressed: 'line'}
        const harness = await mount()
        try {
            const {canvasWidth, height} = harness.geometry()
            const centre = canvasWidth / 2
            const playhead = harness.paintedScene().notes.playhead
            expect(playhead.ops).toEqual([
                ['rect', centre - 1.5, 0, 3, height],
                ['poly', [centre - 6, 0, centre + 6, 0, centre, 8]],
                ['poly', [centre - 6, height, centre + 6, height, centre, height - 8]],
                ['fill', {color: ThemeProvider.get('accent').rgbNumber(), alpha: 0.9}],
            ])
        } finally {
            harness.destroy()
        }
    })
})

describe('Timeline viewport middle indicator line', () => {
    it('draws a vertical line in the middle of the viewport', async () => {
        const harness = await mount()
        try {
            const scene = harness.paintedScene()
            const viewport = scene.timeline.viewport
            const {stripWidth, timelineHeight, columnWidth, canvasWidth} = harness.geometry()
            const timelineColumnWidth = stripWidth / harness.context.song.columns.length
            const columnsOnScreen = canvasWidth / columnWidth
            const viewportWidth = Math.floor(timelineColumnWidth * columnsOnScreen)
            expect(viewport.ops).toEqual([
                ['roundRect', 0, 0, viewportWidth, timelineHeight - 3, 6],
                ['moveTo', viewportWidth / 2, 0],
                ['lineTo', viewportWidth / 2, timelineHeight - 3],
                ['stroke', {
                    width: 3,
                    color: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
                    alpha: 0.8,
                }],
            ])
        } finally {
            harness.destroy()
        }
    })
})

describe('Audio recording does not render notes or timeline and avoids rendering updates', () => {
    it('hides timeline strip and performs no rendering updates during recording ticks', async () => {
        const harness = await mount()
        try {
            harness.context.props.isRecordingAudio = true
            harness.push()
            const scene = harness.paintedScene()
            expect(scene.notes.columns).toEqual([])
            expect(scene.notes.playhead.visible).toBe(false)
            expect(scene.timeline.strip.visible).toBe(false)

            const initialRenders = harness.renders()
            // Transport ticks arrive during recording
            for (let i = 0; i < 5; i++) {
                harness.context.song.selected += 1
                harness.push()
            }
            // No renders happened during recording ticks
            expect(harness.renders()).toBe(initialRenders)

            // Once recording finishes, canvas and timeline are restored with a full render
            harness.context.props.isRecordingAudio = false
            harness.push()
            const restoredScene = harness.paintedScene()
            expect(restoredScene.notes.columns.length).toBeGreaterThan(0)
            expect(restoredScene.timeline.strip.visible).toBe(true)
            expect(harness.renders()).toBeGreaterThan(initialRenders)
        } finally {
            harness.destroy()
        }
    })
})

// ---------------------------------------------------------------------------------------------
// PART NINE: THE PRO VIEW'S INPUT (spec §7, phase D).
//
// The same pointer stream PART SEVEN drives, over a canvas where a tap no longer picks a column: it
// EDITS the cell under it, a hold opens the duration popover, and - with the View Lock open - a drag
// pans the frame vertically as well (CONTEXT.md: Pro View, View Lock).
//
// WHAT THESE ROWS CAN SEE, and what they cannot. The renderer's job here is MECHANICAL - resolve a
// column and a Note Number, hand them over - so the two callbacks below are the whole observable
// surface for a tap, and the CAMERA is observed through them too: what a tap at a fixed screen point
// resolves to IS where the camera is, which is a stronger reading than a private field would be. What
// the tap then does to the song is Composer.svelte's and is not reachable from here; the decision it
// makes is pinned in test/composerInput.test.ts, and the row resolution both sides share is pinned in
// test/proViewGeometry.test.ts.
//
// mount() above cannot serve: it asserts the Compressed View's three-child stage, and a Pro View
// stage carries five (the zone's framing and the row-label strip join it). The harness below is
// deliberately small - it reads no scene at all.
describe('the Pro View pointer', () => {
    /**
     * A pro renderer over the same fixture song, with the two Pro View callbacks recorded.
     *
     * `takeLongPress` is what Composer.svelte answers when a hold reaches it - true where a popover
     * would open, false where it would not (an empty cell, or any cell while the song plays) - and
     * flipping it is how the rows below state that an unconsumed hold still releases as a tap.
     */
    async function mountPro(
        options: {
            viewLocked?: boolean
            smoothScroll?: boolean
            takeLongPress?: boolean
            keyboardRaised?: boolean
        } = {}
    ) {
        const song = makeSong()
        const canvasEl = document.createElement('div')
        document.body.append(canvasEl)
        let viewLocked = options.viewLocked ?? true
        let takeLongPress = options.takeLongPress ?? true
        //the keyboard sheet, which changes ONE thing about this surface: a settled tap puts it down
        //instead of editing (spec §2). A drag is untouched - that is the point of the rule.
        let keyboardRaised = options.keyboardRaised ?? false
        let dismissals = 0
        const taps: {column: number, number: number}[] = []
        const longPresses: {
            column: number
            number: number
            rect: {x: number, y: number, width: number, height: number}
        }[] = []
        const selectColumnCalls: number[] = []
        let height = 0
        let timelineHeight = 0
        const state = (): ComposerRendererState => ({
            columns: song.columns,
            structureVersion: song.structureVersion,
            isPlaying: false,
            playbackColumnStartMs: performance.now(),
            playbackAnchorGeneration: 0,
            isRecordingAudio: false,
            instruments: song.instruments,
            songPitch: song.pitch,
            selected: song.selected,
            currentLayer: 0,
            beatMarks: 3,
            columnsPerCanvas: COLUMNS_PER_CANVAS,
            proView: true,
            viewLocked,
            keyboardRaised,
            noteNameType: 'Note name',
            breakpoints: song.breakpoints,
            selectedColumns: [],
            smoothScroll: options.smoothScroll ?? false,
            bpm: BPM,
        })
        const appsBefore = pixi.applications.length
        const renderer = new ComposerRenderer(canvasEl, state(), {
            selectColumn: index => selectColumnCalls.push(index),
            toggleBreakpoint: () => {},
            onGeometryChange: reported => {
                height = reported.height
                timelineHeight = reported.timelineHeight
            },
            onProCellTap: (column, number) => taps.push({column, number}),
            onProCellLongPress: (column, number, rect) => {
                longPresses.push({column, number, rect})
                return takeLongPress
            },
            onKeyboardDismiss: () => {
                keyboardRaised = false
                dismissals++
            },
        })
        await renderer.init()
        //the cache debounce, exactly as mount() waits it out - without a cache nothing paints and
        //applyCameraY has nothing to move
        await vi.advanceTimersByTimeAsync(180)
        const [app] = pixi.applications.slice(appsBefore)
        //the Pro View's stage: columns, the zone's framing, the playhead, the row-label strip, the
        //mini-timeline. Stated here for the reason mount() states its own three - the LAST child is
        //what pixi hit-tests first, and the notes container being [0] is what the emits below reach.
        expect(app.stage.children).toHaveLength(5)
        const notesColumns = app.stage.children[0]

        //THE VIEW FUNCTION, restated from the same modules the renderer reads it from (see this
        //part's import note): the axis this song draws on, the row height this region gives it, and
        //the camera the LOCKED framing puts on the current layer's Editable Zone.
        const rowHeight = proRowHeight(height)
        const axis: ProViewAxis = proViewAxis(songNumberSpan(song.columns))
        const notesTop = composerNotesRegionY(true, timelineHeight)
        const lockedCamera = (layer = 0) =>
            lockedCameraY({
                axis,
                zone: editableZone(
                    song.instruments[layer].name,
                    effectiveTrackPitch(song.instruments[layer], song.pitch)
                ),
                rowHeight,
                notesRegionHeight: height,
            })
        /** The canvas x of a column's middle - the playhead sits at a QUARTER of the width in this view. */
        const xOfColumn = (column: number) =>
            CANVAS_WIDTH * 0.25 + (column - song.selected) * COLUMN_WIDTH + COLUMN_WIDTH / 2
        /** The canvas y of a Note Number's row centre, at a given camera. */
        const yOfNumber = (number: number, cameraY: number) =>
            notesTop + (rowForNumber(axis, number) + 0.5) * rowHeight - cameraY
        /** The Note Number a canvas y stands for at a given camera - the tap's own oracle. */
        const numberAt = (y: number, cameraY: number) =>
            numberAtY({axis, y: y - notesTop, cameraY, rowHeight})

        return {
            song,
            taps,
            longPresses,
            selectColumnCalls,
            axis,
            rowHeight,
            height,
            notesTop,
            lockedCamera,
            xOfColumn,
            yOfNumber,
            numberAt,
            stripWidth: () => proStripWidth(rowHeight),
            dismissals: () => dismissals,
            setViewLocked(locked: boolean) {
                viewLocked = locked
            },
            setKeyboardRaised(raised: boolean) {
                keyboardRaised = raised
            },
            push() {
                renderer.update(state())
            },
            press(x: number, y: number, pointerId = PRIMARY_POINTER) {
                notesColumns.emit('pointerdown', {globalX: x, globalY: y, pointerId})
            },
            move(x: number, y: number, pointerId = PRIMARY_POINTER) {
                notesColumns.emit('pointermove', {globalX: x, globalY: y, pointerId})
            },
            release(x: number, y: number, pointerId = PRIMARY_POINTER) {
                notesColumns.emit('pointerup', {globalX: x, globalY: y, pointerId})
            },
            /** Press and release on one point with nothing in between - the settled tap. */
            tap(x: number, y: number) {
                notesColumns.emit('pointerdown', {globalX: x, globalY: y, pointerId: PRIMARY_POINTER})
                notesColumns.emit('pointerup', {globalX: x, globalY: y, pointerId: PRIMARY_POINTER})
            },
            /** A drag from one point to another, ending in a release on the far one. */
            drag(x: number, y: number, toX: number, toY: number) {
                notesColumns.emit('pointerdown', {globalX: x, globalY: y, pointerId: PRIMARY_POINTER})
                notesColumns.emit('pointermove', {
                    globalX: toX,
                    globalY: toY,
                    pointerId: PRIMARY_POINTER,
                })
                notesColumns.emit('pointerup', {globalX: toX, globalY: toY, pointerId: PRIMARY_POINTER})
            },
            destroy() {
                renderer.destroy()
                canvasEl.remove()
            },
        }
    }

    /** A Note Number the current layer can really voice, taken from the middle of its Editable Zone. */
    function addableNumber(harness: {song: ComposedSong}): number {
        const zone = editableZone(
            harness.song.instruments[0].name,
            effectiveTrackPitch(harness.song.instruments[0], harness.song.pitch)
        )
        return [...zone.numbers].sort((a, b) => a - b)[Math.floor(zone.numbers.size / 2)]
    }

    /** A throw fast enough to Coast, released on its last sampled point - PART EIGHT's own recipe. */
    async function throwAndCoast(
        harness: Awaited<ReturnType<typeof mountPro>>,
        y: number
    ): Promise<void> {
        const start = CANVAS_WIDTH * 0.25
        harness.press(start, y)
        for (let step = 1; step <= 3; step++) {
            await vi.advanceTimersByTimeAsync(20)
            harness.move(start - 40 * step, y)
        }
        harness.release(start - 120, y)
        await vi.advanceTimersByTimeAsync(64)
    }

    it('a settled tap reports the cell it landed on, and selects nothing', async () => {
        const harness = await mountPro()
        try {
            const column = SELECTED + 3
            const number = addableNumber(harness)
            harness.tap(harness.xOfColumn(column), harness.yOfNumber(number, harness.lockedCamera()))
            expect(harness.taps).toEqual([{column, number}])
            //THE WHOLE POINT of spec §2's "never column selection": the cursor stays where it was,
            //so an edit three columns away neither moves nor sounds the selection
            expect(harness.selectColumnCalls).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('resolves the row under the pointer, one Note Number per row', async () => {
        const harness = await mountPro()
        try {
            const camera = harness.lockedCamera()
            const number = addableNumber(harness)
            for (const offset of [-2, -1, 0, 1, 2]) {
                harness.tap(harness.xOfColumn(SELECTED), harness.yOfNumber(number + offset, camera))
            }
            expect(harness.taps.map(tap => tap.number)).toEqual([
                number - 2,
                number - 1,
                number,
                number + 1,
                number + 2,
            ])
        } finally {
            harness.destroy()
        }
    })

    it('a tap on the row-label strip band reports nothing', async () => {
        const harness = await mountPro()
        try {
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            harness.tap(harness.stripWidth() - 1, y)
            expect(harness.taps).toEqual([])
            //...and one pixel to its right is an ordinary cell again
            harness.tap(harness.stripWidth(), y)
            expect(harness.taps).toHaveLength(1)
        } finally {
            harness.destroy()
        }
    })

    it('a press that travelled past the slop is a gesture, not a tap', async () => {
        const harness = await mountPro()
        try {
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            //vertically, where the LOCKED frame moves nothing at all - the press still stops being
            //a tap, because a tap here writes a note
            harness.drag(x, y, x, y + 20)
            expect(harness.taps).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('a Catch halts the Coast and edits nothing', async () => {
        const harness = await mountPro({smoothScroll: true})
        try {
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            await throwAndCoast(harness, y)
            //the Catch itself: a press on the travelling canvas, released without moving
            const start = CANVAS_WIDTH * 0.25
            harness.tap(start, y)
            expect(harness.taps).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('a hold opens the popover on the cell it was held on, and swallows its own release', async () => {
        const harness = await mountPro()
        try {
            const column = SELECTED + 2
            const number = addableNumber(harness)
            const camera = harness.lockedCamera()
            const x = harness.xOfColumn(column)
            const y = harness.yOfNumber(number, camera)
            harness.press(x, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS)
            expect(harness.longPresses).toHaveLength(1)
            expect({
                column: harness.longPresses[0].column,
                number: harness.longPresses[0].number,
            }).toEqual({column, number})
            //THE CELL'S OWN BOX, in screen coordinates - what the popover anchors to when there is
            //no element to anchor to. jsdom measures the canvas at the origin, so this is the
            //canvas-space rect itself.
            const rect = harness.longPresses[0].rect
            expect({x: rect.x, width: rect.width, height: rect.height}).toEqual({
                x: x - COLUMN_WIDTH / 2,
                width: COLUMN_WIDTH,
                height: harness.rowHeight,
            })
            //the row's own top edge - to the float, since both sides are a camera subtracted from a
            //row multiple and the two spellings of that differ in the last bit
            expect(rect.y).toBeCloseTo(y - harness.rowHeight / 2, 9)
            harness.release(x, y)
            expect(harness.taps).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('a hold nothing took still releases as a tap', async () => {
        const harness = await mountPro({takeLongPress: false})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            harness.press(x, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS)
            expect(harness.longPresses).toHaveLength(1)
            harness.release(x, y)
            expect(harness.taps).toEqual([{column: SELECTED, number}])
        } finally {
            harness.destroy()
        }
    })

    it('movement past the slop cancels a pending hold', async () => {
        const harness = await mountPro()
        try {
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            harness.press(x, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS / 2)
            harness.move(x + 30, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS)
            expect(harness.longPresses).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('a Catch arms no hold: the press on a moving canvas is the grab', async () => {
        const harness = await mountPro({smoothScroll: true})
        try {
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            await throwAndCoast(harness, y)
            harness.press(CANVAS_WIDTH * 0.25, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS)
            expect(harness.longPresses).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('locked, a vertical drag moves the frame nowhere', async () => {
        const harness = await mountPro({viewLocked: true})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            harness.drag(x, y, x, y + harness.rowHeight * 4)
            //the same point still resolves the same row, which is the camera not having moved
            harness.tap(x, y)
            expect(harness.taps).toEqual([{column: SELECTED, number}])
        } finally {
            harness.destroy()
        }
    })

    it('unlocked, a drag pans the frame by exactly what the pointer travelled', async () => {
        const harness = await mountPro({viewLocked: false})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            const travel = harness.rowHeight * 3
            harness.drag(x, y, x, y + travel)
            //dragging DOWN brings higher numbers into the same screen point, one per row travelled
            harness.tap(x, y)
            expect(harness.taps).toEqual([
                {column: SELECTED, number: harness.numberAt(y, harness.lockedCamera() - travel)},
            ])
            expect(harness.taps[0].number).toBe(number + 3)
        } finally {
            harness.destroy()
        }
    })

    it('unlocked, the pan stops at the axis rather than running off it', async () => {
        const harness = await mountPro({viewLocked: false})
        try {
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            //far more travel than the axis has above the zone: the clamp is what stops it at 0
            harness.drag(x, y, x, y + harness.rowHeight * 1000)
            harness.tap(x, harness.notesTop + harness.rowHeight / 2)
            //camera 0 = the axis' top row at the region's top edge
            expect(harness.taps).toEqual([{column: SELECTED, number: harness.axis.max}])
        } finally {
            harness.destroy()
        }
    })

    it('re-locking brings the frame back to the Editable Zone', async () => {
        const harness = await mountPro({viewLocked: false})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            harness.drag(x, y, x, y + harness.rowHeight * 3)
            harness.setViewLocked(true)
            harness.push()
            harness.tap(x, y)
            expect(harness.taps).toEqual([{column: SELECTED, number}])
        } finally {
            harness.destroy()
        }
    })

    it('...and eases there while smooth motion is on', async () => {
        const harness = await mountPro({viewLocked: false, smoothScroll: true})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            harness.drag(x, y, x, y + harness.rowHeight * 6)
            harness.setViewLocked(true)
            harness.push()
            //MID-EASE: the frame is on its way back rather than already there
            await vi.advanceTimersByTimeAsync(32)
            harness.tap(x, y)
            expect(harness.taps[0].number).toBeGreaterThan(number)
            //...and it arrives on the zone within the scroll's own ease duration
            await vi.advanceTimersByTimeAsync(SCROLL_EASE_MS + 64)
            harness.tap(x, y)
            expect(harness.taps[1]).toEqual({column: SELECTED, number})
        } finally {
            harness.destroy()
        }
    })

    it('a zone change eases an UNLOCKED frame to the new zone, and leaves it unlocked', async () => {
        const harness = await mountPro({viewLocked: false})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            const travel = harness.rowHeight * 3
            harness.drag(x, y, x, y + travel)
            //the Basepoint moves the whole Editable Zone (spec §9), which is a zone change the
            //camera follows in either lock state
            harness.song.pitch = 'B'
            harness.push()
            const zoneCamera = harness.lockedCamera()
            harness.tap(x, y)
            expect(harness.taps).toEqual([
                {column: SELECTED, number: harness.numberAt(y, zoneCamera)},
            ])
            //STILL UNLOCKED: the next drag pans exactly as the first one did
            harness.drag(x, y, x, y + travel)
            harness.tap(x, y)
            expect(harness.taps[1].number).toBe(harness.numberAt(y, zoneCamera - travel))
        } finally {
            harness.destroy()
        }
    })

    it('a release with no press of ours behind it edits nothing', async () => {
        const harness = await mountPro()
        try {
            //a press taken by a DOM element over the canvas (a side chevron, a key of the raised
            //sheet) still delivers its pointerUP here - pixi hit-tests a page-wide release against
            //the canvas by coordinate - and it must not write a note (spec §7)
            harness.release(
                harness.xOfColumn(SELECTED),
                harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            )
            expect(harness.taps).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    // THE KEYBOARD SHEET IS UP, and the canvas under it is no longer covered by a backdrop: it is
    // bright, it scrolls, and a settled tap on it is what puts the sheet away (spec §2/§8).
    it('with the sheet up, a settled tap dismisses it and edits nothing', async () => {
        const harness = await mountPro({keyboardRaised: true})
        try {
            harness.tap(
                harness.xOfColumn(SELECTED),
                harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            )
            expect(harness.dismissals()).toBe(1)
            expect(harness.taps).toEqual([])
            expect(harness.selectColumnCalls).toEqual([])
            //...and the NEXT tap, with the sheet now down, is an ordinary edit again
            harness.push()
            const number = addableNumber(harness)
            harness.tap(harness.xOfColumn(SELECTED), harness.yOfNumber(number, harness.lockedCamera()))
            expect(harness.taps).toEqual([{column: SELECTED, number}])
        } finally {
            harness.destroy()
        }
    })

    it('with the sheet up, a drag still scrolls the song and leaves the sheet alone', async () => {
        const harness = await mountPro({keyboardRaised: true})
        try {
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            const x = harness.xOfColumn(SELECTED)
            //two columns to the left, exactly as it would scroll with the sheet down
            harness.drag(x, y, x - COLUMN_WIDTH * 2, y)
            expect(harness.selectColumnCalls).toContain(SELECTED + 2)
            expect(harness.dismissals()).toBe(0)
            expect(harness.taps).toEqual([])
        } finally {
            harness.destroy()
        }
    })

    it('with the sheet up, a hold opens no popover - the release dismisses instead', async () => {
        const harness = await mountPro({keyboardRaised: true})
        try {
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(addableNumber(harness), harness.lockedCamera())
            harness.press(x, y)
            await vi.advanceTimersByTimeAsync(COMPOSER_LONG_PRESS_MS + 16)
            expect(harness.longPresses).toEqual([])
            harness.release(x, y)
            expect(harness.dismissals()).toBe(1)
        } finally {
            harness.destroy()
        }
    })

    // The unlocked pan is a DRAG, so it goes on working with the sheet up as well - the vertical
    // half of "the canvas scrolls exactly as it does when the sheet is down".
    it('with the sheet up and the view unlocked, a drag still pans the frame', async () => {
        const harness = await mountPro({viewLocked: false, keyboardRaised: true})
        try {
            const number = addableNumber(harness)
            const x = harness.xOfColumn(SELECTED)
            const y = harness.yOfNumber(number, harness.lockedCamera())
            const travel = harness.rowHeight * 3
            harness.drag(x, y, x, y + travel)
            expect(harness.dismissals()).toBe(0)
            //the same screen point now stands three rows higher up the axis
            harness.tap(x, y)
            expect(harness.dismissals()).toBe(1)
            expect(harness.taps).toEqual([])
            harness.push()
            harness.tap(x, y)
            expect(harness.taps).toEqual([{column: SELECTED, number: number + 3}])
        } finally {
            harness.destroy()
        }
    })
})
