<script module lang="ts">
  // QUIRK: the trailing } in this string is deliberate, not a typo - it makes the "zen-keyboard"
  // token never match the :global(.zen-keyboard) rule at the bottom of this file, so that rule's
  // margin never applies. Reproduces old's own dead-styling bug (a stray brace outside its
  // original CSS-Modules interpolation) faithfully. Flagged, not fixed.
  const cssBase = `keyboard zen-keyboard}`;
  const keyboardClasses = new Map<number, string>([
    [15, `${cssBase} keyboard-5`],
    [14, `${cssBase} keyboard-5`],
    [8, `${cssBase} keyboard-4`],
    [6, `${cssBase} keyboard-3`],
  ]);
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { zenKeyboardStore } from '$stores/ZenKeyboardStore.svelte';
  import { createKeyboardListener } from '$stores/KeybindsStore.svelte';
  import type { Instrument, ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { NoteNameType, Pitch } from '$core/legacyConfig';
  import ZenNote from './ZenNote.svelte';

  let {
    onNoteClick,
    instrument,
    pitch,
    verticalOffset,
    scale,
    noteNameType,
    keySpacing,
  }: {
    instrument: Instrument;
    pitch: Pitch;
    scale: number;
    noteNameType: NoteNameType;
    keySpacing: number;
    verticalOffset: number;
    onNoteClick: (note: ObservableNote) => void;
  } = $props();

  // Registered once here, not re-run when instrument/onNoteClick change: the callback below reads
  // both fresh at call time since they're live reactive bindings, so they can never go stale.
  onMount(() => {
    return createKeyboardListener('zen_keyboard', ({ shortcut, event }) => {
      if (event.repeat) return;
      const note = instrument.getNoteFromCode(shortcut.name);
      if (note !== null) onNoteClick(note);
    });
  });

  const keyboardClass = $derived(keyboardClasses.get(zenKeyboardStore.keyboard.length) || cssBase);
</script>

<div
  class={keyboardClass}
  style="transform:scale({scale / 100}) translateY({verticalOffset}px);margin-top:unset"
>
  {#each zenKeyboardStore.keyboard as note, index (index)}
    <ZenNote
      keyPadding={keySpacing}
      instrumentName={instrument.name}
      noteText={instrument.getNoteText(index, noteNameType, pitch)}
      noteImage={note.noteImage}
      {note}
      onClick={onNoteClick}
    />
  {/each}
</div>

<style>
  :global(.zen-keyboard) {
    margin: auto 0;
  }
</style>
