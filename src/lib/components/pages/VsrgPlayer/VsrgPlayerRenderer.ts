// This renderer owns the vsrg player canvas - one pixi Application with a single scrolling
// container of hit-object sprites (tap vs. held, plus the connecting "line" sprite between
// simultaneous notes on different keys).
//
// Unlike VsrgComposerRenderer (which is pushed props reactively via update() for everything it
// tracks), this renderer owns song/timestamp/accuracy/sizes/colors/cache/renderableHitObjects/
// accuracyBounds as its own private fields, subscribing directly to subscribeCurrentVsrgSong
// itself. Only isPlaying/scrollSpeed/keyboardLayout/maxFps are pushed reactively via update() (see
// VsrgPlayerRendererState below); the callbacks are wired once at construction instead and never
// change identity afterward.
import { Application, Container, Sprite } from 'pixi.js';
import { subscribeTheme } from '$core/theme/ThemeProvider.svelte';
import type { Theme } from '$core/theme/ThemeProvider.svelte';
import { keyBinds } from '$stores/KeybindsStore.svelte';
import { subscribeCurrentVsrgSong, vsrgPlayerStore } from '$stores/VsrgPlayerStore.svelte';
import type {
  KeyboardKey,
  VsrgKeyboardPressType,
  VsrgPlayerHitType,
  VsrgPlayerSong,
} from '$stores/VsrgPlayerStore.svelte';
import { ThrottledEventLoop } from '$core/ThrottledEventLoop';
import { isNumberCloseTo } from '$core/utils/Utilities';
import { DEFAULT_DOM_RECT, PIXI_CENTER_X_END_Y } from '$core/legacyConfig';
import { VsrgSong } from '$core/Songs/VsrgSong.svelte';
import type { VsrgAccuracyBounds, VsrgHitObject } from '$core/Songs/VsrgSong.svelte';
import type { VsrgKeyboardLayout } from './VsrgPlayerKeyboard.svelte';
import { VsrgPlayerCache } from './VsrgPlayerCache';

export type VsrgPlayerCanvasColors = {
  background_plain: [string, number];
  background_layer_10: [string, number];
  background: [string, number];
  background_10: [string, number];
  secondary: [string, number];
  lineColor: [string, number];
  lineColor_10: [string, number];
  accent: [string, number];
};

export type VsrgPlayerCanvasSizes = {
  el: DOMRect;
  rawWidth: number;
  rawHeight: number;
  width: number;
  height: number;
  keyWidth: number;
  hitObjectSize: number;
  scaling: number;
  verticalOffset: number;
};

// QUIRK: duplicated verbatim in the vsrg-player +page.svelte route too - the page must never
// statically import this module (it touches pixi.js, which would break prerendering), so it
// keeps its own copy of this default instead of importing it from here.
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
};

export enum HitObjectStatus {
  Idle,
  Pressed,
  Missed,
  Hit,
}

export class RenderableHitObject {
  hitObject: VsrgHitObject;
  color: string = '#FFFFFF';
  status = HitObjectStatus.Idle;
  instrumentIndex: number = 0;
  // will be used to give score only every N ms
  heldScoreTimeout = 0;

  constructor(hitObject: VsrgHitObject) {
    this.hitObject = hitObject;
  }
}

// The reactive input VsrgPlayerCanvas.svelte pushes into update() on every relevant change via its
// own $effect.
export interface VsrgPlayerRendererState {
  isPlaying: boolean;
  scrollSpeed: number;
  // QUIRK: accepted for prop-shape parity but never read anywhere in this class's body - a
  // genuine dead field, preserved as dead rather than wired up to something.
  keyboardLayout: VsrgKeyboardLayout;
  maxFps: number;
}

export interface VsrgPlayerRendererCallbacks {
  onSizeChange: (sizes: VsrgPlayerCanvasSizes) => void;
  onTick: (timestamp: number) => void;
  playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void;
  onTimestampChange: (timestamp: number) => void;
}

export class VsrgPlayerRenderer {
  private app: Application | null = null;
  private cache: VsrgPlayerCache | null = null;
  private themeDispose: (() => void) | null = null;
  private currentSongDispose: (() => void) | null = null;
  private throttledEventLoop: ThrottledEventLoop;

  // Persistent scene container, created once per renderer instance; draw() clears and rebuilds
  // its children on every update rather than diffing incrementally. Added to the stage once in
  // init().
  private readonly hitObjectsContainer = new Container();

  private state: VsrgPlayerRendererState;

  // ---- private fields, not pushed reactively via update() (see this class's own header note) ----
  private song: VsrgSong = new VsrgSong('');
  private timestamp = 0;
  private readonly accuracy = 150;
  private sizes: VsrgPlayerCanvasSizes = { ...defaultVsrgPlayerSizes };
  private colors: VsrgPlayerCanvasColors = {
    background_plain: ['#000000', 0],
    background_layer_10: ['#000000', 0],
    background: ['#000000', 0],
    background_10: ['#000000', 0],
    secondary: ['#000000', 0],
    lineColor: ['#000000', 0],
    lineColor_10: ['#000000', 0],
    accent: ['#000000', 0],
  };
  private renderableHitObjects: RenderableHitObject[] = [];
  private accuracyBounds: VsrgAccuracyBounds = [0, 0, 0, 0, 0];

  constructor(
    private readonly container: HTMLElement,
    initialState: VsrgPlayerRendererState,
    private readonly callbacks: VsrgPlayerRendererCallbacks
  ) {
    this.state = initialState;
    // Read directly from initialState here, unlike VsrgComposerRenderer's hardcoded-48
    // placeholder - this class's constructor has the real maxFps available immediately.
    this.throttledEventLoop = new ThrottledEventLoop(() => {}, initialState.maxFps);
  }

  // Constructors cannot be async, so mounting collapses into this explicit async method;
  // VsrgPlayerCanvas.svelte's onMount awaits it before ever calling update().
  //
  // QUIRK (load-bearing - read before "fixing" the call order below): same reasoning as
  // VsrgComposerRenderer's own init() - the cache is generated for-real exactly once, after the
  // pixi Application exists. Do not add extra early cache-generating calls here: generateCache()'s
  // own `if (!app) return` guard makes an early call harmless, but a redundant later call would
  // regenerate and discard the just-generated cache.
  async init(): Promise<void> {
    this.themeDispose = subscribeTheme(this.handleThemeChange);
    vsrgPlayerStore.addKeyboardListener({
      callback: this.handleKeyboard,
      id: 'vsrg-player-canvas',
    });
    this.currentSongDispose = subscribeCurrentVsrgSong(this.onSongPick);
    window.addEventListener('resize', this.calculateSizes);
    this.calculateSizes();

    const devicePixelRatio = window.devicePixelRatio ?? 1.4;
    this.app = new Application();
    await this.app.init({
      width: this.sizes.rawWidth,
      height: this.sizes.rawHeight,
      backgroundAlpha: 0,
      autoDensity: false,
      antialias: true,
      resolution: devicePixelRatio,
    });
    this.container.appendChild(this.app.canvas);
    this.app.stage.addChild(this.hitObjectsContainer);
    this.hitObjectsContainer.sortableChildren = true;

    this.throttledEventLoop.setCallback(this.handleTick);
    this.throttledEventLoop.changeMaxFps(this.state.maxFps);
    this.throttledEventLoop.start();

    // Re-run now that the Application genuinely exists (the earlier call above ran before it
    // did) - this is the real calculateSizes()/generateCache() pass; it also paints the first frame.
    this.calculateSizes();
    this.draw();
  }

  private onSongPick = ({ type, song }: VsrgPlayerSong) => {
    vsrgPlayerStore.resetScore();
    const { scrollSpeed } = this.state;
    if (type === 'play' && song) {
      const countDown = 3000 / 2;
      this.song = song;
      this.timestamp = -countDown - scrollSpeed;
      this.renderableHitObjects = [];
      song.startPlayback(0);
      this.calculateSizes();
      this.generateAccuracyBounds();
      this.callbacks.onTimestampChange(this.timestamp);
    }
    if (type === 'stop') {
      this.song = new VsrgSong('');
      this.timestamp = 0;
      this.renderableHitObjects = [];
      this.callbacks.onTimestampChange(this.timestamp);
      this.draw();
    }
  };

  // this.app?.destroy() below is REQUIRED: nothing else owns the pixi Application's lifecycle in
  // this synchronous class. Skipping it would leak a WebGL context/canvas on every unmount.
  destroy(): void {
    this.throttledEventLoop.stop();
    // QUIRK: resets the shared vsrgPlayerStore's keyboard layout to the 4-key mapping
    // UNCONDITIONALLY, regardless of whether a 4-key or 6-key layout was active. Flagged, not fixed.
    vsrgPlayerStore.setLayout(keyBinds.getVsrgKeybinds(4));
    vsrgPlayerStore.removeKeyboardListener({ id: 'vsrg-player-canvas' });
    this.currentSongDispose?.();
    this.themeDispose?.();
    window.removeEventListener('resize', this.calculateSizes);
    this.cache?.destroy();
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  // QUIRK: mutates rho.status directly below and never calls draw() itself, so a key-press
  // never repaints immediately on keydown/keyup - it only becomes visible on the next
  // ThrottledEventLoop tick (whose validateHitObjects call ends in a real draw()). Flagged, not
  // fixed - don't add a draw() call here for "responsiveness" without checking the timing.
  private handleKeyboard = (key: KeyboardKey, type: VsrgKeyboardPressType) => {
    const { renderableHitObjects, timestamp, accuracy } = this;
    // rho = renderable hit object
    const rho = renderableHitObjects.find((r) => r.hitObject.index === key.index);
    if (!rho) return;
    if (type === 'down') {
      const isInRange = isNumberCloseTo(rho.hitObject.timestamp, timestamp, accuracy);
      const isIdle = rho.status === HitObjectStatus.Idle;
      if (isInRange && isIdle) {
        if (!rho.hitObject.isHeld) {
          rho.status = HitObjectStatus.Hit;
        } else {
          rho.status = HitObjectStatus.Pressed;
        }
        this.callbacks.playHitObject(rho.hitObject, rho.instrumentIndex);
        vsrgPlayerStore.incrementScore(this.getHitRating(rho.hitObject, timestamp));
      }
    }
    if (type === 'up') {
      if (rho.hitObject.isHeld) {
        if (
          isNumberCloseTo(rho.hitObject.timestamp + rho.hitObject.holdDuration, timestamp, accuracy)
        ) {
          rho.status = HitObjectStatus.Hit;
        } else {
          rho.status = HitObjectStatus.Missed;
          vsrgPlayerStore.incrementScore('miss');
        }
      }
    }
  };

  // Bound to the resize listener and called directly at mount/song-pick.
  private calculateSizes = () => {
    const el = this.container;
    const width = el.clientWidth;
    const keyWidth = width / this.song.keys;
    const hitObjectSize = keyWidth * 0.6;
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
    };
    this.app?.renderer.resize(sizes.width, sizes.height);
    if (this.app) {
      this.app.canvas.style.width = `${sizes.width}px`;
      this.app.canvas.style.height = `${sizes.height}px`;
    }
    // QUIRK: fires unconditionally, even during the brief window before this.app exists (this
    // method runs at construction time, on window resize, and on song-pick alike) - unlike
    // generateCache() below, this call is not gated behind an `if (this.app)` check.
    this.callbacks.onSizeChange(sizes);
    this.sizes = sizes;
    this.generateCache();
  };

  private generateCache = () => {
    const app = this.app;
    if (!app) return;
    const newCache = new VsrgPlayerCache({
      app,
      colors: this.colors,
      sizes: this.sizes,
      trackColors: this.song.tracks.map((track) => track.color),
    });
    const oldCache = this.cache;
    this.cache = newCache;
    this.draw();
    // QUIRK: the previous cache's textures are destroyed only after a 500ms delay ("not sure
    // why pixi reuses textures from the old cache" - old's own TODO, preserved). Destroying
    // immediately caused visible issues; don't remove or shorten this delay without checking that.
    setTimeout(() => {
      oldCache?.destroy();
    }, 500);
  };

  private generateAccuracyBounds = () => {
    this.accuracyBounds = this.song.getAccuracyBounds();
  };

  private getHitRating = (hitObject: VsrgHitObject, timestamp: number): VsrgPlayerHitType => {
    const { accuracyBounds } = this;
    const diff = Math.abs(timestamp - hitObject.timestamp);
    if (diff < accuracyBounds[0]) return 'amazing';
    if (diff < accuracyBounds[1]) return 'perfect';
    if (diff < accuracyBounds[2]) return 'great';
    if (diff < accuracyBounds[3]) return 'good';
    if (diff < accuracyBounds[4]) return 'bad';
    return 'miss';
  };

  private handleThemeChange = (theme: Theme) => {
    const bgPlain = theme.get('primary');
    const bgLine = theme.getText('primary');
    const bgLine10 = bgLine.darken(0.5).desaturate(1);
    const bgLayer10 = theme.layer('background', 0.18, 0.06);
    const bg = bgPlain.darken(0.15);
    const bg10 = bg.darken(0.1);
    const secondary = theme.get('secondary');
    const accent = theme.get('accent');
    this.colors = {
      background_plain: [bgPlain.hex(), bgPlain.rgb().rgbNumber()],
      background_layer_10: [bgLayer10.hex(), bgLayer10.rgb().rgbNumber()],
      background: [bg.hex(), bg.rgb().rgbNumber()],
      background_10: [bg10.hex(), bg10.rgb().rgbNumber()],
      secondary: [secondary.hex(), secondary.rgb().rgbNumber()],
      lineColor: [bgLine.hex(), bgLine.rgb().rgbNumber()],
      lineColor_10: [bgLine10.hex(), bgLine10.rgb().rgbNumber()],
      accent: [accent.hex(), accent.rgb().rgbNumber()],
    };
    this.generateCache();
  };

  // The ThrottledEventLoop-driven playback tick.
  private handleTick = (_elapsed: number, sinceLast: number) => {
    const { isPlaying, scrollSpeed } = this.state;
    if (!isPlaying) return;
    const timestamp = this.timestamp + sinceLast;
    const tracks = this.song.tickPlayback(timestamp + scrollSpeed + this.sizes.height);
    const toAdd = tracks
      .map((track, i) => {
        return track.map((hitObject) => {
          const renderable = new RenderableHitObject(hitObject);
          renderable.instrumentIndex = i;
          renderable.color = this.song.tracks[i].color;
          return renderable;
        });
      })
      .flat();

    this.validateHitObjects(timestamp, this.renderableHitObjects.concat(toAdd), this.timestamp);
    this.callbacks.onTick(timestamp);
  };

  private validateHitObjects = (
    timestamp: number,
    renderableHitObjects: RenderableHitObject[],
    previousTimestamp: number
  ) => {
    const { accuracy } = this;
    // hoisted once, and a PLAIN array: `vsrgPlayerStore.keyboard` is `$state.raw` so that the
    // per-hit-object `keyboard[index]` / `key.isPressed` reads in the loop below - which run on
    // every frame - are plain property reads rather than Proxy traps. Reading it here registers
    // nothing: this runs from a ThrottledEventLoop callback, not a reactive context.
    const keyboard = vsrgPlayerStore.keyboard;
    for (let i = 0; i < renderableHitObjects.length; i++) {
      const ro = renderableHitObjects[i];
      const key = keyboard[ro.hitObject.index];
      if (!key) continue;
      const isIdle = ro.status === HitObjectStatus.Idle;
      if (!key.isPressed && isIdle && ro.hitObject.timestamp < timestamp - accuracy) {
        ro.status = HitObjectStatus.Missed;
        vsrgPlayerStore.incrementScore('miss');
        continue;
      }
      if (key.isPressed && ro.status === HitObjectStatus.Pressed) {
        const pressedTooLong =
          ro.hitObject.timestamp + ro.hitObject.holdDuration < timestamp - accuracy;
        ro.heldScoreTimeout -= timestamp - previousTimestamp;
        if (pressedTooLong) {
          ro.status = HitObjectStatus.Missed;
          vsrgPlayerStore.incrementScore('miss');
        } else {
          if (ro.heldScoreTimeout <= 0) {
            ro.heldScoreTimeout = 300;
            vsrgPlayerStore.incrementScore('perfect');
          }
        }
        continue;
      }
    }
    const filtered = renderableHitObjects.filter(
      (r) => r.hitObject.timestamp + r.hitObject.holdDuration > timestamp - accuracy
    );
    this.timestamp = timestamp;
    this.renderableHitObjects = filtered;
    this.callbacks.onTimestampChange(timestamp);
    this.draw();
  };

  // The entry point VsrgPlayerCanvas.svelte's $effect calls on every reactive-prop change.
  // Svelte props are this class's only state channel. maxFps used to arrive through a
  // vsrgPlayerStore 'fpsChange' event, which the React original emitted from
  // `setState(..., callback)` - after the new props had landed - but this port emitted
  // synchronously, one flush before them, so it re-read the PREVIOUS maxFps. Diffing here
  // cannot get out of step; see VsrgComposerRenderer.update() for the same fix.
  update(state: VsrgPlayerRendererState): void {
    const previous = this.state;
    this.state = state;
    if (previous.maxFps !== state.maxFps) this.throttledEventLoop.changeMaxFps(state.maxFps);
  }

  private draw(): void {
    if (!this.app) return;
    const hasCache = this.cache !== null;
    this.hitObjectsContainer.visible = hasCache;
    if (hasCache) {
      this.drawHitObjects();
    } else {
      for (const child of this.hitObjectsContainer.removeChildren())
        child.destroy({ children: true });
    }
  }

  private drawHitObjects(): void {
    for (const child of this.hitObjectsContainer.removeChildren())
      child.destroy({ children: true });
    const cache = this.cache;
    if (!cache) return;
    const sizes = this.sizes;
    const scale = sizes.scaling;
    const offset = sizes.verticalOffset;
    const halfWidth = sizes.hitObjectSize / 2;
    const timestamp = this.timestamp;
    const renderableHitObjects = this.renderableHitObjects;

    this.hitObjectsContainer.x = 0;
    this.hitObjectsContainer.y = timestamp * scale + sizes.height - offset;

    renderableHitObjects.forEach((renderableHitObject) => {
      const hitObject = renderableHitObject.hitObject;
      const x = hitObject.index * sizes.keyWidth + sizes.keyWidth / 2;
      const y = -(hitObject.timestamp * scale);
      if (
        (renderableHitObject.status === HitObjectStatus.Hit ||
          renderableHitObject.status === HitObjectStatus.Missed) &&
        !hitObject.isHeld
      )
        return;

      let min = hitObject.index;
      let max = min;
      for (const note of renderableHitObjects) {
        if (
          note === renderableHitObject ||
          note.status === HitObjectStatus.Missed ||
          note.status === HitObjectStatus.Hit
        )
          continue;
        if (note.hitObject.timestamp === hitObject.timestamp) {
          if (note.hitObject.index < min) min = note.hitObject.index;
          if (note.hitObject.index > max) max = note.hitObject.index;
        }
      }

      if (min !== max) {
        const line = new Sprite(cache.getLinesCache(renderableHitObject.color));
        line.x = min * sizes.keyWidth + sizes.keyWidth / 2;
        line.width = (max - min) * sizes.keyWidth;
        line.zIndex = -1;
        line.y = y - halfWidth;
        this.hitObjectsContainer.addChild(line);
      }

      if (hitObject.isHeld) {
        const trail = new Sprite(cache.getHeldTrailCache(renderableHitObject.color));
        trail.anchor = PIXI_CENTER_X_END_Y;
        trail.width = cache.textures.sizes.trail;
        trail.height = hitObject.holdDuration * scale;
        trail.x = x;
        trail.y = y - halfWidth;
        this.hitObjectsContainer.addChild(trail);

        const startCap = new Sprite(cache.getHeldHitObjectCache(renderableHitObject.color));
        startCap.anchor = 0.5;
        startCap.angle = 45;
        startCap.x = x;
        startCap.y = y - halfWidth;
        this.hitObjectsContainer.addChild(startCap);

        const endCap = new Sprite(cache.getHeldHitObjectCache(renderableHitObject.color));
        endCap.anchor = PIXI_CENTER_X_END_Y;
        endCap.x = x;
        endCap.y = y - hitObject.holdDuration * scale;
        this.hitObjectsContainer.addChild(endCap);
      } else {
        const sprite = new Sprite(cache.getHitObjectCache(renderableHitObject.color));
        sprite.y = y;
        sprite.anchor = PIXI_CENTER_X_END_Y;
        sprite.x = x;
        this.hitObjectsContainer.addChild(sprite);
      }
    });
  }
}
