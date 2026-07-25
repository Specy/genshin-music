// Old: src/components/pages/Composer/ComposerCanvas.tsx (640 lines) + RenderColumn.tsx (74) +
// ComposerBreakpointsRenderer.tsx (28) - all three collapse into this ONE plain-TS renderer class
// per spec section 6.2. Old's own top-of-file commentary on ComposerCanvas.tsx, preserved here as
// provenance (this task IS that rewrite):
//   //TODO i hate this component with all my heart, the code needs to be improved, but this is the
//   //only way to make it half performant, maybe i should get rid of react pixi and do it manually,
//   //that might improve garbage collection since sprites are always removed and added to the stage
//   //everytime it scrolls
//
// ARCHITECTURE SPLIT vs old's single React class component:
// - This class owns EVERYTHING pixi: both `Application`s (notes stage + timeline stage - old
//   rendered two `<Application>` elements from `@pixi/react`), the `ComposerCache`, the
//   scroll/drag state machine, native wheel/pointer wiring, and the `update(state)` entry point
//   that rebuilds the visible-column container + timeline content (spec section 6.2's
//   renderer-class contract).
// - `ComposerCanvas.svelte` (sibling file, this same task) owns lifecycle only: it constructs
//   this class inside `onMount`, feeds it reactive state via `update()`, and renders the
//   surrounding DOM (the two side `canvas-buttons`, the three `TimelineButton`s, the outer
//   wrapper divs) - none of which are pixi objects in old either (old's JSX interleaved them with
//   the two `<Application>`s, but they were always plain DOM elements).
// - `handleBreakpoints`, `isColumnVisible` and the drag/scroll state machine stay HERE (this
//   task's file list explicitly names them as this class's members) even though the DOM buttons
//   that trigger `handleBreakpoints` live in the .svelte file - `ComposerCanvas.svelte` calls
//   `renderer?.handleBreakpoints(direction)`, a plain method call into this class.
// - The one old `componentDidMount` registration NOT ported here: the
//   `createShortcutListener("composer", "composer_canvas", ...)` keybind registration. That is a
//   Svelte-lifecycle-scoped concern (matching the established precedent of e.g. `PlayerKeyboard.
//   svelte` registering ITS OWN shortcut listener directly in its own `onMount` rather than a
//   non-component class), so `ComposerCanvas.svelte`'s `onMount` registers it and calls into this
//   class's `handleBreakpoints` method - see that file for the registration.
// - Theme reaches THIS class via the Task-1 `subscribeTheme(cb)` helper (spec section 6.1 -
//   renderers are non-component consumers). `ComposerCanvas.svelte` independently derives the
//   handful of theme values its OWN DOM needs (canvas-wrapper background, canvas-buttons
//   gradient, timeline-button background) via its own `$derived` off the same `ThemeProvider`
//   singleton, per the established "components use $derived, renderers use subscribeTheme"
//   convention - this is a deliberate, disclosed duplication of a few theme-color formulas
//   between the two files (each computes them in the representation its own consumer needs:
//   numeric for pixi draw calls here, CSS hex/rgb strings there), not an oversight. The ONLY
//   things this class reports BACK to the Svelte side (via `ComposerRendererCallbacks.
//   onGeometryChange`) are `width` and `hasCache` - genuine pixi/DOM-measurement-derived values
//   (not pure theme derivations) that the Svelte template cannot re-derive on its own.
//
// TWO-TIER IMPORT CHANGES vs old:
// - `$config` -> `$game` for NOTES_PER_COLUMN/COMPOSER_NOTE_POSITIONS/TEMPO_CHANGERS/the composer
//   row-height scale (none of these are in the `$core/legacyConfig` UI-allowlist), aliased to
//   local module consts exactly like `ComposerCache.ts` does, so the REST of the ported method
//   bodies keep referencing the same bare identifiers old used.
// - `is-mobile`: old used the default import (`import isMobile from "is-mobile"`); this port uses
//   the NAMED import (`import {isMobile} from 'is-mobile'`), matching the established convention
//   already used by `AppInit.svelte`/`BaseSettings.ts`/`GlobalConfigStore.svelte.ts` in this tree.
// - `$lib/Songs/SongClasses` / `$lib/Songs/ComposedSong` -> `$core/Songs/SongClasses` /
//   `$core/Songs/ComposedSong`. `$lib/BaseSettings` -> `$core/BaseSettings`.
//
// REQUIRED (not stylistic) DEVIATIONS, both a direct consequence of removing `@pixi/react`:
// 1. `constructor(container, initialState)` -> `await app.init(...)` per the renderer-class
//    contract cannot literally be one synchronous JS constructor (constructors cannot be async).
//    Resolved via constructor (synchronous field setup, mirroring old's own constructor) + a
//    separate `async init()` (mirroring old's `componentDidMount` + the `<Application onInit>`
//    callbacks it relied on) that `ComposerCanvas.svelte`'s `onMount` awaits before ever calling
//    `update()`.
// 2. `destroy()` now explicitly calls `.destroy()` on BOTH pixi `Application`s. Old's
//    `componentWillUnmount` never did this - it only nulled the `notesApp`/`timelineApp` refs -
//    because `@pixi/react`'s `<Application>` owned and destroyed its own pixi `Application`
//    automatically on React unmount. That ownership layer is gone here, so skipping this would be
//    a genuine WebGL-context/canvas leak on every remount (e.g. the
//    `{#key settings.columnsPerCanvas.value}` remount Task 6 wires around this component), not a
//    preservable old "quirk" (old's no-op-destroy was an artifact of a removed framework layer,
//    not a deliberate design choice).
// 3. `init()` sizes and creates both pixi `Application`s ONCE, directly at their final computed
//    size (`computeCanvasSize()`, which folds in the `inPreview` scaling). Old's own comment
//    ("@pixi/react v8 only applies width/height at <Application> init; resize the renderers
//    explicitly when the dimensions change") documents WHY old's canvases were actually first
//    mounted at the constructor's placeholder 300x150 (or, once `componentDidMount`'s synchronous
//    setState landed, at a size that still excluded the `inPreview` scaling `
//    recalculateCacheAndSizes` alone applied) and only reached their correct final size ~50ms
//    later via an explicit `.renderer.resize()` call - a brief wrong-size flash that was purely a
//    limitation of `@pixi/react` only reading size props at init. This port fully controls
//    `Application` creation timing itself (no framework layer forcing size-only-at-init), so
//    there is no mechanical reason to reproduce that flash; the initial paint is sized correctly
//    from the start instead.
import {game} from '$game'
import {isMobile} from 'is-mobile'
import {Application, Container, Graphics, Sprite, type FederatedPointerEvent, type Texture} from 'pixi.js'
import {ThemeProvider, subscribeTheme} from '$core/theme/ThemeProvider.svelte'
import {clamp, colorToRGB, nearestEven} from '$core/utils/Utilities'
import type {Timer} from '$core/utils/Utilities'
import type {NoteColumn, ColumnNote, InstrumentData} from '$core/Songs/SongClasses'
import type {ComposedSong} from '$core/Songs/ComposedSong'
import type {ComposerSettingsDataType} from '$core/BaseSettings'
import {ComposerCache, type ComposerCacheData} from './ComposerCache'

// Local aliases for the `$game` fields old read off `$config` (see header comment) - keeps the
// ported method bodies below referencing the same bare identifiers old used.
const NOTES_PER_COLUMN = game.notes.perColumn
const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions

type ClickEventType = 'up' | 'down-slider' | 'down-stage'

interface ComposerRendererTheme {
    timeline: {
        hex: string
        hexNumber: number
        selected: number
        border: number
    }
    sideButtons: {
        hex: string
        rgb: string
    }
    main: {
        background: number
        backgroundHex: string
        backgroundOpacity: number
    }
}

// Mirrors old `ComposerCanvasProps['data']` - the reactive input `ComposerCanvas.svelte` pushes
// into `update()` on every relevant change via its own `$effect`.
export interface ComposerRendererState {
    columns: NoteColumn[]
    isPlaying: boolean
    isRecordingAudio: boolean
    song: ComposedSong
    selected: number
    currentLayer: number
    inPreview?: boolean
    settings: ComposerSettingsDataType
    breakpoints: number[]
    selectedColumns: number[]
}

// Mirrors old `ComposerCanvasProps['functions']`, plus the one new callback this port needs to
// report pixi/DOM-measurement-derived geometry back up to the Svelte template (see header
// comment) - old's DOM read `this.state.width`/`cache` directly since it was the same React class.
export interface ComposerRendererCallbacks {
    selectColumn: (index: number, ignoreAudio?: boolean) => void
    toggleBreakpoint: () => void
    onGeometryChange: (geometry: {width: number, hasCache: boolean}) => void
}

// Old: RenderColumn.tsx's `isColumnVisible` windowing helper, ported verbatim. Exported per this
// task's own interface list (Task 6's checklist references it).
export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
    const threshold = numberOfColumnsPerCanvas / 2 + 2
    return (currentPos - threshold) < pos && pos < (currentPos + threshold)
}

interface RenderColumnParams {
    notes: ColumnNote[]
    currentLayer: number
    instruments: InstrumentData[]
    index: number
    sizes: {width: number, height: number}
    cache: ComposerCacheData
    backgroundCache: Texture
    isBreakpoint: boolean
    isSelected: boolean
    isToolsSelected: boolean
}

// Old: RenderColumn.tsx's function component (74 lines), rebuilt as a plain Container-builder
// with the SAME prop shape and the SAME child ordering old's nested JSX had: the background
// sprite carries the selected/tools-selected overlay AND the breakpoint sprite as ITS OWN
// children (not siblings), while the note sprites are siblings of the background sprite under
// the outer column container.
function renderColumn({
    notes,
    index,
    sizes,
    cache,
    instruments,
    backgroundCache,
    isBreakpoint,
    isSelected,
    isToolsSelected,
    currentLayer,
}: RenderColumnParams): Container {
    const columnContainer = new Container()
    columnContainer.x = sizes.width * index

    const background = new Sprite(backgroundCache)
    if (isSelected || isToolsSelected) {
        const overlay = new Sprite(isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2])
        overlay.alpha = isToolsSelected && !isSelected ? 0.4 : 0.8
        overlay.zIndex = 1
        background.addChild(overlay)
    }
    if (isBreakpoint) {
        background.addChild(new Sprite(cache.breakpoints[1]))
    }
    columnContainer.addChild(background)

    for (const note of notes) {
        const layerStatus = note.layer.toLayerStatus(currentLayer, instruments)
        if (layerStatus === 0) continue
        const noteSprite = new Sprite(cache.notes[layerStatus])
        noteSprite.y = COMPOSER_NOTE_POSITIONS[note.index] * sizes.height / NOTES_PER_COLUMN
        columnContainer.addChild(noteSprite)
    }
    return columnContainer
}

export class ComposerRenderer {
    private notesApp: Application | null = null
    private timelineApp: Application | null = null
    private wheelCanvas: HTMLCanvasElement | null = null
    private cache: ComposerCache | null = null
    private themeDispose: (() => void) | null = null

    // Persistent scene objects (created once per renderer instance, children rebuilt on every
    // draw() - see that method for why a full rebuild is used instead of an incremental diff).
    private readonly notesColumnsContainer = new Container()
    private readonly timelineContentContainer = new Container()
    private readonly viewportGraphics = new Graphics()

    private state: ComposerRendererState
    private numberOfColumnsPerCanvas: number
    private width: number
    private height: number
    private columnSize: {width: number, height: number}
    private timelineHeight = 30
    private stageBackgroundColor: number
    private theme: ComposerRendererTheme

    // Scroll/drag state machine - old's own instance fields, ported unchanged (names, spelling
    // and all).
    private stageSelected = false
    private sliderSelected = false
    // old wrote `hasSlided = true` inside `handleSliderSlide` but never read it anywhere else in
    // ComposerCanvas.tsx (verified via a full-file search) - a pre-existing dead write, preserved
    // bug-for-bug rather than silently dropped.
    private hasSlided = false
    // old's own spelling (missing the second "i" in "Position") - preserved verbatim.
    private stagePreviousPositon = 0
    private stageXMovement = 0
    private stageMovementAmount = 0
    private sliderOffset = 0
    private throttleScroll = 0
    private onSlider = false
    // old: "//TODO memory leak somewhere in this page" sat directly above this field - preserved.
    private cacheRecalculateDebounce: Timer = 0
    // old initialized `currentBreakpoint: -1` in state and never read or wrote it again anywhere
    // in ComposerCanvas.tsx (verified via a full-file search) - another pre-existing dead field,
    // preserved rather than dropped.
    private currentBreakpoint = -1

    constructor(
        private readonly notesContainer: HTMLElement,
        private readonly timelineContainer: HTMLElement,
        initialState: ComposerRendererState,
        private readonly callbacks: ComposerRendererCallbacks,
    ) {
        this.state = initialState
        this.numberOfColumnsPerCanvas = Number(initialState.settings.columnsPerCanvas.value)
        // old's own constructor placeholder (`const width = 300; const height = 150`) - provably
        // never observed in this port (see header comment item 3: `init()` always recomputes and
        // overwrites these with the real computed size before any Application is created, and no
        // pointer interaction - the only other reader of these fields - can happen before then).
        // Kept for structural parity with old's constructor.
        this.width = 300
        this.height = 150
        this.columnSize = {width: nearestEven(300 / this.numberOfColumnsPerCanvas), height: 150}
        this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber()
        // DISCLOSED (see header comment): this placeholder theme mirrors old's constructor-time
        // formula (`.toString()`/`.alpha()`) exactly, but is provably never READ in this port -
        // `init()` always calls `subscribeTheme(this.handleThemeChange)` before this class does
        // anything else observable, and that helper's contract (Task 1) invokes its callback
        // SYNCHRONOUSLY once before returning, so `handleThemeChange`'s "real" formula
        // (`.hex()`/`.hexa()`/`Math.max(alpha,0.8)`) has always already overwritten this value by
        // the time `draw()` first runs. Kept for structural parity with old's constructor, which
        // had this same real discrepancy between its constructor-time and
        // `handleThemeChange`-time theme formulas (a harmless, momentary old quirk there too -
        // React's `componentDidMount` ran synchronously before first paint in old as well).
        this.theme = {
            timeline: {
                hex: ThemeProvider.layer('primary', 0.1).toString(),
                hexNumber: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber(),
                selected: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber(),
                border: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
            },
            sideButtons: {
                hex: ThemeProvider.get('primary').darken(0.08).toString(),
                rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','),
            },
            main: {
                background: ThemeProvider.get('primary').rgb().rgbNumber(),
                backgroundHex: ThemeProvider.get('primary').toString(),
                backgroundOpacity: ThemeProvider.get('primary').alpha(),
            },
        }
    }

    // Old: `componentDidMount` + the two `<Application onInit>` callbacks it depended on,
    // collapsed into one explicit async method (see header comment item 1). `ComposerCanvas.
    // svelte`'s `onMount` awaits this before ever calling `update()`.
    async init(): Promise<void> {
        const {width, height, columnWidth} = this.computeCanvasSize()
        this.width = width
        this.height = height
        this.columnSize = {width: columnWidth, height}
        this.timelineHeight = isMobile() ? 25 : 30

        this.notesApp = new Application()
        await this.notesApp.init({
            width: this.width,
            height: this.height,
            background: this.stageBackgroundColor,
            autoDensity: true,
            antialias: true,
            resolution: window.devicePixelRatio ?? 1.4,
        })
        this.notesContainer.appendChild(this.notesApp.canvas)
        this.wheelCanvas = this.notesApp.canvas
        this.wheelCanvas.addEventListener('wheel', this.handleWheel)
        this.applyNotesCanvasOpacity()
        this.notesApp.renderer.background.color = this.theme.main.background
        this.notesColumnsContainer.eventMode = 'static'
        this.notesColumnsContainer.interactiveChildren = false
        this.notesColumnsContainer.hitArea = this.testStageHitarea
        this.notesColumnsContainer.on('pointerdown', this.handleClickStage)
        this.notesColumnsContainer.on('pointerup', this.handleClickStageUp)
        this.notesColumnsContainer.on('pointermove', this.handleStageSlide)
        this.notesApp.stage.addChild(this.notesColumnsContainer)

        this.timelineApp = new Application()
        await this.timelineApp.init({
            width: this.width,
            height: this.timelineHeight,
            backgroundAlpha: 0,
            autoDensity: true,
            antialias: true,
            resolution: window.devicePixelRatio ?? 1.4,
        })
        this.timelineContainer.appendChild(this.timelineApp.canvas)
        this.timelineContentContainer.eventMode = 'static'
        this.timelineContentContainer.interactiveChildren = false
        this.timelineContentContainer.hitArea = this.testTimelineHitarea
        this.timelineContentContainer.on('pointerdown', this.handleClickDown)
        this.timelineContentContainer.on('pointerup', this.handleClickUp)
        this.timelineContentContainer.on('pointermove', this.handleSliderSlide)
        this.timelineApp.stage.addChild(this.timelineContentContainer)
        // The current-viewport indicator is a sibling of (and, being added after, renders on top
        // of) the interactive content container - matches old's JSX, where this graphic was the
        // LAST child of the timeline `<Application>`, outside the `{cache && <pixiContainer>}`.
        this.timelineApp.stage.addChild(this.viewportGraphics)

        window.addEventListener('resize', this.recalculateCacheAndSizes)
        window.addEventListener('pointerup', this.resetPointerDown)
        window.addEventListener('blur', this.resetPointerDown)

        this.themeDispose = subscribeTheme(this.handleThemeChange)
        // subscribeTheme's synchronous first callback (Task 1 contract) already ran
        // handleThemeChange above, which itself calls recalculateCacheAndSizes - old's own
        // componentDidMount additionally called recalculateCacheAndSizes directly from its own
        // geometry setState callback, but that second call is subsumed by the first here (the
        // debounce's clearTimeout collapses back-to-back calls into a single execution 50ms
        // later), so a second explicit call would be a redundant duplicate of what the theme
        // subscription above already triggers.
    }

    // Old: the render-affecting half of `componentDidMount`'s inline computation, mirrored by
    // `recalculateCacheAndSizes` below (which repeats the same formula on every resize/theme
    // change) - factored into one helper both call, since the two were byte-identical in old
    // apart from the `inPreview` scaling (see header comment item 3 for why that scaling is
    // folded in here unconditionally rather than only on the LATER recalculation).
    private computeCanvasSize(): {width: number, height: number, columnWidth: number} {
        const sizes = document.body.getBoundingClientRect()
        let width = nearestEven(sizes.width * 0.85 - 45)
        let height = nearestEven(sizes.height * 0.45)
        // old: `if (APP_NAME === "Sky") height = nearestEven(height * 0.95)`. Replaced by an
        // unconditional multiply by the per-game scale (1 for Genshin, 0.95 for Sky) per the P4c
        // two-tier map (`game.notes.composerRowHeightScale`) - mechanically equivalent since
        // multiplying by 1 is a no-op.
        height = nearestEven(height * game.notes.composerRowHeightScale)
        if (this.state.inPreview) {
            width = nearestEven(width * (sizes.width < 900 ? 0.8 : 0.55))
            height = nearestEven(height * (sizes.width < 900 ? 0.8 : 0.6))
        }
        const columnWidth = nearestEven(width / this.numberOfColumnsPerCanvas)
        return {width, height, columnWidth}
    }

    private recalculateCacheAndSizes = () => {
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        this.cacheRecalculateDebounce = setTimeout(() => {
            if (!this.notesApp || !this.timelineApp) return
            const {width, height, columnWidth} = this.computeCanvasSize()
            this.notesApp.renderer.resize(width, height)
            this.timelineApp.renderer.resize(width, this.timelineHeight)
            const oldCache = this.cache
            this.width = width
            this.height = height
            this.columnSize = {width: columnWidth, height}
            this.cache = this.generateCache(columnWidth, height, isMobile() ? 2 : 4, isMobile() ? 25 : 30)
            this.notifyGeometry()
            // old's automatic React re-render is what actually refreshed the visible sprites
            // after this state update landed - the explicit draw() call here is this port's
            // equivalent (nothing else would otherwise pick up the freshly regenerated cache).
            this.draw()
            // old: "//TODO not sure why pixi is still using old textures" - the previous cache's
            // destroy is delayed 500ms after the new one is generated, preserved verbatim.
            setTimeout(() => {
                oldCache?.destroy()
            }, 500)
        }, 50)
    }

    private generateCache(columnWidth: number, height: number, margin: number, timelineHeight: number): ComposerCache | null {
        const colors = {
            l: ThemeProvider.get('primary'), //light
            d: ThemeProvider.get('primary'), //dark
        }
        colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.4) : colors.l.lighten(0.1)
        colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.15) : colors.d.darken(0.03)
        if (!this.notesApp || !this.timelineApp) return null
        return new ComposerCache({
            width: columnWidth,
            height,
            margin,
            timelineHeight,
            app: this.notesApp,
            breakpointsApp: this.timelineApp,
            colors: {
                accent: ThemeProvider.get('composer_accent').rotate(20).darken(0.5),
                mainLayer: ThemeProvider.get('composer_main_layer'),
                secondLayer: ThemeProvider.get('composer_secondary_layer'),
                bars: [
                    {color: colors.l.rgb().rgbNumber()}, //lighter
                    {color: colors.d.rgb().rgbNumber()}, //darker
                    {color: ThemeProvider.get('composer_accent').rgb().rgbNumber()}, //current
                    {color: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber()}, //selected
                ],
            },
        })
    }

    private applyNotesCanvasOpacity = () => {
        if (this.wheelCanvas) this.wheelCanvas.style.opacity = String(this.theme.main.backgroundOpacity)
    }

    private handleWheel = (e: WheelEvent) => {
        this.callbacks.selectColumn(this.state.selected + Math.sign(e.deltaY), true)
    }

    private handleClick = (e: FederatedPointerEvent, type: ClickEventType) => {
        const x = e.globalX
        const {width, numberOfColumnsPerCanvas, state} = this
        this.stageXMovement = 0
        this.stageMovementAmount = 0
        if (type === 'up') {
            this.sliderSelected = false
        }
        if (type === 'down-slider') {
            this.sliderSelected = true
            const relativeColumnWidth = width / state.columns.length
            const stageSize = relativeColumnWidth * (numberOfColumnsPerCanvas + 1)
            const stagePosition = relativeColumnWidth * state.selected - (numberOfColumnsPerCanvas / 2) * relativeColumnWidth
            this.onSlider = x > stagePosition && x < stagePosition + stageSize
            this.sliderOffset = stagePosition + stageSize / 2 - x
            this.throttleScroll = Number.MAX_SAFE_INTEGER
            this.handleSliderSlide(e)
        }
        if (type === 'down-stage') {
            this.stagePreviousPositon = x
            this.stageSelected = true
        }
    }

    private handleClickStage = (e: FederatedPointerEvent) => {
        this.handleClick(e, 'down-stage')
    }

    private handleClickStageUp = (e: FederatedPointerEvent) => {
        this.stageSelected = false
        if (this.stageMovementAmount === 0) {
            const middle = (this.numberOfColumnsPerCanvas / 2) * this.columnSize.width
            const clickedOffset = Math.floor((e.globalX - middle) / this.columnSize.width + 1)
            if (clickedOffset === 0) return
            const newPosition = this.state.selected + Math.round(clickedOffset)
            this.callbacks.selectColumn(clamp(newPosition, 0, this.state.columns.length - 1))
        }
    }

    private handleClickDown = (e: FederatedPointerEvent) => {
        this.handleClick(e, 'down-slider')
    }

    private handleClickUp = (e: FederatedPointerEvent) => {
        this.handleClick(e, 'up')
    }

    private handleStageSlide = (e: FederatedPointerEvent) => {
        const x = e.globalX
        const amount = (this.stagePreviousPositon - x)
        this.stagePreviousPositon = x
        if (this.stageSelected) {
            const threshold = this.columnSize.width
            this.stageXMovement += amount
            const amountToMove = (this.stageXMovement - this.stageMovementAmount * threshold) / threshold
            if (Math.abs(amountToMove) < 1) return
            this.stageMovementAmount += Math.round(amountToMove)
            const newPosition = this.state.selected + Math.round(amountToMove)
            this.callbacks.selectColumn(clamp(newPosition, 0, this.state.columns.length - 1), true)
        }
    }

    // Called externally by ComposerCanvas.svelte's prev/next-breakpoint TimelineButtons (see
    // header comment - the shortcut listener that ALSO calls this lives in that file now).
    handleBreakpoints = (direction: 1 | -1) => {
        const {selected, columns, breakpoints} = this.state
        const breakpoint = direction === 1 //1 = right, -1 = left
            ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
            : breakpoints.filter((v) => v < selected).sort((a, b) => b - a)
        if (breakpoint.length === 0) return
        if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
            this.callbacks.selectColumn(breakpoint[0])
        }
    }

    private handleSliderSlide = (e: FederatedPointerEvent) => {
        const globalX = e.globalX
        if (this.sliderSelected) {
            if (this.throttleScroll++ < 4) return
            const {width, columnSize, state} = this
            this.hasSlided = true
            this.throttleScroll = 0
            const totalWidth = columnSize.width * state.columns.length
            const x = this.onSlider ? (globalX + this.sliderOffset) : globalX
            const relativePosition = Math.floor(x / width * totalWidth / columnSize.width)
            this.callbacks.selectColumn(clamp(relativePosition, 0, state.columns.length - 1), true)
        }
    }

    private testStageHitarea = {
        contains: (x: number, y: number) => {
            if (this.stageSelected) return true //if stage is selected, we want to be able to move it even if we are outside the timeline
            const width = this.columnSize.width * this.state.columns.length
            if (x < 0 || x > width || y < 0 || y > this.height) return false
            return true
        },
    }

    private testTimelineHitarea = {
        contains: (x: number, y: number) => {
            if (this.sliderSelected) return true //if slider is selected, we want to be able to move it even if we are outside the timeline
            if (x < 0 || x > this.width || y < 0 || y > this.timelineHeight) return false
            return true
        },
    }

    private resetPointerDown = () => {
        this.stageSelected = false
        this.sliderSelected = false
        this.stagePreviousPositon = 0
    }

    // Old took no parameter here either (`handleThemeChange = () => {...}`), even though
    // subscribeTheme's callback type passes one - it always re-read the global `ThemeProvider`
    // singleton directly instead. Ported the same way.
    private handleThemeChange = () => {
        this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber()
        this.theme = {
            timeline: {
                hex: ThemeProvider.layer('primary', 0.1).hex(),
                hexNumber: ThemeProvider.layer('primary', 0.1).rgb().rgbNumber(),
                selected: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber(),
                border: ThemeProvider.get('composer_accent').rgb().rgbNumber(),
            },
            sideButtons: {
                hex: ThemeProvider.get('primary').darken(0.08).hex(),
                rgb: colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','),
            },
            main: {
                background: ThemeProvider.get('primary').rgb().rgbNumber(),
                backgroundHex: ThemeProvider.get('primary').hexa(),
                backgroundOpacity: Math.max(ThemeProvider.get('primary').alpha(), 0.8),
            },
        }
        this.recalculateCacheAndSizes()
        if (this.notesApp) this.notesApp.renderer.background.color = this.theme.main.background
        this.applyNotesCanvasOpacity()
    }

    private notifyGeometry() {
        this.callbacks.onGeometryChange({width: this.width, hasCache: this.cache !== null})
    }

    // The ONE entry point ComposerCanvas.svelte's `$effect` calls on every reactive-state change.
    // Does NOT re-read `settings.columnsPerCanvas.value` into `numberOfColumnsPerCanvas` - old
    // only ever computed that once (constructor, re-confirmed by componentDidMount) because its
    // PARENT keyed `<ComposerCanvas>` on that exact value, unmounting+reconstructing a fresh
    // instance on change rather than updating the existing one; Task 6 reproduces that with
    // `{#key settings.columnsPerCanvas.value}` around this component, so a changed value always
    // arrives via a brand-new `ComposerRenderer` construction, never through this method.
    update(state: ComposerRendererState): void {
        this.state = state
        this.draw()
    }

    // Old: the pixi-scene half of `render()` (the DOM/JSX half lives in ComposerCanvas.svelte's
    // template). Rebuilds both stages' content fully on every call rather than incrementally
    // diffing sprites, matching this task's own framing ("update(state) rebuilds the
    // visible-column container") - the visible window is small (at most
    // numberOfColumnsPerCanvas/2+2 columns each side) so a full rebuild is cheap, and it is
    // trivially correct (no stale-sprite bookkeeping) after a resize/theme/cache change as well
    // as a plain state update.
    private draw(): void {
        if (!this.notesApp || !this.timelineApp) return
        const cacheData = this.cache?.cache
        const sizes = this.columnSize
        const state = this.state
        const xPosition = (state.selected - this.numberOfColumnsPerCanvas / 2 + 1) * -sizes.width
        const beatMarks = Number(state.settings.beatMarks.value)
        const counterLimit = beatMarks === 0 ? 12 : 4 * beatMarks
        const relativeColumnWidth = this.width / state.columns.length
        const timelineWidth = Math.floor(relativeColumnWidth * (this.width / sizes.width + 1))
        const timelinePosition = relativeColumnWidth * state.selected - relativeColumnWidth * (this.numberOfColumnsPerCanvas / 2)

        this.drawNotesStage(cacheData, sizes, xPosition, counterLimit)
        this.drawTimelineStage(cacheData, relativeColumnWidth, timelineWidth, timelinePosition)
    }

    private drawNotesStage(cacheData: ComposerCacheData | undefined, sizes: {width: number, height: number}, xPosition: number, counterLimit: number) {
        for (const child of this.notesColumnsContainer.removeChildren()) child.destroy({children: true})
        this.notesColumnsContainer.x = xPosition
        // old: `{(cache && !data.isRecordingAudio) && <pixiContainer>...}` - the whole column
        // container is absent (not just empty) while recording audio or before a cache exists.
        const visible = Boolean(cacheData) && !this.state.isRecordingAudio
        this.notesColumnsContainer.visible = visible
        if (!visible || !cacheData) return
        this.state.columns.forEach((column, i) => {
            if (!isColumnVisible(i, this.state.selected, this.numberOfColumnsPerCanvas)) return
            const tempoChangersCache = (i + 1) % 4 === 0 ? cacheData.columnsLarger : cacheData.columns
            const standardCache = (i + 1) % 4 === 0 ? cacheData.standardLarger : cacheData.standard
            const background = column.tempoChanger === 0
                ? standardCache[Number(i % (counterLimit * 2) >= counterLimit)]
                : tempoChangersCache[column.tempoChanger]
            this.notesColumnsContainer.addChild(renderColumn({
                cache: cacheData,
                notes: column.notes,
                index: i,
                sizes,
                instruments: this.state.song.instruments,
                currentLayer: this.state.currentLayer,
                backgroundCache: background,
                isToolsSelected: this.state.selectedColumns.includes(i),
                isSelected: i === this.state.selected,
                isBreakpoint: this.state.breakpoints.includes(i),
            }))
        })
    }

    private drawTimelineStage(cacheData: ComposerCacheData | undefined, relativeColumnWidth: number, timelineWidth: number, timelinePosition: number) {
        for (const child of this.timelineContentContainer.removeChildren()) child.destroy({children: true})
        // old: `{cache && <pixiContainer>...}` - the interactive timeline content (background
        // fill, selected-range highlight, breakpoint markers) is absent entirely before a cache
        // exists; the current-viewport indicator below is NOT gated on this, matching old.
        if (cacheData) {
            const background = new Graphics()
            background.rect(0, 0, this.width, this.timelineHeight)
            background.fill({color: this.theme.timeline.hexNumber})
            this.timelineContentContainer.addChild(background)

            if (this.state.selectedColumns.length) {
                const first = this.state.selectedColumns[0] || 0
                const last = this.state.selectedColumns[this.state.selectedColumns.length - 1]
                const x = first * relativeColumnWidth
                const xEnd = last * relativeColumnWidth
                const selectedRange = new Graphics()
                selectedRange.rect(x, 0, xEnd - x, this.timelineHeight)
                selectedRange.fill({color: this.theme.timeline.selected, alpha: 0.6})
                this.timelineContentContainer.addChild(selectedRange)
            }

            // Old: ComposerBreakpointsRenderer.tsx (28 lines) - a `memo`-wrapped function
            // returning one sprite per breakpoint; inlined here since drop-the-memo is this
            // migration's established precedent and there is no separate component tree to memo
            // against anymore.
            const breakpointsTexture = cacheData.breakpoints[0]
            this.state.breakpoints.forEach(breakpoint => {
                const sprite = new Sprite(breakpointsTexture)
                // old: `interactive={false}` - the FederatedOptions alias for `eventMode:
                // 'passive'`, itself pixi's default eventMode. Set explicitly for parity even
                // though a no-op against the default.
                sprite.eventMode = 'passive'
                sprite.anchor.set(0.5, 0)
                sprite.x = (this.width / (this.state.columns.length - 1)) * breakpoint
                this.timelineContentContainer.addChild(sprite)
            })
        }

        this.viewportGraphics.clear()
        this.viewportGraphics.roundRect(0, 0, timelineWidth, this.timelineHeight - 3, 6)
        this.viewportGraphics.stroke({width: 3, color: this.theme.timeline.border, alpha: 0.8})
        this.viewportGraphics.x = timelinePosition
        this.viewportGraphics.y = 1.5
    }

    // Old: `componentWillUnmount`. See header comment item 2 for why the two `.destroy()` calls
    // below are a required addition, not an optional one.
    destroy(): void {
        window.removeEventListener('resize', this.recalculateCacheAndSizes)
        window.removeEventListener('pointerup', this.resetPointerDown)
        window.removeEventListener('blur', this.resetPointerDown)
        if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce)
        this.wheelCanvas?.removeEventListener('wheel', this.handleWheel)
        this.themeDispose?.()
        this.cache?.destroy()
        this.notesApp?.destroy(true, {children: true})
        this.timelineApp?.destroy(true, {children: true})
        this.notesApp = null
        this.timelineApp = null
        this.wheelCanvas = null
    }
}
