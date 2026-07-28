<script lang="ts">
  import { game } from '$game';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { ObservableNote } from '$lib/audio/Instrument.svelte';
  import type { InstrumentName, NoteStatus } from '$core/types';
  import type { ApproachingNote } from '$core/Songs/SongClasses';
  import GenshinNoteBorder from '$cmp/GenshinNoteBorder.svelte';
  import SvgNote from '$cmp/SvgNote.svelte';

  let {
    note,
    data,
    approachingNotes,
    noteText,
    hideNote,
    handleClick,
  }: {
    note: ObservableNote;
    data: {
      approachRate: number;
      instrument: InstrumentName;
    };
    approachingNotes: ApproachingNote[];
    noteText: string;
    hideNote: boolean;
    handleClick: (note: ObservableNote) => void;
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

  function getApproachCircleColor(index: number) {
    const numOfNotes = game.notes.perRow;
    const row = Math.floor(index / numOfNotes);
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
</script>

<button
  onpointerdown={(e) => {
    e.preventDefault();
    handleClick(note);
  }}
  oncontextmenu={preventDefault}
  class="button-hitbox-bigger"
>
  {#each approachingNotes as approachingNote (approachingNote.id)}
    <div
      class={game.notes.cssClasses.approachCircle}
      style="animation:approach {data.approachRate}ms linear;border-color:{getApproachCircleColor(
        approachingNote.index
      )}"
    ></div>
  {/each}
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
    <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
      {noteText}
    </div>
  </div>
</button>
