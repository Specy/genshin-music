<script lang="ts">
  // THE TEMPO CHANGER COLUMN, in one component because it now has TWO PLACES to be rendered from
  // and one of them is not inside the keyboard (CONTEXT.md: Pro View, Compressed View):
  //  - Compressed View: ComposerKeyboard renders it, exactly where it always did - as the sibling
  //    that follows `.composer-keyboard-wrapper`, under the keyboard's right-hand end;
  //  - Pro View: Composer.svelte renders it in its own always-visible bottom slot, because there
  //    the keyboard is a bottom SHEET that spends most of its life translated off-screen, and the
  //    tempo changers must not go down with it (spec §8).
  // The markup is here rather than duplicated at those two sites, so the two placements cannot
  // drift into two different button rows.
  //
  // `.tempo-changers-wrapper` is `position: absolute` against the viewport in both cases (no
  // positioned ancestor on this route), so WHERE it lands is App.css's decision and not the parent
  // component's - what the parent decides is whether it exists and what it is a sibling of, which
  // is what stacking against the Pro View's backdrop depends on.
  import { game } from '$game';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { t } from '$i18n/binding.svelte';
  import type { NoteColumn } from '$core/Songs/SongClasses';

  let {
    isPlaying,
    currentColumn,
    handleTempoChanger,
    songLocked = false,
  }: {
    isPlaying: boolean;
    currentColumn: NoteColumn;
    handleTempoChanger: (tempoChanger: (typeof game.composer.tempoChangers)[number]) => void;
    songLocked?: boolean;
  } = $props();
</script>

<div class={['tempo-changers-wrapper', isPlaying && 'tempo-changers-wrapper-hidden']}>
  <div class="bottom-right-text">
    {t('composer:tempo')}
  </div>
  {#each game.composer.tempoChangers as tempoChanger (tempoChanger.id)}
    <button
      disabled={songLocked}
      onclick={() => handleTempoChanger(tempoChanger)}
      style="{tempoChanger.changer === 1
        ? `background-color:${ThemeProvider.get('primary').toString()};color:${ThemeProvider.getText('primary').toString()}`
        : `background-color:#${tempoChanger.color.toString(16)}`};outline:{currentColumn.tempoChanger ===
      tempoChanger.id
        ? `3px ${ThemeProvider.get('composer_accent').toString()} solid`
        : 'unset'};outline-offset:-3px"
    >
      {tempoChanger.text}
    </button>
  {/each}
</div>
