<script lang="ts">
  import { onMount } from 'svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { ClickType } from '$core/utils/Utilities';
  import type { VsrgSong, VsrgHitObject } from '$core/Songs/VsrgSong.svelte';
  import type { RecordedSong } from '$core/Songs/RecordedSong';
  import type { RecordedNote } from '$core/Songs/SongClasses';
  import type { VsrgComposerRenderer } from './VsrgComposerRenderer';
  import { captureVsrgSongState } from './vsrgSongRenderState';

  // This file owns the wrapper DOM element and the renderer's lifecycle (construct/feed/destroy)
  // plus native wheel/pointer bindings; VsrgComposerRenderer owns the pixi objects.
  //
  // VsrgComposerRenderer (and therefore pixi.js) must never be a static import here - only
  // `import type` (erased at compile time) for typing `renderer`, plus the dynamic
  // `await import(...)` inside onMount below, which never runs during prerender. A static
  // import would pull pixi.js into the prerendered bundle and break it.
  interface VsrgComposerCanvasProps {
    vsrg: VsrgSong;
    isHorizontal: boolean;
    isPlaying: boolean;
    snapPoint: number;
    scrollSnap: boolean;
    snapPoints: number[];
    selectedHitObject: VsrgHitObject | null;
    audioSong: RecordedSong | null;
    scaling: number;
    maxFps: number;
    renderableNotes: RecordedNote[];
    tempoChanger: number;
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

  let {
    vsrg,
    isHorizontal,
    isPlaying,
    snapPoint,
    scrollSnap,
    snapPoints,
    selectedHitObject,
    audioSong,
    scaling,
    maxFps,
    renderableNotes,
    tempoChanger,
    onKeyDown,
    onKeyUp,
    onAddTime,
    onRemoveTime,
    onTimestampChange,
    onSnapPointSelect,
    dragHitObject,
    releaseHitObject,
    selectHitObject,
  }: VsrgComposerCanvasProps = $props();

  let wrapperEl: HTMLDivElement | undefined;
  let renderer: VsrgComposerRenderer | null = $state(null);

  onMount(() => {
    let cancelled = false;
    void (async () => {
      const { VsrgComposerRenderer: VsrgComposerRendererClass } =
        await import('./VsrgComposerRenderer');
      if (cancelled || !wrapperEl) return;
      const instance = new VsrgComposerRendererClass(
        wrapperEl,
        {
          ...captureVsrgSongState(vsrg),
          isHorizontal,
          isPlaying,
          snapPoint,
          scrollSnap,
          snapPoints,
          selectedHitObject,
          audioSong,
          scaling,
          maxFps,
          renderableNotes,
          tempoChanger,
        },
        {
          onKeyDown,
          onKeyUp,
          onAddTime,
          onRemoveTime,
          onTimestampChange,
          onSnapPointSelect,
          dragHitObject,
          releaseHitObject,
          selectHitObject,
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

  /**
   * The whole reactive contract of this component (2026-08-06 reactive-model plan, phase 2).
   *
   * It used to hand the VsrgSong INSTANCE to the renderer and read nothing off it - which worked
   * only because the page reassigned the `vsrg` prop after every edit (`vsrg = vsrg.clone()`). With
   * one stable instance that reference never changes, so this effect would re-run only when some
   * OTHER prop happened to change: adding a track, deleting a track, recolouring one, editing a hold
   * tail or moving a hit object would simply stop repainting the canvas, with nothing failing
   * anywhere.
   *
   * captureVsrgSongState's reads are what subscribe this effect to the song (see
   * ./vsrgSongRenderState.ts for what it takes and why). `vsrg.tracks` and `vsrg.structureVersion`
   * both read the structure signal, so any hit-object edit re-runs this; the scalars carry their
   * own.
   *
   * A value taken off the SONG belongs in captureVsrgSongState, not written straight into the
   * object literal below next to this component's own props. Subscribing works either way, so this
   * is about where the rule can be checked: test/vsrgComposerRenderer.test.ts holds the capture's
   * result to "a moment, not a view onto the song", and a song field spliced in here is outside
   * what that check can see.
   *
   * Do not route one of those values through an object-valued `$derived` on the way: Svelte
   * skips downstream updates when a derived's recomputed value is referentially identical to the
   * previous one, and `tracks` is object-valued with an identity that does not move within a song,
   * which is the value such a derived would swallow. (`breakpoints` is replaced on change and
   * `trackColors` is rebuilt on every call, so those would survive the round trip; the rule is
   * simplest applied to all of them.)
   */
  $effect(() => {
    //captured BEFORE the optional-chained update(), on purpose: the song's signals must be read on
    //every run, including the runs where `renderer` is still null (the pixi Application is loaded
    //asynchronously). A read inside the argument list of a call that never happens registers no
    //dependency.
    const song = captureVsrgSongState(vsrg);
    renderer?.update({
      ...song,
      isHorizontal,
      isPlaying,
      snapPoint,
      scrollSnap,
      snapPoints,
      selectedHitObject,
      audioSong,
      scaling,
      maxFps,
      renderableNotes,
      tempoChanger,
    });
  });
</script>

<!-- Pointer-only interactions by design, no ARIA role/keyboard handling - not adding new a11y
     behavior this control never had. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="vsrg-top-canvas-wrapper"
  bind:this={wrapperEl}
  onwheel={(e) => renderer?.handleWheel(e)}
  onpointerdown={(e) => renderer?.setIsDragging(e)}
  onpointerup={() => renderer?.setIsNotDragging()}
  onpointerleave={() => renderer?.setIsNotDragging()}
  onpointermove={(e) => renderer?.handleDrag(e)}
  oncontextmenu={preventDefault}
></div>

<style>
  .vsrg-top-canvas-wrapper {
    display: flex;
    flex: 1;
    justify-content: center;
    position: relative;
    cursor: pointer;
  }

  /* :global(canvas) because pixi creates the <canvas> and appends it into this wrapper at runtime
     (VsrgComposerRenderer's `this.container.appendChild(this.app.canvas)`) - it is never in this
     component's markup, so Svelte would otherwise prune the selector. */
  .vsrg-top-canvas-wrapper :global(canvas) {
    position: absolute;
    opacity: 0.9;
    /* border-radius: 0.6rem; */
  }
</style>
