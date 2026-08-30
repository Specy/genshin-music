// This renderer owns the whole vsrg composer canvas - keys, scrollable tracks, timeline, and
// breakpoints - as one plain-TS class around a single pixi Application.
import { isMobile } from 'is-mobile';
import FontFaceObserver from 'fontfaceobserver';
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Rectangle,
  type FederatedPointerEvent,
  type RendererPreference,
  type Texture,
} from 'pixi.js';
import { PIXI_RENDERER_PREFERENCE } from '$cmp/pixiRendererPreference';
import { observeWebGLContext, pixiResolution } from '$cmp/pixiContextRecovery';
import { subscribeTheme } from '$core/theme/ThemeProvider.svelte';
import type { Theme } from '$core/theme/ThemeProvider.svelte';
import { t } from '$i18n/binding.svelte';
import { globalConfigStore } from '$stores/GlobalConfigStore.svelte';
import { vsrgComposerStore } from '$stores/VsrgComposerStore.svelte';
import type { VsrgComposerEvents } from '$stores/VsrgComposerStore.svelte';
import { ThrottledEventLoop } from '$core/ThrottledEventLoop';
import { clamp, getNearestTo, ClickType, parseMouseClick } from '$core/utils/Utilities';
import {
  DEFAULT_DOM_RECT,
  DEFAULT_VSRG_KEYS_MAP,
  PIXI_CENTER_X_END_Y,
  PIXI_HORIZONTAL_ALIGN,
  PIXI_VERTICAL_ALIGN,
} from '$core/legacyConfig';
import type { VsrgHitObject, VsrgTrack } from '$core/Songs/VsrgSong.svelte';
import type { RecordedSong } from '$core/Songs/RecordedSong';
import type { RecordedNote } from '$core/Songs/SongClasses';
import type { VsrgSongRenderState } from './vsrgSongRenderState';
import { VsrgCanvasCache } from './VsrgComposerCache';

/**
 * Height in px of the bottom strip drawKeys() prints the key numbers into in VERTICAL mode. Its
 * counterpart in horizontal mode is a 60px-WIDE left strip, which is a separate look and is left
 * alone. Dropped from 60 to 40 (user, 2026-08-22) to hand the difference to the tracks; every site
 * that places the band, its separator line, its per-key hit areas or its numbers derives from here.
 */
const VERTICAL_KEYS_BAND_PX = 40;
/** The band's numbers print at this fraction of its height, leaving ~30% of it as headroom. */
const VERTICAL_KEYS_BAND_FONT_RATIO = 0.7;

export type VsrgCanvasSizes = {
  el: DOMRect;
  rawWidth: number;
  rawHeight: number;
  width: number;
  height: number;
  snapPointWidth: number;
  keyHeight: number;
  keyWidth: number;
  scaling: number;
  timelineSize: number;
};
export type VsrgCanvasColors = {
  background_plain: [string, number];
  background: [string, number];
  background_10: [string, number];
  secondary: [string, number];
  lineColor: [string, number];
  lineColor_10: [string, number];
  accent: [string, number];
};

// The reactive input VsrgComposerCanvas.svelte pushes into update() on every relevant prop change
// via its own $effect.
//
// THERE IS NO `vsrg` FIELD, and that is the load-bearing part of this interface (2026-08-06
// reactive-model plan, phase 2 - ComposerRendererState dropped its `song` field in phase 1 for the
// same reason). The fields of VsrgSongRenderState stand in for it, read off the song by
// captureVsrgSongState() at the moment Svelte says something changed; that module's header has the
// reasoning and the per-field notes. Two consequences, both of which the previous shape got wrong:
//
//  - update() can DIFF them. While this carried the VsrgSong itself, `needsSizes` compared
//    `previous.vsrg.bpm !== next.vsrg.bpm` and `needsCache` compared `previous.vsrg.tracks[i].color`
//    against `next.vsrg.tracks[i].color`. That only ever worked because refreshVsrg() cloned the
//    song on every edit, so the two states held two different instances. With one stable instance
//    those are fields compared against themselves - permanently false, silently, with no error and
//    no failing test: bpm and key-count changes would stop recalculating `sizes`, and track colour
//    and track add/delete would stop rebuilding the texture cache (every hit object falling back to
//    VsrgCanvasCache's '#FF0000' error texture).
//  - the canvas's $effect READS each of them, so its dependency set is explicit and run-independent.
//    Reaching through a `vsrg` field made the dependencies implicit - they were registered only if a
//    given update() call happened to draw deep enough to reach them, and draw() early-returns on a
//    missing Application or cache.
export interface VsrgComposerRendererState extends VsrgSongRenderState {
  isHorizontal: boolean;
  isPlaying: boolean;
  snapPoint: number;
  scrollSnap: boolean;
  snapPoints: number[];
  selectedHitObject: VsrgHitObject | null;
  // QUIRK: accepted for prop-shape parity but never read anywhere in this class - a genuine
  // dead field, preserved as dead rather than wired up to something.
  audioSong: RecordedSong | null;
  scaling: number;
  maxFps: number;
  renderableNotes: RecordedNote[];
  tempoChanger: number;
}

/**
 * THE POOLED UNIT IS A DRAW SLOT - position N of what this scene draws - and not the hit object,
 * snap point or note that happens to occupy it.
 *
 * ComposerRenderer's ColumnView pool (see its own header) is keyed on the COLUMN a view holds,
 * because painting a column there is expensive enough to be worth skipping when it has not moved,
 * and the price it pays for that key is an ordered insertion on every acquire whose only job is to
 * keep the scene graph in ascending column order. Nothing this class draws is expensive to paint -
 * a hit object is a dozen property writes and no allocation - so there is nothing to skip, and
 * slots keep the order for free: a draw walks the visible objects in exactly the order the
 * pre-pool code added them to the container, paints slot 0, 1, 2..., and hides the slots past the
 * last one it painted. Same tree, same order, no per-frame allocation, and no bookkeeping that can
 * disagree with what is on screen.
 *
 * THE PAINT RULE IS ColumnView'S, and it matters more here than there: a slot holds a DIFFERENT
 * occupant on nearly every frame of playback, so every property that varies from occupant to
 * occupant is written on every paint. "Set it only if it changed" is how a slot ends up showing
 * the previous occupant's texture, lane or trail length.
 *
 * Slots grow on demand and are never shrunk - the pool ends up as deep as the busiest window it
 * has ever drawn, which is bounded by the canvas, not by the song. What DOES destroy them is the
 * texture cache being replaced (VsrgComposerRenderer.generateCache): every sprite here borrows a
 * texture the cache owns, so the pool is dropped with it rather than left holding textures that
 * are about to be destroyed.
 */
class SpriteSlots {
  private readonly sprites: Sprite[] = [];
  private painted = 0;
  /** How many slots are currently visible; the rest are hidden, not removed. */
  private shown = 0;

  constructor(
    private readonly layer: Container,
    /** Runs once per sprite, when the pool grows - never per paint. Only for what never varies. */
    private readonly onCreate?: (sprite: Sprite) => void
  ) {}

  begin(): void {
    this.painted = 0;
  }

  next(texture: Texture): Sprite {
    let sprite = this.sprites[this.painted];
    if (sprite === undefined) {
      sprite = new Sprite(texture);
      this.sprites.push(sprite);
      this.layer.addChild(sprite);
      this.onCreate?.(sprite);
    }
    this.painted++;
    sprite.texture = texture;
    sprite.visible = true;
    return sprite;
  }

  end(): void {
    for (let i = this.painted; i < this.shown; i++) this.sprites[i].visible = false;
    this.shown = this.painted;
  }

  destroy(): void {
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.painted = 0;
    this.shown = 0;
    this.layer.removeChildren();
  }
}

/**
 * One drawn hit object: the tap sprite, the held note's trail and its two caps, and the selection
 * ring - all of them present for the whole life of the slot, with the half this occupant does not
 * use hidden rather than removed.
 *
 * CHILD ORDER IS DRAW ORDER (pixi renders a container's children in array order and `zIndex`
 * decides nothing unless the parent sets sortableChildren, which nothing here does), and it is the
 * order the pre-pool code produced: a tap drew its ring as the sibling BEFORE its sprite, while a
 * held note drew its ring as the last child of its own container, AFTER both caps. That is why
 * there are two ring slots rather than one moved between two depths - a slot pool's child order
 * has to be fixed for the pool to be free, and `isHeld` flips per frame. One of the two is always
 * hidden, and the rings are drawn strictly larger than either hit-object texture
 * (VsrgCanvasCache.generateSelectionRings), so the pair is the same pixels either way.
 *
 * EVENT SHAPE, also reproduced rather than simplified: the container is the interactive one and
 * carries the only handler, so `event.target` is stable no matter which half is showing.
 *
 * EVERY CHILD STAYS `passive`, rings included, and 'none' is the wrong mode for any of them. A
 * passive sprite is still hit-tested (pixi only prunes a passive container that ALSO has
 * `interactiveChildren` off) and resolves the hit to its nearest interactive ancestor, which is
 * this container - so the whole footprint of a slot, ring annulus and all, lands on the handler
 * above. 'none' prunes the sprite outright, and since a base Container has no `containsPoint` the
 * hit then falls PAST this view to the snap-point layer, whose sprites tile the canvas edge to
 * edge: because the rings are drawn larger than the hit-object texture and both are anchored at
 * the object's timestamp, that annulus's leading half sits in the PREVIOUS snap point's column, so
 * a click on the selected note's own ring created a note one column back (or, right-clicked,
 * deleted whatever was there). The pre-pool code had a tap's ring as a sibling of the scroll
 * container, where passive meant "absorbed, and the container has no handler"; there is no depth
 * left here that absorbs without acting, so re-selecting the already-selected note is the
 * deliberate resting state.
 */
class HitObjectView {
  readonly container = new Container();
  /**
   * What this slot is showing, or null while it is hidden. The pointer handler reads it off the
   * VIEW rather than closing over a hit object, which is what a pooled slot needs: a per-draw
   * closure would be an allocation per visible object per frame, and a closure captured once would
   * name the object the slot held when it was created.
   */
  hitObject: VsrgHitObject | null = null;
  trackIndex = 0;
  private readonly ringUnder = new Sprite();
  private readonly trail = new Sprite();
  private readonly startCap = new Sprite();
  private readonly endCap = new Sprite();
  private readonly tap = new Sprite();
  private readonly ringOver = new Sprite();

  constructor() {
    this.container.addChild(
      this.ringUnder,
      this.trail,
      this.startCap,
      this.endCap,
      this.tap,
      this.ringOver
    );
    this.container.eventMode = 'static';
    // The one presentation property that is the same for every occupant, so it is not part of the
    // paint: a held note's start cap is a diamond, i.e. the same rounded square rotated.
    this.startCap.angle = 45;
  }

  /**
   * Writes everything the visible half of this slot needs. The hidden half is left carrying the
   * previous occupant's values deliberately - it is invisible AND pruned from hit testing while
   * hidden, and the paint that reveals it writes it in the same call.
   */
  paint(params: {
    hitObject: VsrgHitObject;
    trackIndex: number;
    cache: VsrgCanvasCache;
    color: string;
    isSelected: boolean;
    isHorizontal: boolean;
    scale: number;
    x: number;
    y: number;
  }): void {
    const { hitObject, cache, color, isSelected, isHorizontal, scale, x, y } = params;
    this.hitObject = hitObject;
    this.trackIndex = params.trackIndex;
    this.container.visible = true;
    const isHeld = hitObject.isHeld;
    this.trail.visible = isHeld;
    this.startCap.visible = isHeld;
    this.endCap.visible = isHeld;
    this.tap.visible = !isHeld;
    this.ringUnder.visible = isSelected && !isHeld;
    this.ringOver.visible = isSelected && isHeld;
    if (isHeld) {
      const trail = this.trail;
      trail.texture = cache.getHeldTrailCache(color);
      if (isHorizontal) {
        trail.anchor = PIXI_HORIZONTAL_ALIGN;
        trail.height = cache.textures.sizes.trail;
        trail.width = hitObject.holdDuration * scale;
      } else {
        trail.anchor = PIXI_CENTER_X_END_Y;
        trail.width = cache.textures.sizes.trail;
        trail.height = hitObject.holdDuration * scale;
      }
      trail.x = x;
      trail.y = y;
      const capTexture = cache.getHeldHitObjectCache(color);
      this.startCap.texture = capTexture;
      this.startCap.anchor = 0.5;
      this.startCap.x = x;
      this.startCap.y = y;
      this.endCap.texture = capTexture;
      this.endCap.anchor = 0.5;
      this.endCap.x = isHorizontal ? (hitObject.timestamp + hitObject.holdDuration) * scale : x;
      this.endCap.y = isHorizontal ? y : y - hitObject.holdDuration * scale;
    } else {
      this.tap.texture = cache.getHitObjectCache(color);
      this.tap.anchor = 0.5;
      this.tap.x = x;
      this.tap.y = y;
    }
    const ring = isHeld ? this.ringOver : this.ringUnder;
    ring.texture = cache.getSelectionRingsCache(color);
    ring.anchor = 0.5;
    ring.x = x;
    ring.y = y;
  }

  hide(): void {
    this.container.visible = false;
    this.hitObject = null;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/** SpriteSlots' counterpart for hit objects; see that class for the rules both follow. */
class HitObjectSlots {
  private readonly views: HitObjectView[] = [];
  private painted = 0;
  private shown = 0;

  constructor(
    private readonly layer: Container,
    private readonly onCreate: (view: HitObjectView) => void
  ) {}

  begin(): void {
    this.painted = 0;
  }

  next(): HitObjectView {
    let view = this.views[this.painted];
    if (view === undefined) {
      view = new HitObjectView();
      this.views.push(view);
      this.layer.addChild(view.container);
      this.onCreate(view);
    }
    this.painted++;
    return view;
  }

  end(): void {
    for (let i = this.painted; i < this.shown; i++) this.views[i].hide();
    this.shown = this.painted;
  }

  destroy(): void {
    for (const view of this.views) view.destroy();
    this.views.length = 0;
    this.painted = 0;
    this.shown = 0;
    this.layer.removeChildren();
  }
}

/**
 * The "click to add/remove time" button at the end of the song: a sprite and a label that only
 * exist within one screen of the song's end, kept rather than rebuilt for the same reason as
 * everything else here - a pixi Text is a canvas rasterization plus a GPU texture upload on every
 * construction, which is the single most expensive thing a frame can do by accident.
 */
class TimeButtonView {
  readonly container = new Container();
  private readonly sprite = new Sprite();
  private readonly label: Text;

  constructor(style: TextStyle, onTap: () => void) {
    this.label = new Text({ text: '', style, anchor: 0.5 });
    this.container.addChild(this.sprite, this.label);
    this.container.eventMode = 'static';
    this.container.on('pointertap', onTap);
  }

  paint(texture: Texture, text: string, x: number, y: number, width: number, height: number): void {
    this.container.visible = true;
    this.container.x = x;
    this.container.y = y;
    this.sprite.texture = texture;
    // pixi's Text setter early-returns on an unchanged string, so this costs nothing per frame and
    // still follows the locale when it moves.
    this.label.text = text;
    this.label.x = width / 2;
    this.label.y = height / 2;
  }

  hide(): void {
    this.container.visible = false;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * First index of an ASCENDING array whose value is at or past `bound`, or `items.length` when none
 * is. Replaces the whole-array scans the pre-pool draws ran: a 3-minute background song is ~3000
 * notes and a 3-minute snap grid ~1400 entries, every one of them read on every frame to draw the
 * ten or so inside the window.
 */
function firstAtOrAfter<T>(items: readonly T[], bound: number, key: (item: T) => number): number {
  let low = 0;
  let high = items.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (key(items[middle]) < bound) low = middle + 1;
    else high = middle;
  }
  return low;
}

const snapPointValue = (snapPoint: number) => snapPoint;
const noteTime = (note: RecordedNote) => note.time;

export interface VsrgComposerRendererCallbacks {
  onKeyDown: (key: number) => void;
  onKeyUp: (key: number) => void;
  onAddTime: () => void;
  onRemoveTime: () => void;
  onTimestampChange: (timestamp: number) => void;
  onSnapPointSelect: (timestamp: number, key: number, clickType?: ClickType) => void;
  dragHitObject: (timestamp: number, key?: number) => void;
  releaseHitObject: () => void;
  selectHitObject: (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => void;
}

export class VsrgComposerRenderer {
  private app: Application | null = null;
  private cache: VsrgCanvasCache | null = null;
  private themeDispose: (() => void) | null = null;
  private contextLost = false;
  private contextRecoveryDispose: (() => void) | null = null;
  private replacingLostRenderer = false;
  /** A renderer instance gets one fresh WebGL context before its terminal Canvas fallback. */
  private hasRestartedWebGL = false;
  private destroyed = false;
  private throttledEventLoop = new ThrottledEventLoop(() => {}, 48);
  private cumulativeScroll = 0;

  // Persistent scene containers, created once per renderer instance.
  // Ordering requirement: added to the stage in THIS exact order in init() - scrollable tracks,
  // then keys, then timeline. That's the visual stacking z-order; reordering the addChild calls
  // changes what draws on top of what.
  private readonly scrollableTrackContainer = new Container();
  private readonly keysContainer = new Container();
  private readonly timelineContainer = new Container();

  /**
   * The scenes' LAYERS, one per pool, added to their scene container once in init() and never
   * touched again. They exist so the pools can be slot-ordered independently while the flattened
   * draw order stays byte-for-byte the one the pre-pool rebuild produced - pixi renders a
   * container's children in array order depth-first, so [snap points][empty][hit objects][buttons]
   * nested is the same sequence as the flat list those four groups were appended to.
   *
   * Ordering requirement, exactly as for the scene containers above: the addChild order in init()
   * is the z-order.
   */
  private readonly snapPointsLayer = new Container();
  private readonly emptySnapPointLayer = new Container();
  private readonly hitObjectsLayer = new Container();
  private readonly timeButtonsLayer = new Container();
  private readonly timelineSquareLayer = new Container();
  private readonly timelineNotesLayer = new Container();
  private readonly timelineBreakpointsLayer = new Container();
  private readonly timelineMarkersLayer = new Container();

  private readonly snapPointSlots = new SpriteSlots(this.snapPointsLayer, (sprite) => {
    sprite.eventMode = 'static';
    // ONE handler per sprite, bound when the pool grows rather than per draw. It reads the sprite
    // and the live sizes/orientation off `this` instead of the values the drawing loop had in
    // scope, which is the same answer: every one of them is a field the next draw would have
    // recomputed anyway.
    sprite.on('pointertap', this.handleSnapPointClick);
  });
  private readonly emptySnapPointSlots = new SpriteSlots(this.emptySnapPointLayer);
  private readonly hitObjectSlots = new HitObjectSlots(this.hitObjectsLayer, (view) => {
    view.container.on('pointerdown', (e: FederatedPointerEvent) => {
      if (view.hitObject === null) return;
      this.selectHitObject(view.hitObject, view.trackIndex, parseMouseClick(e.button));
    });
  });
  private readonly timelineSquareSlots = new SpriteSlots(this.timelineSquareLayer);
  private readonly timelineNoteSlots = new SpriteSlots(this.timelineNotesLayer, (sprite) => {
    sprite.anchor = PIXI_VERTICAL_ALIGN;
  });
  private readonly timelineBreakpointSlots = new SpriteSlots(this.timelineBreakpointsLayer);
  private readonly timelineMarkerSlots = new SpriteSlots(this.timelineMarkersLayer);
  private addTimeButton: TimeButtonView | null = null;
  private removeTimeButton: TimeButtonView | null = null;
  /** Mutated in place by calculateSizes; pixi reads a hitArea at hit-test time, not at assignment. */
  private readonly timelineHitArea = new Rectangle(0, 0, 0, 0);

  private state: VsrgComposerRendererState;
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
  };
  private canvasColors: VsrgCanvasColors = {
    background_plain: ['#000000', 0],
    background: ['#000000', 0],
    background_10: ['#000000', 0],
    secondary: ['#ffffff', 0xffffff],
    lineColor: ['#ffffff', 0xffffff],
    lineColor_10: ['#ffffff', 0xffffff],
    accent: ['#ffffff', 0xffffff],
  };
  private timestamp = 0;
  private isPressing = false;
  private previousPosition = 0;
  private preventClick = false;
  private totalMovement = 0;
  private draggedHitObject: VsrgHitObject | null = null;
  private isClickingTimeline = false;
  private isBonoboFontLoaded = false;
  /**
   * `globalConfigStore.get()` spreads a deep `$state` object into a fresh one on every call, and
   * the pre-pool draws called it three-plus-one-per-track times per frame for this one number.
   * Refreshed where it can actually move (the store's own load(), which runs long before this class
   * mounts, and any resize/cache rebuild after it).
   */
  private playBarOffset = globalConfigStore.get().PLAY_BAR_OFFSET;
  /**
   * Bumped by handleThemeChange, and part of the keys' paint signature below. The colours are read
   * out of the Theme into a fresh `canvasColors` object, so there is no identity to compare and
   * nothing cheaper than a counter to say "these are different colours now".
   */
  private themeVersion = 0;
  /**
   * What drawKeys() last painted, or null for "nothing on screen can be trusted to be the keys".
   *
   * The keys are the one scene that does not move during playback - drawKeys reads the orientation,
   * the key count, the canvas geometry, the playbar offset, the theme and whether Bonobo has
   * loaded, and NONE of those change between two frames of a playing song - so rebuilding them per
   * frame was 4-6 canvas text rasterizations, 4-6 GPU texture uploads and two Graphics geometry
   * rebuilds per frame for glyphs and lines that never changed. This is the whole input list; a
   * new input added to drawKeys has to be added here too or the keys stop following it.
   */
  private paintedKeys: {
    isHorizontal: boolean;
    keys: number;
    width: number;
    height: number;
    timelineSize: number;
    playBarOffset: number;
    bonoboLoaded: boolean;
    theme: number;
  } | null = null;

  constructor(
    private readonly container: HTMLElement,
    initialState: VsrgComposerRendererState,
    private readonly callbacks: VsrgComposerRendererCallbacks
  ) {
    this.state = initialState;
  }

  // Constructors cannot be async, so mounting collapses into this explicit async method;
  // VsrgComposerCanvas.svelte's onMount awaits it before ever calling update().
  //
  // QUIRK (load-bearing - read before "fixing" the call order below): the cache is generated
  // for-real exactly once, after theme colors are known AND the pixi Application exists - hence
  // theme, then sizes, then the Application, then sizes+draw again. Do not add extra early
  // cache-generating calls here for the sake of matching some other sequence "more closely":
  // generateCache()'s own `if (!this.app) return` guard makes an early call a no-op, but a
  // redundant call placed AFTER the Application exists would regenerate and immediately discard
  // the just-generated cache.
  async init(): Promise<void> {
    this.themeDispose = subscribeTheme(this.handleThemeChange);
    this.calculateSizes();

    this.app = await this.createApplication(PIXI_RENDERER_PREFERENCE);
    this.container.appendChild(this.app.canvas);
    this.observeContext(this.app.canvas);

    this.app.stage.addChild(
      this.scrollableTrackContainer,
      this.keysContainer,
      this.timelineContainer
    );
    // z-order within each scene - see the layer declarations
    this.scrollableTrackContainer.addChild(
      this.snapPointsLayer,
      this.emptySnapPointLayer,
      this.hitObjectsLayer,
      this.timeButtonsLayer
    );
    this.timelineContainer.addChild(
      this.timelineSquareLayer,
      this.timelineNotesLayer,
      this.timelineBreakpointsLayer,
      this.timelineMarkersLayer
    );
    this.scrollableTrackContainer.eventMode = 'static';
    this.timelineContainer.eventMode = 'static';
    this.timelineContainer.hitArea = this.timelineHitArea;
    this.timelineContainer.on('pointermove', this.handleTimelineEvent);
    this.timelineContainer.on('pointerdown', this.handleTimelineClick);
    this.timelineContainer.on('pointerup', this.handleTimelineRelease);
    this.timelineContainer.on('pointerupoutside', this.handleTimelineRelease);

    window.addEventListener('resize', this.calculateSizes);
    vsrgComposerStore.addEventListener('timestampChange', {
      callback: this.handleEvent,
      id: 'vsrg-canvas',
    });
    this.throttledEventLoop.setCallback(this.handleTick);
    this.throttledEventLoop.changeMaxFps(this.state.maxFps);
    // Started only while playing - see update(). Its callback already did nothing else, so this
    // changes no behaviour and removes ~125 no-op main-thread wakes per second from a paused
    // editor, which is the whole time most of one is open.
    if (this.state.isPlaying) this.throttledEventLoop.start();
    window.addEventListener('blur', this.handleBlur);

    new FontFaceObserver('Bonobo')
      .load()
      .then(() => {
        this.isBonoboFontLoaded = true;
        // The keys re-derive their own rebuild from this (see paintedKeys), but the end-of-song
        // buttons hold a TextStyle built when they were first created, so the pool goes too. It is
        // a one-shot at startup, and dropping it is cheaper to reason about than a second
        // restyle path.
        this.dropPools();
        this.draw();
      })
      .catch(() => {
        // Deliberately silent - swallows a font-load failure rather than surfacing it.
      });

    // Re-run now that the Application genuinely exists (the earlier call above ran before it
    // did) - this is the real calculateSizes()/generateCache() pass; it also paints the first frame.
    this.calculateSizes();
    this.draw();
  }

  private async createApplication(
    preference: RendererPreference | RendererPreference[]
  ): Promise<Application> {
    const app = new Application();
    await app.init({
      preference,
      width: this.sizes.rawWidth,
      height: this.sizes.rawHeight,
      background: this.canvasColors.background_plain[1],
      autoDensity: false,
      antialias: true,
      // ON DEMAND, like ComposerRenderer (2026-07-28 spec, which explicitly excluded this canvas).
      // pixi's TickerPlugin defaults this to true and starts a ticker with `app.render` on it, so
      // both VSRG canvases re-rendered on every rAF for as long as they were mounted, paused
      // included. Nothing here animates outside playback: every repaint is caused by a tick, a
      // pointer, a prop change or a cache rebuild, and all four end in draw(), which now renders
      // once. Any future path that mutates the scene without reaching draw() goes silently stale.
      autoStart: false,
      resolution: pixiResolution(),
    });
    return app;
  }

  private observeContext(canvas: HTMLCanvasElement): void {
    this.contextRecoveryDispose?.();
    this.contextRecoveryDispose = observeWebGLContext(canvas, {
      onLost: () => {
        this.contextLost = true;
      },
      onRestored: () => {
        if (this.destroyed || this.replacingLostRenderer) return;
        this.contextLost = false;
        // The keys hold no cache texture, so nothing else in the recalculation below invalidates
        // them - but a restored context is the one moment their Text and Graphics can be showing
        // pixels that no longer exist on the GPU. Same reason generateCache drops the pools.
        this.paintedKeys = null;
        this.calculateSizes();
      },
      onRecoveryTimeout: () => {
        void this.replaceUnrestoredRenderer();
      },
    });
  }

  /** Preserve live editor state, try one fresh WebGL context, then use Canvas if that also fails. */
  private async replaceUnrestoredRenderer(): Promise<void> {
    const oldApp = this.app;
    if (this.destroyed || this.replacingLostRenderer || !this.contextLost || !oldApp) return;

    this.replacingLostRenderer = true;
    const preference: RendererPreference = this.hasRestartedWebGL ? 'canvas' : 'webgl';
    if (preference === 'webgl') this.hasRestartedWebGL = true;
    let replacement: Application;
    try {
      replacement = await this.createApplication(preference);
    } catch (error) {
      this.replacingLostRenderer = false;
      if (preference === 'webgl') {
        console.warn('Could not restart a lost Pixi WebGL renderer; using Canvas.', error);
        await this.replaceUnrestoredRenderer();
      } else {
        console.error('Could not replace a lost Pixi renderer with Canvas.', error);
      }
      return;
    }
    if (this.destroyed) {
      replacement.destroy(true, { children: true });
      return;
    }

    this.contextRecoveryDispose?.();
    this.contextRecoveryDispose = null;
    oldApp.stage.removeChild(this.scrollableTrackContainer);
    oldApp.stage.removeChild(this.keysContainer);
    oldApp.stage.removeChild(this.timelineContainer);
    this.cache?.destroy();
    this.cache = null;
    // Everything drawn so far belongs to a renderer that is about to be destroyed; the pools go
    // with it (generateCache would drop them anyway) and the keys lose their paint baseline for
    // the same reason as on a context restore.
    this.dropPools();
    this.paintedKeys = null;

    this.app = replacement;
    replacement.stage.addChild(
      this.scrollableTrackContainer,
      this.keysContainer,
      this.timelineContainer
    );
    if (oldApp.canvas.parentNode) oldApp.canvas.replaceWith(replacement.canvas);
    else this.container.appendChild(replacement.canvas);
    if (preference === 'webgl') this.observeContext(replacement.canvas);
    oldApp.destroy(true, false);

    this.contextLost = false;
    this.replacingLostRenderer = false;
    this.calculateSizes();
  }

  // Bound to the resize listener and called directly here and from VsrgComposerStore events.
  private calculateSizes = () => {
    const wrapperSizes = this.container.getBoundingClientRect();
    this.playBarOffset = globalConfigStore.get().PLAY_BAR_OFFSET;
    const { scaling, keys, bpm, snapPoint } = this.state;
    const timelineSize = isMobile() ? 20 : 40;
    const height = wrapperSizes.height - timelineSize;
    const keysLength = DEFAULT_VSRG_KEYS_MAP[keys].length;
    this.sizes = {
      el: wrapperSizes,
      rawWidth: wrapperSizes.width,
      rawHeight: wrapperSizes.height,
      width: wrapperSizes.width,
      height,
      keyHeight: height / keysLength,
      keyWidth: wrapperSizes.width / keysLength,
      snapPointWidth: ((60000 / bpm / snapPoint) * scaling) / 100,
      scaling: scaling / 100,
      timelineSize,
    };
    // pixi's renderer only applies width/height at Application init; this explicit resize on
    // every recalculation is what keeps the drawing buffer tracking the container (e.g. on
    // window resize).
    if (this.app && !this.contextLost && !this.replacingLostRenderer) {
      this.app.renderer.resize(this.sizes.rawWidth, this.sizes.rawHeight);
      this.app.canvas.style.width = `${this.sizes.width}px`;
      this.app.canvas.style.height = `${this.sizes.height + timelineSize}px`;
    }
    this.timelineHitArea.width = this.sizes.width;
    this.timelineHitArea.height = timelineSize;
    this.generateCache();
  };

  // Unlike the sibling ComposerRenderer (which ignores its theme callback param and re-reads
  // ThemeProvider directly), this one genuinely uses the passed theme argument.
  //
  // NOTHING HERE IS DEBOUNCED, which is what keeps the pools out of ComposerRenderer's documented
  // theme trap (its paintTailAccent field): there, the theme lands synchronously while the repaint
  // waits 50ms, so an update arriving in between could paint one column in the new colour beside a
  // window still in the old one. This recolours by dropping the pools inside generateCache() and
  // repainting every slot from the new cache in the same call, and the keys follow through
  // `themeVersion`, so there is no moment where half the canvas is on the previous palette.
  private handleThemeChange = (theme: Theme) => {
    const bgPlain = theme.get('primary');
    const bgLine = theme.getText('primary');
    const bgLine10 = bgLine.darken(0.5).desaturate(1);
    const bg = bgPlain.darken(0.15);
    const bg10 = bg.darken(0.1);
    const secondary = theme.get('secondary');
    const accent = theme.get('accent');
    this.canvasColors = {
      background_plain: [bgPlain.hex(), bgPlain.rgb().rgbNumber()],
      background: [bg.hex(), bg.rgb().rgbNumber()],
      background_10: [bg10.hex(), bg10.rgb().rgbNumber()],
      secondary: [secondary.hex(), secondary.rgb().rgbNumber()],
      lineColor: [bgLine.hex(), bgLine.rgb().rgbNumber()],
      lineColor_10: [bgLine10.hex(), bgLine10.rgb().rgbNumber()],
      accent: [accent.hex(), accent.rgb().rgbNumber()],
    };
    this.themeVersion++;
    this.generateCache();
  };

  private generateCache = () => {
    if (!this.app || this.contextLost || this.replacingLostRenderer) return;
    this.playBarOffset = globalConfigStore.get().PLAY_BAR_OFFSET;
    const trackColors = this.state.trackColors;
    // QUIRK: sets the background from the DARKENED color's hex string, not the un-darkened
    // numeric the Application was created with in init() - an apparent old mismatch, not a
    // runtime error (pixi's ColorSource accepts either form just as readily). Flagged, not fixed.
    this.app.renderer.background.color = this.canvasColors.background[0];
    const newCache = new VsrgCanvasCache({
      app: this.app,
      sizes: this.sizes,
      colors: this.canvasColors,
      trackColors,
      isHorizontal: this.state.isHorizontal,
      playbarOffset: this.playBarOffset,
    });
    const oldCache = this.cache;
    this.cache = newCache;
    // Every pooled sprite BORROWS a texture the cache owns and is about to destroy below, so the
    // pool is dropped with the cache rather than repainted onto it - the same rule as
    // ComposerRenderer.dropColumnPool. draw() rebuilds it from the new cache on the next line.
    this.dropPools();
    this.draw();
    // QUIRK: the previous cache's textures are destroyed only after a 500ms delay ("not sure
    // why pixi is still using old textures" - old's own TODO, preserved). Destroying
    // immediately caused visible issues; don't remove or shorten this delay without checking that.
    setTimeout(() => {
      oldCache?.destroy();
    }, 500);
  };

  // The store carries an imperative COMMAND (seek to a breakpoint), not props: those arrive
  // through update() above, and keeping the two channels apart is what stopped the recalculations
  // from running on values that had not landed yet.
  private handleEvent = (_event: VsrgComposerEvents, data?: unknown) => {
    this.setTimestamp(data as number);
  };

  // The ThrottledEventLoop-driven playback tick.
  private handleTick = (_elapsed: number, sinceLast: number) => {
    if (this.state.isPlaying) {
      this.setTimestamp(this.timestamp + sinceLast * this.state.tempoChanger);
    }
  };

  // Resets both the canvas-wide drag flag and the timeline's own click flag - two independent
  // blur handlers consolidated into one.
  private handleBlur = () => {
    this.isPressing = false;
    this.isClickingTimeline = false;
  };

  // ---- wrapper-level wheel/pointer drag handlers: PUBLIC, called directly from
  // VsrgComposerCanvas.svelte's own onwheel/onpointerdown/onpointerup/onpointerleave/
  // onpointermove template bindings. Unlike the sibling ComposerRenderer (which self-attaches
  // its own DOM listeners), this class never attaches these to a DOM node itself - the caller
  // wires them up. ----

  handleWheel = (e: WheelEvent) => {
    if (this.state.scrollSnap) {
      this.cumulativeScroll += e.deltaY;
      if (Math.abs(this.cumulativeScroll) < 100) return;
      const { snapPoints } = this.state;
      const nearestSnapPoint = snapPoints.findIndex((s) => s > this.timestamp);
      const index =
        (nearestSnapPoint < 0 ? snapPoints.length : nearestSnapPoint) -
        1 +
        (this.cumulativeScroll < 0 ? -1 : 1);
      this.cumulativeScroll = 0;
      if (index < 0 || index >= snapPoints.length) return;
      this.setTimestamp(snapPoints[index]);
      return;
    }
    const max = Math.max(0, this.timestamp + e.deltaY / 1.2);
    const min = Math.min(max, this.state.duration);
    this.setTimestamp(min);
    if (this.draggedHitObject && this.timestamp > 0) {
      this.callbacks.dragHitObject(this.draggedHitObject.timestamp + e.deltaY / 1.2);
    }
  };

  setIsDragging = (e: PointerEvent) => {
    if (e.clientY - this.sizes.el.top > this.sizes.timelineSize) {
      this.isPressing = true;
      this.previousPosition = this.state.isHorizontal ? e.clientX : -e.clientY;
    }
  };

  setIsNotDragging = () => {
    if (!this.isPressing) return;
    const draggedHitObject = this.draggedHitObject;
    this.isPressing = false;
    this.totalMovement = 0;
    this.draggedHitObject = null;
    // QUIRK: preventClick resets via a 200ms setTimeout here, not synchronously - resetting it
    // immediately would let the pointerup that ends a drag also register as a click on a snap
    // point (see the preventClick read in drawScrollableTracks' handleSnapPointClick). Don't
    // shorten or remove this delay.
    if (draggedHitObject) this.callbacks.releaseHitObject();
    setTimeout(() => {
      this.preventClick = false;
      this.draw();
    }, 200);
    if (this.state.scrollSnap) {
      const { snapPoints } = this.state;
      const index = snapPoints.findIndex((s) => s > this.timestamp);
      // QUIRK: !index also treats a match at index 0 as "not found" (0 is falsy in JS),
      // incorrectly skipping the snap for that case - likely meant index === -1/index < 0
      // alone. Flagged, not fixed.
      if (!index || index < 0) return;
      const next = snapPoints[index];
      const previous = snapPoints[index - 1];
      if (next === undefined || previous === undefined) return;
      this.setTimestamp(getNearestTo(this.timestamp, previous, next));
    }
  };

  handleDrag = (e: PointerEvent) => {
    if (!this.isPressing) return;
    const { sizes, timestamp, previousPosition, draggedHitObject, totalMovement } = this;
    const { isHorizontal, duration } = this.state;
    const deltaOrientation = isHorizontal ? e.clientX : -e.clientY;
    const keyPosition = isHorizontal
      ? e.clientY - sizes.el.top - sizes.timelineSize
      : e.clientX - sizes.el.left;
    const hoveredPosition = Math.floor(
      keyPosition / (isHorizontal ? sizes.keyHeight : sizes.keyWidth)
    );
    const delta = (previousPosition - deltaOrientation) / sizes.scaling;
    const newTotalMovement = totalMovement + Math.abs(delta);
    if (draggedHitObject !== null) {
      this.previousPosition = deltaOrientation;
      const position = draggedHitObject.timestamp - delta;
      this.callbacks.dragHitObject(Math.max(0, position), hoveredPosition);
      return;
    }
    const max = Math.max(0, timestamp + delta);
    const min = Math.min(max, duration);
    this.previousPosition = deltaOrientation;
    this.preventClick = newTotalMovement > 50;
    this.totalMovement = newTotalMovement;
    this.setTimestamp(min);
  };

  // `draggedHitObject` is another retained reference to a hit object the SONG owns, alongside the
  // ones the page keeps (see its forgetRemovedHitObjects) - and one refreshVsrg() did not know
  // about, since it lives in this class rather than in the page. That silently fixed itself
  // when the clone went away (2026-08-06 reactive-model plan, phase 2), which is a behaviour change
  // worth stating: while the song was re-cloned on every edit, the first refresh of a drag left
  // this pointing at a pre-clone orphan whose timestamp never advanced, so handleDrag/handleWheel
  // kept computing `draggedHitObject.timestamp - delta` from a frozen base. It is now the same live
  // object the page is moving. setIsNotDragging() still clears it, which is what keeps it from
  // outliving a deletion.
  selectHitObject = (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => {
    if (clickType !== ClickType.Right) this.draggedHitObject = hitObject;
    this.callbacks.selectHitObject(hitObject, trackIndex, clickType);
  };

  setTimestamp = (timestamp: number) => {
    this.timestamp = timestamp;
    this.callbacks.onTimestampChange(timestamp);
    this.draw();
  };

  // ---- timeline-internal pointer handlers ----

  private handleTimelineEvent = (e: FederatedPointerEvent, override = false) => {
    if (!this.isClickingTimeline && !override) return;
    const time = (e.globalX / this.sizes.width) * this.state.duration;
    this.setTimestamp(clamp(time, 0, this.state.duration));
  };

  private handleTimelineClick = (e: FederatedPointerEvent) => {
    this.isClickingTimeline = true;
    this.handleTimelineEvent(e, true);
  };

  private handleTimelineRelease = () => {
    this.isClickingTimeline = false;
  };

  private getTextStyle(): TextStyle {
    return new TextStyle({
      fontFamily: this.isBonoboFontLoaded ? '"Bonobo"' : '"Source Sans Pro", Helvetica, sans-serif',
      fontSize: this.isBonoboFontLoaded ? 25 : 30,
      fill: this.canvasColors.lineColor[1],
    });
  }

  // The entry point VsrgComposerCanvas.svelte's $effect calls on every reactive-state change - the
  // props channel; theme reaches this class separately, through subscribeTheme, and
  // vsrgComposerStore delivers a seek COMMAND (see handleEvent).
  //
  // The React original drove the expensive recalculations below from vsrgComposerStore events
  // emitted inside `this.setState(..., callback)` - the callback ran after React had committed
  // state and re-rendered children, so the renderer always saw fresh props. The Svelte port
  // kept the emits but not the callback: they fire synchronously, one flush BEFORE the new
  // props arrive here, so every recalculation read the previous values (a scale/snap change
  // applied one step late, an orientation switch built its texture cache for the old
  // orientation). Diffing here restores that ordering by construction rather than by timing -
  // there is no second channel left to get out of step.
  update(state: VsrgComposerRendererState): void {
    const previous = this.state;
    this.state = state;
    if (previous.maxFps !== state.maxFps) this.throttledEventLoop.changeMaxFps(state.maxFps);
    // The playback clock runs only while there is playback to clock. handleTick already
    // early-returned on `!isPlaying`, so the frames this stops were doing nothing.
    if (previous.isPlaying !== state.isPlaying) {
      if (state.isPlaying) this.throttledEventLoop.start();
      else this.throttledEventLoop.stop();
    }
    // calculateSizes() ends in generateCache(), which ends in draw() - so each branch below is
    // a superset of the ones after it, and only the outermost one that applies has to run.
    if (this.needsSizes(previous, state)) return this.calculateSizes();
    if (this.needsCache(previous, state)) return this.generateCache();
    this.draw();
  }

  /**
   * `sizes` is derived from these; the container's own size is handled by the resize listener.
   *
   * All four are values on the state object rather than fields reached through a shared song - see
   * this file's VsrgComposerRendererState header for what that distinction cost, and
   * test/vsrgComposerRenderer.test.ts for the gate that keeps it.
   */
  private needsSizes(
    previous: VsrgComposerRendererState,
    next: VsrgComposerRendererState
  ): boolean {
    return (
      previous.scaling !== next.scaling ||
      previous.snapPoint !== next.snapPoint ||
      previous.bpm !== next.bpm ||
      previous.keys !== next.keys
    );
  }

  /**
   * The cached textures are baked per orientation and per track color.
   *
   * Element-wise over the two `trackColors` arrays, which is what makes the comparison mean
   * anything: the track objects themselves are edited in place, and both states hold the SAME live
   * array, so a comparison reaching through them (`next.tracks[i].color !== previous.tracks[i].color`)
   * compares a value against itself for every edit made within one song.
   */
  private needsCache(
    previous: VsrgComposerRendererState,
    next: VsrgComposerRendererState
  ): boolean {
    if (previous.isHorizontal !== next.isHorizontal) return true;
    return (
      previous.trackColors.length !== next.trackColors.length ||
      next.trackColors.some((color, i) => color !== previous.trackColors[i])
    );
  }

  /**
   * The frame. Everything below repaints from the pools - no display object is constructed or
   * destroyed here unless a pool has to grow - and it is the ONLY place that renders, which is
   * what `autoStart: false` bought (see createApplication).
   */
  private draw(): void {
    if (!this.app || this.contextLost || this.replacingLostRenderer) return;
    if (!this.keysAreCurrent()) this.drawKeys();
    const hasCache = this.cache !== null;
    this.scrollableTrackContainer.visible = hasCache;
    this.timelineContainer.visible = hasCache;
    if (hasCache) {
      this.drawScrollableTracks();
      this.drawTimeline();
    } else {
      this.dropPools();
    }
    this.app.render();
  }

  /** Whether the keys on screen were painted for exactly this state - see the field. */
  private keysAreCurrent(): boolean {
    const painted = this.paintedKeys;
    return (
      painted !== null &&
      painted.isHorizontal === this.state.isHorizontal &&
      painted.keys === this.state.keys &&
      painted.width === this.sizes.width &&
      painted.height === this.sizes.height &&
      painted.timelineSize === this.sizes.timelineSize &&
      painted.playBarOffset === this.playBarOffset &&
      painted.bonoboLoaded === this.isBonoboFontLoaded &&
      painted.theme === this.themeVersion
    );
  }

  /** Destroy both scenes' pools outright. Used when the textures they hold stop existing. */
  private dropPools(): void {
    this.snapPointSlots.destroy();
    this.emptySnapPointSlots.destroy();
    this.hitObjectSlots.destroy();
    this.timelineSquareSlots.destroy();
    this.timelineNoteSlots.destroy();
    this.timelineBreakpointSlots.destroy();
    this.timelineMarkerSlots.destroy();
    this.addTimeButton?.destroy();
    this.addTimeButton = null;
    this.removeTimeButton?.destroy();
    this.removeTimeButton = null;
    this.timeButtonsLayer.removeChildren();
  }

  // Always drawn regardless of cache state - unlike the scrollable-track/timeline draws below,
  // this one doesn't read from the pixi texture cache at all. Rebuilt wholesale rather than
  // pooled, because the paint signature above means it runs on an orientation or key-count change
  // and not on a frame.
  private drawKeys(): void {
    this.paintedKeys = {
      isHorizontal: this.state.isHorizontal,
      keys: this.state.keys,
      width: this.sizes.width,
      height: this.sizes.height,
      timelineSize: this.sizes.timelineSize,
      playBarOffset: this.playBarOffset,
      bonoboLoaded: this.isBonoboFontLoaded,
      theme: this.themeVersion,
    };
    // `context: true` so the two Graphics below release their GraphicsContext and its GPU geometry
    // as well; Container.destroy hands the same options to every child, and a Text ignores it.
    for (const child of this.keysContainer.removeChildren())
      child.destroy({ children: true, context: true });
    this.keysContainer.x = 0;
    this.keysContainer.y = this.sizes.timelineSize;

    const { isHorizontal, keys: keyCount } = this.state;
    const keys = DEFAULT_VSRG_KEYS_MAP[keyCount];
    const sizes = this.sizes;
    const colors = this.canvasColors;
    const keyHeight = sizes.height / keys.length;
    const keyWidth = sizes.width / keys.length;
    const PLAY_BAR_OFFSET = this.playBarOffset;

    const background = new Graphics();
    if (isHorizontal) {
      background.rect(0, 0, 60, sizes.height).fill({ color: colors.background_plain[1] });
      for (let i = 0; i < keys.length - 1; i++) {
        background.moveTo(0, keyHeight * (i + 1));
        background.lineTo(sizes.width, keyHeight * (i + 1));
      }
      background.stroke({ width: 2, color: colors.lineColor_10[1] });
      background.moveTo(59, 0);
      background.lineTo(59, sizes.height);
      background.stroke({ width: 2, color: colors.secondary[1] });
    } else {
      background
        .rect(0, sizes.height - VERTICAL_KEYS_BAND_PX, sizes.width, VERTICAL_KEYS_BAND_PX)
        .fill({ color: colors.background_plain[1] });
      for (let i = 0; i < keys.length - 1; i++) {
        background.moveTo(keyWidth * (i + 1), 0);
        background.lineTo(keyWidth * (i + 1), sizes.height);
      }
      background.stroke({ width: 2, color: colors.lineColor_10[1] });
      background.moveTo(0, sizes.height - VERTICAL_KEYS_BAND_PX);
      background.lineTo(sizes.width, sizes.height - VERTICAL_KEYS_BAND_PX);
      background.stroke({ width: 2, color: colors.secondary[1] });
    }
    this.keysContainer.addChild(background);

    const playbar = new Graphics();
    if (isHorizontal) {
      playbar.moveTo(PLAY_BAR_OFFSET + 1, 0);
      playbar.lineTo(PLAY_BAR_OFFSET + 1, sizes.height);
      playbar.stroke({ width: 6, color: colors.accent[1] });
      for (let i = 0; i < keys.length; i++) {
        playbar
          .circle(PLAY_BAR_OFFSET + 1, keyHeight * (i + 0.5), 4)
          .fill({ color: colors.accent[1] });
      }
    } else {
      const offset = sizes.height - PLAY_BAR_OFFSET - 1 - sizes.timelineSize;
      playbar.moveTo(0, offset);
      playbar.lineTo(sizes.width, offset);
      playbar.stroke({ width: 6, color: colors.accent[1] });
      for (let i = 0; i < keys.length; i++) {
        playbar.circle(keyWidth * (i + 0.5) + 1, offset, 4).fill({ color: colors.accent[1] });
      }
    }
    this.keysContainer.addChild(playbar);

    const textStyle = this.getTextStyle();
    // getTextStyle() picks a size for a full key row; the vertical band is only
    // VERTICAL_KEYS_BAND_PX tall, so cap the glyphs to it (the no-Bonobo fallback of 30px would
    // otherwise fill 40px edge to edge). Harmless when the size already fits.
    if (!isHorizontal) {
      textStyle.fontSize = Math.min(
        textStyle.fontSize,
        Math.round(VERTICAL_KEYS_BAND_PX * VERTICAL_KEYS_BAND_FONT_RATIO)
      );
    }
    keys.forEach((_key, index) => {
      const hitArea = new Rectangle(
        isHorizontal ? 0 : keyWidth * index,
        isHorizontal ? keyHeight * index : sizes.height - VERTICAL_KEYS_BAND_PX,
        isHorizontal ? 60 : sizes.width,
        isHorizontal ? keyHeight : VERTICAL_KEYS_BAND_PX
      );
      const keyContainer = new Container();
      keyContainer.hitArea = hitArea;
      keyContainer.eventMode = 'static';
      keyContainer.on('pointerdown', () => this.callbacks.onKeyDown(index));
      keyContainer.on('pointerup', () => this.callbacks.onKeyUp(index));
      keyContainer.on('pointerupoutside', () => this.callbacks.onKeyUp(index));
      keyContainer.addChild(
        new Text({
          text: `${index + 1}`,
          style: textStyle,
          anchor: 0.5,
          x: isHorizontal ? 30 : keyWidth * index + keyWidth / 2,
          y: isHorizontal
            ? keyHeight * index + keyHeight / 2
            : sizes.height - VERTICAL_KEYS_BAND_PX / 2,
        })
      );
      this.keysContainer.addChild(keyContainer);
    });
  }

  // Each snap-point sprite spans the whole cross axis, so only the axis it is POSITIONED along can
  // be read off the sprite (that gives the timestamp); the key has to come from where the pointer
  // actually landed. Vertically that used to read the key from `target.x`, which is 0 for every
  // vertical snap point (see the sprite.x assignment in drawScrollableTracks) - so every click in
  // vertical mode landed on key 0 no matter which column was under the cursor.
  //
  // A bound method rather than a closure built per draw: it is attached once per pooled sprite,
  // and every value it needs is a field the next draw would have recomputed from anyway.
  private handleSnapPointClick = (event: FederatedPointerEvent) => {
    if (this.preventClick) return;
    const cache = this.cache;
    if (!cache) return;
    const sizes = this.sizes;
    const scale = sizes.scaling;
    const target = event.target as Sprite;
    if (this.state.isHorizontal) {
      const y = event.globalY - sizes.timelineSize;
      const x = target.x / scale;
      this.callbacks.onSnapPointSelect(
        x,
        Math.floor(y / sizes.keyHeight),
        parseMouseClick(event.button)
      );
    } else {
      const y = Math.abs(
        Math.floor(target.y - sizes.height + cache.textures.snapPoints.size) / scale
      );
      const x = event.globalX;
      this.callbacks.onSnapPointSelect(
        y,
        Math.floor(x / sizes.keyWidth),
        parseMouseClick(event.button)
      );
    }
  };

  private drawScrollableTracks(): void {
    const cache = this.cache;
    if (!cache) return;
    const { isHorizontal, tracks, duration, snapPoint, snapPoints, selectedHitObject } = this.state;
    const sizes = this.sizes;
    const timestamp = this.timestamp;
    const scale = sizes.scaling;
    const PLAY_BAR_OFFSET = this.playBarOffset;

    this.scrollableTrackContainer.x = isHorizontal ? -timestamp * scale + PLAY_BAR_OFFSET : 0;
    this.scrollableTrackContainer.y = isHorizontal
      ? sizes.timelineSize
      : timestamp * scale - PLAY_BAR_OFFSET;

    const snapPointSize = cache.textures.snapPoints.size;
    const lowerBound = timestamp - (PLAY_BAR_OFFSET + snapPointSize) / scale;
    const upperBound =
      timestamp + ((isHorizontal ? sizes.width : sizes.height) - PLAY_BAR_OFFSET) / scale;

    // WINDOWED rather than scanned-and-culled: the grid is ascending, so the first drawn index is
    // a search instead of a walk over every entry before it.
    const smallTexture = cache.textures.snapPoints.small!;
    const largeTexture = cache.textures.snapPoints.large!;
    this.snapPointSlots.begin();
    for (
      let i = firstAtOrAfter(snapPoints, lowerBound, snapPointValue);
      i < snapPoints.length;
      i++
    ) {
      const sp = snapPoints[i];
      if (sp > upperBound) break;
      const sprite = this.snapPointSlots.next(i % snapPoint ? smallTexture : largeTexture);
      sprite.x = isHorizontal ? sp * scale : 0;
      sprite.y = isHorizontal ? 0 : -(sp * scale - sizes.height + snapPointSize);
    }
    this.snapPointSlots.end();

    this.emptySnapPointSlots.begin();
    if (lowerBound < 0) {
      const sprite = this.emptySnapPointSlots.next(cache.textures.snapPoints.empty!);
      sprite.x = isHorizontal ? -PLAY_BAR_OFFSET : 0;
      sprite.y = isHorizontal ? 0 : sizes.height;
    }
    this.emptySnapPointSlots.end();

    // ONE pool across every track, opened here and closed after the loop, because the slots are
    // handed out in draw order and the draw order is track 0's objects, then track 1's - which is
    // also what keeps a later track's notes drawing over an earlier one's.
    this.hitObjectSlots.begin();
    for (let index = 0; index < tracks.length; index++) {
      this.drawTrack(tracks[index], index, cache, selectedHitObject);
    }
    this.hitObjectSlots.end();

    if (timestamp >= duration - (isHorizontal ? sizes.width : sizes.height) / scale) {
      const buttons = cache.textures.buttons;
      this.addTimeButton ??= this.createTimeButton(() => this.callbacks.onAddTime());
      this.addTimeButton.paint(
        buttons.time!,
        t('vsrg_composer:click_to_add_time'),
        isHorizontal ? duration * scale : 0,
        isHorizontal ? 0 : -(duration * scale - sizes.height + buttons.height),
        buttons.width,
        buttons.height
      );
      this.removeTimeButton ??= this.createTimeButton(() => this.callbacks.onRemoveTime());
      this.removeTimeButton.paint(
        buttons.time!,
        t('vsrg_composer:click_to_remove_time'),
        isHorizontal ? duration * scale : sizes.width / 2,
        isHorizontal ? sizes.height / 2 : -(duration * scale - sizes.height + buttons.height),
        buttons.width,
        buttons.height
      );
    } else {
      this.addTimeButton?.hide();
      this.removeTimeButton?.hide();
    }
  }

  private createTimeButton(onTap: () => void): TimeButtonView {
    const view = new TimeButtonView(this.getTextStyle(), onTap);
    this.timeButtonsLayer.addChild(view.container);
    return view;
  }

  private drawTrack(
    track: VsrgTrack,
    trackIndex: number,
    cache: VsrgCanvasCache,
    selectedHitObject: VsrgHitObject | null
  ): void {
    const { isHorizontal, keys } = this.state;
    const sizes = this.sizes;
    const timestamp = this.timestamp;
    const scale = sizes.scaling;
    const PLAY_BAR_OFFSET = this.playBarOffset;
    const positionSizeHorizontal = sizes.height / keys;
    const positionSizeVertical = sizes.width / keys;
    const lowerBound = timestamp - PLAY_BAR_OFFSET / scale - cache.textures.sizes.hitObject;
    const upperBound =
      timestamp +
      (isHorizontal ? sizes.width : sizes.height) / scale -
      PLAY_BAR_OFFSET +
      cache.textures.sizes.hitObject;

    // Scanned in full and culled inside the loop, unlike the snap points and the timeline's notes
    // above and below. `hitObjects` is NOT reliably ascending: VsrgSong.moveHitObject deliberately
    // does not re-sort after a drag (its own comment says so, and names what that already costs
    // tickPlayback), so a windowed search would make the object being dragged disappear from the
    // canvas. A plain `for` costs an index read per object and allocates nothing, which is what
    // this pass was actually about.
    const hitObjects = track.hitObjects;
    for (let i = 0; i < hitObjects.length; i++) {
      const hitObject = hitObjects[i];
      if (
        lowerBound > hitObject.timestamp + hitObject.holdDuration ||
        hitObject.timestamp > upperBound
      )
        continue;
      const x = isHorizontal
        ? hitObject.timestamp * scale
        : positionSizeVertical * hitObject.index + positionSizeVertical / 2;
      const y = isHorizontal
        ? positionSizeHorizontal * hitObject.index + positionSizeHorizontal / 2
        : -(hitObject.timestamp * scale - sizes.height);
      this.hitObjectSlots.next().paint({
        hitObject,
        trackIndex,
        cache,
        color: track.color,
        isSelected: hitObject === selectedHitObject,
        isHorizontal,
        scale,
        x,
        y,
      });
    }
  }

  private drawTimeline(): void {
    const cache = this.cache;
    if (!cache) return;
    const { duration, breakpoints, renderableNotes: notes } = this.state;
    const sizes = this.sizes;
    const timestamp = this.timestamp;
    const PLAY_BAR_OFFSET = this.playBarOffset;

    this.timelineContainer.x = 0;
    this.timelineContainer.y = 0;

    const lowerBound = timestamp - (PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling;
    const upperBound =
      timestamp + (sizes.width - PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling;
    const relativeTimestampPosition = timestamp / duration;

    this.timelineSquareSlots.begin();
    this.timelineSquareSlots.next(cache.textures.timeline.square!);
    this.timelineSquareSlots.end();

    this.timelineNotesLayer.x = -timestamp * sizes.scaling + PLAY_BAR_OFFSET;
    this.timelineNotesLayer.y = 0;
    // WINDOWED: the background song's notes are time-ascending (RecordedSong.tickPlayback already
    // relies on it, and getRenderableNotes only filters), so the whole song no longer has to be
    // read to draw the handful of ticks under the timeline.
    const noteTexture = cache.textures.timeline.note!;
    this.timelineNoteSlots.begin();
    for (let i = firstAtOrAfter(notes, lowerBound, noteTime); i < notes.length; i++) {
      const note = notes[i];
      if (note.time > upperBound) break;
      this.timelineNoteSlots.next(noteTexture).x = note.time * sizes.scaling;
    }
    this.timelineNoteSlots.end();

    // No window: a breakpoint is placed as a FRACTION of the whole timeline strip, so every one of
    // them is on screen at every timestamp.
    const breakpointTexture = cache.textures.timeline.breakpoint!;
    this.timelineBreakpointSlots.begin();
    for (let i = 0; i < breakpoints.length; i++) {
      this.timelineBreakpointSlots.next(breakpointTexture).x =
        (breakpoints[i] / duration) * sizes.width;
    }
    this.timelineBreakpointSlots.end();

    this.timelineMarkerSlots.begin();
    const currentTime = this.timelineMarkerSlots.next(cache.textures.timeline.currentTime!);
    currentTime.x = PLAY_BAR_OFFSET - 2;
    currentTime.y = 0;
    const thumb = this.timelineMarkerSlots.next(cache.textures.timeline.thumb!);
    thumb.y = 0;
    thumb.x = relativeTimestampPosition * sizes.width;
    this.timelineMarkerSlots.end();
  }

  // this.app?.destroy() below is REQUIRED: nothing else owns the pixi Application's lifecycle in
  // this synchronous class. Skipping it would leak a WebGL context/canvas on every unmount.
  destroy(): void {
    this.destroyed = true;
    this.contextRecoveryDispose?.();
    this.contextRecoveryDispose = null;
    window.removeEventListener('resize', this.calculateSizes);
    window.removeEventListener('blur', this.handleBlur);
    vsrgComposerStore.removeEventListener('timestampChange', { id: 'vsrg-canvas' });
    this.themeDispose?.();
    this.cache?.destroy();
    this.throttledEventLoop.stop();
    // Before the Application goes: the pools are the only display objects this class owns that a
    // stage teardown would otherwise have to find for it.
    this.dropPools();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
