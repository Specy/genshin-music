import { afterEach, describe, expect, it, vi } from 'vitest';

const pixi = vi.hoisted(() => {
  interface FakeApplicationOptions {
    autoStart?: boolean;
  }

  class FakeTexture {
    destroy() {}
  }

  class FakeContainer {
    children: FakeContainer[] = [];
    eventMode = 'none';
    interactiveChildren = true;
    hitArea: unknown;
    visible = true;
    x = 0;
    y = 0;
    zIndex = 0;
    alpha = 1;

    addChild<T extends FakeContainer>(child: T): T {
      this.children.push(child);
      return child;
    }

    removeChildren(): FakeContainer[] {
      const children = this.children;
      this.children = [];
      return children;
    }

    on() {
      return this;
    }

    destroy() {}
  }

  class FakeGraphics extends FakeContainer {
    clear() {
      return this;
    }

    rect() {
      return this;
    }

    roundRect() {
      return this;
    }

    circle() {
      return this;
    }

    moveTo() {
      return this;
    }

    lineTo() {
      return this;
    }

    fill() {
      return this;
    }

    stroke() {
      return this;
    }
  }

  class FakeSprite extends FakeContainer {
    readonly anchor = { set: vi.fn() };

    constructor(_texture: FakeTexture) {
      super();
    }
  }

  class FakeRectangle {
    constructor(_x: number, _y: number, _width: number, _height: number) {}
  }

  const applications: FakeApplication[] = [];

  class FakeApplication {
    readonly render = vi.fn();
    readonly canvas = document.createElement('canvas');
    readonly stage = new FakeContainer();
    readonly renderer = {
      background: { color: 0 },
      resize: vi.fn(),
      generateTexture: vi.fn(() => new FakeTexture()),
    };
    initOptions: FakeApplicationOptions | undefined;
    private ticker: ReturnType<typeof setInterval> | undefined;

    constructor() {
      applications.push(this);
    }

    async init(options: FakeApplicationOptions) {
      this.initOptions = options;
      if (options.autoStart !== false) {
        this.ticker = setInterval(this.render, 1);
      }
    }

    destroy() {
      if (this.ticker !== undefined) clearInterval(this.ticker);
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
  };
});

vi.mock('pixi.js', () => pixi);

import { ComposerSettings } from '$core/BaseSettings';
import { ComposedSong } from '$core/Songs/ComposedSong';
import { ComposerRenderer, type ComposerRendererState } from '$cmp/pages/Composer/ComposerRenderer';

afterEach(() => {
  vi.useRealTimers();
  pixi.applications.length = 0;
  document.body.replaceChildren();
});

describe('ComposerRenderer rendering', () => {
  it('repaints both static scenes only when update invalidates them', async () => {
    vi.useFakeTimers();
    const song = new ComposedSong('Composer render loop');
    const initialState = {
      columns: song.columns,
      isPlaying: false,
      isRecordingAudio: false,
      song,
      selected: 0,
      currentLayer: 0,
      settings: ComposerSettings.data,
      breakpoints: song.breakpoints,
      selectedColumns: [],
    } satisfies ComposerRendererState;
    const renderer = new ComposerRenderer(
      document.createElement('div'),
      document.createElement('div'),
      initialState,
      {
        selectColumn: () => {},
        toggleBreakpoint: () => {},
        onGeometryChange: () => {},
      }
    );

    await renderer.init();
    renderer.update(initialState);

    expect(pixi.applications).toHaveLength(2);
    const initialRenderCounts = pixi.applications.map(
      (application) => application.render.mock.calls.length
    );

    vi.advanceTimersByTime(32);
    expect(pixi.applications.map((application) => application.render.mock.calls.length)).toEqual(
      initialRenderCounts
    );
    expect(initialRenderCounts).toEqual([1, 1]);
    expect(pixi.applications.map((application) => application.initOptions?.autoStart)).toEqual([
      false,
      false,
    ]);

    renderer.update({ ...initialState, selected: 1 });
    expect(pixi.applications.map((application) => application.render.mock.calls.length)).toEqual([2, 2]);

    renderer.destroy();
  });
});
