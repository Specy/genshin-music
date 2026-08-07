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
 * THE SILENT FAILURE MODE the pool introduces is a reused view showing something its previous
 * occupant left behind - a texture, an alpha, a note sprite that should have been hidden. Nothing
 * about that is visible in HOW MUCH was repainted, so counting repaints cannot see it. The second
 * and third parts below are aimed at it, and each compares against a reference the pooled path had
 * no hand in producing.
 *
 * Four parts, because they fail on different mistakes:
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
 *  - the tests after the tables are single claims neither table makes on its own, each stating at
 *    its own site what it is there for.
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
 *  - the pixi interaction wiring (eventMode, interactiveChildren, hitArea) on the root containers,
 *    and the wheel listener - the pointer handlers are exercised by the click-inverse test, these
 *    are not.
 *  - the Application constructor options: FakeApplication.init() discards them, so resolution,
 *    autoDensity, antialias and the initial canvas size are invisible.
 *  - teardown: nothing requires either Application to be destroyed, though destroy()'s own comment
 *    calls that a hard requirement against a WebGL leak on remount.
 *  - the rules this file imports from production rather than restating - nearestEven,
 *    computeRowLayerStatuses, computeStrandedRows, displayButtonForId, isColumnVisible. A defect
 *    inside one of those is followed by the reference rather than caught, EXCEPT where a second,
 *    independent statement pins it (the closed-form window range does this for isColumnVisible).
 *
 * HOW MUCH was repainted is observed indirectly, because everything the renderer decides is
 * private. Each counter of Repainted rides on something the class does in one place:
 *  - painting a column clears that view's tail Graphics; the timeline viewport is the other
 *    Graphics this class clears, and it is subtracted by identity, so `columnPaints` follows column
 *    paints rather than clears in general;
 *  - rebuilding the timeline content removeChildren()s the timeline content container, which
 *    nothing else in the class calls;
 *  - the class constructs plain Containers in two places - its persistent scene containers, in
 *    field initialisers that run before init(), and the pooled views - so once a harness is mounted,
 *    container constructions and destructions read as "the pool grew" / "the pool was thrown away".
 *    A Sprite and a Graphics each un-count themselves in their own constructor.
 *  - Application.render() is the "did this update do anything at all" channel, and the rows where
 *    it is 0 are what make the rest mean something.
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

    class FakeApplication {
        renders = 0
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

        //no ticker: the renderer passes autoStart:false, and the counters here are the only
        //observation. test/composerRenderLoop.test.ts is the file that pins autoStart itself.
        async init() {}

        render = () => {
            this.renders++
        }

        destroy() {}
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
        if (!isColumnVisible(index, song.selected, COLUMNS_PER_CANVAS)) continue
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
}

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
        },
    }
}

/** What one update() repainted. See this file's header for what observes each of these. */
interface Repainted {
    /** both Applications, asserted together - a row where they differ is a bug in the renderer */
    renders: {notes: number, timeline: number}
    /** columns whose content was repainted */
    columnPaints: number
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
    /** How many columns isColumnVisible says are drawn right now. */
    windowSize(): number
    /** The column indices the pool currently has on screen, derived from the containers' x. */
    attachedColumns(): number[]
    /** Everything on screen, as values. */
    paintedScene(): PaintedScene
    /** The kind of every child of every drawn column view, in the order pixi draws them. */
    columnChildKinds(): string[][]
    /** The geometry this renderer computed. */
    geometry(): Geometry
    /** The ComposerCache the views currently hold textures from. */
    currentCache(): ComposerCache
    /** Release a pointer over the notes stage at a canvas x, the way a click on a column arrives. */
    releasePointerOverNotes(globalX: number): void
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
    expect(notesApp.stage.children).toHaveLength(1)
    expect(timelineApp.stage.children).toHaveLength(2)
    const notesColumns = notesApp.stage.children[0]
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
        timelineClears: timelineContent.clears,
        containersCreated: counters.constructed.containers,
        containersDestroyed: counters.destroyed.containers,
    })

    const columnIndex = (column: SceneNode) => Math.round(column.x / geometry().columnWidth)

    return {
        context,
        push() {
            const before = measure()
            renderer.update(state())
            const after = measure()
            return {
                renders: {
                    notes: after.notesRenders - before.notesRenders,
                    timeline: after.timelineRenders - before.timelineRenders,
                },
                columnPaints:
                    after.graphicsClears -
                    before.graphicsClears -
                    (after.viewportClears - before.viewportClears),
                timelineRebuilds: after.timelineClears - before.timelineClears,
                viewsCreated: after.containersCreated - before.containersCreated,
                viewsDestroyed: after.containersDestroyed - before.containersDestroyed,
            }
        },
        windowSize() {
            let count = 0
            for (let i = 0; i < context.song.columns.length; i++) {
                if (isColumnVisible(i, context.song.selected, COLUMNS_PER_CANVAS)) count++
            }
            return count
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
        geometry,
        currentCache,
        releasePointerOverNotes(globalX: number) {
            notesColumns.emit('pointerup', {globalX})
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
    //every wait in this file is a debounce - cache regeneration, the delayed destruction of the
    //previous cache, subscribeTheme's own - so the clock is driven rather than slept through
    vi.useFakeTimers()
})

afterEach(() => {
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
 *  - the selection overlay is one sprite: the selected column takes standard[2] at 0.8, a column in
 *    the tools selection that is NOT the selected one takes standard[3] at 0.4, and a column in
 *    neither shows none;
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
        if (!isColumnVisible(index, song.selected, COLUMNS_PER_CANVAS)) continue
        const column = song.columns[index]
        const larger = (index + 1) % 4 === 0
        const background =
            column.tempoChanger === 0
                ? `${larger ? 'standardLarger' : 'standard'}[${Number(index % (groupSize * 2) >= groupSize)}]`
                : `${larger ? 'columnsLarger' : 'columns'}[${column.tempoChanger}]`
        const isSelected = index === song.selected
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
 * SELECTED column's left edge one column-width short of half a canvas' worth of columns, which is
 * what puts the playhead near the middle of the canvas rather than at an edge.
 *
 * This is one of two statements the offset has to satisfy. The other is a CONSEQUENCE rather than a
 * restatement: ComposerRenderer.handleClickStageUp turns a click at x into
 * `floor((x - middle) / columnWidth + 1)` columns away from the selected one, so wherever this
 * offset puts the selected column on the canvas, a click landing there has to select nothing and a
 * click one column-width right has to select the next column. That is driven through the renderer
 * in its own test below, so a matching mistake here and in the draw path does not pass.
 */
function expectedNotesOffset(context: Context, geometry: Geometry): number {
    const middle = (COLUMNS_PER_CANVAS / 2) * geometry.columnWidth
    return middle - geometry.columnWidth - context.song.selected * geometry.columnWidth
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
 *  - the viewport outline is as wide as the number of columns the canvas shows plus one, with its
 *    left edge half a canvas' worth of columns before the selected one, drawn 1.5px down so its
 *    3px stroke sits inside the strip.
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
            //where the selected column sits here, less half a canvas' worth of columns. Two terms
            //rather than one multiplication by the difference, because the comparison against the
            //renderer is exact and a timeline column is not a whole number of pixels: reassociating
            //`a * b - a * c` into `a * (b - c)` moves the last bits of the result.
            timelineColumnWidth * song.selected - timelineColumnWidth * (COLUMNS_PER_CANVAS / 2),
            1.5,
            [
                ['roundRect', 0, 0, Math.floor(timelineColumnWidth * (columnsOnScreen + 1)), timelineHeight - 3, 6],
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
    /** a number, or 'window' for "every drawn column", which is what a full repaint does */
    columnPaints: number | 'window'
    timelineRebuilds: number
}

/** A structural edit: the window is repainted column by column and the timeline content rebuilt. */
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
        columnPaints: 0,
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
        columnPaints: 0,
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
        columnPaints: 1,
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
        columnPaints: 0,
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
    {
        what: 'a note is added',
        change: context => void context.song.addNoteAt(41, 0, idOf(3)),
        ...FULL,
    },
    {
        what: 'a note is removed',
        change: context => context.song.removeNoteAt(41, 0, idOf(41 % 7)),
        ...FULL,
    },
    {
        what: "a note's span changes",
        change: context => void context.song.setNoteSpan(40, 0, idOf(40 % 7), 4),
        ...FULL,
    },
    {
        what: 'a tempo changer is set',
        change: context => context.song.setTempoChangerAt(41, TEMPO_CHANGERS[2]),
        ...FULL,
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
        columnPaints: 0,
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

function expectedColumnPaints(testCase: RepaintCase, harness: Harness): number {
    return testCase.columnPaints === 'window' ? harness.windowSize() : testCase.columnPaints
}

describe('ComposerRenderer repaints from a diff of two moments, on one stable song', () => {
    for (const testCase of REPAINTS) {
        const expected =
            `renders=${testCase.renders} columns=${testCase.columnPaints}`
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
                expect(repainted).toEqual({
                    renders: {notes: testCase.renders, timeline: testCase.renders},
                    columnPaints: expectedColumnPaints(testCase, harness),
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
                    if (isColumnVisible(i, harness.context.song.selected, COLUMNS_PER_CANVAS)) visible.push(i)
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
    /** drives the renderer to the state under test; every push here is a real update() */
    drive: (harness: Harness) => void
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
]

describe('the painted scene is what the drawing rules say it is', () => {
    for (const testCase of WINDOWS) {
        it(testCase.what, async () => {
            const harness = await mount()
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
                //one column leaves the window and one enters, and the entering one is painted
                expect(harness.push()).toEqual({
                    renders: {notes: 1, timeline: 1},
                    columnPaints: 1,
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
        //isColumnVisible on every draw. The thresholds are half-integers for the odd options, which
        //is where a naive `selected +- n/2` form stops agreeing.
        //The list is READ OUT OF THE SETTING rather than copied here: an option added there is
        //covered on the day it is added, which is what lets isColumnVisible's docstring name this
        //test as what keeps the definition and the closed form agreeing.
        const options = ComposerSettings.data.columnsPerCanvas.options
        //...and the value the rest of this file drives the renderer with is one of them, so those
        //rows exercise a configuration the composer can be put into
        expect(options).toContain(COLUMNS_PER_CANVAS)
        const columns = 200
        for (const perCanvas of options) {
            const threshold = perCanvas / 2 + 2
            for (const selected of [0, 1, 7, 40, 99, 150, 198, 199]) {
                const first = Math.max(0, Math.floor(selected - threshold) + 1)
                const last = Math.min(columns - 1, Math.ceil(selected + threshold) - 1)
                const closedForm: number[] = []
                for (let i = first; i <= last; i++) closedForm.push(i)
                const definition: number[] = []
                for (let i = 0; i < columns; i++) {
                    if (isColumnVisible(i, selected, perCanvas)) definition.push(i)
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
 * puts the selected column at, ComposerRenderer.handleClickStageUp - the inverse, and the only
 * other place in the class that reasons about that placement - has to read a pointer there as the
 * selected column. The x is taken off the painted scene (the container's offset plus the view's own
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

describe('NoteColumn.version is not read yet', () => {
    it('a repaint decision ignores it - that wiring is phase 4', async () => {
        const harness = await mount()
        try {
            harness.push()
            //bumping a counter by hand, the way a mutator does, must not repaint anything on its
            //own: phase 3 decides from the structure version, and phase 4 is where the per-column
            //counter starts narrowing that down. Stated as a test so the two phases stay separately
            //verifiable.
            for (const column of harness.context.song.columns) column.version++
            expect(harness.push()).toEqual({
                renders: {notes: 0, timeline: 0},
                columnPaints: 0,
                timelineRebuilds: 0,
                viewsCreated: 0,
                viewsDestroyed: 0,
            })
        } finally {
            harness.destroy()
        }
    })
})
