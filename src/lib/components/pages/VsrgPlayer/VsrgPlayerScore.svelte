<script lang="ts">
  import { VSRG_SCORE_COLOR_MAP } from '$core/legacyConfig';
  import { vsrgPlayerStore } from '$stores/VsrgPlayerStore.svelte';
  import { vsrgAccuracy, vsrgGrade } from '$stores/vsrgGrade';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import IconArrowsRotate from '~icons/fa6-solid/arrows-rotate';
  import { t } from '$i18n/binding.svelte';

  // vsrgPlayerStore.score is a Svelte-reactive $state object, so the template reads below stay
  // live without a subscription.

  interface VsrgPlayerScoreProps {
    //the route's existing restart path, handed down through VsrgPlayerRight. Nothing here resets
    //the score: it ends at VsrgPlayerRenderer.onSongPick, whose first act is resetScore(), so the
    //panel dismisses itself as a consequence of the song restarting rather than by being told to.
    onRetrySong: () => void;
  }

  let { onRetrySong }: VsrgPlayerScoreProps = $props();

  //derived, never stored on the score object - see vsrgGrade.ts. Safe to read the tallies here in a
  //way VsrgLatestScore's animation effect is not: a $derived recomputes from its dependencies and
  //writes nothing back, so there is no self-retrigger to untrack away from.
  const grade = $derived(vsrgGrade(vsrgPlayerStore.score));
  const accuracy = $derived((vsrgAccuracy(vsrgPlayerStore.score) * 100).toFixed(1));
</script>

{#snippet scoreElement(text: string, number: number, color: string, gridArea: string)}
  <div class="floating-score-element row" style="grid-area:{gridArea}">
    <span style="color:{color}">
      {text}
    </span>
    <span>
      {number}
    </span>
  </div>
{/snippet}

{#snippet retryIcon()}
  <IconArrowsRotate />
{/snippet}

<div class="vsrg-player-score">
  <div class="column space-between">
    <div>
      {vsrgPlayerStore.score.score}
    </div>
  </div>
</div>
{#if vsrgPlayerStore.score.scoreVisible}
  <div class="vsrg-final-score box-shadow">
    <div class="vsrg-final-grade row" style="grid-area:g">
      <div class="vsrg-final-grade-letter">
        {grade}
      </div>
      <div class="column">
        <span class="vsrg-final-grade-label">
          {t('vsrg_player:grade')}
        </span>
        <span>
          {t('vsrg_player:accuracy')}: {accuracy}%
        </span>
      </div>
    </div>
    {@render scoreElement(
      t('vsrg_player:amazing'),
      vsrgPlayerStore.score.amazing,
      VSRG_SCORE_COLOR_MAP.amazing,
      'a'
    )}
    {@render scoreElement(
      t('vsrg_player:perfect'),
      vsrgPlayerStore.score.perfect,
      VSRG_SCORE_COLOR_MAP.perfect,
      'b'
    )}
    {@render scoreElement(
      t('vsrg_player:great'),
      vsrgPlayerStore.score.great,
      VSRG_SCORE_COLOR_MAP.great,
      'c'
    )}
    {@render scoreElement(
      t('vsrg_player:good'),
      vsrgPlayerStore.score.good,
      VSRG_SCORE_COLOR_MAP.good,
      'd'
    )}
    <!-- bad was tallied by the store and shown nowhere before the grade started counting it; a
         judgment that silently drags the letter down has to be visible next to the letter. -->
    {@render scoreElement(
      t('vsrg_player:bad'),
      vsrgPlayerStore.score.bad,
      VSRG_SCORE_COLOR_MAP.bad,
      'e'
    )}
    {@render scoreElement(
      t('vsrg_player:miss'),
      vsrgPlayerStore.score.miss,
      VSRG_SCORE_COLOR_MAP.miss,
      'f'
    )}
    <!-- the PEAK, not the live combo this row used to print: by the time the panel opens the live
         one is whatever survived the final note, which is 0 whenever the run ended on a miss. The
         running combo is already on screen while playing, in VsrgLatestScore. -->
    <div class="row space-between" style="width:100%;align-items:center;grid-area:h">
      <div style="font-size:1.2rem">
        {t('vsrg_player:max_combo')}: {vsrgPlayerStore.score.maxCombo}x
      </div>
      <div class="flex" style="font-size:1.2rem;align-items:center">
        {vsrgPlayerStore.score.score}
      </div>
    </div>
    <!-- cssVar, not the default fill: .app-button's own background IS --primary, which is this
         panel's background too, so a plain button would be an invisible rectangle on it. -->
    <div class="row" style="justify-content:flex-end;grid-area:r">
      <AppButton onclick={onRetrySong} icon={retryIcon} cssVar="accent">
        {t('vsrg_player:retry')}
      </AppButton>
    </div>
  </div>
{/if}

<style>
  /* QUIRK: animation: fadeIn 0.4s below references a keyframe that isn't defined anywhere
       globally (App.css/Theme.css have no @keyframes fadeIn) - any @keyframes fadeIn that exist
       are scoped inside other components' <style> blocks, not global, so this is a harmless no-op,
       not newly introduced here. The same undefined reference recurs elsewhere in this codebase's
       CSS; don't "fix" it here by inventing a keyframe, or drop it as unused without checking those
       other sites too. */
  .vsrg-player-score {
    position: absolute;
    top: 2.4rem;
    right: 0.5rem;
    min-width: 5rem;
    margin-top: 1rem;
    text-shadow: 0 0 0.5rem #252525;
    font-size: 1.4rem;
    color: var(--background-text);
  }

  /* QUIRK: the horizontal centring is the FLEX STATIC POSITION of .vsrg-player-page
       (align-items:center), not the margin pair below, which does nothing for an absolutely
       positioned box with auto offsets. Reparent this panel and it jumps to the left edge with no
       rule here appearing to explain why. The row gap is tighter than the column gap because the
       grid grew from four rows to six and 2rem in both directions overflowed short viewports. */
  .vsrg-final-score {
    position: absolute;
    top: 20%;
    display: grid;
    grid-template-areas:
      'g g'
      'a b'
      'c d'
      'e f'
      'h h'
      'r r';
    gap: 1rem 2rem;
    background-color: var(--primary);
    border-radius: 0.5rem;
    border: solid 2px var(--secondary);
    padding: 1rem;
    z-index: 10;
    margin-left: auto;
    margin-right: auto;
    animation: fadeIn 0.4s;
  }

  .vsrg-final-grade {
    align-items: center;
    gap: 0.8rem;
  }

  /* --accent/--accent-text rather than a colour picked here: the theme computes the text colour
     against the fill, so the letter stays readable in themes where --primary and --accent are
     close. */
  .vsrg-final-grade-letter {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 3.6rem;
    height: 3.6rem;
    padding: 0 0.5rem;
    border-radius: 0.5rem;
    background-color: var(--accent);
    color: var(--accent-text);
    font-size: 2.2rem;
    font-weight: bold;
    line-height: 1;
  }

  .vsrg-final-grade-label {
    font-size: 0.9rem;
    opacity: 0.8;
  }

  .floating-score-element {
    display: grid;
    align-items: center;
    gap: 1rem;
    grid-template-columns: 1fr min-content;
    font-size: 1.4rem;
  }
</style>
