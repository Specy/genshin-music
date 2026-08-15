<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '$i18n/binding.svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { colorToRGB } from '$core/utils/Utilities';
  import { createShortcutListener } from '$stores/KeybindsStore.svelte';
  import type { InstrumentData, NoteColumn } from '$core/Songs/SongClasses';
  import type { ComposerSettingsDataType } from '$core/BaseSettings';
  import type { ComposerRenderer } from './ComposerRenderer';
  import { composerCanvasCssSize } from './composerCanvasGeometry';
  import TimelineButton from './TimelineButton.svelte';

  // The class names below (canvas-wrapper, canvas-relative, canvas-buttons, timeline-controls,
  // timeline-button) are styled from App.css, not a local <style> block - renaming or restructuring
  // these divs breaks that styling silently.
  //
  // ComposerRenderer (and therefore pixi.js) is never statically imported here - only `import
  // type` (erased at compile time) for typing `renderer`, plus the real
  // `await import('./ComposerRenderer')` inside onMount, which never runs during prerender.
  // Making this a static import would pull pixi.js into the prerendered/SSR build.
  // composerCanvasGeometry, by contrast, IS a static import and must stay pixi-free for that reason:
  // its whole job is to give this template the canvas' size before the renderer exists.
  interface ComposerCanvasProps {
    columns: NoteColumn[];
    // ComposedSong's graph version. Its own prop for the same reason `instruments` is: the renderer
    // DIFFS it, and `columns` cannot serve on its own - the mutators that edit the array in place
    // leave its identity alone, so an identity comparison does not see those edits. (The renderer
    // compares both; the identity in needsUnconditionalRepaint, the version in update().)) Reading it here is also what
    // subscribes this component to the graph.
    structureVersion: number;
    isPlaying: boolean;
    /** performance.now()-domain start of the selected sounding playback column. */
    playbackColumnStartMs: number;
    /** Bumped for play/manual re-anchors; stable across ordinary transport advances. */
    playbackAnchorGeneration: number;
    isRecordingAudio: boolean;
    // The roster is its own prop, not reached through a `song` prop - see ComposerRendererState's
    // note. The $effect below has to READ it for an instrument edit to repaint the canvas.
    instruments: InstrumentData[];
    selected: number;
    currentLayer: number;
    inPreview?: boolean;
    settings: ComposerSettingsDataType;
    breakpoints: number[];
    selectedColumns: number[];
    selectColumn: (index: number, ignoreAudio?: boolean, forceAnchor?: boolean) => void;
    toggleBreakpoint: () => void;
  }

  let {
    columns,
    structureVersion,
    isPlaying,
    playbackColumnStartMs,
    playbackAnchorGeneration,
    isRecordingAudio,
    instruments,
    selected,
    currentLayer,
    inPreview,
    settings,
    breakpoints,
    selectedColumns,
    selectColumn,
    toggleBreakpoint,
  }: ComposerCanvasProps = $props();

  let canvasContainerEl: HTMLDivElement | undefined;
  let renderer: ComposerRenderer | null = $state(null);

  // Everything here comes from the renderer's onGeometryChange callback, not $derived: they're
  // pixi/DOM-measurement values this template cannot compute on its own. The three timeline
  // buttons are absolutely positioned over the mini-timeline the ONE canvas now draws at its
  // bottom, so where that strip starts (height + timelinePadding) and how tall it is are part of
  // the same report - previously `timelineHeight` was a second copy of the renderer's
  // `isMobile() ? 25 : 30` here, which could disagree with it silently.
  let width = $state(0);
  let height = $state(0);
  let timelinePadding = $state(0);
  let timelineHeight = $state(0);
  let hasCache = $state(false);

  const isBreakpointSelected = $derived(breakpoints.includes(selected));
  // Mirrors ComposerRenderer's own theme formulas - see that file's header for why this is
  // duplicated rather than shared.
  const sideButtonsRgb = $derived(colorToRGB(ThemeProvider.get('primary').darken(0.08)).join(','));
  const backgroundHex = $derived(ThemeProvider.get('primary').hexa());
  // THE THREE TIMELINE BUTTONS' BACKGROUND, and it is `.hex()` rather than App.css's
  // `var(--primary-layer-10)` for one reason: `.hex()` DROPS the theme's alpha where ThemeVars
  // emits that property through `.toString()`, which keeps it. The two shipped translucent themes
  // ("Sky Music" rgba(23,23,23,0.72), "Eons of times" #453427d9) would otherwise give the buttons
  // an alpha they never had - and unlike the canvas behind them, a DOM background composites
  // straight onto the page, so a composer background image would show through the icons. This is
  // verbatim what these buttons carried before the two canvases were merged, and it is the same
  // alpha-stripped colour ComposerRenderer fills the strip with (`.rgb().rgbNumber()`).
  // test/composerCanvasCss.test.ts reads this expression out of this file.
  const timelineHex = $derived(ThemeProvider.layer('primary', 0.1).hex());
  // THE CANVAS' SIZE AS CSS, so `.canvas-wrapper` is already the right size while the dynamic pixi
  // import and Application.init() are still running - see composerCanvasCssSize for the whole
  // rationale and for what it does and does not reproduce. Null in preview, and a null style
  // directive REMOVES the property, so App.css's `var(..., 0px)` fallback takes over there.
  const cssSize = $derived(composerCanvasCssSize({ inPreview: Boolean(inPreview) }));

  onMount(() => {
    let cancelled = false;
    let disposeShortcuts: (() => void) | null = null;
    void (async () => {
      const { ComposerRenderer: ComposerRendererClass } = await import('./ComposerRenderer');
      if (cancelled || !canvasContainerEl) return;
      const instance = new ComposerRendererClass(
        canvasContainerEl,
        {
          columns,
          structureVersion,
          isPlaying,
          playbackColumnStartMs,
          playbackAnchorGeneration,
          isRecordingAudio,
          instruments,
          selected,
          currentLayer,
          inPreview,
          beatMarks: Number(settings.beatMarks.value),
          columnsPerCanvas: Number(settings.columnsPerCanvas.value),
          breakpoints,
          selectedColumns,
          bpm: Number(settings.bpm.value),
          smoothScroll: Boolean(settings.smoothScroll.value),
        },
        {
          selectColumn,
          toggleBreakpoint,
          onGeometryChange: (geometry) => {
            width = geometry.width;
            height = geometry.height;
            timelinePadding = geometry.timelinePadding;
            timelineHeight = geometry.timelineHeight;
            hasCache = geometry.hasCache;
          },
        }
      );
      await instance.init();
      if (cancelled) {
        instance.destroy();
        return;
      }
      renderer = instance;
      disposeShortcuts = createShortcutListener('composer', 'composer_canvas', ({ shortcut }) => {
        const { name } = shortcut;
        if (name === 'next_breakpoint') renderer?.handleBreakpoints(1);
        if (name === 'previous_breakpoint') renderer?.handleBreakpoints(-1);
      });
    })();
    return () => {
      cancelled = true;
      disposeShortcuts?.();
      renderer?.destroy();
      renderer = null;
    };
  });

  // THE PROPS CHANNEL. Reactive values are read for the renderer HERE, in the object below, rather
  // than deeper inside it - that read is what subscribes this effect to them, and the paragraph
  // after next is what goes wrong when one is read deeper instead. Theme is the renderer's other
  // channel: it subscribes to ThemeProvider directly (see its file header), and that subscription,
  // not this effect, is what repaints the canvas on a theme edit.
  //
  // Values also cross between this component and the renderer outside this effect - the same object
  // shape is handed to the constructor once in onMount, and selectColumn/toggleBreakpoint/
  // onGeometryChange/handleBreakpoints carry values in both directions. Those are calls rather than
  // reactive reads, so keeping them current is not this effect's job.
  //
  // update() is free to skip work - it diffs its input and takes a fast path, or none at all, when
  // little or nothing moved - and Svelte re-collects an effect's dependencies on every run, so a
  // value first read inside renderer.update() would be dropped from this effect's dependency set by
  // the first run that skipped it. `settings.beatMarks.value` was exactly that: it reached the draw
  // path only through `state.settings`, whose identity never changes on a settings edit, so a
  // skipping update() would have frozen the bar shading at the previous grouping with nothing to
  // notice it. It is a scalar on the state object now; the same rule applies to anything added
  // later. (ThemeProvider's `accent` was the same shape of problem on the theme channel, and moved
  // out of the draw path for the same reason - see ComposerRendererTheme.tailAccent.)
  //
  // `renderer?.update({...})` short-circuits the ARGUMENT while renderer is still null (before the
  // dynamic pixi import resolves), so on those runs the object is not built at all and this effect
  // registers `renderer` alone. It self-heals - assigning renderer re-runs this, and that run does
  // read every field - but it is why the diffing lives inside update() rather than as an early
  // return here. VsrgComposerCanvas.svelte hit the same edge and captures its song reads BEFORE
  // the call.
  $effect(() => {
    renderer?.update({
      columns,
      structureVersion,
      isPlaying,
      playbackColumnStartMs,
      playbackAnchorGeneration,
      isRecordingAudio,
      instruments,
      selected,
      currentLayer,
      inPreview,
      beatMarks: Number(settings.beatMarks.value),
      columnsPerCanvas: Number(settings.columnsPerCanvas.value),
      breakpoints,
      selectedColumns,
      bpm: Number(settings.bpm.value),
      smoothScroll: Boolean(settings.smoothScroll.value),
    });
  });
</script>

{#snippet chevronLeftIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M34.52 239.03L228.87 44.69c9.37-9.37 24.57-9.37 33.94 0l22.67 22.67c9.36 9.36 9.37 24.52.04 33.9L131.49 256l154.02 154.75c9.34 9.38 9.32 24.54-.04 33.9l-22.67 22.67c-9.37 9.37-24.57 9.37-33.94 0L34.52 272.97c-9.37-9.37-9.37-24.57 0-33.94z"
    /></svg
  >
{/snippet}

{#snippet chevronRightIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 320 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M285.476 272.971L91.132 467.314c-9.373 9.373-24.569 9.373-33.941 0l-22.667-22.667c-9.357-9.357-9.375-24.522-.04-33.901L188.505 256 34.484 101.255c-9.335-9.379-9.317-24.544.04-33.901l22.667-22.667c9.373-9.373 24.569-9.373 33.941 0L285.475 239.03c9.373 9.372 9.373 24.568.001 33.941z"
    /></svg
  >
{/snippet}

{#snippet faStepBackwardIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M64 468V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12v176.4l195.5-181C352.1 22.3 384 36.6 384 64v384c0 27.4-31.9 41.7-52.5 24.6L136 292.7V468c0 6.6-5.4 12-12 12H76c-6.6 0-12-5.4-12-12z"
    /></svg
  >
{/snippet}

{#snippet faStepForwardIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 448 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M384 44v424c0 6.6-5.4 12-12 12h-48c-6.6 0-12-5.4-12-12V291.6l-195.5 181C95.9 489.7 64 475.4 64 448V64c0-27.4 31.9-41.7 52.5-24.6L312 219.3V44c0-6.6 5.4-12 12-12h48c6.6 0 12 5.4 12 12z"
    /></svg
  >
{/snippet}

{#snippet faMinusCircleIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zM124 296c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h264c6.6 0 12 5.4 12 12v56c0 6.6-5.4 12-12 12H124z"
    /></svg
  >
{/snippet}

{#snippet faPlusCircleIcon()}
  <svg
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 512 512"
    height="16"
    width="16"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M256 8C119 8 8 119 8 256s111 248 248 248 248-111 248-248S393 8 256 8zm144 276c0 6.6-5.4 12-12 12h-92v92c0 6.6-5.4 12-12 12h-56c-6.6 0-12-5.4-12-12v-92h-92c-6.6 0-12-5.4-12-12v-56c0-6.6 5.4-12 12-12h92v-92c0-6.6 5.4-12 12-12h56c6.6 0 12 5.4 12 12v92h92c6.6 0 12 5.4 12 12v56z"
    /></svg
  >
{/snippet}

<div
  class={['canvas-wrapper', inPreview && 'canvas-wrapper-in-preview']}
  style="width:{width}px;background-color:{hasCache ? 'unset' : backgroundHex}"
  style:--composer-canvas-width={cssSize?.width}
  style:--composer-canvas-height={cssSize?.height}
>
  <div class="canvas-relative" bind:this={canvasContainerEl}>
    <!--
      `height` is the NOTES region, and the inline height is what holds these chevrons to it:
      `.canvas-buttons`' own `height: 100%` is 100% of `.canvas-relative`, which since the merge
      holds the mini-timeline strip as well, so it would run them down over the strip.

      Gated on the first geometry report for the same reason the timeline controls below are: that
      report only exists once the dynamic pixi import and Application.init() have resolved, and a
      0px-tall button leaves its 2rem chevron overflowing above the top of the canvas for the whole
      of that window.
    -->
    {#if !settings.useKeyboardSideButtons.value && height > 0}
      <button
        onpointerdown={() => selectColumn(selected - 1)}
        class={['canvas-buttons', !isPlaying && 'canvas-buttons-visible']}
        style="height:{height}px;left:0;padding-right:0.5rem;justify-content:flex-start;background:linear-gradient(90deg, rgba({sideButtonsRgb},0.80) 30%, rgba({sideButtonsRgb},0.30) 80%, rgba({sideButtonsRgb},0) 100%)"
      >
        {@render chevronLeftIcon()}
      </button>
      <button
        onpointerdown={() => selectColumn(selected + 1)}
        class={['canvas-buttons', !isPlaying && 'canvas-buttons-visible']}
        style="height:{height}px;right:0;padding-left:0.5rem;justify-content:flex-end;background:linear-gradient(270deg, rgba({sideButtonsRgb},0.80) 30%, rgba({sideButtonsRgb},0.30) 80%, rgba({sideButtonsRgb},0) 100%)"
      >
        {@render chevronRightIcon()}
      </button>
    {/if}
  </div>
  <!--
    The three timeline controls, floated over the mini-timeline the canvas above now draws for
    itself.

    A FLEX ROW OF THREE, each 2.2rem wide with 0.2rem HORIZONTAL margins and no shrink, the last
    pushed right by an auto margin. That leaves them standing on [0, 80px] and [W-41.6px, W] at every
    viewport width, and the canvas draws its strip between those two bounds rather than underneath
    them - see composerCanvasGeometry's TIMELINE_INSET_LEFT/RIGHT, which is the same arithmetic on
    the pixi side, and test/composerCanvasCss.test.ts, which keeps the two statements together.

    THOSE ARE FOOTPRINTS AND NOT MARGIN BOXES, and the difference is only in how it is derived: an
    auto margin absorbs the row's whole free space, so the third button's margin box is [80, W] and
    its BORDER box is [W-38.4, W-3.2]. The 41.6px it is held clear by is 0.2rem of clearance before
    it, the 2.2rem button, and its own trailing 0.2rem margin.

    Pinned to the CANVAS box - `top` at the reported notes height (timelinePadding is now zero),
    `width` from the reported canvas width - and not to the wrapper. On a tall viewport `.canvas-wrapper`'s
    min-height gives `.canvas-relative` a sliver of slack under the canvas, so anchoring vertically
    to the wrapper would put the row below the strip. Horizontally it is a DELIBERATE divergence:
    below a ~643px viewport `.canvas-wrapper`'s `min-width: 78vw` makes the wrapper wider than the
    canvas - by 16px at a 400px viewport, more below that - and the old band ran the wrapper's full
    width, so the add/remove-breakpoint button used to hang ~13px past the canvas' right edge over
    band that no longer exists: only the canvas draws the strip now. Held to the canvas, that button
    sits that same ~16px further left than it did at those widths. That same `78vw` floor is why
    App.css maxes the placeholder against it rather than replacing it. From ~643px up, and in
    preview at any width, the wrapper and the canvas are the same box.

    OUTSIDE `.canvas-relative`, which is `overflow: hidden` and would clip the tooltips these
    buttons render BELOW themselves.

    Not rendered until that first geometry report exists: `top`, `width` and `height` come from a
    measurement that only happens once `await import('./ComposerRenderer')` and `Application.init()`
    have resolved, and a `top: 0; width: 0` row stacks three 16px icons over the TOP-LEFT CORNER of
    the composer, over the first note rows, for the whole of that window. (They stay inside it: with
    a zero width the free space is negative, so the third button's `margin-left: auto` resolves to 0
    and the three pack from x=0 and overflow to the right.)
  -->
  {#if width > 0}
    <div
      class="timeline-controls"
      style="top:{height + timelinePadding}px;width:{width}px;height:{timelineHeight}px"
    >
      <TimelineButton
        onclick={() => renderer?.handleBreakpoints(-1)}
        tooltip={t('composer:previous_breakpoint')}
        style="background-color:{timelineHex}"
        ariaLabel={t('composer:previous_breakpoint')}
      >
        {@render faStepBackwardIcon()}
      </TimelineButton>
      <TimelineButton
        onclick={() => renderer?.handleBreakpoints(1)}
        tooltip={t('composer:next_breakpoint')}
        style="margin-left:0;background-color:{timelineHex}"
        ariaLabel={t('composer:next_breakpoint')}
      >
        {@render faStepForwardIcon()}
      </TimelineButton>

      <!-- the auto margin that puts this one against the row's right edge, which is what makes the
           gap between it and the two above exactly the strip's span - see the comment above -->
      <TimelineButton
        onclick={toggleBreakpoint}
        style="margin-left:auto;background-color:{timelineHex}"
        tooltip={isBreakpointSelected
          ? t('composer:remove_breakpoint')
          : t('composer:add_breakpoint')}
        ariaLabel={isBreakpointSelected
          ? t('composer:remove_breakpoint')
          : t('composer:add_breakpoint')}
      >
        {@render (isBreakpointSelected ? faMinusCircleIcon : faPlusCircleIcon)()}
      </TimelineButton>
    </div>
  {/if}
</div>
