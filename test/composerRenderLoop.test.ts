import {afterEach, describe, expect, it, vi} from 'vitest'

/**
 * THE RENDER LOOP'S CONTRACT: who asks the two pixi Applications to render, and how often.
 *
 * test/composerRenderer.test.ts owns everything about WHAT is painted and carries its own, much
 * larger, set of pixi fakes; the two are deliberately separate and neither should grow toward the
 * other. What is here is the wiring that file's harness has to assume in order to measure anything:
 * that neither Application drives itself, that the notes one's Ticker is the single frame loop and
 * carries the cap, and that an idle composer schedules nothing at all.
 */

const pixi = vi.hoisted(() => {
    interface FakeApplicationOptions {
        autoStart?: boolean
    }

    class FakeTexture {
        destroy() {}
    }

    /**
     * pixi's Ticker, modelled only as far as this file's claims need: who is listening, at what
     * priority, whether it is running, and whether it ever asked the browser for a frame.
     *
     * `add` inserts before the first listener of a STRICTLY LOWER priority, which is pixi's own
     * rule (node_modules/pixi.js/lib/ticker/Ticker.mjs) and the reason a callback at the default
     * priority runs before `Application.render` at UPDATE_PRIORITY.LOW. The maxFPS GATE is not
     * modelled - the cap's effect on the emit cadence is stated in composerRenderer.test.ts, which
     * drives a clock; here maxFPS is only a value to read back.
     */
    class FakeTicker {
        started = false
        maxFPS = 0
        framesRequested = 0
        destroyed = false
        readonly listeners: {fn: unknown, context: unknown, priority: number}[] = []
        private requestId: number | null = null

        add(fn: unknown, context: unknown, priority = 0) {
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

        remove(fn: unknown, context: unknown) {
            for (let i = this.listeners.length - 1; i >= 0; i--) {
                const listener = this.listeners[i]
                if (listener.fn === fn && listener.context === context) this.listeners.splice(i, 1)
            }
            return this
        }

        start() {
            if (this.started) return
            this.started = true
            if (this.requestId !== null || this.listeners.length === 0) return
            this.framesRequested++
            this.requestId = setTimeout(() => {
                this.requestId = null
            }, 16) as unknown as number
        }

        stop() {
            if (!this.started) return
            this.started = false
            if (this.requestId === null) return
            clearTimeout(this.requestId)
            this.requestId = null
        }

        //Ticker.destroy() begins with this.stop()
        destroy() {
            this.stop()
            this.destroyed = true
            this.listeners.length = 0
        }
    }

    class FakeContainer {
        children: FakeContainer[] = []
        eventMode = 'none'
        interactiveChildren = true
        hitArea: unknown
        visible = true
        isRenderGroup = false
        x = 0
        y = 0
        zIndex = 0
        alpha = 1

        addChild<T extends FakeContainer>(child: T): T {
            this.children.push(child)
            return child
        }

        removeChildren(): FakeContainer[] {
            const children = this.children
            this.children = []
            return children
        }

        on() {
            return this
        }

        enableRenderGroup() {
            this.isRenderGroup = true
        }

        destroy() {}
    }

    class FakeGraphics extends FakeContainer {
        clear() {
            return this
        }

        rect() {
            return this
        }

        roundRect() {
            return this
        }

        poly() {
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

        fill() {
            return this
        }

        stroke() {
            return this
        }
    }

    class FakeSprite extends FakeContainer {
        readonly anchor = {set: vi.fn()}

        constructor(_texture: FakeTexture) {
            super()
        }
    }

    class FakeRectangle {
        constructor(_x: number, _y: number, _width: number, _height: number) {}
    }

    const applications: FakeApplication[] = []

    class FakeApplication {
        readonly render = vi.fn()
        readonly ticker = new FakeTicker()
        readonly canvas = document.createElement('canvas')
        readonly stage = new FakeContainer()
        readonly renderer = {
            background: {color: 0},
            resize: vi.fn(),
            generateTexture: vi.fn(() => new FakeTexture()),
        }
        initOptions: FakeApplicationOptions | undefined

        constructor() {
            applications.push(this)
        }

        /**
         * TickerPlugin.init, in the order it runs: the `ticker` setter registers `this.render` at
         * UPDATE_PRIORITY.LOW UNCONDITIONALLY, and only then does `autoStart` decide whether
         * `start()` is called. Both halves matter here - the first is what the renderer has to undo
         * to own its own rendering, and the second is what `autoStart: false` actually buys.
         */
        async init(options: FakeApplicationOptions) {
            this.initOptions = options
            this.ticker.add(this.render, this, -25)
            if (options.autoStart) this.ticker.start()
        }

        start() {
            this.ticker.start()
        }

        stop() {
            this.ticker.stop()
        }

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

import {ComposerSettings} from '$core/BaseSettings'
import {ComposedSong} from '$core/Songs/ComposedSong.svelte'
import {ComposerRenderer, type ComposerRendererState} from '$cmp/pages/Composer/ComposerRenderer'

afterEach(() => {
    for (const application of pixi.applications) application.ticker.destroy()
    vi.useRealTimers()
    pixi.applications.length = 0
    document.body.replaceChildren()
})

describe('ComposerRenderer rendering', () => {
    /**
     * SMOOTH SCROLLING OFF, stated rather than defaulted. It is the mode where a playback tick
     * applies itself inside update(), which is what the render counts below measure; with it on the
     * tick would only schedule and the Ticker would own what reaches the screen.
     */
    function makeInitialState(song: ComposedSong): ComposerRendererState {
        return {
            columns: song.columns,
            structureVersion: song.structureVersion,
            isPlaying: false,
            isRecordingAudio: false,
            instruments: song.instruments,
            selected: 0,
            currentLayer: 0,
            beatMarks: Number(ComposerSettings.data.beatMarks.value),
            columnsPerCanvas: Number(ComposerSettings.data.columnsPerCanvas.value),
            breakpoints: song.breakpoints,
            selectedColumns: [],
            smoothScroll: false,
            bpm: Number(ComposerSettings.data.bpm.value),
            lookaheadMs: Number(ComposerSettings.data.lookaheadTime.value),
        }
    }

    function mount(initialState: ComposerRendererState) {
        return new ComposerRenderer(
            document.createElement('div'),
            document.createElement('div'),
            initialState,
            {
                selectColumn: () => {},
                toggleBreakpoint: () => {},
                onGeometryChange: () => {},
            }
        )
    }

    it('repaints both static scenes only when update invalidates them', async () => {
        vi.useFakeTimers()
        const song = new ComposedSong('Composer render loop')
        const initialState = makeInitialState(song)
        const renderer = mount(initialState)

        await renderer.init()
        renderer.update(initialState)

        expect(pixi.applications).toHaveLength(2)
        const initialRenderCounts = pixi.applications.map(
            application => application.render.mock.calls.length
        )

        vi.advanceTimersByTime(32)
        expect(pixi.applications.map(application => application.render.mock.calls.length)).toEqual(
            initialRenderCounts
        )
        expect(initialRenderCounts).toEqual([1, 1])
        expect(pixi.applications.map(application => application.initOptions?.autoStart)).toEqual([
            false,
            false,
        ])

        renderer.update({...initialState, selected: 1})
        expect(pixi.applications.map(application => application.render.mock.calls.length)).toEqual([
            2, 2,
        ])

        renderer.destroy()
    })

    /**
     * THE FRAME LOOP, as wiring rather than as behaviour over time.
     *
     * `autoStart: false` survives from before the loop existed, and what it means has changed: the
     * Ticker is created and holds `Application.render` either way, so the flag only decides whether
     * it was started. The renderer then makes three further decisions on top of it, and all three
     * are here because each is a single line that nothing else would fail on.
     */
    it("leaves both Applications stopped at init, and owns the notes Application's rendering itself", async () => {
        vi.useFakeTimers()
        const song = new ComposedSong('Composer render loop')
        const renderer = mount(makeInitialState(song))
        await renderer.init()

        const [notes, timeline] = pixi.applications
        //NEITHER ticker runs: a composer that has not been asked to move anything schedules no
        //frames at all, which is what makes the render counts above mean something
        expect([notes.ticker.started, timeline.ticker.started]).toEqual([false, false])
        expect([notes.ticker.framesRequested, timeline.ticker.framesRequested]).toEqual([0, 0])

        //THE CAP lives on the notes ticker, which is the one the renderer runs
        expect(notes.ticker.maxFPS).toBe(30)
        expect(timeline.ticker.maxFPS).toBe(0)

        //PIXI'S OWN RENDER LISTENER IS GONE from the notes ticker, and the renderer's own callback
        //is the only thing on it. That is what makes "one render per frame that MOVED" possible:
        //pixi's listener renders on every tick regardless. The timeline keeps its listener, which
        //is harmless because its ticker is never started.
        expect(notes.ticker.listeners).toHaveLength(1)
        expect(notes.ticker.listeners[0].fn).not.toBe(notes.render)
        //...at the DEFAULT priority, above the LOW that a render listener would sit at, so a
        //callback that mutated the scene would do so before anything rendered it
        expect(notes.ticker.listeners[0].priority).toBe(0)
        expect(timeline.ticker.listeners.map(listener => listener.fn)).toEqual([timeline.render])

        //...and the column container is its own render group, so moving it is a matrix update
        //rather than a walk over every descendant. One line in init(), and the largest single item
        //in the per-frame budget.
        expect(notes.stage.children[0].isRenderGroup).toBe(true)

        renderer.destroy()
        //nothing of this class's is left on a ticker that could still fire
        expect([notes.ticker.started, timeline.ticker.started]).toEqual([false, false])
        expect(notes.ticker.listeners).toHaveLength(0)
    })
})
