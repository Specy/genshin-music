<script module lang="ts">
  import { Instrument } from '$lib/audio/Instrument.svelte';

  // Module-scope so it's one shared singleton across every rendered frame (this component is
  // instantiated once per chunk, often dozens of times per page) rather than rebuilt per instance.
  const baseInstrument = new Instrument();
</script>

<script lang="ts">
  import { game } from '$game';
  import { SUSTAIN_VISUAL_THRESHOLD_MS } from '$core/legacyConfig';
  import type { Chunk } from '$core/Songs/VisualSong';
  import type { NoteNameType } from '$lib/games/types';
  import { cn, cs } from '$core/utils/Utilities';


  // One note-grid "frame" tile - the small per-chunk sheet-music preview block rendered under
  // the player keyboard (fed RecordedSong chunks, duck-typed against this file's `Chunk` type).
  // CSS paints the empty-dot lattice; only filled notes render as explicitly placed grid children.
  let {
    chunk,
    rows,
    hasText,
    keyboardLayout,
    selected,
  }: {
    chunk: Chunk;
    rows: number;
    hasText: boolean;
    keyboardLayout: NoteNameType;
    selected?: boolean;
  } = $props();

  const columnsPerRow = $derived(game.notes.perRow);
  const filledNotes = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- transient local accumulator, never UI-observed
    const byButton = new Map<number, boolean>();
    const max = columnsPerRow * rows;
    chunk.notes.forEach((note) => {
      //`displayButton`, resolved once at queue-build by resolvePlayerNoteButtons, which owns
      //this coordinate outright: the note's OWN track instrument's button (ADR-0004 keeps these
      //frames own-button), with the grid row a Stranded Note draws on as its own fallback. There
      //is no second answer to compute here — a Note Number means nothing without the track's
      //instrument and Basepoint, neither of which this frame has (ADR-0007). Deliberately NOT
      //the note's `keyboardButton`: that is the key on the player's on-screen keyboard, a
      //different coordinate space (see RecordedNote), and these frames are not that keyboard.
      const button = note.displayButton;
      if (button < 0 || button >= max) return;
      const held = note.duration >= SUSTAIN_VISUAL_THRESHOLD_MS || (byButton.get(button) ?? false);
      byButton.set(button, held);
    });
    return [...byButton.entries()].map(([button, held]) => ({
      button,
      held,
      row: Math.floor(button / columnsPerRow) + 1,
      column: (button % columnsPerRow) + 1,
    }));
  });
  // cs() returns a CSSProperties-shaped object; Svelte's style attribute is string-only, so only
  // the one property this call produces is read directly rather than stringifying the whole object.
  const borderColor = $derived(cs([selected, { borderColor: 'var(--accent)' }]).borderColor);
</script>

<div
  class={cn('frame-outer-smaller', [chunk.notes.length === 0, 'visualizer-ball'])}
  style={borderColor ? `border-color:${borderColor}` : ''}
>
  {#if chunk.notes.length === 0}
    <div></div>
  {:else}
    <div class="visualizer-frame">
      {#each filledNotes as note (note.button)}
        <div
          class={note.held ? 'frame-note-s frame-note-held' : 'frame-note-s'}
          style="grid-row:{note.row};grid-column:{note.column}"
        >
          {hasText ? baseInstrument.getNoteText(note.button, keyboardLayout, 'C') : ''}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .visualizer-frame {
    width: 94%;
    height: 90%;
    position: absolute;
    top: 5%;
    left: 3%;
    display: grid;
    grid-template-columns: repeat(var(--sheet-cols, 7), 1fr);
    grid-template-rows: repeat(3, 1fr);
    justify-items: center;
    align-items: center;
    background-image: radial-gradient(
      circle closest-side,
      var(--sheet-dot-color, var(--primary)) calc(var(--sheet-dot-r, 25%) - 0.5px),
      transparent var(--sheet-dot-r, 25%)
    );
    background-size: calc(100% / var(--sheet-cols, 7)) calc(100% / 3);
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }

  .frame-outer-smaller {
    border-radius: 0.4rem;
    background-color: var(--primary);
    width: 100%;
    height: 100%;
    border: solid var(--primary) 0.18rem;
    padding-bottom: 49%;
    position: relative;
  }

  .frame-note-s {
    border-radius: 0.2rem;
    width: 80%;
    height: 80%;
    font-size: 0.6rem;
    display: flex;
    justify-content: center;
    align-items: center;
    position: relative;
    background-color: var(--selected-note-background, var(--accent));
    color: var(--accent-text);
  }

  /* held-note marker (Duration over the visual threshold) — replaces the inline-styled div */
  .frame-note-held::after {
    content: '';
    position: absolute;
    bottom: 8%;
    left: 22%;
    right: 22%;
    height: 0.14rem;
    border-radius: 1rem;
    background-color: currentColor;
    opacity: 0.75;
    pointer-events: none;
  }

  .visualizer-ball {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
    border-color: transparent;
    background-color: transparent;
  }

  .visualizer-ball div {
    width: 0.5rem;
    height: 0.5rem;
    position: absolute;
    top: calc(50% - 0.25rem);
    left: calc(50% - 0.25rem);
    background-color: #606876;
    border-radius: 50%;
    opacity: 0.5;
  }

  @media print {
    .frame-note-s {
      border-radius: 2px;
    }

    .visualizer-frame {
      --sheet-dot-color: black;
    }

    .visualizer-ball {
      border: none !important;
    }
  }
</style>
