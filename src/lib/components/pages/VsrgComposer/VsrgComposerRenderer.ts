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
  PIXI_VERTICAL_ALIGN,
} from '$core/legacyConfig';
import type { VsrgHitObject, VsrgTrack } from '$core/Songs/VsrgSong.svelte';
import type { RecordedSong } from '$core/Songs/RecordedSong';
import type { RecordedNote } from '$core/Songs/SongClasses';
import type { VsrgSongRenderState } from './vsrgSongRenderState';
import { VsrgCanvasCache } from './VsrgComposerCache';

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

  // Persistent scene containers, created once per renderer instance; draw() clears and rebuilds
  // each one's children on every update rather than diffing incrementally.
  // Ordering requirement: added to the stage in THIS exact order in init() - scrollable tracks,
  // then keys, then timeline. That's the visual stacking z-order; reordering the addChild calls
  // changes what draws on top of what.
  private readonly scrollableTrackContainer = new Container();
  private readonly keysContainer = new Container();
  private readonly timelineContainer = new Container();

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
    this.scrollableTrackContainer.eventMode = 'static';
    this.timelineContainer.eventMode = 'static';
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
    this.throttledEventLoop.start();
    window.addEventListener('blur', this.handleBlur);

    new FontFaceObserver('Bonobo')
      .load()
      .then(() => {
        this.isBonoboFontLoaded = true;
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
    this.generateCache();
  };

  // Unlike the sibling ComposerRenderer (which ignores its theme callback param and re-reads
  // ThemeProvider directly), this one genuinely uses the passed theme argument.
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
    this.generateCache();
  };

  private generateCache = () => {
    if (!this.app || this.contextLost || this.replacingLostRenderer) return;
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
      playbarOffset: globalConfigStore.get().PLAY_BAR_OFFSET,
    });
    const oldCache = this.cache;
    this.cache = newCache;
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

  // Rebuilds every container's children fully on every call (see the scrollableTrackContainer/
  // keysContainer/timelineContainer declarations above for why).
  private draw(): void {
    if (!this.app || this.contextLost || this.replacingLostRenderer) return;
    this.drawKeys();
    const hasCache = this.cache !== null;
    this.scrollableTrackContainer.visible = hasCache;
    this.timelineContainer.visible = hasCache;
    if (hasCache) {
      this.drawScrollableTracks();
      this.drawTimeline();
    } else {
      for (const child of this.scrollableTrackContainer.removeChildren())
        child.destroy({ children: true });
      for (const child of this.timelineContainer.removeChildren())
        child.destroy({ children: true });
    }
  }

  // Always drawn regardless of cache state - unlike the scrollable-track/timeline draws below,
  // this one doesn't read from the pixi texture cache at all.
  private drawKeys(): void {
    for (const child of this.keysContainer.removeChildren()) child.destroy({ children: true });
    this.keysContainer.x = 0;
    this.keysContainer.y = this.sizes.timelineSize;

    const { isHorizontal, keys: keyCount } = this.state;
    const keys = DEFAULT_VSRG_KEYS_MAP[keyCount];
    const sizes = this.sizes;
    const colors = this.canvasColors;
    const keyHeight = sizes.height / keys.length;
    const keyWidth = sizes.width / keys.length;
    const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET;

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
        .rect(0, sizes.height - 60, sizes.width, 60)
        .fill({ color: colors.background_plain[1] });
      for (let i = 0; i < keys.length - 1; i++) {
        background.moveTo(keyWidth * (i + 1), 0);
        background.lineTo(keyWidth * (i + 1), sizes.height);
      }
      background.stroke({ width: 2, color: colors.lineColor_10[1] });
      background.moveTo(0, sizes.height - 60);
      background.lineTo(sizes.width, sizes.height - 60);
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
    keys.forEach((_key, index) => {
      const hitArea = new Rectangle(
        isHorizontal ? 0 : keyWidth * index,
        isHorizontal ? keyHeight * index : sizes.height - 60,
        isHorizontal ? 60 : sizes.width,
        isHorizontal ? keyHeight : 60
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
          y: isHorizontal ? keyHeight * index + keyHeight / 2 : sizes.height - 30,
        })
      );
      this.keysContainer.addChild(keyContainer);
    });
  }

  private drawScrollableTracks(): void {
    for (const child of this.scrollableTrackContainer.removeChildren())
      child.destroy({ children: true });
    const cache = this.cache;
    if (!cache) return;
    const { isHorizontal, tracks, duration, snapPoint, snapPoints, selectedHitObject } = this.state;
    const sizes = this.sizes;
    const timestamp = this.timestamp;
    const preventClick = this.preventClick;
    const scale = sizes.scaling;
    const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET;

    this.scrollableTrackContainer.x = isHorizontal ? -timestamp * scale + PLAY_BAR_OFFSET : 0;
    this.scrollableTrackContainer.y = isHorizontal
      ? sizes.timelineSize
      : timestamp * scale - PLAY_BAR_OFFSET;

    const lowerBound = timestamp - (PLAY_BAR_OFFSET + cache.textures.snapPoints.size) / scale;
    const upperBound =
      timestamp + ((isHorizontal ? sizes.width : sizes.height) - PLAY_BAR_OFFSET) / scale;
    const snapPointSize = cache.textures.snapPoints.size;

    // Each sprite spans the whole cross axis, so only the axis it is POSITIONED along can be
    // read off the sprite (that gives the timestamp); the key has to come from where the
    // pointer actually landed. Vertically that used to read the key from `target.x`, which is
    // 0 for every vertical snap point (see the sprite.x assignment below) - so every click in
    // vertical mode landed on key 0 no matter which column was under the cursor.
    const handleSnapPointClick = (event: FederatedPointerEvent) => {
      if (preventClick) return;
      const target = event.target as Sprite;
      if (isHorizontal) {
        const y = event.globalY - sizes.timelineSize;
        const x = target.x / scale;
        this.callbacks.onSnapPointSelect(
          x,
          Math.floor(y / sizes.keyHeight),
          parseMouseClick(event.button)
        );
      } else {
        const y = Math.abs(Math.floor(target.y - sizes.height + snapPointSize) / scale);
        const x = event.globalX;
        this.callbacks.onSnapPointSelect(
          y,
          Math.floor(x / sizes.keyWidth),
          parseMouseClick(event.button)
        );
      }
    };

    snapPoints.forEach((sp, i) => {
      if (lowerBound > sp || sp > upperBound) return;
      const sprite = new Sprite(
        i % snapPoint ? cache.textures.snapPoints.small! : cache.textures.snapPoints.large!
      );
      sprite.eventMode = 'static';
      sprite.on('pointertap', handleSnapPointClick);
      sprite.x = isHorizontal ? sp * scale : 0;
      sprite.y = isHorizontal ? 0 : -(sp * scale - sizes.height + snapPointSize);
      this.scrollableTrackContainer.addChild(sprite);
    });

    if (lowerBound < 0) {
      const sprite = new Sprite(cache.textures.snapPoints.empty!);
      sprite.x = isHorizontal ? -PLAY_BAR_OFFSET : 0;
      sprite.y = isHorizontal ? 0 : sizes.height;
      this.scrollableTrackContainer.addChild(sprite);
    }

    tracks.forEach((track, index) => {
      this.drawTrack(track, index, cache, selectedHitObject);
    });

    if (timestamp >= duration - (isHorizontal ? sizes.width : sizes.height) / scale) {
      const textStyle = this.getTextStyle();
      const addTimeText = t('vsrg_composer:click_to_add_time');
      const removeTimeText = t('vsrg_composer:click_to_remove_time');

      const addTimeContainer = new Container();
      addTimeContainer.eventMode = 'static';
      addTimeContainer.on('pointertap', () => this.callbacks.onAddTime());
      addTimeContainer.x = isHorizontal ? duration * scale : 0;
      addTimeContainer.y = isHorizontal
        ? 0
        : -(duration * scale - sizes.height + cache.textures.buttons.height);
      addTimeContainer.addChild(new Sprite(cache.textures.buttons.time!));
      addTimeContainer.addChild(
        new Text({
          text: addTimeText,
          style: textStyle,
          anchor: 0.5,
          x: cache.textures.buttons.width / 2,
          y: cache.textures.buttons.height / 2,
        })
      );
      this.scrollableTrackContainer.addChild(addTimeContainer);

      const removeTimeContainer = new Container();
      removeTimeContainer.eventMode = 'static';
      removeTimeContainer.on('pointertap', () => this.callbacks.onRemoveTime());
      removeTimeContainer.x = isHorizontal ? duration * scale : sizes.width / 2;
      removeTimeContainer.y = isHorizontal
        ? sizes.height / 2
        : -(duration * scale - sizes.height + cache.textures.buttons.height);
      removeTimeContainer.addChild(new Sprite(cache.textures.buttons.time!));
      removeTimeContainer.addChild(
        new Text({
          text: removeTimeText,
          style: textStyle,
          anchor: 0.5,
          x: cache.textures.buttons.width / 2,
          y: cache.textures.buttons.height / 2,
        })
      );
      this.scrollableTrackContainer.addChild(removeTimeContainer);
    }
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
    const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET;
    const positionSizeHorizontal = sizes.height / keys;
    const positionSizeVertical = sizes.width / keys;
    const lowerBound = timestamp - PLAY_BAR_OFFSET / scale - cache.textures.sizes.hitObject;
    const upperBound =
      timestamp +
      (isHorizontal ? sizes.width : sizes.height) / scale -
      PLAY_BAR_OFFSET +
      cache.textures.sizes.hitObject;

    track.hitObjects.forEach((hitObject) => {
      if (
        lowerBound > hitObject.timestamp + hitObject.holdDuration ||
        hitObject.timestamp > upperBound
      )
        return;
      const x = isHorizontal
        ? hitObject.timestamp * scale
        : positionSizeVertical * hitObject.index + positionSizeVertical / 2;
      const y = isHorizontal
        ? positionSizeHorizontal * hitObject.index + positionSizeHorizontal / 2
        : -(hitObject.timestamp * scale - sizes.height);

      const onPointerDown = (e: FederatedPointerEvent) => {
        this.selectHitObject(hitObject, trackIndex, parseMouseClick(e.button));
      };

      if (hitObject.isHeld) {
        const container = new Container();
        container.eventMode = 'static';
        container.on('pointerdown', onPointerDown);

        const trail = new Sprite(cache.getHeldTrailCache(track.color));
        if (isHorizontal) {
          trail.anchor = { x: 0, y: 0.5 };
          trail.height = cache.textures.sizes.trail;
          trail.width = hitObject.holdDuration * scale;
        } else {
          trail.anchor = PIXI_CENTER_X_END_Y;
          trail.width = cache.textures.sizes.trail;
          trail.height = hitObject.holdDuration * scale;
        }
        trail.x = x;
        trail.y = y;
        container.addChild(trail);

        const startCap = new Sprite(cache.getHeldHitObjectCache(track.color));
        startCap.anchor = 0.5;
        startCap.x = x;
        startCap.angle = 45;
        startCap.y = y;
        container.addChild(startCap);

        const endCap = new Sprite(cache.getHeldHitObjectCache(track.color));
        endCap.anchor = 0.5;
        endCap.x = isHorizontal ? (hitObject.timestamp + hitObject.holdDuration) * scale : x;
        endCap.y = isHorizontal ? y : y - hitObject.holdDuration * scale;
        container.addChild(endCap);

        if (hitObject === selectedHitObject) {
          const ring = new Sprite(cache.getSelectionRingsCache(track.color));
          ring.anchor = 0.5;
          ring.x = x;
          ring.y = y;
          container.addChild(ring);
        }
        this.scrollableTrackContainer.addChild(container);
      } else {
        if (hitObject === selectedHitObject) {
          const ring = new Sprite(cache.getSelectionRingsCache(track.color));
          ring.anchor = 0.5;
          ring.x = x;
          ring.y = y;
          this.scrollableTrackContainer.addChild(ring);
        }
        const sprite = new Sprite(cache.getHitObjectCache(track.color));
        sprite.eventMode = 'static';
        sprite.on('pointerdown', onPointerDown);
        sprite.anchor = 0.5;
        sprite.x = x;
        sprite.y = y;
        this.scrollableTrackContainer.addChild(sprite);
      }
    });
  }

  private drawTimeline(): void {
    for (const child of this.timelineContainer.removeChildren()) child.destroy({ children: true });
    const cache = this.cache;
    if (!cache) return;
    const { duration, breakpoints, renderableNotes: notes } = this.state;
    const sizes = this.sizes;
    const timestamp = this.timestamp;
    const PLAY_BAR_OFFSET = globalConfigStore.get().PLAY_BAR_OFFSET;

    this.timelineContainer.x = 0;
    this.timelineContainer.y = 0;
    this.timelineContainer.hitArea = new Rectangle(0, 0, sizes.width, sizes.timelineSize);

    const lowerBound = timestamp - (PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling;
    const upperBound =
      timestamp + (sizes.width - PLAY_BAR_OFFSET + sizes.timelineSize) / sizes.scaling;
    const relativeTimestampPosition = timestamp / duration;

    this.timelineContainer.addChild(new Sprite(cache.textures.timeline.square!));

    const notesContainer = new Container();
    notesContainer.x = -timestamp * sizes.scaling + PLAY_BAR_OFFSET;
    notesContainer.y = 0;
    notes.forEach((note) => {
      if (note.time < lowerBound || note.time > upperBound) return;
      const sprite = new Sprite(cache.textures.timeline.note!);
      sprite.x = note.time * sizes.scaling;
      sprite.anchor = PIXI_VERTICAL_ALIGN;
      notesContainer.addChild(sprite);
    });
    this.timelineContainer.addChild(notesContainer);

    const breakpointsContainer = new Container();
    breakpoints.forEach((breakpoint) => {
      const sprite = new Sprite(cache.textures.timeline.breakpoint!);
      sprite.x = (breakpoint / duration) * sizes.width;
      breakpointsContainer.addChild(sprite);
    });
    this.timelineContainer.addChild(breakpointsContainer);

    const currentTime = new Sprite(cache.textures.timeline.currentTime!);
    currentTime.x = PLAY_BAR_OFFSET - 2;
    currentTime.y = 0;
    this.timelineContainer.addChild(currentTime);

    const thumb = new Sprite(cache.textures.timeline.thumb!);
    thumb.y = 0;
    thumb.x = relativeTimestampPosition * sizes.width;
    this.timelineContainer.addChild(thumb);
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
    this.app?.destroy(true, { children: true });
    this.app = null;
  }
}
