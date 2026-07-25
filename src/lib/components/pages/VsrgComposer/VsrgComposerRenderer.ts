// Old: SIX files collapse into this ONE plain-TS renderer class, per spec section 6.2 and this
// task's own file list:
//   - src/components/pages/VsrgComposer/VsrgComposerCanvas.tsx (393 lines, the React class - owned
//     the wrapper div, the ONE `<Application>`, mount/unmount, theme/store subscriptions, the
//     wheel/pointer drag state machine, and `setTimestamp`/`selectHitObject`/the playback tick).
//   - VsrgKeysRenderer.tsx (124) - the per-key hitboxes + labels + accent playbar overlay.
//   - VsrgScrollableTrackRenderer.tsx (174) - the snap points + per-track hit objects + the
//     add/remove-time buttons at the end of the song, all riding one scrolling container.
//   - VsrgTrackRenderer.tsx (123) - one track's hit-object sprites (tap vs. held, selection ring).
//   - VsrgTimelineRenderer.tsx (117) - the top timeline strip: background, note overlay,
//     current-time marker, scrub thumb, click/drag-to-seek.
//   - VsrgTimelineBreakpointsRenderer.tsx (31) - breakpoint markers on that same timeline strip.
// ONE class, ONE `Application` (old rendered exactly one `<Application>` too - unlike
// ComposerRenderer.ts's two). Three PERSISTENT containers are added to the stage exactly once, in
// `init()`, in the SAME z-order old's JSX had (scrollable tracks -> keys -> timeline - see old
// VsrgComposerCanvas.tsx's `render()`): `scrollableTrackContainer`, `keysContainer`,
// `timelineContainer`. `draw()` (called from `update()` and every internal mutation) clears and
// rebuilds each container's CHILDREN every time - the same "full rebuild is cheap and trivially
// correct" choice ComposerRenderer.ts already made for an equivalent bounded-visible-window
// problem (here: the `lowerBound`/`upperBound` windowing each old sub-renderer already did).
//
// ARCHITECTURAL DIFFERENCE vs. ComposerRenderer.ts (disclosed, not an oversight): old's wheel/
// pointer handlers (`handleWheel`, `setIsDragging`, `setIsNotDragging`, `handleDrag`) were bound
// directly on the WRAPPER DIV via JSX props (`onWheel`, `onPointerDown`, ...), not wired by the
// class onto a canvas element it owns (unlike ComposerRenderer.ts, which called
// `wheelCanvas.addEventListener('wheel', ...)` itself). This port keeps that exact split: these
// four methods are PUBLIC here and called directly from VsrgComposerCanvas.svelte's own template
// bindings (`onwheel={(e) => renderer?.handleWheel(e)}`, etc.) - this class never attaches them to
// any DOM node itself, matching old's own architecture.
//
// TWO-TIER: none of these six old files read ANY game-dependent data (`$game`) - every `$config`
// import across all six (`DEFAULT_DOM_RECT`, `DEFAULT_VSRG_KEYS_MAP`, `PIXI_CENTER_X_END_Y`,
// `PIXI_VERTICAL_ALIGN`) is one of Task 1's game-INDEPENDENT `sharedConfig`/`legacyConfig`
// constants. `is-mobile`: named import (established convention, see ComposerRenderer.ts).
//
// RESTORED DEPENDENCY (disclosed, beyond Task 1's stated two-dep Tech Stack list): old's
// VsrgKeysRenderer.tsx AND VsrgScrollableTrackRenderer.tsx each independently called
// `useFontFaceObserver([{family: 'Bonobo'}])` (a hook wrapping the `fontfaceobserver` npm package,
// old dependency `^2.3.0` + `@types/fontfaceobserver ^2.1.3`) to swap key-label/button-label text
// from "Source Sans Pro" to the custom "Bonobo" webfont once it finishes loading. This is the
// FIRST real UI consumer of that old dependency in this tree, so it is restored here (exact old
// version, `package.json`) rather than hand-rolled against the raw `document.fonts` API - a small,
// well-known, dependency-free-of-its-own package (unlike `@spotify/basic-pitch`'s TensorFlow.js
// weight), and the conservative, parity-first choice per this wave's own binding conventions
// (minimal-diff port; restore-with-consumer). CONSOLIDATION (disclosed): old ran this exact same
// font-load check TWICE (once per component, each with its own local `textStyle` state + its own
// `useEffect` recomputing the identical formula off the identical flag). This port runs the check
// ONCE (`init()`) and exposes one shared `getTextStyle()` helper used by both the key labels and
// the add/remove-time button labels - a safe consolidation (identical resulting TextStyle either
// way), not a behavior change. Also NOT reproduced: old's brief "white 30px Source Sans Pro" FIRST
// PAINT (the `defaultVsrgTextStyle` placeholder used before the very first React effect ran) - a
// one-frame artifact of React's synchronous-render-then-effect model that has no equivalent moment
// in this synchronous class, same rationale as ComposerRenderer.ts's own disclosed decision not to
// reproduce ITS OWN two-phase mount-flash (see that file's header comment, item 3).
//
// UTILITIES RESTORED (restore-with-consumer): `ClickType` (enum) and `parseMouseClick` - both were
// deferred (no consumer) since P3 Task 2 relocated `Timer` out of old `$types/GeneralTypes.ts`;
// this task is their first real consumer (every snap-point/hit-object pointerdown here maps a
// native `PointerEvent.button` to a `ClickType` exactly like old did) - restored to
// `$core/utils/Utilities.ts` in this same commit.
//
// MOUNT-SEQUENCE SIMPLIFICATION (disclosed, load-bearing - read before "fixing" the call order
// below): old's `componentDidMount` LOOKS like it triggers `handleThemeChange`/`generateCache`
// FOUR times (subscribeTheme's synchronous first callback; an explicit `calculateSizes()` call; a
// dead `this.state.cache?.destroy()` read; and a final explicit `this.handleThemeChange(
// ThemeProvider)` call). Tracing React's actual ref/commit timing: `wrapperRef.current` is null
// during the FIRST render, so `<Application>` (and its `onInit={(app) => {this.app = app;
// this.calculateSizes()}}`, where `this.app` is finally assigned AND `calculateSizes()` runs a
// further time) is not rendered until a LATER re-render triggered by the very state updates
// `componentDidMount` schedules - meaning EVERY one of those four EARLIER triggers runs with
// `this.app` still null, so `generateCache`'s own `if (!this.app) return` guard (ported unchanged
// below) makes all four a no-op there. The cache is for-real generated exactly ONCE, by that
// `onInit`-triggered `calculateSizes()` call (which itself calls `generateCache()` at its own
// tail, and is ALSO what actually assigns `canvas.style.width`/`height` - `calculateSizes()` is
// the real unit of work here, not `generateCache()` alone). `init()` below reproduces that SAME
// observable outcome (theme colors known before the Application exists; one real
// `calculateSizes()` -> `generateCache()` pass once it does) without mechanically replaying dead
// calls whose old inertness depended on a React ref/batching model this synchronous class doesn't
// have - replaying them literally here (where field writes ARE synchronous) would actively destroy
// the just-generated cache via that `this.state.cache?.destroy()` line, a regression old never
// had. Disclosed deliberately, not silently dropped.
//
// CONSOLIDATED: old registered TWO independent `window.addEventListener('blur', ...)` handlers -
// one in this top-level class (resetting `isPressing`), one inside VsrgTimelineRenderer's own
// effect (resetting ITS OWN local `isClicking`, tracked here as `isClickingTimeline`). Collapsing
// six files into one class naturally merges these into a single `handleBlur` resetting both
// fields, registered once - identical combined behavior, not a behavior change.
//
// DROPPED (disclosed, both provably dead in old, not a behavior change): (1) VsrgTimelineRenderer's
// `hidden` prop - its ONE call site (`<VsrgTimelineRenderer hidden={false} .../>`) always passed
// `false`, so the `if (hidden) return null` branch never fired; no equivalent field is introduced
// here. (2) `audioSong` IS kept in `VsrgComposerRendererState` (Task 8 must still supply it per the
// interface contract) but - matching old exactly - is never actually READ anywhere in this class:
// VsrgTimelineRenderer.tsx declared `audioSong` in its own props type yet never destructured/used
// it in the function body either. A genuine old dead-prop, preserved as dead rather than silently
// wired up to something.
import { isMobile } from 'is-mobile'
import FontFaceObserver from 'fontfaceobserver'
import {
    Application,
    Container,
    Graphics,
    Sprite,
    Text,
    TextStyle,
    Rectangle,
    type FederatedPointerEvent,
} from 'pixi.js'
import { subscribeTheme } from '$core/theme/ThemeProvider.svelte'
import type { Theme } from '$core/theme/ThemeProvider.svelte'
import { t } from '$i18n/binding.svelte'
import { globalConfigStore } from '$stores/GlobalConfigStore.svelte'
import { vsrgComposerStore } from '$stores/VsrgComposerStore.svelte'
import type { VsrgComposerEvents } from '$stores/VsrgComposerStore.svelte'
import { ThrottledEventLoop } from '$core/ThrottledEventLoop'
import { clamp, getNearestTo, ClickType, parseMouseClick } from '$core/utils/Utilities'
import { DEFAULT_DOM_RECT, DEFAULT_VSRG_KEYS_MAP, PIXI_CENTER_X_END_Y, PIXI_VERTICAL_ALIGN } from '$core/legacyConfig'
import type { VsrgSong, VsrgHitObject, VsrgTrack } from '$core/Songs/VsrgSong'
import type { RecordedSong } from '$core/Songs/RecordedSong'
import type { RecordedNote } from '$core/Songs/SongClasses'
import { VsrgCanvasCache } from './VsrgComposerCache'

// Old: VsrgComposerCanvas.tsx's own exported type, used by both VsrgComposerCache.ts and (per
// Task 8) the VSRG composer page/keyboard - unchanged shape.
export type VsrgCanvasSizes = {
    el: DOMRect
    rawWidth: number
    rawHeight: number
    width: number
    height: number
    snapPointWidth: number
    keyHeight: number
    keyWidth: number
    scaling: number
    timelineSize: number
}
export type VsrgCanvasColors = {
    background_plain: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
    accent: [string, number]
}

// Mirrors old `VsrgCanvasProps`'s non-callback fields - the reactive input VsrgComposerCanvas.svelte
// pushes into `update()` on every relevant change via its own `$effect`.
export interface VsrgComposerRendererState {
    vsrg: VsrgSong
    isHorizontal: boolean
    isPlaying: boolean
    snapPoint: number
    scrollSnap: boolean
    snapPoints: number[]
    selectedHitObject: VsrgHitObject | null
    // Accepted for prop-shape parity with old (Task 8 supplies it) but never read here - see
    // header comment "DROPPED" item 2.
    audioSong: RecordedSong | null
    scaling: number
    maxFps: number
    renderableNotes: RecordedNote[]
    tempoChanger: number
}

// Mirrors old `VsrgCanvasProps`'s nine callback fields exactly.
export interface VsrgComposerRendererCallbacks {
    onKeyDown: (key: number) => void
    onKeyUp: (key: number) => void
    onAddTime: () => void
    onRemoveTime: () => void
    onTimestampChange: (timestamp: number) => void
    onSnapPointSelect: (timestamp: number, key: number, clickType?: ClickType) => void
    dragHitObject: (timestamp: number, key?: number) => void
    releaseHitObject: () => void
    selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void
}

export class VsrgComposerRenderer {
    private app: Application | null = null
    private cache: VsrgCanvasCache | null = null
    private themeDispose: (() => void) | null = null
    private throttledEventLoop = new ThrottledEventLoop(() => {}, 48)
    private cumulativeScroll = 0

    // Persistent scene containers (created once per renderer instance, children rebuilt on every
    // draw() - see header comment for why a full rebuild is used instead of an incremental diff).
    // Added to the stage, in THIS exact order, once in init() - old's own JSX z-order.
    private readonly scrollableTrackContainer = new Container()
    private readonly keysContainer = new Container()
    private readonly timelineContainer = new Container()

    private state: VsrgComposerRendererState
    private sizes: VsrgCanvasSizes = {
        el: { ...DEFAULT_DOM_RECT },
        rawWidth: 0,
        rawHeight: 0,
        width: 0,
        height: 0,
        snapPointWidth: 0,
        keyHeight: 0,
        keyWidth: 0,
        timelineSize: 0,
        scaling: 0,
    }
    private canvasColors: VsrgCanvasColors = {
        background_plain: ['#000000', 0],
        background: ['#000000', 0],
        background_10: ['#000000', 0],
        secondary: ['#ffffff', 0xffffff],
        lineColor: ['#ffffff', 0xffffff],
        lineColor_10: ['#ffffff', 0xffffff],
        accent: ['#ffffff', 0xffffff],
    }
    private timestamp = 0
    private isPressing = false
    private previousPosition = 0
    private preventClick = false
    private totalMovement = 0
    private draggedHitObject: VsrgHitObject | null = null
    // old: VsrgTimelineRenderer's own local `isClicking` state - consolidated here (see header
    // comment "CONSOLIDATED").
    private isClickingTimeline = false
    // old: VsrgKeysRenderer's/VsrgScrollableTrackRenderer's own local font-loaded state,
    // consolidated into one flag (see header comment).
    private isBonoboFontLoaded = false

    constructor(
        private readonly container: HTMLElement,
        initialState: VsrgComposerRendererState,
        private readonly callbacks: VsrgComposerRendererCallbacks,
    ) {
        this.state = initialState
    }

    // Old: `componentDidMount` + the `<Application onInit>` callback it depended on, collapsed
    // into one explicit async method (constructors cannot be async) - VsrgComposerCanvas.svelte's
    // `onMount` awaits this before ever calling `update()`. See header comment "MOUNT-SEQUENCE
    // SIMPLIFICATION" for why the call order below (theme first, then sizes, THEN the Application)
    // reproduces old's real observable behavior without replaying its dead/no-op calls.
    async init(): Promise<void> {
        this.themeDispose = subscribeTheme(this.handleThemeChange)
        this.calculateSizes()

        this.app = new Application()
        await this.app.init({
            width: this.sizes.rawWidth,
            height: this.sizes.rawHeight,
            background: this.canvasColors.background_plain[1],
            autoDensity: false,
            antialias: true,
            resolution: window?.devicePixelRatio || 1,
        })
        this.container.appendChild(this.app.canvas)

        this.app.stage.addChild(this.scrollableTrackContainer, this.keysContainer, this.timelineContainer)
        this.scrollableTrackContainer.eventMode = 'static'
        this.timelineContainer.eventMode = 'static'
        this.timelineContainer.on('pointermove', this.handleTimelineEvent)
        this.timelineContainer.on('pointerdown', this.handleTimelineClick)
        this.timelineContainer.on('pointerup', this.handleTimelineRelease)
        this.timelineContainer.on('pointerupoutside', this.handleTimelineRelease)

        window.addEventListener('resize', this.calculateSizes)
        vsrgComposerStore.addEventListener('ALL', { callback: this.handleEvent, id: 'vsrg-canvas-color-change' })
        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.changeMaxFps(this.state.maxFps)
        this.throttledEventLoop.start()
        window.addEventListener('blur', this.handleBlur)

        new FontFaceObserver('Bonobo').load().then(() => {
            this.isBonoboFontLoaded = true
            this.draw()
        }).catch(() => {
            // old (useFontFaceObserver's default Config param): `showErrors: false` - swallow.
        })

        // Old: `<Application onInit={(app) => {this.app = app; this.calculateSizes()}}>` - now
        // that the Application genuinely exists, re-run calculateSizes() (which sets the canvas's
        // inline width/height style AND generates the real cache at its own tail - see header
        // comment "MOUNT-SEQUENCE SIMPLIFICATION") and paint the first frame.
        this.calculateSizes()
        this.draw()
    }

    // Old: `calculateSizes`, bound to the resize listener AND called directly here/on VsrgComposerStore
    // events. Reads the container's OWN bounding rect (old read `wrapperRef.current.getBoundingClientRect()`).
    private calculateSizes = () => {
        const wrapperSizes = this.container.getBoundingClientRect()
        const { scaling, vsrg, snapPoint } = this.state
        const timelineSize = isMobile() ? 20 : 40
        const height = wrapperSizes.height - timelineSize
        const keysLength = DEFAULT_VSRG_KEYS_MAP[vsrg.keys].length
        this.sizes = {
            el: wrapperSizes,
            rawWidth: wrapperSizes.width,
            rawHeight: wrapperSizes.height,
            width: wrapperSizes.width,
            height,
            keyHeight: height / keysLength,
            keyWidth: wrapperSizes.width / keysLength,
            snapPointWidth: (60000 / vsrg.bpm) / snapPoint * scaling / 100,
            scaling: scaling / 100,
            timelineSize,
        }
        // old: "@pixi/react v8 only applies width/height at <Application> init; resize the
        // renderer explicitly so the drawing buffer tracks the container (e.g. on window resize)".
        // This port creates+resizes the Application directly (no @pixi/react layer) but still
        // needs this explicit resize on every recalculation to keep the drawing buffer in sync -
        // comment preserved for provenance.
        this.app?.renderer.resize(this.sizes.rawWidth, this.sizes.rawHeight)
        if (this.app) {
            // old queried `wrapperRef.current.querySelector('canvas')` because it had no direct
            // handle on the canvas @pixi/react created; this port creates+appends the canvas
            // itself, so `this.app.canvas` IS that same element - a direct reference, not a
            // behavior change.
            this.app.canvas.style.width = `${this.sizes.width}px`
            this.app.canvas.style.height = `${this.sizes.height + timelineSize}px`
        }
        this.generateCache()
    }

    // Old: `handleThemeChange`. Unlike ComposerRenderer's own version (which ignores the passed
    // `theme` param and re-reads the global `ThemeProvider` directly), old's VSRG version genuinely
    // used the callback argument - ported the same way.
    private handleThemeChange = (theme: Theme) => {
        const bgPlain = theme.get('primary')
        const bgLine = theme.getText('primary')
        const bgLine10 = bgLine.darken(0.5).desaturate(1)
        const bg = bgPlain.darken(0.15)
        const bg10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.canvasColors = {
            background_plain: [bgPlain.hex(), bgPlain.rgb().rgbNumber()],
            background: [bg.hex(), bg.rgb().rgbNumber()],
            background_10: [bg10.hex(), bg10.rgb().rgbNumber()],
            secondary: [secondary.hex(), secondary.rgb().rgbNumber()],
            lineColor: [bgLine.hex(), bgLine.rgb().rgbNumber()],
            lineColor_10: [bgLine10.hex(), bgLine10.rgb().rgbNumber()],
            accent: [accent.hex(), accent.rgb().rgbNumber()],
        }
        this.generateCache()
    }

    // Old: `generateCache`.
    private generateCache = () => {
        if (!this.app) return
        const trackColors = this.state.vsrg.tracks.map(track => track.color)
        // old quirk, preserved: sets the live renderer background from `background[0]` - the
        // DARKENED color's HEX STRING - not `background_plain[1]` (the un-darkened numeric the
        // Application was actually CREATED with in init()). pixi's ColorSource accepts a hex
        // string exactly as readily as a number, so this is not a runtime error - just an
        // apparently-unintended mismatch between the init-time and cache-generation-time
        // background in old. Flagged, not fixed.
        this.app.renderer.background.color = this.canvasColors.background[0]
        const newCache = new VsrgCanvasCache({
            app: this.app,
            sizes: this.sizes,
            colors: this.canvasColors,
            trackColors,
            isHorizontal: this.state.isHorizontal,
            playbarOffset: globalConfigStore.get().PLAY_BAR_OFFSET,
        })
        const oldCache = this.cache
        this.cache = newCache
        // old's automatic React re-render is what refreshed the visible sprites once this state
        // update landed - this explicit draw() is this port's synchronous equivalent (same
        // rationale ComposerRenderer.ts already documents for the identical situation).
        this.draw()
        // old: "//TODO not sure why pixi is still using old textures" - preserved verbatim, incl.
        // the 500ms delay before tearing down the PREVIOUS cache's textures.
        setTimeout(() => {
            oldCache?.destroy()
        }, 500)
    }

    // Old: `handleEvent`, the vsrgComposerStore 'ALL' listener.
    private handleEvent = (event: VsrgComposerEvents, data?: unknown) => {
        if (event === 'colorChange') this.generateCache()
        if (event === 'updateKeys') this.calculateSizes()
        if (event === 'updateOrientation') this.calculateSizes()
        if (event === 'snapPointChange') this.calculateSizes()
        if (event === 'tracksChange') this.generateCache()
        if (event === 'songLoad') this.calculateSizes()
        if (event === 'scaleChange') this.calculateSizes()
        if (event === 'maxFpsChange') this.throttledEventLoop.changeMaxFps(this.state.maxFps)
        if (event === 'timestampChange') this.setTimestamp(data as number)
    }

    // Old: `handleTick`, the ThrottledEventLoop-driven playback tick.
    private handleTick = (_elapsed: number, sinceLast: number) => {
        if (this.state.isPlaying) {
            this.setTimestamp(this.timestamp + sinceLast * this.state.tempoChanger)
        }
    }

    // Old: `handleBlur` - consolidated with VsrgTimelineRenderer's own blur handler (see header
    // comment "CONSOLIDATED").
    private handleBlur = () => {
        this.isPressing = false
        this.isClickingTimeline = false
    }

    // ---- wrapper-level wheel/pointer drag handlers (PUBLIC - called directly from
    // VsrgComposerCanvas.svelte's own onwheel/onpointerdown/onpointerup/onpointerleave/
    // onpointermove template bindings, matching old's own JSX-level wiring on the wrapper div -
    // see header comment "ARCHITECTURAL DIFFERENCE") ----

    // Old: `handleWheel`.
    handleWheel = (e: WheelEvent) => {
        if (this.state.scrollSnap) {
            this.cumulativeScroll += e.deltaY
            if (Math.abs(this.cumulativeScroll) < 100) return
            const { snapPoints } = this.state
            const nearestSnapPoint = snapPoints.findIndex(s => s > this.timestamp)
            const index = (nearestSnapPoint < 0 ? snapPoints.length : nearestSnapPoint) - 1 + (this.cumulativeScroll < 0 ? -1 : 1)
            this.cumulativeScroll = 0
            if (index < 0 || index >= snapPoints.length) return
            this.setTimestamp(snapPoints[index])
            return
        }
        const max = Math.max(0, this.timestamp + e.deltaY / 1.2)
        const min = Math.min(max, this.state.vsrg.duration)
        this.setTimestamp(min)
        if (this.draggedHitObject && this.timestamp > 0) {
            this.callbacks.dragHitObject(this.draggedHitObject.timestamp + e.deltaY / 1.2)
        }
    }

    // Old: `setIsDragging`.
    setIsDragging = (e: PointerEvent) => {
        if ((e.clientY - this.sizes.el.top) > this.sizes.timelineSize) {
            this.isPressing = true
            this.previousPosition = this.state.isHorizontal ? e.clientX : -e.clientY
        }
    }

    // Old: `setIsNotDragging`. Old's own signature accepted a pointer event it never read either -
    // dropped here (a trivial, disclosed signature simplification; the call sites below simply
    // don't pass one).
    setIsNotDragging = () => {
        if (!this.isPressing) return
        const draggedHitObject = this.draggedHitObject
        this.isPressing = false
        this.totalMovement = 0
        this.draggedHitObject = null
        // old: "//dumbass idk how to make otherwise" - preserved verbatim
        if (draggedHitObject) this.callbacks.releaseHitObject()
        setTimeout(() => {
            this.preventClick = false
            this.draw()
        }, 200)
        if (this.state.scrollSnap) {
            const { snapPoints } = this.state
            const index = snapPoints.findIndex(s => s > this.timestamp)
            // old quirk, preserved: `!index` also treats a match at index 0 as "not found" (0 is
            // falsy in JS), incorrectly skipping the snap for that one case - likely meant
            // `index === -1`/`index < 0` alone. Flagged, not fixed.
            if (!index || index < 0) return
            const next = snapPoints[index]
            const previous = snapPoints[index - 1]
            if (next === undefined || previous === undefined) return
            this.setTimestamp(getNearestTo(this.timestamp, previous, next))
        }
    }

    // Old: `handleDrag`.
    handleDrag = (e: PointerEvent) => {
        if (!this.isPressing) return
        const { sizes, timestamp, previousPosition, draggedHitObject, totalMovement } = this
        const { isHorizontal, vsrg } = this.state
        const deltaOrientation = isHorizontal ? e.clientX : -e.clientY
        const keyPosition = isHorizontal ? e.clientY - sizes.el.top - sizes.timelineSize : e.clientX - sizes.el.left
        const hoveredPosition = Math.floor(keyPosition / (isHorizontal ? sizes.keyHeight : sizes.keyWidth))
        const delta = (previousPosition - deltaOrientation) / sizes.scaling
        const newTotalMovement = totalMovement + Math.abs(delta)
        if (draggedHitObject !== null) {
            this.previousPosition = deltaOrientation
            const position = draggedHitObject.timestamp - delta
            this.callbacks.dragHitObject(Math.max(0, position), hoveredPosition)
            return
        }
        const max = Math.max(0, timestamp + delta)
        const min = Math.min(max, vsrg.duration)
        this.previousPosition = deltaOrientation
        this.preventClick = newTotalMovement > 50
        this.totalMovement = newTotalMovement
        this.setTimestamp(min)
    }

    // Old: `selectHitObject`.
    selectHitObject = (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => {
        if (clickType !== ClickType.Right) this.draggedHitObject = hitObject
        this.callbacks.selectHitObject(hitObject, trackIndex, clickType)
    }

    // Old: `setTimestamp`.
    setTimestamp = (timestamp: number) => {
        this.timestamp = timestamp
        this.callbacks.onTimestampChange(timestamp)
        this.draw()
    }

    // ---- timeline-internal pointer handlers (old: VsrgTimelineRenderer's own `handleEvent`/
    // `setClicking`/blur-driven `setNotClicking`) ----

    private handleTimelineEvent = (e: FederatedPointerEvent, override = false) => {
        if (!this.isClickingTimeline && !override) return
        const time = e.globalX / this.sizes.width * this.state.vsrg.duration
        this.setTimestamp(clamp(time, 0, this.state.vsrg.duration))
    }

    private handleTimelineClick = (e: FederatedPointerEvent) => {
        this.isClickingTimeline = true
        this.handleTimelineEvent(e, true)
    }

    private handleTimelineRelease = () => {
        this.isClickingTimeline = false
    }

    private getTextStyle(): TextStyle {
        return new TextStyle({
            fontFamily: this.isBonoboFontLoaded ? '"Bonobo"' : '"Source Sans Pro", Helvetica, sans-serif',
            fontSize: this.isBonoboFontLoaded ? 25 : 30,
            fill: this.canvasColors.lineColor[1],
        })
    }

    // The ONE entry point VsrgComposerCanvas.svelte's `$effect` calls on every reactive-state
    // change.
    update(state: VsrgComposerRendererState): void {
        this.state = state
        this.draw()
    }

    // Old: the pixi-scene half of `render()` (the DOM half lives in VsrgComposerCanvas.svelte's
    // template) + the three sub-renderers' own return trees. Rebuilds every container's children
    // fully on every call - see header comment for why that is the right tradeoff here.
    private draw(): void {
        if (!this.app) return
        this.drawKeys()
        const hasCache = this.cache !== null
        this.scrollableTrackContainer.visible = hasCache
        this.timelineContainer.visible = hasCache
        if (hasCache) {
            this.drawScrollableTracks()
            this.drawTimeline()
        } else {
            for (const child of this.scrollableTrackContainer.removeChildren()) child.destroy({ children: true })
            for (const child of this.timelineContainer.removeChildren()) child.destroy({ children: true })
        }
    }

    // Old: VsrgKeysRenderer.tsx. Always drawn (old rendered `<VsrgKeysRenderer>` unconditionally,
    // never gated on `cache`).
    private drawKeys(): void {
        for (const child of this.keysContainer.removeChildren()) child.destroy({ children: true })
        this.keysContainer.x = 0
        this.keysContainer.y = this.sizes.timelineSize

        const { isHorizontal, vsrg } = this.state
        const keys = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]
        const sizes = this.sizes
        const colors = this.canvasColors
        const keyHeight = sizes.height / keys.length
        const keyWidth = sizes.width / keys.length
        const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET

        const background = new Graphics()
        if (isHorizontal) {
            background.rect(0, 0, 60, sizes.height).fill({ color: colors.background_plain[1] })
            for (let i = 0; i < keys.length - 1; i++) {
                background.moveTo(0, keyHeight * (i + 1))
                background.lineTo(sizes.width, keyHeight * (i + 1))
            }
            background.stroke({ width: 2, color: colors.lineColor_10[1] })
            background.moveTo(59, 0)
            background.lineTo(59, sizes.height)
            background.stroke({ width: 2, color: colors.secondary[1] })
        } else {
            background.rect(0, sizes.height - 60, sizes.width, 60).fill({ color: colors.background_plain[1] })
            for (let i = 0; i < keys.length - 1; i++) {
                background.moveTo(keyWidth * (i + 1), 0)
                background.lineTo(keyWidth * (i + 1), sizes.height)
            }
            background.stroke({ width: 2, color: colors.lineColor_10[1] })
            background.moveTo(0, sizes.height - 60)
            background.lineTo(sizes.width, sizes.height - 60)
            background.stroke({ width: 2, color: colors.secondary[1] })
        }
        this.keysContainer.addChild(background)

        const playbar = new Graphics()
        if (isHorizontal) {
            playbar.moveTo(PLAY_BAR_OFFSET + 1, 0)
            playbar.lineTo(PLAY_BAR_OFFSET + 1, sizes.height)
            playbar.stroke({ width: 6, color: colors.accent[1] })
            for (let i = 0; i < keys.length; i++) {
                playbar.circle(PLAY_BAR_OFFSET + 1, keyHeight * (i + 0.5), 4).fill({ color: colors.accent[1] })
            }
        } else {
            const offset = sizes.height - PLAY_BAR_OFFSET - 1 - sizes.timelineSize
            playbar.moveTo(0, offset)
            playbar.lineTo(sizes.width, offset)
            playbar.stroke({ width: 6, color: colors.accent[1] })
            for (let i = 0; i < keys.length; i++) {
                playbar.circle(keyWidth * (i + 0.5) + 1, offset, 4).fill({ color: colors.accent[1] })
            }
        }
        this.keysContainer.addChild(playbar)

        const textStyle = this.getTextStyle()
        keys.forEach((_key, index) => {
            const hitArea = new Rectangle(
                isHorizontal ? 0 : keyWidth * index,
                isHorizontal ? keyHeight * index : sizes.height - 60,
                isHorizontal ? 60 : sizes.width,
                isHorizontal ? keyHeight : 60,
            )
            const keyContainer = new Container()
            keyContainer.hitArea = hitArea
            keyContainer.eventMode = 'static'
            keyContainer.on('pointerdown', () => this.callbacks.onKeyDown(index))
            keyContainer.on('pointerup', () => this.callbacks.onKeyUp(index))
            keyContainer.on('pointerupoutside', () => this.callbacks.onKeyUp(index))
            keyContainer.addChild(new Text({
                text: `${index + 1}`,
                style: textStyle,
                anchor: 0.5,
                x: isHorizontal ? 30 : keyWidth * index + keyWidth / 2,
                y: isHorizontal ? keyHeight * index + keyHeight / 2 : sizes.height - 30,
            }))
            this.keysContainer.addChild(keyContainer)
        })
    }

    // Old: VsrgScrollableTrackRenderer.tsx.
    private drawScrollableTracks(): void {
        for (const child of this.scrollableTrackContainer.removeChildren()) child.destroy({ children: true })
        const cache = this.cache
        if (!cache) return
        const { isHorizontal, vsrg, snapPoint, snapPoints, selectedHitObject } = this.state
        const sizes = this.sizes
        const timestamp = this.timestamp
        const preventClick = this.preventClick
        const scale = sizes.scaling
        const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET

        this.scrollableTrackContainer.x = isHorizontal ? (-timestamp * scale + PLAY_BAR_OFFSET) : 0
        this.scrollableTrackContainer.y = isHorizontal ? sizes.timelineSize : (timestamp * scale - PLAY_BAR_OFFSET)

        const lowerBound = timestamp - (PLAY_BAR_OFFSET + cache.textures.snapPoints.size) / scale
        const upperBound = timestamp + ((isHorizontal ? sizes.width : sizes.height) - PLAY_BAR_OFFSET) / scale
        const snapPointSize = cache.textures.snapPoints.size

        const handleSnapPointClick = (event: FederatedPointerEvent) => {
            if (preventClick) return
            const target = event.target as Sprite
            if (isHorizontal) {
                const y = event.globalY - sizes.timelineSize
                const x = target.x / scale
                this.callbacks.onSnapPointSelect(x, Math.floor(y / sizes.keyHeight), parseMouseClick(event.button))
            } else {
                const y = Math.abs(Math.floor(target.y - sizes.height + snapPointSize) / scale)
                const x = target.x
                this.callbacks.onSnapPointSelect(y, Math.floor(x / sizes.keyWidth), parseMouseClick(event.button))
            }
        }

        snapPoints.forEach((sp, i) => {
            if (lowerBound > sp || sp > upperBound) return
            const sprite = new Sprite(i % snapPoint ? cache.textures.snapPoints.small! : cache.textures.snapPoints.large!)
            sprite.eventMode = 'static'
            sprite.on('pointertap', handleSnapPointClick)
            sprite.x = isHorizontal ? sp * scale : 0
            sprite.y = isHorizontal ? 0 : -(sp * scale - sizes.height + snapPointSize)
            this.scrollableTrackContainer.addChild(sprite)
        })

        if (lowerBound < 0) {
            const sprite = new Sprite(cache.textures.snapPoints.empty!)
            sprite.x = isHorizontal ? -PLAY_BAR_OFFSET : 0
            sprite.y = isHorizontal ? 0 : sizes.height
            this.scrollableTrackContainer.addChild(sprite)
        }

        vsrg.tracks.forEach((track, index) => {
            this.drawTrack(track, index, cache, selectedHitObject)
        })

        if (timestamp >= vsrg.duration - (isHorizontal ? sizes.width : sizes.height) / scale) {
            const textStyle = this.getTextStyle()
            const addTimeText = t('vsrg_composer:click_to_add_time')
            const removeTimeText = t('vsrg_composer:click_to_remove_time')

            const addTimeContainer = new Container()
            addTimeContainer.eventMode = 'static'
            addTimeContainer.on('pointertap', () => this.callbacks.onAddTime())
            addTimeContainer.x = isHorizontal ? vsrg.duration * scale : 0
            addTimeContainer.y = isHorizontal ? 0 : -(vsrg.duration * scale - sizes.height + cache.textures.buttons.height)
            addTimeContainer.addChild(new Sprite(cache.textures.buttons.time!))
            addTimeContainer.addChild(new Text({
                text: addTimeText,
                style: textStyle,
                anchor: 0.5,
                x: cache.textures.buttons.width / 2,
                y: cache.textures.buttons.height / 2,
            }))
            this.scrollableTrackContainer.addChild(addTimeContainer)

            const removeTimeContainer = new Container()
            removeTimeContainer.eventMode = 'static'
            removeTimeContainer.on('pointertap', () => this.callbacks.onRemoveTime())
            removeTimeContainer.x = isHorizontal ? vsrg.duration * scale : sizes.width / 2
            removeTimeContainer.y = isHorizontal ? sizes.height / 2 : -(vsrg.duration * scale - sizes.height + cache.textures.buttons.height)
            removeTimeContainer.addChild(new Sprite(cache.textures.buttons.time!))
            removeTimeContainer.addChild(new Text({
                text: removeTimeText,
                style: textStyle,
                anchor: 0.5,
                x: cache.textures.buttons.width / 2,
                y: cache.textures.buttons.height / 2,
            }))
            this.scrollableTrackContainer.addChild(removeTimeContainer)
        }
    }

    // Old: VsrgTrackRenderer.tsx - one track's hit-object sprites, appended directly into
    // `scrollableTrackContainer` (matching old, where `VsrgTrackRenderer` rendered a `<Fragment>`/
    // bare list of siblings directly under `VsrgScrollableTrackRenderer`'s own container, not a
    // per-track wrapper container).
    private drawTrack(track: VsrgTrack, trackIndex: number, cache: VsrgCanvasCache, selectedHitObject: VsrgHitObject | null): void {
        const { isHorizontal, vsrg } = this.state
        const sizes = this.sizes
        const timestamp = this.timestamp
        const scale = sizes.scaling
        const keys = vsrg.keys
        const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET
        const positionSizeHorizontal = sizes.height / keys
        const positionSizeVertical = sizes.width / keys
        const lowerBound = timestamp - PLAY_BAR_OFFSET / scale - cache.textures.sizes.hitObject
        const upperBound = timestamp + (isHorizontal ? sizes.width : sizes.height) / scale - PLAY_BAR_OFFSET + cache.textures.sizes.hitObject

        track.hitObjects.forEach(hitObject => {
            if (lowerBound > hitObject.timestamp + hitObject.holdDuration || hitObject.timestamp > upperBound) return
            const x = isHorizontal
                ? hitObject.timestamp * scale
                : positionSizeVertical * hitObject.index + positionSizeVertical / 2
            const y = isHorizontal
                ? positionSizeHorizontal * hitObject.index + positionSizeHorizontal / 2
                : -(hitObject.timestamp * scale - sizes.height)

            const onPointerDown = (e: FederatedPointerEvent) => {
                this.selectHitObject(hitObject, trackIndex, parseMouseClick(e.button))
            }

            if (hitObject.isHeld) {
                const container = new Container()
                container.eventMode = 'static'
                container.on('pointerdown', onPointerDown)

                const trail = new Sprite(cache.getHeldTrailCache(track.color))
                if (isHorizontal) {
                    trail.anchor = { x: 0, y: 0.5 }
                    trail.height = cache.textures.sizes.trail
                    trail.width = hitObject.holdDuration * scale
                } else {
                    trail.anchor = PIXI_CENTER_X_END_Y
                    trail.width = cache.textures.sizes.trail
                    trail.height = hitObject.holdDuration * scale
                }
                trail.x = x
                trail.y = y
                container.addChild(trail)

                const startCap = new Sprite(cache.getHeldHitObjectCache(track.color))
                startCap.anchor = 0.5
                startCap.x = x
                startCap.angle = 45
                startCap.y = y
                container.addChild(startCap)

                const endCap = new Sprite(cache.getHeldHitObjectCache(track.color))
                endCap.anchor = 0.5
                endCap.x = isHorizontal ? (hitObject.timestamp + hitObject.holdDuration) * scale : x
                endCap.y = isHorizontal ? y : (y - hitObject.holdDuration * scale)
                container.addChild(endCap)

                if (hitObject === selectedHitObject) {
                    const ring = new Sprite(cache.getSelectionRingsCache(track.color))
                    ring.anchor = 0.5
                    ring.x = x
                    ring.y = y
                    container.addChild(ring)
                }
                this.scrollableTrackContainer.addChild(container)
            } else {
                if (hitObject === selectedHitObject) {
                    const ring = new Sprite(cache.getSelectionRingsCache(track.color))
                    ring.anchor = 0.5
                    ring.x = x
                    ring.y = y
                    this.scrollableTrackContainer.addChild(ring)
                }
                const sprite = new Sprite(cache.getHitObjectCache(track.color))
                sprite.eventMode = 'static'
                sprite.on('pointerdown', onPointerDown)
                sprite.anchor = 0.5
                sprite.x = x
                sprite.y = y
                this.scrollableTrackContainer.addChild(sprite)
            }
        })
    }

    // Old: VsrgTimelineRenderer.tsx + VsrgTimelineBreakpointsRenderer.tsx (inlined here - see
    // ComposerRenderer.ts's own precedent for inlining a `memo`-wrapped breakpoints sub-component,
    // same rationale: no separate component tree left to memo against).
    private drawTimeline(): void {
        for (const child of this.timelineContainer.removeChildren()) child.destroy({ children: true })
        const cache = this.cache
        if (!cache) return
        const { vsrg: song, renderableNotes: notes } = this.state
        const sizes = this.sizes
        const timestamp = this.timestamp
        const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET

        this.timelineContainer.x = 0
        this.timelineContainer.y = 0
        this.timelineContainer.hitArea = new Rectangle(0, 0, sizes.width, sizes.timelineSize)

        const lowerBound = timestamp - (PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling
        const upperBound = timestamp + (sizes.width - PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling
        const relativeTimestampPosition = timestamp / song.duration

        this.timelineContainer.addChild(new Sprite(cache.textures.timeline.square!))

        const notesContainer = new Container()
        notesContainer.x = -timestamp * sizes.scaling + PLAY_BAR_OFFSET
        notesContainer.y = 0
        notes.forEach(note => {
            if (note.time < lowerBound || note.time > upperBound) return
            const sprite = new Sprite(cache.textures.timeline.note!)
            sprite.x = note.time * sizes.scaling
            sprite.anchor = PIXI_VERTICAL_ALIGN
            notesContainer.addChild(sprite)
        })
        this.timelineContainer.addChild(notesContainer)

        const breakpointsContainer = new Container()
        song.breakpoints.forEach(breakpoint => {
            const sprite = new Sprite(cache.textures.timeline.breakpoint!)
            sprite.x = breakpoint / song.duration * sizes.width
            breakpointsContainer.addChild(sprite)
        })
        this.timelineContainer.addChild(breakpointsContainer)

        const currentTime = new Sprite(cache.textures.timeline.currentTime!)
        currentTime.x = PLAY_BAR_OFFSET - 2
        currentTime.y = 0
        this.timelineContainer.addChild(currentTime)

        const thumb = new Sprite(cache.textures.timeline.thumb!)
        thumb.y = 0
        thumb.x = relativeTimestampPosition * sizes.width
        this.timelineContainer.addChild(thumb)
    }

    // Old: `componentWillUnmount`. The explicit `Application.destroy()` call is a REQUIRED
    // addition beyond old (which never destroyed the pixi Application itself - `@pixi/react`'s
    // `<Application>` owned and destroyed it automatically on React unmount, an ownership layer
    // this port doesn't have - identical rationale to ComposerRenderer.ts's own `destroy()`, see
    // its header comment item 2). Skipping it would be a genuine WebGL-context/canvas leak on
    // every unmount, not a preservable old "quirk".
    destroy(): void {
        window.removeEventListener('resize', this.calculateSizes)
        window.removeEventListener('blur', this.handleBlur)
        vsrgComposerStore.removeEventListener('ALL', { id: 'vsrg-canvas-color-change' })
        this.themeDispose?.()
        this.cache?.destroy()
        this.throttledEventLoop.stop()
        this.app?.destroy(true, { children: true })
        this.app = null
    }
}
