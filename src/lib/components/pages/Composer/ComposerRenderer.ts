// This class owns all pixi state: both Applications (notes stage + timeline stage), the
// ComposerCache, the scroll/drag state machine, and the update(state) entry point that rebuilds
// the visible-column container and timeline content every call. ComposerCanvas.svelte owns
// lifecycle only - it constructs this class in onMount, awaits init(), feeds it state via
// update(), and renders the surrounding DOM.
//
// Theme reaches this class via subscribeTheme(cb); ComposerCanvas.svelte separately derives the
// handful of theme values its own DOM needs via $derived off the same ThemeProvider singleton.
// This duplicates a few color formulas between the two files (numeric here for pixi draw calls,
// CSS strings there) - deliberate, not an oversight. The only values this class reports back to
// the Svelte side (via ComposerRendererCallbacks.onGeometryChange) are width and hasCache -
// pixi/DOM-measurement-derived values the template cannot re-derive on its own.
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
import type { ComposedSong } from '$core/Songs/ComposedSong';
import type { ComposerSettingsDataType } from '$core/BaseSettings';
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
}

// The reactive input ComposerCanvas.svelte pushes into update() on every relevant change via its
// own $effect.
export interface ComposerRendererState {
  columns: NoteColumn[];
  isPlaying: boolean;
  isRecordingAudio: boolean;
  song: ComposedSong;
  selected: number;
  currentLayer: number;
  inPreview?: boolean;
  settings: ComposerSettingsDataType;
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

export function isColumnVisible(pos: number, currentPos: number, numberOfColumnsPerCanvas: number) {
  const threshold = numberOfColumnsPerCanvas / 2 + 2;
  return currentPos - threshold < pos && pos < currentPos + threshold;
}

/** One span-tail segment crossing (or starting in) a column, at a display row. */
export interface TailSegment {
  button: number;
  isCurrentLayer: boolean;
  /** true in the span's start column: draw only the right half (a stub out of the note icon). */
  isStart: boolean;
}

interface RenderColumnParams {
  notes: ColumnNote[];
  tails: TailSegment[];
  accentColor: number;
  currentLayer: number;
  instruments: InstrumentData[];
  index: number;
  sizes: { width: number; height: number };
  cache: ComposerCacheData;
  backgroundCache: Texture;
  isBreakpoint: boolean;
  isSelected: boolean;
  isToolsSelected: boolean;
}

// background carries the selected/tools-selected overlay and the breakpoint marker as its own
// children (not siblings) - note sprites are separate, siblings of background under the column
// container.
function renderColumn({
  notes,
  tails,
  accentColor,
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
  const columnContainer = new Container();
  columnContainer.x = sizes.width * index;

  const background = new Sprite(backgroundCache);
  if (isSelected || isToolsSelected) {
    const overlay = new Sprite(
      isToolsSelected && !isSelected ? cache.standard[3] : cache.standard[2]
    );
    overlay.alpha = isToolsSelected && !isSelected ? 0.4 : 0.8;
    overlay.zIndex = 1;
    // background is a Sprite; PixiJS v8 logs a one-time deprecation warning for addChild on
    // non-Container nodes ("Only Containers will be allowed to add children in v8.0.0") but
    // still supports it - nesting is kept here to match the intended child order above.
    background.addChild(overlay);
  }
  if (isBreakpoint) {
    background.addChild(new Sprite(cache.breakpoints[1]));
  }
  columnContainer.addChild(background);

  //span tails render UNDER the note icons: a connector bar through covered columns
  //(right-half stub in the start column), accent for the current layer, dim otherwise
  if (tails.length > 0) {
    const rowHeight = sizes.height / NOTES_PER_COLUMN;
    const tailHeight = Math.max(2, rowHeight * 0.22);
    const tailGraphics = new Graphics();
    for (const tail of tails) {
      const y = COMPOSER_NOTE_POSITIONS[tail.button] * rowHeight + (rowHeight - tailHeight) / 2;
      const x = tail.isStart ? sizes.width * 0.55 : 0;
      tailGraphics.rect(x, y, sizes.width - x, tailHeight).fill({
        color: tail.isCurrentLayer ? accentColor : 0x888888,
        alpha: tail.isCurrentLayer ? 0.75 : 0.35,
      });
    }
    columnContainer.addChild(tailGraphics);
  }
  const strandedRows = computeStrandedRows(notes, instruments);
  for (const [button, layerStatus] of computeRowLayerStatuses(notes, currentLayer, instruments)) {
    if (layerStatus === 0) continue;
    const noteSprite = new Sprite(cache.notes[layerStatus]);
    noteSprite.y = (COMPOSER_NOTE_POSITIONS[button] * sizes.height) / NOTES_PER_COLUMN;
    //stranded notes (id has no button on its own instrument) are visibly dimmed
    if (strandedRows.has(button)) noteSprite.alpha = 0.45;
    columnContainer.addChild(noteSprite);
  }
  return columnContainer;
}

export class ComposerRenderer {
  private notesApp: Application | null = null;
  private timelineApp: Application | null = null;
  private wheelCanvas: HTMLCanvasElement | null = null;
  private cache: ComposerCache | null = null;
  private themeDispose: (() => void) | null = null;

  // Persistent scene objects (created once per renderer instance, children rebuilt on every
  // draw() - see that method for why a full rebuild is used instead of an incremental diff).
  private readonly notesColumnsContainer = new Container();
  private readonly timelineContentContainer = new Container();
  private readonly viewportGraphics = new Graphics();

  private state: ComposerRendererState;
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
    this.numberOfColumnsPerCanvas = Number(initialState.settings.columnsPerCanvas.value);
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
    };
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
      this.notifyGeometry();
      // draw() must be called explicitly - nothing else re-renders after the cache regenerates.
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
    };
    this.recalculateCacheAndSizes();
    if (this.notesApp) this.notesApp.renderer.background.color = this.theme.main.background;
    this.applyNotesCanvasOpacity();
  };

  private notifyGeometry() {
    this.callbacks.onGeometryChange({ width: this.width, hasCache: this.cache !== null });
  }

  // The one entry point ComposerCanvas.svelte's $effect calls on every reactive-state change.
  // Does not re-read settings.columnsPerCanvas.value - a changed value always arrives via a
  // fresh ComposerRenderer instance instead, because the parent wraps this component in
  // {#key settings.columnsPerCanvas.value}.
  update(state: ComposerRendererState): void {
    this.state = state;
    this.draw();
  }

  // Rebuilds all visible columns from scratch on every call rather than diffing - the visible
  // window is at most numberOfColumnsPerCanvas/2+2 columns per side, so a full rebuild is cheap
  // and avoids stale-sprite bookkeeping after a resize/theme/cache change or a plain state update.
  private draw(): void {
    if (!this.notesApp || !this.timelineApp) return;
    const cacheData = this.cache?.cache;
    const sizes = this.columnSize;
    const state = this.state;
    const xPosition = (state.selected - this.numberOfColumnsPerCanvas / 2 + 1) * -sizes.width;
    const beatMarks = Number(state.settings.beatMarks.value);
    const counterLimit = beatMarks === 0 ? 12 : 4 * beatMarks;
    const relativeColumnWidth = this.width / state.columns.length;
    const timelineWidth = Math.floor(relativeColumnWidth * (this.width / sizes.width + 1));
    const timelinePosition =
      relativeColumnWidth * state.selected -
      relativeColumnWidth * (this.numberOfColumnsPerCanvas / 2);

    this.drawNotesStage(cacheData, sizes, xPosition, counterLimit);
    this.drawTimelineStage(cacheData, relativeColumnWidth, timelineWidth, timelinePosition);
  }

  private drawNotesStage(
    cacheData: ComposerCacheData | undefined,
    sizes: { width: number; height: number },
    xPosition: number,
    counterLimit: number
  ) {
    for (const child of this.notesColumnsContainer.removeChildren())
      child.destroy({ children: true });
    this.notesColumnsContainer.x = xPosition;
    const visible = Boolean(cacheData) && !this.state.isRecordingAudio;
    this.notesColumnsContainer.visible = visible;
    if (!visible || !cacheData) return;
    const tailsByColumn = this.computeTailsByColumn();
    const accentColor = ThemeProvider.get('accent').rgbNumber();
    this.state.columns.forEach((column, i) => {
      if (!isColumnVisible(i, this.state.selected, this.numberOfColumnsPerCanvas)) return;
      const tempoChangersCache = (i + 1) % 4 === 0 ? cacheData.columnsLarger : cacheData.columns;
      const standardCache = (i + 1) % 4 === 0 ? cacheData.standardLarger : cacheData.standard;
      const background =
        column.tempoChanger === 0
          ? standardCache[Number(i % (counterLimit * 2) >= counterLimit)]
          : tempoChangersCache[column.tempoChanger];
      this.notesColumnsContainer.addChild(
        renderColumn({
          cache: cacheData,
          notes: column.notes,
          tails: tailsByColumn.get(i) ?? [],
          accentColor,
          index: i,
          sizes,
          instruments: this.state.song.instruments,
          currentLayer: this.state.currentLayer,
          backgroundCache: background,
          isToolsSelected: this.state.selectedColumns.includes(i),
          isSelected: i === this.state.selected,
          isBreakpoint: this.state.breakpoints.includes(i),
        })
      );
    });
  }

  /** Tail segments clipped to the visible column window, including spans that start off-screen. */
  private computeTailsByColumn(): Map<number, TailSegment[]> {
    const tails = new Map<number, TailSegment[]>();
    const { columns, song, currentLayer } = this.state;
    const threshold = this.numberOfColumnsPerCanvas / 2 + 2;
    const visibleStart = Math.max(0, Math.floor(this.state.selected - threshold) + 1);
    const visibleEnd = Math.min(columns.length, Math.ceil(this.state.selected + threshold));
    for (let start = 0; start < visibleEnd; start++) {
      const column = columns[start];
      column.notes.forEach((note) => {
        if (note.span <= 1) return;
        const instrument = song.instruments[note.trackIndex];
        const isCurrentLayer = note.trackIndex === currentLayer;
        if (!isCurrentLayer && !instrument?.visible) return;
        const button = displayButtonForId(instrument?.name ?? '', note.id);
        if (button === -1) return;
        const segmentStart = Math.max(start, visibleStart);
        const end = Math.min(start + note.span, visibleEnd);
        for (let i = segmentStart; i < end; i++) {
          const segment: TailSegment = { button, isCurrentLayer, isStart: i === start };
          const existing = tails.get(i);
          if (existing) existing.push(segment);
          else tails.set(i, [segment]);
        }
      });
    }
    return tails;
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
    this.cache?.destroy();
    this.notesApp?.destroy(true, { children: true });
    this.timelineApp?.destroy(true, { children: true });
    this.notesApp = null;
    this.timelineApp = null;
    this.wheelCanvas = null;
  }
}
