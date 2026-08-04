<script module lang="ts">
  // QUIRK: the trailing } in this string is deliberate, not a typo - it makes the "zen-keyboard"
  // token never match the :global(.zen-keyboard) rule at the bottom of this file, so that rule's
  // margin never applies. Reproduces old's own dead-styling bug (a stray brace outside its
  // original CSS-Modules interpolation) faithfully. Flagged, not fixed.
  const cssBase = `keyboard zen-keyboard}`;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { zenKeyboardStore } from '$stores/ZenKeyboardStore.svelte';
  import { createKeyboardListener } from '$stores/KeybindsStore.svelte';
  import type { Instrument, ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { NoteNameType, Pitch } from '$core/legacyConfig';
  import ShapeKeyboard from '$lib/games/shapes/ShapeKeyboard.svelte';
  import ZenNote from './ZenNote.svelte';

  let {
    onNoteClick,
    instrument,
    pitch,
    verticalOffset,
    scale,
    noteNameType,
    keySpacing,
    onNoteRelease,
    heldNotes,
  }: {
    instrument: Instrument;
    pitch: Pitch;
    scale: number;
    noteNameType: NoteNameType;
    keySpacing: number;
    verticalOffset: number;
    onNoteClick: (note: ObservableNote) => void;
    onNoteRelease?: (note: ObservableNote) => void;
    /** Button indexes currently physically held — rendered pressed-down. */
    heldNotes?: ReadonlySet<number>;
  } = $props();

  // Registered once here, not re-run when instrument/onNoteClick change: the callback below reads
  // both fresh at call time since they're live reactive bindings, so they can never go stale.
  onMount(() => {
    return createKeyboardListener(
      'zen_keyboard',
      ({ shortcut, event }) => {
        if (event.repeat) return;
        const note = instrument.getNoteFromCode(shortcut.name);
        if (note !== null) onNoteClick(note);
      },
      {
        onRelease: ({ shortcut }) => {
          const note = instrument.getNoteFromCode(shortcut.name);
          if (note !== null) onNoteRelease?.(note);
        },
      }
    );
  });
</script>

<ShapeKeyboard
  shape={instrument.shape}
  count={zenKeyboardStore.keyboard.length}
  class={cssBase}
  style="transform:scale({scale / 100}) translateY({verticalOffset}px);margin-top:unset"
>
  {#snippet button(index)}
    {@const note = zenKeyboardStore.keyboard[index]}
    <ZenNote
      keyPadding={keySpacing}
      instrumentName={instrument.name}
      noteText={instrument.getNoteText(index, noteNameType, pitch)}
      noteImage={note.noteImage}
      {note}
      onClick={onNoteClick}
      onRelease={onNoteRelease}
      held={heldNotes?.has(index) ?? false}
    />
  {/snippet}
</ShapeKeyboard>

<style>
  :global(.zen-keyboard) {
    margin: auto 0;
  }
</style>
