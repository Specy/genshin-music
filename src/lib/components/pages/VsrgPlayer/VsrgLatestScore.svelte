<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { VSRG_SCORE_COLOR_MAP } from '$core/legacyConfig';
  import { subscribeVsrgLatestScore, vsrgPlayerStore } from '$stores/VsrgPlayerStore.svelte';
  import type { Timer } from '$core/utils/Utilities';
  import { t } from '$i18n/binding.svelte';

  // data is a one-time snapshot of vsrgPlayerStore.score.lastScore at mount, not a live binding -
  // it only updates via the subscribeVsrgLatestScore callback below.
  let data = $state(vsrgPlayerStore.score.lastScore);
  let ref: HTMLDivElement | undefined = $state();
  // styleTransform's initial value includes " scale(1)"; the effect below only ever writes
  // `rotate(${angle}deg)` (no scale() token) - both render identically since CSS transform
  // defaults to scale(1) with no scale() function present.
  let styleTransform = $state('rotate(0) scale(1)');
  let styleColor = $state('var(--primary-text)');

  onMount(() => {
    let lastTimeout: Timer = 0;
    const dispose = subscribeVsrgLatestScore((d) => {
      data = d;
      clearTimeout(lastTimeout);
      lastTimeout = setTimeout(() => {
        data = { ...d, type: '' };
      }, 800);
    });
    return () => {
      dispose();
      clearTimeout(lastTimeout);
    };
  });

  // QUIRK (load-bearing - a real bug this port found, not old parity): ref.animate() below reads
  // styleTransform/styleColor ($state) as keyframe values, then the two lines after write fresh
  // values to both. A $state read ANYWHERE inside a Svelte 5 effect body is tracked as a
  // dependency - even nested in a function-call argument, even with a top-level `void data`
  // guard - so without untrack(), this effect retriggers on its own write: an unbounded loop
  // (reproduced live: one scored hit fired 37 extra re-runs in a single burst) that only stops
  // once two consecutive Math.random() draws coincide, and can throw effect_update_depth_exceeded
  // on an unlucky run. untrack() below confines tracked dependencies to exactly {data, ref},
  // matching old's own [data]-only effect dependency array. Do not remove it. Same fix pattern in
  // ZenNote.svelte, Player.svelte, NumericalInput.svelte, zen-keyboard/+page.svelte.
  $effect(() => {
    void data;
    if (!ref) return;
    // Plain local copy of the already-guarded ref (not a new $state read) - needed because
    // TypeScript's narrowing from the guard above doesn't carry into the untrack() closure below.
    const el = ref;
    const angle = Math.floor(Math.random() * 25 - 12.5);
    const newColor = VSRG_SCORE_COLOR_MAP[data.type];
    untrack(() => {
      el.animate(
        [
          { transform: styleTransform, color: styleColor },
          { transform: `rotate(${angle}deg) scale(1.3)`, color: newColor },
          { transform: `rotate(0) scale(1)`, color: newColor },
        ],
        {
          duration: 150,
          easing: 'ease-out',
        }
      );
      styleTransform = `rotate(${angle}deg)`;
      styleColor = newColor;
    });
  });
</script>

<!-- Rendered into VsrgPlayerCanvas's snippet slot, so the offsets below are the PLAY COLUMN's, not
     the page's. Kept as one component rather than split per element: subscribeVsrgLatestScore
     JSON.stringifies the whole score object on every mutation, and a held note mutates it every
     300ms, so a second subscription would double that on the hottest path for no gain. -->
<div
  bind:this={ref}
  style="transform:{styleTransform};color:{styleColor}"
  class="vsrg-floating-score"
>
  {#if data.type}
    {t(`vsrg_player:${data.type}`)}
  {/if}
</div>
<!-- goes blank the moment the result panel opens: that panel prints the run's PEAK combo, while
     this corner holds whatever the last judgment left behind (0 if the run ended on a miss), so
     keeping both up puts two disagreeing numbers on screen with only one of them labelled. -->
<div class="vsrg-floating-combo">
  {#if data.combo > 0 && !vsrgPlayerStore.score.scoreVisible}
    {data.combo}x
  {/if}
</div>

<style>
  /* z-index is load-bearing, not decoration: VsrgPlayerRenderer appends the pixi <canvas> to this
     same wrapper AFTER this markup, and with both at z-index auto tree order wins, so a falling hit
     object would paint straight over the readouts. The countdown gets away without one only
     because the scene is still empty while it shows. */
  .vsrg-floating-score,
  .vsrg-floating-combo {
    position: absolute;
    z-index: 1;
    pointer-events: none;
    font-weight: bold;
    text-shadow: 0 0 0.5rem #252525;
  }

  /* the judgment now takes the slot the combo vacated. Still a fixed-width centred box rather than
     a full-width one: the pop animation rotates about the element's centre, and a box as wide as
     the column would swing the text across it instead of tilting it in place. */
  .vsrg-floating-score {
    top: 30%;
    width: 12rem;
    left: calc(50% - 6rem);
    text-align: center;
    font-size: 2.4rem;
  }

  /* the column's own top-left corner, which is only addressable from inside the canvas wrapper */
  .vsrg-floating-combo {
    top: 0.5rem;
    left: 0.75rem;
    text-align: left;
    font-size: 2.4rem;
    opacity: 0.8;
  }

  @media only screen and (max-width: 920px) {
    .vsrg-floating-score {
      top: 20%;
      font-size: 1.8rem;
    }

    .vsrg-floating-combo {
      font-size: 1.8rem;
    }
  }
</style>
