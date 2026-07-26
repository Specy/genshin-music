// Old: THREE files collapse into this ONE plain-TS renderer class, per this task's brief and the
// same "Canvas.tsx owns pixi, Canvas.svelte owns lifecycle DOM" split VsrgComposerRenderer.ts (P4c
// Task 7) already established:
//   - src/components/pages/VsrgPlayer/VsrgPlayerCanvas.tsx (385 lines, the React class - owned the
//     wrapper div, the ONE `<Application>`, mount/unmount, keyboard/theme/current-song/event-bus
//     subscriptions, `calculateSizes`/`generateCache`/`generateAccuracyBounds`/`getHitRating`, the
//     keyboard-press hit-detection state machine, and the `ThrottledEventLoop`-driven playback tick).
//   - VsrgHitObjectsRenderer.tsx (101 lines) - the one pixi sub-tree old's canvas class rendered:
//     a single scrolling container holding every currently-visible hit-object's sprites (tap vs.
//     held, plus the connecting "line" sprite between simultaneous notes on different keys).
//   - VsrgPlayerAccuracyRenderer.tsx (17 lines) - DROPPED, not ported as a method: verified via a
//     repo-wide grep of the whole old branch that NOTHING ever imports it (old's own canvas class
//     never rendered `<VsrgPlayerAccuracyRenderer>` either), and its own body is a bare
//     `<pixiContainer></pixiContainer>` behind a `//TODO might implement` comment - a stub with zero
//     observable behavior. There is nothing here to reproduce; collapsing a no-op into this file
//     would add a private method that is never called, not "cover" any missing behavior.
//
// ONE class, ONE `Application` (old rendered exactly one `<Application>` too). ONE persistent
// container (`hitObjectsContainer`) is added to the stage exactly once, in `init()` - old's own
// pixi tree was already just the single `VsrgHitObjectsRenderer` sub-tree, unlike
// VsrgComposerRenderer.ts's three. `draw()` (called from every internal mutation that would have
// triggered an old React re-render) clears and rebuilds the container's children every time - the
// same "full rebuild is cheap and trivially correct" choice VsrgComposerRenderer.ts already made.
//
// ARCHITECTURAL DIFFERENCE vs. VsrgComposerRenderer.ts (disclosed, not an oversight): old's
// VsrgPlayerCanvas OWNED `song`/`timestamp`/`accuracy`/`sizes`/`colors`/`cache`/
// `renderableHitObjects`/`accuracyBounds` as its OWN React state (subscribing directly to
// `subscribeCurrentVsrgSong` itself to learn which song to play), NOT as props threaded in from its
// parent - unlike VsrgComposerCanvas.tsx, which was a fully prop-controlled dumb component. This
// port keeps that same split: everything above lives as PRIVATE fields on this class (mirroring
// old's `this.state`), while only old's real four props (`isPlaying`, `scrollSpeed`,
// `keyboardLayout`, `maxFps`) plus the three callbacks are pushed reactively from
// VsrgPlayerCanvas.svelte's own `$effect`, via `update()` - see `VsrgPlayerRendererState` below.
// `keyboardLayout` is accepted for prop-shape parity with old's `VsrgPlayerCanvasProps` but - like
// old itself - never actually read anywhere in this class's body (verified against the raw old
// blob: declared in the props interface, never destructured/used in the class); a genuine old
// dead-prop, preserved as dead rather than silently wired up to something (same treatment
// VsrgComposerRendererState.audioSong already got from Task 7).
//
// NEW CALLBACK (disclosed, beyond old's exact three - `onSizeChange`/`onTick`/`playHitObject`):
// `onTimestampChange`. Old's own `render()` used its internal `timestamp` (+ the `scrollSpeed` prop)
// to decide whether to show the DOM `<VsrgPlayerCountDown>` sibling and what number to give it
// (`(timestamp + scrollSpeed) < 0 ? Math.abs(Math.ceil((timestamp + scrollSpeed) / 1000 * 2)) + 1 :
// hidden`) - trivial for old, since that DOM child lived in the SAME React class as this pixi state.
// This port's Canvas.svelte owns that DOM sibling instead (matching the Composer/VsrgComposer split:
// renderer-internal, DOM-only derived values cross the class boundary via a callback, e.g.
// ComposerRenderer.ts's `onGeometryChange`) - so this renderer reports raw `timestamp` on every
// change and Canvas.svelte recomputes the identical formula itself with its own `scrollSpeed` prop.
//
// TWO-TIER: no `$config`/`$game` data at all in any of the three old files (same as
// VsrgComposerRenderer.ts) - `DEFAULT_DOM_RECT`/`PIXI_CENTER_X_END_Y` are Task 1's game-independent
// `sharedConfig` constants (re-exported through the `legacyConfig` allowlist).
//
// PRESERVED QUIRKS (verified against the raw old blob, not fixed):
// (1) `handleKeyboard` mutates `rho.status` on an existing `RenderableHitObject` DIRECTLY, without
//     ever calling `setState` - old's own key-press visual feedback therefore never repaints
//     immediately on keydown/keyup; it only becomes visible on the NEXT `ThrottledEventLoop` tick
//     (whose `validateHitObjects` call always ends in a real `setState`/here, `draw()`). This port
//     reproduces the same latency: `handleKeyboard` below mutates `.status` and does NOT call
//     `draw()` itself.
// (2) `componentWillUnmount` resets the shared `vsrgPlayerStore`'s keyboard layout to the 4-key
//     keybind mapping UNCONDITIONALLY on destroy, regardless of what layout (4 or 6 keys) was
//     active - reproduced verbatim in `destroy()` below.
// (3) `calculateSizes`'s `this.props.onSizeChange(sizes)` call is UNGATED on the Application
//     existing (it fires from `componentDidMount`, a window resize, `onSongPick`, and the `onInit`
//     callback alike) - `onSizeChange` below is called every time `calculateSizes()` runs, even
//     during the brief window before `this.app` exists, exactly matching old.
// (4) `getScore`'s `baseScoreMap[type] ?? 0` fallback (VsrgPlayerStore.svelte.ts, not this file) and
//     this file's OWN "accuracy" field are unchanged old constants, not reproduced here again.
//
// MOUNT-SEQUENCE (same reasoning as VsrgComposerRenderer.ts's own header comment, "MOUNT-SEQUENCE
// SIMPLIFICATION" - not repeated in full here): old's `componentDidMount` synchronously subscribes
// to theme (whose FIRST callback fires synchronously, per that same established mechanism) and
// calls `calculateSizes()` once, both while `this.app` is still null (pixi.js v8's `Application
// .init()` is asynchronous, so `<Application onInit>` cannot fire until a LATER microtask at the
// earliest) - so `generateCache`'s `if (!app) return` guard makes every pre-Application call a
// no-op, and the cache is for-real generated exactly once, by the `onInit`-triggered
// `calculateSizes()` -> `generateCache()` pass. `init()` below reproduces that same observable
// outcome directly (theme subscribe -> sizes -> create+await the real Application -> sizes again,
// which now actually builds the cache) rather than mechanically replaying dead calls.
import { Application, Container, Sprite } from 'pixi.js'
import { subscribeTheme } from '$core/theme/ThemeProvider.svelte'
import type { Theme } from '$core/theme/ThemeProvider.svelte'
import { keyBinds } from '$stores/KeybindsStore.svelte'
import {
    subscribeCurrentVsrgSong,
    vsrgPlayerStore,
} from '$stores/VsrgPlayerStore.svelte'
import type {
    KeyboardKey,
    VsrgKeyboardPressType,
    VsrgPlayerEvent,
    VsrgPlayerHitType,
    VsrgPlayerSong,
} from '$stores/VsrgPlayerStore.svelte'
import { ThrottledEventLoop } from '$core/ThrottledEventLoop'
import { isNumberCloseTo } from '$core/utils/Utilities'
import { DEFAULT_DOM_RECT, PIXI_CENTER_X_END_Y } from '$core/legacyConfig'
import { VsrgSong } from '$core/Songs/VsrgSong'
import type { VsrgAccuracyBounds, VsrgHitObject } from '$core/Songs/VsrgSong'
import type { VsrgKeyboardLayout } from './VsrgPlayerKeyboard.svelte'
import { VsrgPlayerCache } from './VsrgPlayerCache'

// Old: VsrgPlayerCanvas.tsx's own exported type - unchanged shape, now the shared home for
// VsrgPlayerCache.ts's type-only import back (see that file's header comment).
export type VsrgPlayerCanvasColors = {
    background_plain: [string, number]
    background_layer_10: [string, number]
    background: [string, number]
    background_10: [string, number]
    secondary: [string, number]
    lineColor: [string, number]
    lineColor_10: [string, number]
    accent: [string, number]
}

// Old: VsrgPlayerCanvas.tsx's own exported type - **exported**, per this task's brief: the page
// holds it in state and feeds `verticalOffset`/`hitObjectSize` to VsrgPlayerKeyboard.svelte.
export type VsrgPlayerCanvasSizes = {
    el: DOMRect
    rawWidth: number
    rawHeight: number
    width: number
    height: number
    keyWidth: number
    hitObjectSize: number
    scaling: number
    verticalOffset: number
}

// Old: VsrgPlayerCanvas.tsx's own exported default - defined here (the renderer module) AND
// separately, verbatim, in the +page.svelte route (see that file's own comment for why: the page
// must never statically import this module, since importing it pulls in `pixi.js`).
export const defaultVsrgPlayerSizes: VsrgPlayerCanvasSizes = {
    el: { ...DEFAULT_DOM_RECT },
    rawWidth: 0,
    rawHeight: 0,
    width: 0,
    height: 0,
    keyWidth: 0,
    hitObjectSize: 0,
    scaling: 0,
    verticalOffset: 0,
}

// Old: VsrgPlayerCanvas.tsx's own exported enum/class - unchanged.
export enum HitObjectStatus {
    Idle,
    Pressed,
    Missed,
    Hit,
}

export class RenderableHitObject {
    hitObject: VsrgHitObject
    color: string = '#FFFFFF'
    status = HitObjectStatus.Idle
    instrumentIndex: number = 0
    // will be used to give score only every N ms
    heldScoreTimeout = 0

    constructor(hitObject: VsrgHitObject) {
        this.hitObject = hitObject
    }
}

// Mirrors old `VsrgPlayerCanvasProps`'s four non-callback fields - the reactive input
// VsrgPlayerCanvas.svelte pushes into `update()` on every relevant change via its own `$effect`.
export interface VsrgPlayerRendererState {
    isPlaying: boolean
    scrollSpeed: number
    // Dead prop, kept for parity - see header comment.
    keyboardLayout: VsrgKeyboardLayout
    maxFps: number
}

// Mirrors old `VsrgPlayerCanvasProps`'s three callback fields, plus the one new
// `onTimestampChange` addition disclosed in the header comment above.
export interface VsrgPlayerRendererCallbacks {
    onSizeChange: (sizes: VsrgPlayerCanvasSizes) => void
    onTick: (timestamp: number) => void
    playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void
    onTimestampChange: (timestamp: number) => void
}

export class VsrgPlayerRenderer {
    private app: Application | null = null
    private cache: VsrgPlayerCache | null = null
    private themeDispose: (() => void) | null = null
    private currentSongDispose: (() => void) | null = null
    private throttledEventLoop: ThrottledEventLoop

    // Persistent scene container (created once per renderer instance, children rebuilt on every
    // draw() - see header comment). Added to the stage once in init().
    private readonly hitObjectsContainer = new Container()

    private state: VsrgPlayerRendererState

    // ---- old: VsrgPlayerCanvas.tsx's OWN React state (`this.state`), not pushed from outside -
    // see header comment "ARCHITECTURAL DIFFERENCE". ----
    private song: VsrgSong = new VsrgSong('')
    private timestamp = 0
    private readonly accuracy = 150
    private sizes: VsrgPlayerCanvasSizes = { ...defaultVsrgPlayerSizes }
    private colors: VsrgPlayerCanvasColors = {
        background_plain: ['#000000', 0],
        background_layer_10: ['#000000', 0],
        background: ['#000000', 0],
        background_10: ['#000000', 0],
        secondary: ['#000000', 0],
        lineColor: ['#000000', 0],
        lineColor_10: ['#000000', 0],
        accent: ['#000000', 0],
    }
    private renderableHitObjects: RenderableHitObject[] = []
    private accuracyBounds: VsrgAccuracyBounds = [0, 0, 0, 0, 0]

    constructor(
        private readonly container: HTMLElement,
        initialState: VsrgPlayerRendererState,
        private readonly callbacks: VsrgPlayerRendererCallbacks,
    ) {
        this.state = initialState
        // Old: `this.throttledEventLoop = new ThrottledEventLoop(() => {}, this.props.maxFps)` -
        // read directly at construction time (unlike VsrgComposerRenderer.ts's own hardcoded-48
        // placeholder - old's VsrgPlayerCanvas constructor genuinely had `this.props` available
        // immediately via `super(props)`, so this port matches that exactly).
        this.throttledEventLoop = new ThrottledEventLoop(() => {}, initialState.maxFps)
    }

    // Old: `componentDidMount` + the `<Application onInit>` callback it depended on, collapsed into
    // one explicit async method (constructors cannot be async) - VsrgPlayerCanvas.svelte's
    // `onMount` awaits this before ever calling `update()`. See header comment "MOUNT-SEQUENCE" for
    // why the call order below reproduces old's real observable behavior.
    async init(): Promise<void> {
        this.themeDispose = subscribeTheme(this.handleThemeChange)
        vsrgPlayerStore.addKeyboardListener({ callback: this.handleKeyboard, id: 'vsrg-player-canvas' })
        this.currentSongDispose = subscribeCurrentVsrgSong(this.onSongPick)
        vsrgPlayerStore.addEventListener(this.handleVsrgEvent, 'vsrg-player-canvas')
        window.addEventListener('resize', this.calculateSizes)
        this.calculateSizes()

        const devicePixelRatio = window.devicePixelRatio ?? 1.4
        this.app = new Application()
        await this.app.init({
            width: this.sizes.rawWidth,
            height: this.sizes.rawHeight,
            backgroundAlpha: 0,
            autoDensity: false,
            antialias: true,
            resolution: devicePixelRatio,
        })
        this.container.appendChild(this.app.canvas)
        this.app.stage.addChild(this.hitObjectsContainer)
        this.hitObjectsContainer.sortableChildren = true

        this.throttledEventLoop.setCallback(this.handleTick)
        this.throttledEventLoop.changeMaxFps(this.state.maxFps)
        this.throttledEventLoop.start()

        // Old: `<Application onInit={(app) => { this.app = app; this.calculateSizes() }}>` - now
        // that the Application genuinely exists, re-run calculateSizes() (which now actually builds
        // the cache at its own tail - see header comment) and paint the first frame.
        this.calculateSizes()
        this.draw()
    }

    // Old: `onSongPick` (the `subscribeCurrentVsrgSong` callback).
    private onSongPick = ({ type, song }: VsrgPlayerSong) => {
        vsrgPlayerStore.resetScore()
        const { scrollSpeed } = this.state
        if (type === 'play' && song) {
            const countDown = 3000 / 2
            this.song = song
            this.timestamp = -countDown - scrollSpeed
            this.renderableHitObjects = []
            song.startPlayback(0)
            this.calculateSizes()
            this.generateAccuracyBounds()
            this.callbacks.onTimestampChange(this.timestamp)
        }
        if (type === 'stop') {
            this.song = new VsrgSong('')
            this.timestamp = 0
            this.renderableHitObjects = []
            this.callbacks.onTimestampChange(this.timestamp)
            this.draw()
        }
    }

    // Old: `componentWillUnmount`. The explicit `Application.destroy()` call is a REQUIRED addition
    // beyond old (same rationale as VsrgComposerRenderer.ts's own `destroy()` - `@pixi/react` owned
    // and destroyed the Application automatically on React unmount, an ownership layer this port
    // doesn't have; skipping it would be a genuine WebGL-context/canvas leak on every unmount).
    destroy(): void {
        this.throttledEventLoop.stop()
        // Old quirk, preserved verbatim - see header comment (2).
        vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(4))
        vsrgPlayerStore.removeKeyboardListener({ id: 'vsrg-player-canvas' })
        this.currentSongDispose?.()
        this.themeDispose?.()
        vsrgPlayerStore.removeEventListener('vsrg-player-canvas')
        window.removeEventListener('resize', this.calculateSizes)
        this.cache?.destroy()
        this.app?.destroy(true, { children: true })
        this.app = null
    }

    // Old: `handleVsrgEvent`, the vsrgPlayerStore event-bus listener.
    private handleVsrgEvent = (data: VsrgPlayerEvent) => {
        if (data === 'fpsChange') this.throttledEventLoop.changeMaxFps(this.state.maxFps)
    }

    // Old: `handleKeyboard`. See header comment preserved-quirk (1): mutates `.status` directly,
    // no `draw()` call here - the next tick's `validateHitObjects` is what repaints it.
    private handleKeyboard = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
        const { renderableHitObjects, timestamp, accuracy } = this
        // rho = renderable hit object
        const rho = renderableHitObjects.find(r => r.hitObject.index === key.index)
        if (!rho) return
        if (type === 'down') {
            const isInRange = isNumberCloseTo(rho.hitObject.timestamp, timestamp, accuracy)
            const isIdle = rho.status === HitObjectStatus.Idle
            if (isInRange && isIdle) {
                if (!rho.hitObject.isHeld) {
                    rho.status = HitObjectStatus.Hit
                } else {
                    rho.status = HitObjectStatus.Pressed
                }
                this.callbacks.playHitObject(rho.hitObject, rho.instrumentIndex)
                vsrgPlayerStore.incrementScore(this.getHitRating(rho.hitObject, timestamp))
            }
        }
        if (type === 'up') {
            if (rho.hitObject.isHeld) {
                if (isNumberCloseTo(rho.hitObject.timestamp + rho.hitObject.holdDuration, timestamp, accuracy)) {
                    rho.status = HitObjectStatus.Hit
                } else {
                    rho.status = HitObjectStatus.Missed
                    vsrgPlayerStore.incrementScore('miss')
                }
            }
        }
    }

    // Old: `calculateSizes`, bound to the resize listener AND called directly at mount/song-pick.
    // See header comment preserved-quirk (3): `onSizeChange` fires unconditionally here.
    private calculateSizes = () => {
        const el = this.container
        const width = el.clientWidth
        const keyWidth = width / this.song.keys
        const hitObjectSize = keyWidth * 0.6
        const sizes: VsrgPlayerCanvasSizes = {
            width,
            height: el.clientHeight,
            rawWidth: width,
            rawHeight: el.clientHeight,
            el: el.getBoundingClientRect(),
            keyWidth,
            hitObjectSize,
            scaling: el.clientHeight / this.state.scrollSpeed,
            verticalOffset: 15,
        }
        this.app?.renderer.resize(sizes.width, sizes.height)
        // Old queried `wrapperRef.current.querySelector('canvas')` since it had no direct handle on
        // the canvas @pixi/react created; this port creates+appends the canvas itself, so
        // `this.app.canvas` IS that same element - a direct reference, not a behavior change (same
        // established rationale as VsrgComposerRenderer.ts's own `calculateSizes`).
        if (this.app) {
            this.app.canvas.style.width = `${sizes.width}px`
            this.app.canvas.style.height = `${sizes.height}px`
        }
        this.callbacks.onSizeChange(sizes)
        this.sizes = sizes
        this.generateCache()
    }

    // Old: `generateCache`.
    private generateCache = () => {
        const app = this.app
        if (!app) return
        const newCache = new VsrgPlayerCache({
            app,
            colors: this.colors,
            sizes: this.sizes,
            trackColors: this.song.tracks.map(track => track.color),
        })
        const oldCache = this.cache
        this.cache = newCache
        this.draw()
        // old: "//TODO not sure why pixi reuses textures from the old cache" - preserved verbatim,
        // incl. the 500ms delay before tearing down the PREVIOUS cache's textures.
        setTimeout(() => {
            oldCache?.destroy()
        }, 500)
    }

    // Old: `generateAccuracyBounds`.
    private generateAccuracyBounds = () => {
        this.accuracyBounds = this.song.getAccuracyBounds()
    }

    // Old: `getHitRating`.
    private getHitRating = (hitObject: VsrgHitObject, timestamp: number): VsrgPlayerHitType => {
        const { accuracyBounds } = this
        const diff = Math.abs(timestamp - hitObject.timestamp)
        if (diff < accuracyBounds[0]) return 'amazing'
        if (diff < accuracyBounds[1]) return 'perfect'
        if (diff < accuracyBounds[2]) return 'great'
        if (diff < accuracyBounds[3]) return 'good'
        if (diff < accuracyBounds[4]) return 'bad'
        return 'miss'
    }

    // Old: `handleThemeChange`.
    private handleThemeChange = (theme: Theme) => {
        const bgPlain = theme.get('primary')
        const bgLine = theme.getText('primary')
        const bgLine10 = bgLine.darken(0.5).desaturate(1)
        const bgLayer10 = theme.layer('background', 0.18, 0.06)
        const bg = bgPlain.darken(0.15)
        const bg10 = bg.darken(0.1)
        const secondary = theme.get('secondary')
        const accent = theme.get('accent')
        this.colors = {
            background_plain: [bgPlain.hex(), bgPlain.rgb().rgbNumber()],
            background_layer_10: [bgLayer10.hex(), bgLayer10.rgb().rgbNumber()],
            background: [bg.hex(), bg.rgb().rgbNumber()],
            background_10: [bg10.hex(), bg10.rgb().rgbNumber()],
            secondary: [secondary.hex(), secondary.rgb().rgbNumber()],
            lineColor: [bgLine.hex(), bgLine.rgb().rgbNumber()],
            lineColor_10: [bgLine10.hex(), bgLine10.rgb().rgbNumber()],
            accent: [accent.hex(), accent.rgb().rgbNumber()],
        }
        this.generateCache()
    }

    // Old: `handleTick`, the ThrottledEventLoop-driven playback tick.
    private handleTick = (_elapsed: number, sinceLast: number) => {
        const { isPlaying, scrollSpeed } = this.state
        if (!isPlaying) return
        const timestamp = this.timestamp + sinceLast
        const tracks = this.song.tickPlayback(timestamp + scrollSpeed + this.sizes.height)
        const toAdd = tracks.map((track, i) => {
            return track.map(hitObject => {
                const renderable = new RenderableHitObject(hitObject)
                renderable.instrumentIndex = i
                renderable.color = this.song.tracks[i].color
                return renderable
            })
        }).flat()

        this.validateHitObjects(timestamp, this.renderableHitObjects.concat(toAdd), this.timestamp)
        this.callbacks.onTick(timestamp)
    }

    // Old: `validateHitObjects`.
    private validateHitObjects = (timestamp: number, renderableHitObjects: RenderableHitObject[], previousTimestamp: number) => {
        const { accuracy } = this
        const keyboard = vsrgPlayerStore.keyboard
        for (let i = 0; i < renderableHitObjects.length; i++) {
            const ro = renderableHitObjects[i]
            const key = keyboard[ro.hitObject.index]
            if (!key) continue
            const isIdle = ro.status === HitObjectStatus.Idle
            if (!key.isPressed && isIdle && ro.hitObject.timestamp < timestamp - accuracy) {
                ro.status = HitObjectStatus.Missed
                vsrgPlayerStore.incrementScore('miss')
                continue
            }
            if (key.isPressed && ro.status === HitObjectStatus.Pressed) {
                const pressedTooLong = ro.hitObject.timestamp + ro.hitObject.holdDuration < timestamp - accuracy
                ro.heldScoreTimeout -= timestamp - previousTimestamp
                if (pressedTooLong) {
                    ro.status = HitObjectStatus.Missed
                    vsrgPlayerStore.incrementScore('miss')
                } else {
                    if (ro.heldScoreTimeout <= 0) {
                        ro.heldScoreTimeout = 300
                        vsrgPlayerStore.incrementScore('perfect')
                    }
                }
                continue
            }
        }
        const filtered = renderableHitObjects.filter(r => r.hitObject.timestamp + r.hitObject.holdDuration > timestamp - accuracy)
        this.timestamp = timestamp
        this.renderableHitObjects = filtered
        this.callbacks.onTimestampChange(timestamp)
        this.draw()
    }

    // The ONE entry point VsrgPlayerCanvas.svelte's `$effect` calls on every reactive-prop change.
    update(state: VsrgPlayerRendererState): void {
        this.state = state
    }

    // Old: the pixi-scene half of `render()` (the DOM half - the wrapper div + countdown - lives in
    // VsrgPlayerCanvas.svelte's template) + VsrgHitObjectsRenderer.tsx's own return tree.
    private draw(): void {
        if (!this.app) return
        const hasCache = this.cache !== null
        this.hitObjectsContainer.visible = hasCache
        if (hasCache) {
            this.drawHitObjects()
        } else {
            for (const child of this.hitObjectsContainer.removeChildren()) child.destroy({ children: true })
        }
    }

    // Old: VsrgHitObjectsRenderer.tsx.
    private drawHitObjects(): void {
        for (const child of this.hitObjectsContainer.removeChildren()) child.destroy({ children: true })
        const cache = this.cache
        if (!cache) return
        const sizes = this.sizes
        const scale = sizes.scaling
        const offset = sizes.verticalOffset
        const halfWidth = sizes.hitObjectSize / 2
        const timestamp = this.timestamp
        const renderableHitObjects = this.renderableHitObjects

        this.hitObjectsContainer.x = 0
        this.hitObjectsContainer.y = timestamp * scale + sizes.height - offset

        renderableHitObjects.forEach(renderableHitObject => {
            const hitObject = renderableHitObject.hitObject
            const x = hitObject.index * sizes.keyWidth + sizes.keyWidth / 2
            const y = -(hitObject.timestamp * scale)
            if (
                (renderableHitObject.status === HitObjectStatus.Hit ||
                    renderableHitObject.status === HitObjectStatus.Missed) &&
                !hitObject.isHeld
            ) return

            let min = hitObject.index
            let max = min
            for (const note of renderableHitObjects) {
                if (note === renderableHitObject ||
                    note.status === HitObjectStatus.Missed ||
                    note.status === HitObjectStatus.Hit
                ) continue
                if (note.hitObject.timestamp === hitObject.timestamp) {
                    if (note.hitObject.index < min) min = note.hitObject.index
                    if (note.hitObject.index > max) max = note.hitObject.index
                }
            }

            if (min !== max) {
                const line = new Sprite(cache.getLinesCache(renderableHitObject.color))
                line.x = min * sizes.keyWidth + sizes.keyWidth / 2
                line.width = (max - min) * sizes.keyWidth
                line.zIndex = -1
                line.y = y - halfWidth
                this.hitObjectsContainer.addChild(line)
            }

            if (hitObject.isHeld) {
                const trail = new Sprite(cache.getHeldTrailCache(renderableHitObject.color))
                trail.anchor = PIXI_CENTER_X_END_Y
                trail.width = cache.textures.sizes.trail
                trail.height = hitObject.holdDuration * scale
                trail.x = x
                trail.y = y - halfWidth
                this.hitObjectsContainer.addChild(trail)

                const startCap = new Sprite(cache.getHeldHitObjectCache(renderableHitObject.color))
                startCap.anchor = 0.5
                startCap.angle = 45
                startCap.x = x
                startCap.y = y - halfWidth
                this.hitObjectsContainer.addChild(startCap)

                const endCap = new Sprite(cache.getHeldHitObjectCache(renderableHitObject.color))
                endCap.anchor = PIXI_CENTER_X_END_Y
                endCap.x = x
                endCap.y = y - hitObject.holdDuration * scale
                this.hitObjectsContainer.addChild(endCap)
            } else {
                const sprite = new Sprite(cache.getHitObjectCache(renderableHitObject.color))
                sprite.y = y
                sprite.anchor = PIXI_CENTER_X_END_Y
                sprite.x = x
                this.hitObjectsContainer.addChild(sprite)
            }
        })
    }
}
