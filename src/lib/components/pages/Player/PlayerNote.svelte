<script lang="ts">
  import { game } from '$game';
  import { SUSTAIN_VISUAL_THRESHOLD_MS } from '$core/legacyConfig';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { InstrumentName, NoteStatus } from '$core/types';
  import type { ShapeDefinition } from '$lib/games/types';
  import type { ApproachingNote } from '$core/Songs/SongClasses';
  import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte';
  import SvgNote from '$cmp/SvgNote.svelte';
  import { suppressNativeTouch } from '$cmp/suppressNativeTouch';
  import { RING_SCALE, RING_STROKE, RING_VIEWBOX, ringGeometry } from '$lib/games/noteShape';

  let {
    note,
    shape,
    data,
    approachingNotes,
    noteText,
    hideNote,
    handleClick,
    handleRelease,
  }: {
    note: ObservableNote;
    /**
     * The Shape this button is drawn in (ADR-0005): the authority on the keyboard's geometry
     * and silhouette, handed down as an object rather than re-derived from the instrument
     * name — so the overlays below can't describe a different keyboard from the one on screen.
     */
    shape: ShapeDefinition;
    data: {
      approachRate: number;
      instrument: InstrumentName;
    };
    approachingNotes: ApproachingNote[];
    noteText: string;
    hideNote: boolean;
    handleClick: (note: ObservableNote) => void;
    handleRelease?: (note: ObservableNote) => void;
  } = $props();

  function getTextColor() {
    const noteBg = theme.get('note_background');
    if (game.features.hasNoteFrame) {
      if (noteBg.luminosity() > 0.65) {
        return game.themes.baseConfig.text.note;
      } else {
        return noteBg.isDark()
          ? game.themes.baseConfig.text.light
          : game.themes.baseConfig.text.dark;
      }
    } else {
      return noteBg.isDark() ? game.themes.baseConfig.text.light : game.themes.baseConfig.text.dark;
    }
  }

  //banded by the row the button is DRAWN on, so the bands read across the keyboard on screen.
  //Asked of the Shape rather than of game.notes.perRow (the Song Grid's width): identical on
  //a full-size keyboard, where the two are the same number, and right on a narrower one -
  //a 2x4 drum kit used to be banded in sevens while being laid out in fours.
  function getApproachCircleColor(index: number) {
    const row = Math.floor(index / shape.columns);
    if (row === 0) return 'var(--accent)';
    if (row === 1) return theme.get('accent').rotate(180).hex();
    if (row === 2) return 'var(--accent)';
    return 'var(--accent)';
  }

  function parseBorderFill(status: NoteStatus, disabled: boolean) {
    if (disabled) return 'var(--note-border-fill)';
    if (status === 'clicked') return 'transparent';
    else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7';
    return 'var(--note-border-fill)';
  }

  function parseClass(status: NoteStatus, disabled: boolean) {
    //TODO there is a bug where if two notes to be clicked are the same, the first click will not be shown, as the transition is the same
    if (disabled) {
      switch (status) {
        case 'clicked':
          return 'click-event';
        default:
          return '';
      }
    }
    switch (status) {
      case 'clicked':
        return 'click-event';
      case 'toClick':
        return 'note-red';
      case 'toClickNext':
        return 'note-border-click';
      case 'toClickAndNext':
        return 'note-red note-border-click';
      case 'approach-wrong':
        return 'click-event approach-wrong';
      case 'approach-correct':
        return 'click-event approach-correct';
      default:
        return '';
    }
  }

  const textColor = $derived(getTextColor());
  const clickColor = $derived(game.instruments.data[data.instrument]?.clickColor);
  const transitionStyle = $derived(
    `background-color ${note.data.delay}ms  ${note.data.delay === game.notes.animationDelayMs ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`
  );
  const noteClassName = $derived(
    `${game.notes.cssClasses.note} ${parseClass(note.data.status, hideNote)}`
  );
  const noteBackgroundColor = $derived(
    clickColor && note.data.status === 'clicked' && theme.isDefault('accent')
      ? clickColor
      : undefined
  );
  const borderFill = $derived(parseBorderFill(note.data.status, hideNote));
  const svgBackground = $derived(
    note.data.status === 'clicked'
      ? clickColor && theme.isDefault('accent')
        ? clickColor
        : 'var(--accent)'
      : 'var(--note-background)'
  );
  const animationBorderColor = $derived(
    clickColor && theme.isDefault('accent') ? clickColor : undefined
  );
  //the hold ring traces the silhouette of the layout being played, so it never reads as a
  //foreign shape laid over the keyboard - taken from the Shape this button is drawn in, the
  //same object the arrangement itself used.
  const ring = $derived(ringGeometry(shape.noteShape));

  /** The pointer pressing this button, if any. */
  let activePointerId: number | null = null;

  /**
   * Only the pointer that pressed may release. `pointerleave` fires for pointers that never
   * pressed — a mouse merely crossing the keyboard — and that stray release used to close the
   * recorded note and cut the sustain of a note being held by the PC keyboard or MIDI.
   */
  function endPointerPress(pointerId: number) {
    if (activePointerId !== pointerId) return;
    activePointerId = null;
    handleRelease?.(note);
  }
</script>

<button
  {@attach suppressNativeTouch}
  onpointerdown={(e) => {
    e.preventDefault();
    activePointerId = e.pointerId;
    handleClick(note);
  }}
  onpointerup={(e) => endPointerPress(e.pointerId)}
  onpointerleave={(e) => endPointerPress(e.pointerId)}
  onpointercancel={(e) => endPointerPress(e.pointerId)}
  oncontextmenu={preventDefault}
  class="button-hitbox-bigger"
>
  {#each approachingNotes as approachingNote (approachingNote.id)}
    <!-- held notes get a dashed outer ring plus their hold length as the "keep it pressed for N seconds" cue -->
    <div
      class={game.notes.cssClasses.approachCircle}
      style="animation:approach {data.approachRate}ms linear;border-color:{getApproachCircleColor(
        approachingNote.index
      )};{approachingNote.duration >= SUSTAIN_VISUAL_THRESHOLD_MS
        ? `outline:2px dashed ${getApproachCircleColor(approachingNote.index)};outline-offset:3px;display:flex;align-items:center;justify-content:center`
        : ''}"
    >
      {#if approachingNote.duration >= SUSTAIN_VISUAL_THRESHOLD_MS}
        <span
          style="font-size:0.65rem;font-weight:bold;color:{getApproachCircleColor(
            approachingNote.index
          )};pointer-events:none"
        >
          {(approachingNote.duration / 1000).toFixed(1)}s
        </span>
      {/if}
    </div>
  {/each}
  {#if note.data.holdTimerMs > 0}
    <!-- keyed on holdTimerId so re-pressing the same button restarts the sweep instead of
             leaving the previous (already unwound) animation in place -->
    {#key note.data.holdTimerId}
      <svg
        class="hold-release-ring"
        viewBox="0 0 {RING_VIEWBOX} {RING_VIEWBOX}"
        style="--ring-scale:{RING_SCALE};--ring-stroke:{RING_STROKE}"
        aria-hidden="true"
      >
        <path class="hold-release-ring-track" d={ring.d} />
        <path
          class="hold-release-ring-progress"
          d={ring.d}
          style="--ring-perimeter:{ring.perimeter};stroke-dasharray:{ring.perimeter};animation-duration:{note
            .data.holdTimerMs}ms"
        />
      </svg>
    {/key}
  {/if}
  {#if note.data.animationId !== 0}
    <!-- {#key} forces a fresh DOM node per animationId so the CSS pulse animation restarts on
             every click - an unchanged element wouldn't replay it. -->
    {#key note.data.animationId}
      <div
        class={game.notes.cssClasses.noteAnimation}
        style={animationBorderColor ? `border-color:${animationBorderColor}` : ''}
      ></div>
    {/key}
  {/if}
  <div
    class={noteClassName}
    style="transition:{transitionStyle};{noteBackgroundColor
      ? `background-color:${noteBackgroundColor}`
      : ''}"
  >
    {#if game.features.hasNoteFrame}
      <GenshinNoteBorder class="genshin-border" fill={borderFill} />
    {/if}
    <SvgNote
      name={note.noteImage}
      color={theme.isDefault('accent') ? game.instruments.data[data.instrument]?.fill : undefined}
      background={svgBackground}
    />
    {#if note.data.holdMs > 0 && !hideNote}
      <!-- practice hold hint: this note should be kept pressed -->
      <div
        style="z-index:2;position:absolute;bottom:6%;left:20%;right:20%;height:0.25rem;border-radius:0.2rem;background-color:var(--accent);pointer-events:none"
      ></div>
    {/if}
    <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
      {noteText}
    </div>
  </div>
</button>
