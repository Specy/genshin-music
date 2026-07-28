<script lang="ts">
  import { onMount } from 'svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { ClickType } from '$core/utils/Utilities';
  import type { VsrgSong, VsrgHitObject } from '$core/Songs/VsrgSong';
  import type { RecordedSong } from '$core/Songs/RecordedSong';
  import type { RecordedNote } from '$core/Songs/SongClasses';
  import type { VsrgComposerRenderer } from './VsrgComposerRenderer';

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

  $effect(() => {
    renderer?.update({
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
