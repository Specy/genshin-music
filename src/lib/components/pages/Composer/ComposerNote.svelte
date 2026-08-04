<script module lang="ts">
  import { game } from '$game';
  import type { LayerStatus } from '$core/Songs/Layer';

  // Precomputes a LayerStatus (bit pattern 0-15) -> CSS class string lookup, e.g. layer=5
  // (bits 1+3 set) -> "layer-1 layer-3".
  // QUIRK: the join emits empty tokens, so a layer=0 note's class string carries trailing spaces — reproduced byte-for-byte, do not normalise it. The map covers 0-15 only; LayerStatus also permits 16, which old never produced and this deliberately does not widen to.
  const classNameMap = new Map<LayerStatus, string>(
    new Array(16).fill(0).map((_, i) => {
      const layers = i
        .toString(2)
        .split('')
        .map((x) => parseInt(x))
        .reverse();
      const className = `${game.notes.cssClasses.noteComposer} ${layers.map((x, idx) => (x === 1 ? `layer-${idx + 1}` : '')).join(' ')}`;
      return [i as LayerStatus, className] as const;
    })
  );
</script>

<script lang="ts">
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { InstrumentName } from '$core/types';
  import type { ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { NoteImage } from '$lib/games/types';
  import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte';
  import SvgNote from '$cmp/SvgNote.svelte';

  let {
    data,
    layer,
    instrument,
    clickAction,
    releaseAction,
    longPressAction,
    held = false,
    noteText,
    noteImage,
  }: {
    data: ObservableNote;
    layer: LayerStatus;
    instrument: InstrumentName;
    clickAction: (data: ObservableNote) => void;
    /** Pointer released/left the button — completes the press gesture (short press). */
    releaseAction?: (data: ObservableNote) => void;
    /** Held ~450ms without release — opens the duration popover for this note, anchored to the button element (live element so the popover can follow resizes). */
    longPressAction?: (data: ObservableNote, anchor: HTMLElement) => void;
    /** The current column is covered by this button's note span on the current layer. */
    held?: boolean;
    noteText: string;
    noteImage: NoteImage;
  } = $props();

  const LONG_PRESS_MS = 450;
  let longPressTimeout: ReturnType<typeof setTimeout> | 0 = 0;
  let buttonElement: HTMLButtonElement | undefined = $state();

  function startLongPress() {
    if (!longPressAction) return;
    clearTimeout(longPressTimeout);
    longPressTimeout = setTimeout(() => {
      longPressTimeout = 0;
      if (buttonElement) longPressAction(data, buttonElement);
    }, LONG_PRESS_MS);
  }

  function endPress() {
    clearTimeout(longPressTimeout);
    longPressTimeout = 0;
    releaseAction?.(data);
  }

  let colors = $state({
    note_background: ThemeProvider.get('note_background').desaturate(0.6).toString(),
    isAccentDefault: ThemeProvider.isDefault('accent'),
  });

  $effect(() => {
    const color = ThemeProvider.get('note_background').desaturate(0.6);
    colors = {
      note_background: color.isDark()
        ? color.lighten(0.45).toString()
        : color.darken(0.18).toString(),
      isAccentDefault: ThemeProvider.isDefault('accent'),
    };
  });

  const className = $derived(classNameMap.get(layer) ?? game.notes.cssClasses.noteComposer);
</script>

<button
  bind:this={buttonElement}
  onpointerdown={(e) => {
    preventDefault(e);
    clickAction(data);
    startLongPress();
  }}
  onpointerup={endPress}
  onpointerleave={endPress}
  onpointercancel={endPress}
  class="button-hitbox"
  oncontextmenu={preventDefault}
>
  <div class={className}>
    {#if game.features.hasNoteFrame}
      <GenshinNoteBorder fill={colors.note_background} class="genshin-border" />
    {/if}
    <SvgNote
      name={noteImage}
      color={colors.isAccentDefault ? game.instruments.data[instrument]?.fill : undefined}
      background="var(--note-background)"
    />
    <div class="layer-3-ball-bigger"></div>
    <div class="layer-4-line"></div>
    {#if held}
      <div
        style="position:absolute;bottom:6%;left:20%;right:20%;height:0.25rem;border-radius:0.2rem;background-color:var(--accent);pointer-events:none"
      ></div>
    {/if}
    <div class={game.features.hasNoteFrame ? 'note-name' : 'note-name-sky'}>
      {noteText}
    </div>
  </div>
</button>
