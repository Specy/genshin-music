// This class owns all pixi state: both Applications (notes stage + timeline stage), the
// ComposerCache, the scroll/drag state machine, and the update(state) entry point. It keeps a POOL
// of per-column views (see ColumnView below) and diffs the state it last PAINTED against the one it
// was handed now to decide how much of the scene to repaint - see update() and paintedState.
// ComposerCanvas.svelte owns lifecycle only - it constructs this class in onMount, awaits init(),
// feeds it state via update(), and renders the surrounding DOM.
//
// Theme reaches this class via subscribeTheme(cb); ComposerCanvas.svelte separately derives the
// handful of theme values its own DOM needs via $derived off the same ThemeProvider singleton.
// This duplicates a few color formulas between the two files (numeric here for pixi draw calls,
// CSS strings there) - deliberate, not an oversight. What this class hands back through
// ComposerRendererCallbacks.onGeometryChange is width and hasCache: pixi/DOM-measurement-derived
// values the template cannot re-derive on its own. The other callbacks carry user input the same
// way round - a pointer on either canvas becomes a selectColumn or a toggleBreakpoint.
import { game } from '$game';
import { isMobile } from 'is-mobile';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  type FederatedPointerEvent,
  type Texture,
} from 'pixi.js';
import { ThemeProvider, subscribeTheme } from '$core/theme/ThemeProvider.svelte';
import { clamp, colorToRGB, nearestEven } from '$core/utils/Utilities';
import type { Timer } from '$core/utils/Utilities';
import type { NoteColumn, ColumnNote, InstrumentData } from '$core/Songs/SongClasses';
import {
  computeRowLayerStatuses,
  computeStrandedRows,
  displayButtonForId,
} from '$core/Songs/noteIds';
import { ComposerCache, type ComposerCacheData } from './ComposerCache';

const NOTES_PER_COLUMN = game.notes.perColumn;
const COMPOSER_NOTE_POSITIONS = game.notes.composerPositions;

type ClickEventType = 'up' | 'down-slider' | 'down-stage';

interface ComposerRendererTheme {
  timeline: {
    hex: string;
    hexNumber: number;
    selected: number;
    border: number;
  };
  sideButtons: {
    hex: string;
    rgb: string;
  };
  main: {
    background: number;
    backgroundHex: string;
    backgroundOpacity: number;
  };
  /**
   * The span-tail colour of the CURRENT layer. Captured here rather than read live in the draw
   * path: a `ThemeProvider.get(...)` inside a draw is both an allocation per painted column and a
   * reactive read, which would join (and, on any run that skipped it, leave) the canvas $effect's
   * dependency set. The channel that repaints tails after a theme edit is subscribeTheme ->
   * handleThemeChange -> recalculateCacheAndSizes, which drops the pool and repaints everything.
   *
   * paintTails does not read THIS field - see ComposerRenderer.paintTailAccent for the copy it
   * reads instead and why the two are updated at different moments.
   */
  tailAccent: number;
}

// The reactive input ComposerCanvas.svelte pushes into update() on every relevant change via its
// own $effect.
//
// EVERY FIELD HERE IS A VALUE OR A PLAIN ARRAY - no `$state` proxy, and nothing reached through the
// song. Two separate reasons, both load-bearing:
//
//  - update() DIFFS these fields (see needsFullRepaint). A field reached through a live song is the
//    same object on both sides of the comparison, so the branch it gates is permanently false -
//    silently. `structureVersion` exists because the column array keeps one identity across the
//    edits that mutate it in place, so an identity comparison does not see those; `columns`'
//    identity is diffed beside it, because a structure version is per-instance and a freshly loaded
//    song starts at 0.
//  - draw() indexes the arrays per column and per note (hundreds of element reads per full
//    repaint), and an element read through Svelte's deep proxy is a Proxy trap plus a dependency
//    registration - measured at ~20x a plain read. `columns` comes from ComposedSong's
//    `#structure`-guarded getter; `instruments`, `breakpoints` and `selectedColumns` are
//    `$state.raw` at their declarations. A future field backed by a deep `$state` array must be
//    hoisted into a plain copy in the canvas's $effect rather than indexed in the loops.
//
// `beatMarks` and `columnsPerCanvas` are the two settings values this class needs, taken as
// scalars rather than as the `ComposerSettings.data` object they come from. That object's identity
// never changes when a setting is edited, so a diff could not see one; and reading them in the
// canvas's $effect - rather than deep inside a draw that may or may not run - is what subscribes
// that effect to them at all.
export interface ComposerRendererState {
  columns: NoteColumn[];
  /**
   * ComposedSong's graph version, captured. Comparable only against another capture from the SAME
   * song, which is why `columns` above is diffed alongside it.
   */
  structureVersion: number;
  // QUIRK: accepted for prop-shape parity but read nowhere in this class - the canvas needs it for
  // its own DOM. Deliberately excluded from the repaint diff: it flips on every play/stop and
  // changes no pixel here.
  isPlaying: boolean;
  isRecordingAudio: boolean;
  // The instrument roster, passed as its OWN field rather than reached through the song. It used
  // to be `song: ComposedSong` and the draw path read `state.song.instruments` - which meant the
  // canvas's $effect depended on the roster only implicitly, through a read that happens deep
  // inside renderer.update(). That worked while every edit handed the effect a freshly cloned
  // `song`; with a stable song identity the effect would never re-run on an instrument change,
  // and it is dropped entirely on any early-returning draw. Explicit prop, explicit dependency.
  //
  // Diffed BY ARRAY IDENTITY: InstrumentSettingsPopup edits the live InstrumentData in place and
  // ComposedSong.setInstrument then publishes a clone of it, so a value comparison between two
  // captures compares the mutated object against its own copy and reports equal.
  instruments: InstrumentData[];
  selected: number;
  currentLayer: number;
  // Read by computeCanvasSize, which runs at init and on the resize/theme path rather than per
  // draw. It scales BOTH canvas dimensions, so it decides every column's x, every note's y and the
  // size of both canvases. Composer.svelte passes it as a static prop, which is the reason
  // needsFullRepaint does not compare it.
  inPreview?: boolean;
  /** ComposerSettings' `beatMarks`, as a number: decides the light/dark bar-group alternation. */
  beatMarks: number;
  /**
   * ComposerSettings' `columnsPerCanvas`, as a number. Read ONCE, in the constructor: a changed
   * value arrives as a fresh ComposerRenderer instead, because Composer.svelte wraps the canvas in
   * {#key settings.columnsPerCanvas.value}. It is on the state object so the canvas's $effect
   * reads it like every other input, not because update() re-reads it.
   */
  columnsPerCanvas: number;
  breakpoints: number[];
  selectedColumns: number[];
}

// onGeometryChange reports pixi/DOM-measurement-derived geometry back up to the Svelte template,
// which cannot compute it independently.
export interface ComposerRendererCallbacks {
  selectColumn: (index: number, ignoreAudio?: boolean) => void;
  toggleBreakpoint: () => void;
  onGeometryChange: (geometry: { width: number; hasCache: boolean }) => void;
}

/**
 * Whether a column is inside the drawn window. This is the DEFINITION; visibleColumnRange() below
 * is the closed form of the same set, and test/composerRenderer.test.ts pins the two against each
 * other rather than assuming they agree, over the option list it reads out of
 * ComposerSettings.data.columnsPerCanvas.
 *
 * Strict on both sides, so for an integer `currentPos` the window is 3 columns wider than the
 * canvas shows when numberOfColumnsPerCanvas is even and 4 wider when it is odd (bleed).
 */
export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
  const threshold = numberOfColumnsPerCanvas / 2 + 2;
  return currentPos - threshold < pos && pos < currentPos + threshold;
}

interface ColumnPaintParams {
  index: number;
  notes: ColumnNote[];
  currentLayer: number;
  instruments: InstrumentData[];
  sizes: { width: number; height: number };
  cache: ComposerCacheData;
  background: Texture;
  isBreakpoint: boolean;
  isSelected: boolean;
  isToolsSelected: boolean;
}

/**
 * One column of the notes stage, owned by ComposerRenderer's pool and REUSED: acquired when a
 * column enters the drawn window, released back to the free list when it leaves, never destroyed
 * in between. Before the pool existed, drawNotesStage destroyed and rebuilt every display object
 * in the window on every update - ~276 of them per playback tick at the default columnsPerCanvas.
 *
 * Four child slots are fixed for the life of the view - background, selection overlay, breakpoint
 * marker, tail Graphics - followed by note sprites grown on demand. THAT ORDER IS THE DRAW ORDER:
 * pixi renders a container's children in array order, and `zIndex` decides nothing unless the
 * PARENT sets sortableChildren, which nothing here does. It is the same order the pre-pool code
 * produced by nesting the overlay and the breakpoint marker inside the background Sprite and adding
 * the rest as siblings.
 *
 * paint() writes the view's own placement and presentation (the container's x, y, alpha and
 * visible) and every property of a child that varies from column to column - the background's
 * texture, the overlay's texture, alpha and visibility, the marker's texture and visibility, and
 * each note sprite's texture, row and alpha - whether or not THIS column uses it: an unused overlay
 * is hidden, a surplus note sprite is hidden. Writing them without first checking what the view
 * already holds is what makes a reused view safe; a "set it only if it changed" paint is how a pool
 * ends up showing the previous occupant's texture, alpha or row.
 *
 * What it leaves alone: the child positions that are the same for every column (the background, the
 * overlay and the marker sit at the container's origin, and a note sprite's x does too, so those
 * are the constructor's zeroes), and the tail Graphics' DRAWING - ComposerRenderer.paintTails
 * clears and refills that immediately after every paint(). Nothing writes that Graphics' own
 * placement or alpha, so it draws from the container's origin at full opacity and the per-bar alpha
 * lives in the fill ops.
 *
 * test/composerRenderer.test.ts is what keeps those two paragraphs honest rather than aspirational:
 * it reads the placement, texture, position, alpha and visibility of every child off a pool that
 * has been driven incrementally, and compares them both against the drawing rules and against a
 * second renderer freshly mounted at the same state.
 */
class ColumnView {
  readonly container = new Container();
  /** Cleared and refilled by ComposerRenderer.paintTails - the view owns the object, not the drawing. */
  readonly tailGraphics = new Graphics();
  private readonly background: Sprite;
  private readonly overlay: Sprite;
  private readonly breakpointMarker: Sprite;
  private readonly noteSprites: Sprite[] = [];
  /** How many of noteSprites are currently shown; the rest are hidden, not removed. */
  private paintedNotes = 0;

  constructor(cache: ComposerCacheData) {
    this.background = new Sprite(cache.standard[0]);
    this.overlay = new Sprite(cache.standard[2]);
    this.overlay.visible = false;
    this.breakpointMarker = new Sprite(cache.breakpoints[1]);
    this.breakpointMarker.visible = false;
    this.container.addChild(this.background);
    this.container.addChild(this.overlay);
    this.container.addChild(this.breakpointMarker);
    this.container.addChild(this.tailGraphics);
  }

  paint(params: ColumnPaintParams): void {
    const { cache, notes, instruments, currentLayer, sizes } = params;
    this.container.x = sizes.width * params.index;
    // The other three of the container's own presentation properties, written for the same reason
    // the child properties below are: this object outlives the column it is painting for, and the
    // pool is keyed on it. Nothing in this class writes them elsewhere today, so these are writes
    // of the values they already hold - which is the point: a release/acquire cycle that starts
    // hiding or fading a view does not need a matching restore added somewhere else to be safe.
    this.container.y = 0;
    this.container.alpha = 1;
    this.container.visible = true;
    this.background.texture = params.background;
    this.paintSelection(cache, params.isSelected, params.isToolsSelected);
    this.breakpointMarker.texture = cache.breakpoints[1];
    this.breakpointMarker.visible = params.isBreakpoint;
    const strandedRows = computeStrandedRows(notes, instruments);
    let painted = 0;
    for (const [button, layerStatus] of computeRowLayerStatuses(notes, currentLayer, instruments)) {
      if (layerStatus === 0) continue;
      const texture = cache.notes[layerStatus];
      const sprite = this.noteSpriteAt(painted, texture);
      sprite.texture = texture;
      sprite.y = (COMPOSER_NOTE_POSITIONS[button] * sizes.height) / NOTES_PER_COLUMN;
      //stranded notes (id has no button on its own instrument) are visibly dimmed
      sprite.alpha = strandedRows.has(button) ? 0.45 : 1;
      sprite.visible = true;
      painted++;
    }
    for (let i = painted; i < this.paintedNotes; i++) this.noteSprites[i].visible = false;
    this.paintedNotes = painted;
  }

  /**
   * The selection overlay, which is the only thing a playback tick changes on a column that stays
   * in the window. Texture AND alpha depend on the (isSelected, isToolsSelected) PAIR - selected
   * wins over a tools selection covering the same column.
   */
  paintSelection(cache: ComposerCacheData, isSelected: boolean, isToolsSelected: boolean): void {
    const toolsOnly = isToolsSelected && !isSelected;
    this.overlay.texture = toolsOnly ? cache.standard[3] : cache.standard[2];
    this.overlay.alpha = toolsOnly ? 0.4 : 0.8;
    this.overlay.visible = isSelected || isToolsSelected;
  }

  private noteSpriteAt(index: number, texture: Texture): Sprite {
    const existing = this.noteSprites[index];
    if (existing) return existing;
    //grown on demand and never shrunk: the array ends up as deep as the densest column this view
    //has ever held, bounded by the number of display rows (game.notes.composerPositions.length)
    const sprite = new Sprite(texture);
    this.noteSprites.push(sprite);
    this.container.addChild(sprite);
    return sprite;
  }

  destroy(): void {
    // `context: true` also destroys the tail Graphics' own GraphicsContext (and its GPU geometry);
    // Container.destroy hands the same options to every child. There is no `texture` key, so the
    // ComposerCache textures the sprites merely BORROW are left alone - the cache owns those and
    // destroys them itself.
    this.container.destroy({ children: true, context: true });
  }
}

export class ComposerRenderer {
  private notesApp: Application | null = null;
  private timelineApp: Application | null = null;
  private wheelCanvas: HTMLCanvasElement | null = null;
  private cache: ComposerCache | null = null;
  private themeDispose: (() => void) | null = null;

  // Persistent scene objects, created once per renderer instance. notesColumnsContainer's children
  // are the pooled ColumnViews currently on screen (see the pool below); timelineContentContainer's
  // are rebuilt by drawTimelineStage, which only runs on the full-repaint path.
  private readonly notesColumnsContainer = new Container();
  private readonly timelineContentContainer = new Container();
  private readonly viewportGraphics = new Graphics();

  /**
   * The column pool. `columnViews` is what is ON SCREEN, keyed by column index; `freeColumnViews`
   * holds detached views waiting to be reused. The invariant, maintained by acquire/release and
   * nothing else: a view is in exactly one of the two, views in the map are children of
   * notesColumnsContainer in ASCENDING INDEX ORDER, and views in the free list have no parent.
   *
   * Ascending order is not cosmetic bookkeeping - it is what makes the pooled scene graph the same
   * tree the pre-pool rebuild produced, so "the pool changed nothing visible" is a claim about the
   * tree rather than about columns happening not to overlap.
   *
   * Every view holds textures from the CURRENT ComposerCache, so cache regeneration destroys the
   * pool outright (dropColumnPool) rather than releasing it - see recalculateCacheAndSizes.
   */
  private readonly columnViews = new Map<number, ColumnView>();
  private readonly freeColumnViews: ColumnView[] = [];

  private state: ComposerRendererState;
  /**
   * The state of the last update() that actually PAINTED the notes stage, or null when nothing
   * on screen can be trusted to match a state at all - no cache yet, recording audio, or the pool
   * just dropped. Null forces the next update onto the full path.
   *
   * It is the left-hand side of every comparison in needsFullRepaint; `this.state` is NOT, because
   * that one is overwritten on every call including the ones that paint nothing - diffing against
   * it would compare the incoming state against a moment that never reached the screen.
   *
   * Holding the object is safe: ComposerCanvas.svelte's $effect builds a fresh literal per run and
   * never mutates one it has handed over.
   */
  private paintedState: ComposerRendererState | null = null;
  /**
   * The longest span in the song, cached against (columns identity, structure version) - the same
   * pair needsFullRepaint diffs, for the same reason. The version moves on a graph edit but reads 0
   * on two different songs; the array identity moves on a song swap but not on every edit. Dropping
   * either half of the key returns a bound from the previous graph for the case the other half
   * covers, and test/composerRenderer.test.ts has a row for each.
   *
   * It bounds the backward scan in paintTails; an underestimate silently drops tails, so it is
   * recomputed rather than maintained incrementally. O(notes) once per structural edit, which is
   * user-paced - a tick that only moves `selected` leaves both halves of the key alone and reuses
   * the cached span.
   */
  private maxSpanCache: { columns: NoteColumn[]; structureVersion: number; span: number } | null =
    null;
  /**
   * The tail accent the pool is painted in, which is a different moment from `theme.tailAccent`.
   *
   * handleThemeChange replaces `this.theme` synchronously and then schedules the repaint through
   * recalculateCacheAndSizes' 50ms debounce. An update() landing in between takes the fast path and
   * repaints only the column that entered the window - so reading the new accent there would put
   * one column in the new colour beside a window still painted in the old one. This copy moves with
   * the repaint instead, so the columns on screen agree with each other. (The notes stage as a
   * whole still trails the DOM and the timeline for the length of that debounce; the textures do
   * too, and both catch up in the same repaint.)
   */
  private paintTailAccent: number;

  private numberOfColumnsPerCanvas: number;
  private width: number;
  private height: number;
  private columnSize: { width: number; height: number };
  private timelineHeight = 30;
  private stageBackgroundColor: number;
  private theme: ComposerRendererTheme;

  // Scroll/drag state machine.
  private stageSelected = false;
  private sliderSelected = false;
  // QUIRK: hasSlided is write-only (set true in handleSliderSlide, never read) and
  // currentBreakpoint below is never read or written past its initializer - both dead fields,
  // preserved inert rather than removed.
  private hasSlided = false;
  private stagePreviousPositon = 0;
  private stageXMovement = 0;
  private stageMovementAmount = 0;
  private sliderOffset = 0;
  private throttleScroll = 0;
  private onSlider = false;
  private cacheRecalculateDebounce: Timer = 0;
  private currentBreakpoint = -1;

  constructor(
    private readonly notesContainer: HTMLElement,
    private readonly timelineContainer: HTMLElement,
    initialState: ComposerRendererState,
    private readonly callbacks: ComposerRendererCallbacks
  ) {
    this.state = initialState;
    this.numberOfColumnsPerCanvas = initialState.columnsPerCanvas;
    // Placeholders - init() always overwrites width/height/columnSize with the real computed
    // size before any Application is created.
    this.width = 300;
    this.height = 150;
    this.columnSize = { width: nearestEven(300 / this.numberOfColumnsPerCanvas), height: 150 };
    this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber();
    // Placeholder - init() calls subscribeTheme(this.handleThemeChange) before anything else
    // runs, and that callback fires synchronously once, overwriting this before first draw().
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
      tailAccent: ThemeProvider.get('accent').rgbNumber(),
    };
    this.paintTailAccent = this.theme.tailAccent;
  }

  // ComposerCanvas.svelte's onMount must await this before ever calling update().
  async init(): Promise<void> {
    const { width, height, columnWidth } = this.computeCanvasSize();
    this.width = width;
    this.height = height;
    this.columnSize = { width: columnWidth, height };
    this.timelineHeight = isMobile() ? 25 : 30;

    this.notesApp = new Application();
    await this.notesApp.init({
      width: this.width,
      height: this.height,
      background: this.stageBackgroundColor,
      autoDensity: true,
      autoStart: false,
      antialias: true,
      resolution: window.devicePixelRatio ?? 1.4,
    });
    this.notesContainer.appendChild(this.notesApp.canvas);
    this.wheelCanvas = this.notesApp.canvas;
    this.wheelCanvas.addEventListener('wheel', this.handleWheel);
    this.applyNotesCanvasOpacity();
    this.notesApp.renderer.background.color = this.theme.main.background;
    this.notesColumnsContainer.eventMode = 'static';
    this.notesColumnsContainer.interactiveChildren = false;
    this.notesColumnsContainer.hitArea = this.testStageHitarea;
    this.notesColumnsContainer.on('pointerdown', this.handleClickStage);
    this.notesColumnsContainer.on('pointerup', this.handleClickStageUp);
    this.notesColumnsContainer.on('pointermove', this.handleStageSlide);
    this.notesApp.stage.addChild(this.notesColumnsContainer);

    this.timelineApp = new Application();
    await this.timelineApp.init({
      width: this.width,
      height: this.timelineHeight,
      backgroundAlpha: 0,
      autoDensity: true,
      autoStart: false,
      antialias: true,
      resolution: window.devicePixelRatio ?? 1.4,
    });
    this.timelineContainer.appendChild(this.timelineApp.canvas);
    this.timelineContentContainer.eventMode = 'static';
    this.timelineContentContainer.interactiveChildren = false;
    this.timelineContentContainer.hitArea = this.testTimelineHitarea;
    this.timelineContentContainer.on('pointerdown', this.handleClickDown);
    this.timelineContentContainer.on('pointerup', this.handleClickUp);
    this.timelineContentContainer.on('pointermove', this.handleSliderSlide);
    this.timelineApp.stage.addChild(this.timelineContentContainer);
    // viewportGraphics is a sibling added after the content container, so it renders on top.
    this.timelineApp.stage.addChild(this.viewportGraphics);

    window.addEventListener('resize', this.recalculateCacheAndSizes);
    window.addEventListener('pointerup', this.resetPointerDown);
    window.addEventListener('blur', this.resetPointerDown);

    this.themeDispose = subscribeTheme(this.handleThemeChange);
    // subscribeTheme's callback fires synchronously once before returning, which already
    // calls recalculateCacheAndSizes via handleThemeChange - no separate call needed here.
  }

  private computeCanvasSize(): { width: number; height: number; columnWidth: number } {
    const sizes = document.body.getBoundingClientRect();
    let width = nearestEven(sizes.width * 0.85 - 45);
    let height = nearestEven(sizes.height * 0.45);
    height = nearestEven(height * game.notes.composerRowHeightScale);
    if (this.state.inPreview) {
      width = nearestEven(width * (sizes.width < 900 ? 0.8 : 0.55));
      height = nearestEven(height * (sizes.width < 900 ? 0.8 : 0.6));
    }
    const columnWidth = nearestEven(width / this.numberOfColumnsPerCanvas);
    return { width, height, columnWidth };
  }

  private recalculateCacheAndSizes = () => {
    if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce);
    this.cacheRecalculateDebounce = setTimeout(() => {
      if (!this.notesApp || !this.timelineApp) return;
      const { width, height, columnWidth } = this.computeCanvasSize();
      this.notesApp.renderer.resize(width, height);
      this.timelineApp.renderer.resize(width, this.timelineHeight);
      const oldCache = this.cache;
      this.width = width;
      this.height = height;
      this.columnSize = { width: columnWidth, height };
      this.cache = this.generateCache(
        columnWidth,
        height,
        isMobile() ? 2 : 4,
        isMobile() ? 25 : 30
      );
      // EVERY input to a pooled view changed here: the column geometry AND every texture it holds
      // (the old cache's textures are destroyed 500ms below, so a surviving pool would end up
      // pointing at destroyed GPU resources). Nothing in the state diff can see any of this - theme
      // and resize have no props channel - so the pool is dropped outright rather than released for
      // reuse, and draw() below repaints from nothing.
      this.dropColumnPool();
      // ...and the accent the pool paints tails in moves here, with the repaint below, rather than
      // when handleThemeChange replaced this.theme - see the field.
      this.paintTailAccent = this.theme.tailAccent;
      this.notifyGeometry();
      // draw() rebuilds and explicitly repaints the static scenes after cache regeneration.
      this.draw();
      // QUIRK: destroying the previous cache is delayed 500ms after the new one is created -
      // destroying it immediately causes visible texture glitches (found empirically; root
      // cause not identified).
      setTimeout(() => {
        oldCache?.destroy();
      }, 500);
    }, 50);
  };

  private generateCache(
    columnWidth: number,
    height: number,
    margin: number,
    timelineHeight: number
  ): ComposerCache | null {
    const colors = {
      l: ThemeProvider.get('primary'), //light
      d: ThemeProvider.get('primary'), //dark
    };
    colors.l = colors.l.luminosity() < 0.05 ? colors.l.lighten(0.4) : colors.l.lighten(0.1);
    colors.d = colors.d.luminosity() < 0.05 ? colors.d.lighten(0.15) : colors.d.darken(0.03);
    if (!this.notesApp || !this.timelineApp) return null;
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
          { color: colors.l.rgb().rgbNumber() }, //lighter
          { color: colors.d.rgb().rgbNumber() }, //darker
          { color: ThemeProvider.get('composer_accent').rgb().rgbNumber() }, //current
          { color: ThemeProvider.get('composer_accent').negate().rgb().rgbNumber() }, //selected
        ],
      },
    });
  }

  // The notes canvas' own CSS opacity, taken from the theme's background alpha. It is a DOM style
  // on the pixi canvas ELEMENT rather than anything in the pixi scene, so a scene description
  // cannot see it while it drives the whole canvas to invisible on its own.
  // test/composerRenderer.test.ts reads the element's whole inline style beside the scene, and
  // states the declaration it expects from ThemeProvider - see its expectedCanvasStyle.
  private applyNotesCanvasOpacity = () => {
    if (this.wheelCanvas)
      this.wheelCanvas.style.opacity = String(this.theme.main.backgroundOpacity);
  };

  private handleWheel = (e: WheelEvent) => {
    this.callbacks.selectColumn(this.state.selected + Math.sign(e.deltaY), true);
  };

  private handleClick = (e: FederatedPointerEvent, type: ClickEventType) => {
    const x = e.globalX;
    const { width, numberOfColumnsPerCanvas, state } = this;
    this.stageXMovement = 0;
    this.stageMovementAmount = 0;
    if (type === 'up') {
      this.sliderSelected = false;
    }
    if (type === 'down-slider') {
      this.sliderSelected = true;
      const relativeColumnWidth = width / state.columns.length;
      const stageSize = relativeColumnWidth * (numberOfColumnsPerCanvas + 1);
      const stagePosition =
        relativeColumnWidth * state.selected - (numberOfColumnsPerCanvas / 2) * relativeColumnWidth;
      this.onSlider = x > stagePosition && x < stagePosition + stageSize;
      this.sliderOffset = stagePosition + stageSize / 2 - x;
      this.throttleScroll = Number.MAX_SAFE_INTEGER;
      this.handleSliderSlide(e);
    }
    if (type === 'down-stage') {
      this.stagePreviousPositon = x;
      this.stageSelected = true;
    }
  };

  private handleClickStage = (e: FederatedPointerEvent) => {
    this.handleClick(e, 'down-stage');
  };

  private handleClickStageUp = (e: FederatedPointerEvent) => {
    this.stageSelected = false;
    if (this.stageMovementAmount === 0) {
      const middle = (this.numberOfColumnsPerCanvas / 2) * this.columnSize.width;
      const clickedOffset = Math.floor((e.globalX - middle) / this.columnSize.width + 1);
      if (clickedOffset === 0) return;
      const newPosition = this.state.selected + Math.round(clickedOffset);
      this.callbacks.selectColumn(clamp(newPosition, 0, this.state.columns.length - 1));
    }
  };

  private handleClickDown = (e: FederatedPointerEvent) => {
    this.handleClick(e, 'down-slider');
  };

  private handleClickUp = (e: FederatedPointerEvent) => {
    this.handleClick(e, 'up');
  };

  private handleStageSlide = (e: FederatedPointerEvent) => {
    const x = e.globalX;
    const amount = this.stagePreviousPositon - x;
    this.stagePreviousPositon = x;
    if (this.stageSelected) {
      const threshold = this.columnSize.width;
      this.stageXMovement += amount;
      const amountToMove = (this.stageXMovement - this.stageMovementAmount * threshold) / threshold;
      if (Math.abs(amountToMove) < 1) return;
      this.stageMovementAmount += Math.round(amountToMove);
      const newPosition = this.state.selected + Math.round(amountToMove);
      this.callbacks.selectColumn(clamp(newPosition, 0, this.state.columns.length - 1), true);
    }
  };

  // Called by ComposerCanvas.svelte's prev/next-breakpoint buttons and its own
  // composer_canvas shortcut listener.
  handleBreakpoints = (direction: 1 | -1) => {
    const { selected, columns, breakpoints } = this.state;
    const breakpoint =
      direction === 1 //1 = right, -1 = left
        ? breakpoints.filter((v) => v > selected).sort((a, b) => a - b)
        : breakpoints.filter((v) => v < selected).sort((a, b) => b - a);
    if (breakpoint.length === 0) return;
    if (columns.length >= breakpoint[0] && breakpoint[0] >= 0) {
      this.callbacks.selectColumn(breakpoint[0]);
    }
  };

  private handleSliderSlide = (e: FederatedPointerEvent) => {
    const globalX = e.globalX;
    if (this.sliderSelected) {
      if (this.throttleScroll++ < 4) return;
      const { width, columnSize, state } = this;
      this.hasSlided = true;
      this.throttleScroll = 0;
      const totalWidth = columnSize.width * state.columns.length;
      const x = this.onSlider ? globalX + this.sliderOffset : globalX;
      const relativePosition = Math.floor(((x / width) * totalWidth) / columnSize.width);
      this.callbacks.selectColumn(clamp(relativePosition, 0, state.columns.length - 1), true);
    }
  };

  private testStageHitarea = {
    contains: (x: number, y: number) => {
      if (this.stageSelected) return true; //if stage is selected, we want to be able to move it even if we are outside the timeline
      const width = this.columnSize.width * this.state.columns.length;
      if (x < 0 || x > width || y < 0 || y > this.height) return false;
      return true;
    },
  };

  private testTimelineHitarea = {
    contains: (x: number, y: number) => {
      if (this.sliderSelected) return true; //if slider is selected, we want to be able to move it even if we are outside the timeline
      if (x < 0 || x > this.width || y < 0 || y > this.timelineHeight) return false;
      return true;
    },
  };

  private resetPointerDown = () => {
    this.stageSelected = false;
    this.sliderSelected = false;
    this.stagePreviousPositon = 0;
  };

  private handleThemeChange = () => {
    this.stageBackgroundColor = ThemeProvider.get('primary').rgb().rgbNumber();
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
      tailAccent: ThemeProvider.get('accent').rgbNumber(),
    };
    this.recalculateCacheAndSizes();
    if (this.notesApp) this.notesApp.renderer.background.color = this.theme.main.background;
    this.applyNotesCanvasOpacity();
  };

  private notifyGeometry() {
    this.callbacks.onGeometryChange({ width: this.width, hasCache: this.cache !== null });
  }

  // The entry point ComposerCanvas.svelte's $effect calls on every reactive-state change - the
  // props channel; theme reaches this class separately, through subscribeTheme.
  // Does not re-read columnsPerCanvas: a changed value arrives via a fresh ComposerRenderer
  // instance instead, because the parent wraps this component in
  // {#key settings.columnsPerCanvas.value}.
  //
  // THREE OUTCOMES, cheapest last:
  //  - full repaint, when needsFullRepaint reports a change - or when there is no trustworthy
  //    baseline to compare against at all (see paintedState);
  //  - `selected` moved and needsFullRepaint reported nothing: drawSelectedMoved, which applies
  //    the shift to the scene already on screen. That is the playback tick, and it is the reason
  //    this diff exists - during playback the structure does not change, so the diff has nothing
  //    to report and the tick costs O(window) rather than O(song).
  //  - `selected` did not move either: return without rendering. A state differing from the last
  //    painted one only in fields needsFullRepaint does not compare lands here; that method's
  //    closing paragraph says what each of those is doing on the state object.
  update(state: ComposerRendererState): void {
    const previous = this.paintedState;
    // FIRST, unconditionally, and before any early return: the pointer/wheel/hitarea handlers all
    // read this.state, and they must never see the state of a previous update.
    this.state = state;
    if (previous === null) return this.draw();
    const cacheData = this.cache?.cache;
    if (!cacheData) return this.draw();
    if (this.needsFullRepaint(previous, state)) return this.draw();
    if (previous.selected === state.selected) return;
    this.drawSelectedMoved(previous.selected, cacheData);
  }

  /**
   * Everything the painted output depends on EXCEPT `selected` - which is the one input the fast
   * path knows how to apply incrementally.
   *
   * The comparisons are identity comparisons on purpose, and they are only sound because each of
   * `instruments`, `breakpoints` and `selectedColumns` is REPLACED rather than edited in place by
   * whoever owns it: the first two are `$state.raw` on the song, the third is `$state.raw` in
   * Composer.svelte.
   *
   * `columns` is the one that does NOT work that way, and it is why `structureVersion` is compared
   * beside it. Some of ComposedSong's mutators install a new array and some edit the one that is
   * there, so the identity moves on an edit sometimes and not others - a moved identity forces a
   * full repaint, which is the safe direction, but an unmoved one proves nothing. The version moves
   * on every graph edit and cannot see a song SWAP (a freshly loaded song sits at 0, which the
   * previous song may too). Neither alone is sufficient.
   *
   * Not compared, and why. `isPlaying` is read nowhere in this class - see its field. `inPreview`
   * and `columnsPerCanvas` both decide geometry, and `inPreview` decides a great deal of it (it
   * scales both canvas dimensions in computeCanvasSize, so it moves every column's x, every note's
   * y and the size of both canvases) - but neither reaches update() as a CHANGE: Composer.svelte
   * passes `inPreview` as a static prop, and a changed `columnsPerCanvas` arrives as a fresh
   * ComposerRenderer instead, because the parent wraps the canvas in
   * {#key settings.columnsPerCanvas.value}. Theme, canvas size and textures have no props channel
   * to compare at all; they reach the scene through recalculateCacheAndSizes, which drops the pool
   * and, with it, the baseline this diffs against.
   */
  private needsFullRepaint(previous: ComposerRendererState, next: ComposerRendererState): boolean {
    return (
      // not `previous.isRecordingAudio !== next.isRecordingAudio`: a baseline is only recorded by a
      // run that painted, which cannot be one where this was true. Written as an absolute so that
      // stays true even if the baseline rule is ever loosened - the pool must never be advanced
      // incrementally while the container it lives in is hidden.
      next.isRecordingAudio ||
      previous.columns !== next.columns ||
      previous.structureVersion !== next.structureVersion ||
      previous.instruments !== next.instruments ||
      previous.breakpoints !== next.breakpoints ||
      previous.selectedColumns !== next.selectedColumns ||
      previous.currentLayer !== next.currentLayer ||
      previous.beatMarks !== next.beatMarks
    );
  }

  /** beatMarks is 3 or 4 in the shipped options; 0 would mean "off" and falls back to 12. */
  private counterLimit(): number {
    const beatMarks = this.state.beatMarks;
    return beatMarks === 0 ? 12 : 4 * beatMarks;
  }

  /**
   * The drawn window, clamped to the song. `last < first` means nothing is drawn (an empty song).
   *
   * Closed form of isColumnVisible's set: the smallest integer strictly greater than
   * selected - threshold, and the largest strictly less than selected + threshold. The two are
   * pinned against each other in test/composerRenderer.test.ts rather than assumed equal - the
   * thresholds are half-integers for odd columnsPerCanvas values, which is where a naive
   * `selected ± n/2` form stops agreeing.
   */
  private visibleColumnRange(): { first: number; last: number } {
    const threshold = this.numberOfColumnsPerCanvas / 2 + 2;
    const { selected, columns } = this.state;
    return {
      first: Math.max(0, Math.floor(selected - threshold) + 1),
      last: Math.min(columns.length - 1, Math.ceil(selected + threshold) - 1),
    };
  }

  private acquireColumnView(index: number, cacheData: ComposerCacheData): ColumnView {
    const view = this.freeColumnViews.pop() ?? new ColumnView(cacheData);
    //counted, not searched: the map holds only the drawn window, so this is at most a few dozen
    //integer comparisons, and it is what keeps the container's children in ascending index order
    let position = 0;
    for (const attached of this.columnViews.keys()) if (attached < index) position++;
    this.notesColumnsContainer.addChildAt(view.container, position);
    this.columnViews.set(index, view);
    return view;
  }

  private releaseColumnView(index: number, view: ColumnView): void {
    this.notesColumnsContainer.removeChild(view.container);
    this.columnViews.delete(index);
    this.freeColumnViews.push(view);
  }

  /** Release every view outside [first, last]; the survivors keep whatever they last painted. */
  private releaseColumnViewsOutside(first: number, last: number): void {
    for (const [index, view] of this.columnViews) {
      if (index < first || index > last) this.releaseColumnView(index, view);
    }
  }

  /** The on-screen half of the pool, back into the free list. Deleting from a Map being iterated is
   *  defined behaviour - an already-visited entry stays visited, an unvisited one is skipped. */
  private releaseAllColumnViews(): void {
    for (const [index, view] of this.columnViews) this.releaseColumnView(index, view);
  }

  /** Destroy the pool outright - both halves. Used when the textures the views hold stop existing. */
  private dropColumnPool(): void {
    this.releaseAllColumnViews();
    for (const view of this.freeColumnViews) view.destroy();
    this.freeColumnViews.length = 0;
    // The pool and the paint baseline describe the same thing - "this window has been painted for
    // this state" - so they are invalidated together and cannot drift apart. Its callers today
    // either redraw immediately afterwards (recalculateCacheAndSizes) or are on their way out
    // (destroy); what runs in between on the first of those calls back into Svelte
    // (notifyGeometry) while the pool is empty and the baseline null.
    this.paintedState = null;
  }

  private paintColumn(
    index: number,
    cacheData: ComposerCacheData,
    sizes: { width: number; height: number },
    counterLimit: number
  ): void {
    const state = this.state;
    const column = state.columns[index];
    const tempoChangersCache = (index + 1) % 4 === 0 ? cacheData.columnsLarger : cacheData.columns;
    const standardCache = (index + 1) % 4 === 0 ? cacheData.standardLarger : cacheData.standard;
    const background =
      column.tempoChanger === 0
        ? standardCache[Number(index % (counterLimit * 2) >= counterLimit)]
        : tempoChangersCache[column.tempoChanger];
    const view = this.columnViews.get(index) ?? this.acquireColumnView(index, cacheData);
    view.paint({
      index,
      notes: column.notes,
      currentLayer: state.currentLayer,
      instruments: state.instruments,
      sizes,
      cache: cacheData,
      background,
      isToolsSelected: state.selectedColumns.includes(index),
      isSelected: index === state.selected,
      isBreakpoint: state.breakpoints.includes(index),
    });
    this.paintTails(view.tailGraphics, index, sizes);
  }

  /**
   * Span tails render UNDER the note icons: a connector bar through covered columns (right-half
   * stub in the start column), accent for the current layer, dim otherwise.
   *
   * Backward scan, bounded by the song's longest span, and EXACT rather than approximate. A note
   * starting at `start` covers `index` iff `start <= index < start + span`; the pre-pool version
   * derived the same set by scanning columns 0..visibleEnd and clipping each span to the window,
   * which produced identical segments for a visible column (the clip collapses once
   * visibleStart <= index < visibleEnd) at a cost that GREW as playback advanced - at column 700 of
   * an 800-column song it read 720 columns and every note in them, to draw 39 columns.
   *
   * A column's tails therefore do not depend on the window position at all: shifting the window
   * changes nothing inside a column that stays visible, which is what lets the fast path repaint
   * only the column that entered.
   */
  private paintTails(
    graphics: Graphics,
    index: number,
    sizes: { width: number; height: number }
  ): void {
    graphics.clear();
    const { columns, instruments, currentLayer } = this.state;
    const rowHeight = sizes.height / NOTES_PER_COLUMN;
    const tailHeight = Math.max(2, rowHeight * 0.22);
    const accentColor = this.paintTailAccent;
    const first = Math.max(0, index - this.maxSpan() + 1);
    for (let start = first; start <= index; start++) {
      const notes = columns[start].notes;
      for (const note of notes) {
        if (note.span <= 1) continue;
        if (start + note.span <= index) continue;
        const instrument = instruments[note.trackIndex];
        const isCurrentLayer = note.trackIndex === currentLayer;
        if (!isCurrentLayer && !instrument?.visible) continue;
        const button = displayButtonForId(instrument?.name ?? '', note.id);
        if (button === -1) continue;
        const y = COMPOSER_NOTE_POSITIONS[button] * rowHeight + (rowHeight - tailHeight) / 2;
        const x = index === start ? sizes.width * 0.55 : 0;
        graphics.rect(x, y, sizes.width - x, tailHeight).fill({
          color: isCurrentLayer ? accentColor : 0x888888,
          alpha: isCurrentLayer ? 0.75 : 0.35,
        });
      }
    }
  }

  /**
   * The longest span in the song. Recomputed when the graph moved (or when the song was swapped),
   * never during playback - see the maxSpanCache declaration for why the key is that pair.
   *
   * ComposedSong has no maintained maximum: `maxSpanAt` is a different quantity (the longest span a
   * note MAY take at a position), and normalizeSpans only clamps against the next same-(track, id)
   * note, so one note may legally span the whole song. That degenerate case costs one full-song
   * scan per structural edit here, not one per tick.
   */
  private maxSpan(): number {
    const { columns, structureVersion } = this.state;
    const cached = this.maxSpanCache;
    if (cached && cached.columns === columns && cached.structureVersion === structureVersion) {
      return cached.span;
    }
    let span = 1;
    for (const column of columns) {
      for (const note of column.notes) if (note.span > span) span = note.span;
    }
    this.maxSpanCache = { columns, structureVersion, span };
    return span;
  }

  /**
   * The full repaint: both scenes, from scratch. Reached on the first update, on every edit, and
   * from recalculateCacheAndSizes (which is a second entry point into drawing, bypassing update()
   * entirely - theme and resize have no state channel).
   */
  private draw(): void {
    if (!this.notesApp || !this.timelineApp) return;
    const cacheData = this.cache?.cache;
    const sizes = this.columnSize;
    const state = this.state;
    const xPosition = (state.selected - this.numberOfColumnsPerCanvas / 2 + 1) * -sizes.width;
    const relativeColumnWidth = this.width / state.columns.length;
    const timelineWidth = Math.floor(relativeColumnWidth * (this.width / sizes.width + 1));
    const timelinePosition =
      relativeColumnWidth * state.selected -
      relativeColumnWidth * (this.numberOfColumnsPerCanvas / 2);

    const painted = this.drawNotesStage(cacheData, sizes, xPosition);
    this.drawTimelineStage(cacheData, relativeColumnWidth, timelineWidth, timelinePosition);
    this.notesApp.render();
    this.timelineApp.render();
    // The baseline is only the state of a run that ACTUALLY PAINTED the notes stage. Recording it
    // after a run that painted nothing (no cache yet, recording audio) would let the next update
    // diff against a moment that never reached the screen, and the pool would come back showing a
    // window it had never been asked to repaint.
    this.paintedState = painted ? state : null;
  }

  /** @returns whether the notes stage actually painted (see draw() for what that decides). */
  private drawNotesStage(
    cacheData: ComposerCacheData | undefined,
    sizes: { width: number; height: number },
    xPosition: number
  ): boolean {
    this.notesColumnsContainer.x = xPosition;
    const visible = Boolean(cacheData) && !this.state.isRecordingAudio;
    this.notesColumnsContainer.visible = visible;
    if (!visible || !cacheData) {
      // The pool is left exactly as it is - hidden, not released and not destroyed, so the stage
      // costs nothing to bring back. What keeps that from showing a stale window is draw()'s rule
      // that a run reaching here records NO baseline: the next paintable update has nothing to diff
      // against and repaints every column of the window, whatever the views happen to be holding.
      return false;
    }
    const counterLimit = this.counterLimit();
    const { first, last } = this.visibleColumnRange();
    this.releaseColumnViewsOutside(first, last);
    // Iterates the WINDOW, not the whole song. The pre-pool version walked every column of the
    // song and filtered with isColumnVisible inside the callback - a second O(song) pass per draw,
    // on top of the tail scan.
    for (let index = first; index <= last; index++) {
      this.paintColumn(index, cacheData, sizes, counterLimit);
    }
    return true;
  }

  /**
   * The playback tick: applying a moved `selected` to a scene that is otherwise already painted.
   *
   * What a column paints is a function of its index and its content, so a view that stays in the
   * window keeps what it already painted. This moves the notes container's offset and the timeline
   * viewport's x; it changes the MEMBERSHIP of the window - views whose columns left go back to the
   * free list, columns that entered are acquired and painted; it repaints the selection overlay of
   * the column that gained the flag and of the one that lost it; then it renders both Applications
   * and records the state it painted as the new baseline.
   *
   * Reached from update() with a baseline recorded (a cache regeneration clears that along with the
   * pool, so the views here hold the current textures and the current geometry), with a cache, with
   * `selected` moved, and with needsFullRepaint reporting nothing.
   */
  private drawSelectedMoved(previousSelected: number, cacheData: ComposerCacheData): void {
    if (!this.notesApp || !this.timelineApp) return;
    const sizes = this.columnSize;
    const state = this.state;
    this.notesColumnsContainer.x =
      (state.selected - this.numberOfColumnsPerCanvas / 2 + 1) * -sizes.width;
    const counterLimit = this.counterLimit();
    const { first, last } = this.visibleColumnRange();
    this.releaseColumnViewsOutside(first, last);
    for (let index = first; index <= last; index++) {
      // Columns that were already in the window keep what they painted: their content, their
      // index-derived background and their tails are all unchanged by a window shift.
      if (!this.columnViews.has(index)) this.paintColumn(index, cacheData, sizes, counterLimit);
    }
    // The column that lost the flag and the one that gained it. Neither changes its BACKGROUND -
    // selection is a separate overlay sprite - and after a large jump either may be outside the
    // window, in which case paintSelectionOverlay finds no view and does nothing.
    this.paintSelectionOverlay(previousSelected, cacheData);
    this.paintSelectionOverlay(state.selected, cacheData);
    const relativeColumnWidth = this.width / state.columns.length;
    this.viewportGraphics.x =
      relativeColumnWidth * state.selected -
      relativeColumnWidth * (this.numberOfColumnsPerCanvas / 2);
    this.notesApp.render();
    this.timelineApp.render();
    this.paintedState = state;
  }

  private paintSelectionOverlay(index: number, cacheData: ComposerCacheData): void {
    const view = this.columnViews.get(index);
    if (!view) return;
    view.paintSelection(
      cacheData,
      index === this.state.selected,
      this.state.selectedColumns.includes(index)
    );
  }

  private drawTimelineStage(
    cacheData: ComposerCacheData | undefined,
    relativeColumnWidth: number,
    timelineWidth: number,
    timelinePosition: number
  ) {
    for (const child of this.timelineContentContainer.removeChildren())
      child.destroy({ children: true });
    // viewportGraphics below is drawn regardless of cacheData - only the background/
    // selection/breakpoints here are gated on it.
    if (cacheData) {
      const background = new Graphics();
      background.rect(0, 0, this.width, this.timelineHeight);
      background.fill({ color: this.theme.timeline.hexNumber });
      this.timelineContentContainer.addChild(background);

      if (this.state.selectedColumns.length) {
        const first = this.state.selectedColumns[0] || 0;
        const last = this.state.selectedColumns[this.state.selectedColumns.length - 1];
        const x = first * relativeColumnWidth;
        const xEnd = last * relativeColumnWidth;
        const selectedRange = new Graphics();
        selectedRange.rect(x, 0, xEnd - x, this.timelineHeight);
        selectedRange.fill({ color: this.theme.timeline.selected, alpha: 0.6 });
        this.timelineContentContainer.addChild(selectedRange);
      }

      const breakpointsTexture = cacheData.breakpoints[0];
      this.state.breakpoints.forEach((breakpoint) => {
        const sprite = new Sprite(breakpointsTexture);
        sprite.eventMode = 'passive';
        sprite.anchor.set(0.5, 0);
        // QUIRK: `columns.length - 1` here while every other timeline value divides by
        // `columns.length` (see draw()'s relativeColumnWidth). Preserved verbatim - it is a
        // pixel-level difference that predates the pool, and it is why a one-column song puts a
        // breakpoint at NaN.
        sprite.x = (this.width / (this.state.columns.length - 1)) * breakpoint;
        this.timelineContentContainer.addChild(sprite);
      });
    }

    this.viewportGraphics.clear();
    this.viewportGraphics.roundRect(0, 0, timelineWidth, this.timelineHeight - 3, 6);
    this.viewportGraphics.stroke({ width: 3, color: this.theme.timeline.border, alpha: 0.8 });
    this.viewportGraphics.x = timelinePosition;
    this.viewportGraphics.y = 1.5;
  }

  // Both Applications must be explicitly destroyed to avoid a WebGL/canvas leak on remount
  // (this component remounts via {#key settings.columnsPerCanvas.value}).
  destroy(): void {
    window.removeEventListener('resize', this.recalculateCacheAndSizes);
    window.removeEventListener('pointerup', this.resetPointerDown);
    window.removeEventListener('blur', this.resetPointerDown);
    if (this.cacheRecalculateDebounce) clearTimeout(this.cacheRecalculateDebounce);
    this.wheelCanvas?.removeEventListener('wheel', this.handleWheel);
    this.themeDispose?.();
    // Before the Applications go: app.destroy({children: true}) only reaches what hangs off the
    // STAGE, and a released view is parked outside the scene graph entirely.
    this.dropColumnPool();
    this.cache?.destroy();
    this.notesApp?.destroy(true, { children: true });
    this.timelineApp?.destroy(true, { children: true });
    this.notesApp = null;
    this.timelineApp = null;
    this.wheelCanvas = null;
  }
}
