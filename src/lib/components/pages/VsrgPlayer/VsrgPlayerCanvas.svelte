<script lang="ts">
  import { onMount } from 'svelte';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import type { VsrgHitObject } from '$core/Songs/VsrgSong.svelte';
  import type { VsrgPlayerRenderer, VsrgPlayerCanvasSizes } from './VsrgPlayerRenderer';
  import type { VsrgKeyboardLayout } from './VsrgPlayerKeyboard.svelte';
  import VsrgPlayerCountDown from './VsrgPlayerCountDown.svelte';

  // This file owns the wrapper DOM element, the renderer's lifecycle (construct/feed/destroy),
  // and the DOM-only VsrgPlayerCountDown sibling; VsrgPlayerRenderer owns the pixi objects.
  //
  // VsrgPlayerRenderer (and therefore pixi.js) must never be a static import here - only
  // `import type` (erased at compile time) for typing `renderer`, plus the dynamic
  // `await import(...)` inside onMount below, which never runs during prerender. A static
  // import would pull pixi.js into the prerendered bundle and break it.
  //
  // backgroundLayer10 below independently recomputes the identical formula VsrgPlayerRenderer.ts's
  // own handleThemeChange uses for its own pixi-side background - duplicated deliberately
  // (ThemeProvider is a global singleton either side can read directly) since nothing inside the
  // pixi scene needs this DOM div's background color, and vice versa.
  interface VsrgPlayerCanvasProps {
    isPlaying: boolean;
    scrollSpeed: number;
    keyboardLayout: VsrgKeyboardLayout;
    maxFps: number;
    onSizeChange: (sizes: VsrgPlayerCanvasSizes) => void;
    onTick: (timestamp: number) => void;
    playHitObject: (hitObject: VsrgHitObject, instrumentIndex: number) => void;
  }

  let {
    isPlaying,
    scrollSpeed,
    keyboardLayout,
    maxFps,
    onSizeChange,
    onTick,
    playHitObject,
  }: VsrgPlayerCanvasProps = $props();

  let wrapperEl: HTMLDivElement | undefined;
  let renderer: VsrgPlayerRenderer | null = $state(null);
  let timestamp = $state(0);

  const backgroundLayer10 = $derived(ThemeProvider.layer('background', 0.18, 0.06).hex());
  const countdownTime = $derived(
    timestamp + scrollSpeed < 0
      ? Math.abs(Math.ceil(((timestamp + scrollSpeed) / 1000) * 2)) + 1
      : null
  );

  onMount(() => {
    let cancelled = false;
    void (async () => {
      const { VsrgPlayerRenderer: VsrgPlayerRendererClass } = await import('./VsrgPlayerRenderer');
      if (cancelled || !wrapperEl) return;
      const instance = new VsrgPlayerRendererClass(
        wrapperEl,
        {
          isPlaying,
          scrollSpeed,
          keyboardLayout,
          maxFps,
        },
        {
          onSizeChange,
          onTick,
          playHitObject,
          onTimestampChange: (t) => (timestamp = t),
        }
      );
      await instance.init();
      if (cancelled) {
        instance.destroy();
        return;
      }
      renderer = instance;
    })();
    return () => {
      cancelled = true;
      renderer?.destroy();
      renderer = null;
    };
  });

  $effect(() => {
    renderer?.update({ isPlaying, scrollSpeed, keyboardLayout, maxFps });
  });
</script>

<div
  class="vsrg-player-canvas box-shadow"
  style="background-color:{backgroundLayer10}"
  bind:this={wrapperEl}
>
  {#if countdownTime !== null}
    <VsrgPlayerCountDown time={countdownTime} />
  {/if}
</div>

<style>
  /* QUIRK: :global(canvas) below is REQUIRED, not a scoping violation to "fix". The actual
       <canvas> element is appended programmatically by VsrgPlayerRenderer.ts, not written in this
       file's own template, so it carries no Svelte scoping hash. :global() is what lets this
       selector reach an element outside this component's own markup - removing it would silently
       stop matching the canvas. */
  .vsrg-player-canvas {
    position: absolute;
    bottom: 0;
    width: 50vw;
    /* height: 190vh; magic number */
    height: 100vh;
    max-width: 35rem;
    background-color: var(--background-darken-10);
    border-left: solid 2px var(--secondary);
    border-right: solid 2px var(--secondary);
    /* transform-origin: bottom;
        transform: rotateX(35deg); */
    display: flex;
  }

  .vsrg-player-canvas :global(canvas) {
    position: absolute;
    border-radius: 0.6rem;
  }
</style>
