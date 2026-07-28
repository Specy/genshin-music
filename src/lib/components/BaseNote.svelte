<script lang="ts" generics="T">
  import { game } from '$game';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { preventDefault } from '$core/utils/Utilities';
  import type { NoteImage } from '$lib/games/types';
  import GenshinNoteBorder from './GenshinNoteBorder.svelte';
  import SvgNote from './SvgNote.svelte';

  // `theme.get(...)` inside `getTextColor()`'s `$derived` (below) auto-tracks
  // ThemeProvider's rune-backed state, so no manual subscribe/dispose is needed.
  //
  // Two-tier rule (see legacyConfig.ts): this file is UI code, so game-data
  // constants are read from `$game` directly, not `$core/legacyConfig`.
  type BaseNoteData = {
    status: 'clicked' | string;
  };

  let {
    data,
    // QUIRK: typed required below but keeps a runtime default - dead under
    // the type system, live if a caller ignores the type and omits it anyway.
    noteText = 'A',
    handleClick,
    noteImage,
    clickClass = '',
    noteClass = '',
    // QUIRK: bindable but no current caller binds to it - kept for API
    // parity, not dead code to prune.
    noteRef = $bindable(),
  }: {
    data: T & BaseNoteData;
    clickClass?: string;
    noteClass?: string;
    noteRef?: HTMLDivElement;
    noteText: string;
    handleClick: (data: T & BaseNoteData) => void;
    noteImage?: NoteImage;
  } = $props();

  function parseClass(status: string, clickClass: string) {
    let className = game.notes.cssClasses.note;
    switch (status) {
      case 'clicked':
        className += ` click-event ${clickClass}`;
        break;
      default:
        break;
    }
    return className;
  }

  function parseBorderColor(status: string) {
    if (status === 'clicked') return 'transparent';
    if (status === 'wrong') return '#d66969';
    if (status === 'right') return '#358a55';
    return game.features.hasNoteFrame ? '#eae5ce' : 'unset';
  }

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

  const className = $derived(`${parseClass(data.status, clickClass)} ${noteClass}`);
  const borderColor = $derived(parseBorderColor(data.status));
  const textColor = $derived(getTextColor());
</script>

<button
  onpointerdown={(e) => {
    preventDefault(e);
    handleClick(data);
  }}
  oncontextmenu={preventDefault}
  class="button-hitbox-bigger"
>
  <div bind:this={noteRef} class={className} style="border-color:{borderColor}">
    {#if game.features.hasNoteFrame}
      <GenshinNoteBorder class="genshin-border" fill={borderColor} />
    {/if}
    {#if noteImage}
      <SvgNote
        name={noteImage}
        background={data.status === 'clicked' ? 'var(--accent)' : 'var(--note-background)'}
      />
    {/if}
    <div class={game.notes.cssClasses.noteName} style="color:{textColor}">
      {noteText}
    </div>
  </div>
</button>
