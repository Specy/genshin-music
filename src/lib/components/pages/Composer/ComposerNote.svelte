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
  import { suppressNativeTouch } from '$cmp/suppressNativeTouch';
  //THE ONE LONG-PRESS TIMING, shared with the Pro View's canvas, which opens the same popover from
  //the same hold (spec §12: no new thresholds) - see composerInput.
  import { COMPOSER_LONG_PRESS_MS } from './composerInput';

  let {
    data,
    layer,
    instrument,
    clickAction,
    releaseAction,
    longPressAction,
    dragAction,
    held = false,
    noteText,
    noteImage,
  }: {
    data: ObservableNote;
    layer: LayerStatus;
    instrument: InstrumentName;
    /** Pointer pressed the button. The pointerId identifies the FINGER, which is what a held note is owned by. */
    clickAction: (data: ObservableNote, pointerId: number) => void;
    /** Pointer released/left the button — completes the press gesture (short press). */
    releaseAction?: (data: ObservableNote, pointerId: number) => void;
    /** Held ~450ms without release — opens the duration popover for this note, anchored to the button element (live element so the popover can follow resizes). */
    longPressAction?: (data: ObservableNote, anchor: HTMLElement) => void;
    /** Pointer moved while the long press is still held — signed horizontal travel in px from where the press began. */
    dragAction?: (data: ObservableNote, deltaX: number) => void;
    /** The current column is covered by this button's note span on the current layer. */
    held?: boolean;
    noteText: string;
    noteImage: NoteImage;
  } = $props();

  let longPressTimeout: ReturnType<typeof setTimeout> | 0 = 0;
  let buttonElement: HTMLButtonElement | undefined = $state();
  //where the still-unreleased press began, and whether it has already turned into a long
  //press — together they are what makes the moves below a duration drag rather than drift
  let pressOriginX = 0;
  let longPressFired = false;
  /** The pointer currently pressing this button, if any — the gesture's owner (see endPress). */
  let activePointerId: number | null = null;

  function startLongPress() {
    if (!longPressAction) return;
    clearTimeout(longPressTimeout);
    longPressTimeout = setTimeout(() => {
      longPressTimeout = 0;
      if (!buttonElement) return;
      longPressFired = true;
      longPressAction(data, buttonElement);
    }, COMPOSER_LONG_PRESS_MS);
  }

  function endPress(pointerId: number) {
    //Only the pointer that pressed may end the press. pointerleave fires for pointers that
    //never pressed at all (a mouse merely crossing the button while a finger or a key holds
    //this note), and that stray release used to cut the real holder's sound.
    if (activePointerId !== pointerId) return;
    activePointerId = null;
    clearTimeout(longPressTimeout);
    longPressTimeout = 0;
    longPressFired = false;
    releaseAction?.(data, pointerId);
  }

  //A held note outlives the pointer events of a button that can be destroyed under it: the
  //keyboard is swapped out wholesale while audio-recording, and re-created when the layer's
  //instrument changes. No pointer event is delivered then, so the release has to come from here.
  $effect(() => {
    return () => {
      if (activePointerId !== null) endPress(activePointerId);
    };
  });

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
  {@attach suppressNativeTouch}
  onpointerdown={(e) => {
    preventDefault(e);
    //keep this pointer's moves and its release on THIS button once the finger/cursor wanders
    //off it, which a duration drag immediately does: touch captures implicitly, mouse does not.
    //Boundary events are held back until the capture is released, so `onpointerleave` below
    //still ends the press — after the pointerup that already did, and it no-ops there.
    //A second pointer landing on a button someone is already holding takes it over — but the
    //displaced one must be RELEASED first. Its own pointerup is about to be swallowed by the
    //ownership guard in endPress, and with held notes refcounted per id (HeldNoteRegistry) a
    //swallowed release is a voice that never stops and a span that keeps growing.
    if (activePointerId !== null && activePointerId !== e.pointerId) endPress(activePointerId);
    buttonElement?.setPointerCapture(e.pointerId);
    pressOriginX = e.clientX;
    longPressFired = false;
    activePointerId = e.pointerId;
    clickAction(data, e.pointerId);
    startLongPress();
  }}
  onpointermove={(e) => {
    //only once the long press has fired: before that the press is still a tap, and the
    //keyboard is a surface fingers legitimately rest on
    if (longPressFired && activePointerId === e.pointerId) {
      dragAction?.(data, e.clientX - pressOriginX);
    }
  }}
  onpointerup={(e) => endPress(e.pointerId)}
  onpointerleave={(e) => endPress(e.pointerId)}
  onpointercancel={(e) => endPress(e.pointerId)}
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
        style="z-index:2;position:absolute;bottom:6%;left:20%;right:20%;height:0.25rem;border-radius:0.2rem;background-color:var(--accent);pointer-events:none"
      ></div>
    {/if}
    <div class={game.features.hasNoteFrame ? 'note-name' : 'note-name-sky'}>
      {noteText}
    </div>
  </div>
</button>
