# Composer On-Demand Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the standard composer's two Pixi applications from repainting unchanged scenes on
every animation frame while preserving one repaint for every real composer invalidation.

**Architecture:** Keep `ComposerRenderer` as the imperative rendering boundary. Disable each
Pixi application's automatic ticker and explicitly render both stages at the end of the existing
`draw()` invalidation path.

**Tech Stack:** Svelte 5, TypeScript, PixiJS 8.19, Vitest, jsdom

## Global Constraints

- Change only the standard composer rendering path; do not alter VSRG composer or player renderers.
- Do not start or schedule a replacement ticker or animation frame.
- Preserve every existing state invalidation, pointer interaction, playback step, cache rebuild,
  resize, and theme update.
- Each completed `draw()` must invoke exactly one notes render and one timeline render.
- Do not add `any`, type assertions, non-null assertions, or TypeScript suppression directives.
- Do not extract a production helper used only once; keep the render calls inline in `draw()`.
- Preserve LF line endings and stage only explicit paths.

---

### Task 1: Make composer rendering invalidation-driven

**Files:**

- Create: `test/composerRenderLoop.test.ts`
- Modify: `src/lib/components/pages/Composer/ComposerRenderer.ts`

**Interfaces:**

- Consumes: `ComposerRenderer.update(state: ComposerRendererState): void`
- Produces: two Pixi applications initialized with `{ autoStart: false }`, with
  `ComposerRenderer.draw()` repainting each application once after rebuilding both scenes

- [ ] **Step 1: Write the failing behavioral test**

Mock `pixi.js` with minimal `Application`, `Container`, `Graphics`, and `Sprite` fakes. The fake
`Application.init()` must start a one-millisecond interval that calls its `render` spy unless
`options.autoStart === false`, reproducing Pixi's real default:

```ts
interface FakeApplicationOptions {
  autoStart?: boolean;
}

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
```

Create a real `ComposedSong`, default composer settings, and an object using
`satisfies ComposerRendererState`. Initialize the renderer, call `update(initialState)`, advance
fake time by 32 ms, then call `update({...initialState, selected: 1})`.

Assert:

```ts
expect(applications).toHaveLength(2);
expect(applications.map((application) => application.initOptions?.autoStart)).toEqual([
  false,
  false,
]);
expect(applications.map((application) => application.render.mock.calls.length)).toEqual([1, 1]);

vi.advanceTimersByTime(32);
expect(applications.map((application) => application.render.mock.calls.length)).toEqual([1, 1]);

renderer.update({ ...initialState, selected: 1 });
expect(applications.map((application) => application.render.mock.calls.length)).toEqual([2, 2]);
```

Destroy the renderer before the 50 ms cache-regeneration timer fires, and restore real timers in
`afterEach`.

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```powershell
npx cross-env PUBLIC_GAME=genshin vitest run test/composerRenderLoop.test.ts
```

Expected: failure because both application init options currently omit `autoStart` and the fake
tickers add render calls while time advances.

- [ ] **Step 3: Implement the minimal production fix**

In both `Application.init()` option objects in `ComposerRenderer.init()`, add:

```ts
autoStart: false,
```

At the end of `draw()`, immediately after both stage rebuild calls, add:

```ts
this.notesApp.render();
this.timelineApp.render();
```

Update the nearby lifecycle comments so they state that `draw()` rebuilds and explicitly repaints
the static scenes. Do not add a helper, ticker, dirty flag, or frame scheduler.

- [ ] **Step 4: Run the focused test and verify green**

Run:

```powershell
npx cross-env PUBLIC_GAME=genshin vitest run test/composerRenderLoop.test.ts
```

Expected: one passing test with no warnings.

- [ ] **Step 5: Verify real composer behavior**

Run the Genshin development server and verify:

- the notes canvas and timeline paint after initial cache generation;
- clicking, wheel selection, dragging, breakpoint changes, note edits, and layer changes repaint;
- playback advances the selected column at musical timing;
- theme changes and viewport resizing repaint correctly;
- after interactions stop, no application ticker remains active.

- [ ] **Step 6: Run project gates**

Run:

```powershell
npm test
npm run check
npm run check:sky
npm run lint
npm run build:genshin
```

Expected: both game suites pass, both checks report zero errors and warnings, lint exits zero, and
the production build completes.

- [ ] **Step 7: Commit explicit paths**

```powershell
git add -- test/composerRenderLoop.test.ts src/lib/components/pages/Composer/ComposerRenderer.ts
git commit -m "fix: render composer canvases only on updates"
```
