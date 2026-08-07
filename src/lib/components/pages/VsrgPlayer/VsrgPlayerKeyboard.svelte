<script module lang="ts">
  export type VsrgKeyboardLayout = 'line' | 'circles';
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { KeyboardProvider } from '$lib/providers/KeyboardProvider';
  import { vsrgPlayerStore } from '$stores/VsrgPlayerStore.svelte';
  import { suppressNativeTouch } from '$cmp/suppressNativeTouch';

  interface VsrgPlayerKeyboardProps {
    hitObjectSize: number;
    keyboardLayout: VsrgKeyboardLayout;
    offset: number;
    verticalOffset: number;
    horizontalOffset: number;
  }

  let {
    hitObjectSize,
    offset,
    keyboardLayout,
    verticalOffset,
    horizontalOffset,
  }: VsrgPlayerKeyboardProps = $props();

  // `vsrgPlayerStore.keyboard` is `$state.raw` (see the field's comment: the player's renderer
  // indexes it per hit object per frame), so a press publishes by ASSIGNING a new array carrying a
  // new key object at the pressed index. This derived and the `{@const}` in the snippet below both
  // read through that array, which is what makes a press repaint the key it belongs to.
  const layout = $derived(vsrgPlayerStore.keyboard);
  const perSide = $derived(Math.ceil(layout.length / 2));
  const left = $derived(layout.slice(0, perSide));
  // QUIRK: relies on layout.length always being even (VSRG only supports 4/6-key layouts) - this
  // simplified slice(perSide) would silently split off-by-one if an odd key count is ever
  // introduced.
  const right = $derived(layout.slice(perSide));

  // Registered ONCE here, not re-registered on layout change: the callbacks below read
  // vsrgPlayerStore.keyboard fresh from the store on every keypress rather than closing over a
  // captured layout array, so they can never go stale across a key-count change (4 vs 6 keys).
  onMount(() => {
    KeyboardProvider.listen(
      ({ letter, event }) => {
        if (event.repeat) return;
        const index = vsrgPlayerStore.keyboard.findIndex((l) => l.key === letter);
        if (index >= 0) vsrgPlayerStore.pressKey(index);
      },
      { type: 'keydown', id: 'vsrg-player-keyboard' }
    );
    KeyboardProvider.listen(
      ({ letter, event }) => {
        if (event.repeat) return;
        const index = vsrgPlayerStore.keyboard.findIndex((l) => l.key === letter);
        if (index >= 0) vsrgPlayerStore.releaseKey(index);
      },
      { type: 'keyup', id: 'vsrg-player-keyboard' }
    );
    return () => {
      KeyboardProvider.unregisterById('vsrg-player-keyboard');
    };
  });
</script>

{#snippet keyboardKey(index: number, layoutType: VsrgKeyboardLayout, size: number)}
  {@const data = vsrgPlayerStore.keyboard[index]}
  {#if layoutType === 'circles'}
    <button
      class="vsrg-player-key-hitbox-circle flex-centered"
      style="padding-bottom:{offset}px"
      {@attach suppressNativeTouch}
      onpointerdown={() => vsrgPlayerStore.pressKey(index)}
      onpointerup={() => vsrgPlayerStore.releaseKey(index)}
      onpointerleave={() => vsrgPlayerStore.releaseKey(index)}
    >
      <div
        class={['vsrg-player-key-circle', data?.isPressed && 'vsrg-key-pressed']}
        style="width:{size}px;height:{size}px"
      >
        {data?.key}
      </div>
    </button>
  {:else if layoutType === 'line'}
    <!-- A plain colored strip, no text/icon/aria-label by design - not adding a label this
             control never had. -->
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button
      class="vsrg-player-key-hitbox-line"
      {@attach suppressNativeTouch}
      onpointerdown={() => vsrgPlayerStore.pressKey(index)}
      onpointerup={() => vsrgPlayerStore.releaseKey(index)}
      onpointerleave={() => vsrgPlayerStore.releaseKey(index)}
    >
      <div
        class={['vsrg-player-key-line', data?.isPressed && 'vsrg-key-pressed']}
        style="height:{offset}px"
      ></div>
    </button>
  {/if}
{/snippet}

{#if keyboardLayout === 'line'}
  <div
    class="vsrg-player-keyboard-control-left"
    style="--vertical-offset:calc(-{perSide * 2}vw + {verticalOffset *
      0.1}rem);--horizontal-offset:{horizontalOffset * 0.1 + 1}rem"
  >
    {#each left as letter (`${letter.key}-${layout.length}`)}
      {@render keyboardKey(letter.index, 'circles', hitObjectSize)}
    {/each}
  </div>
  <div
    class="vsrg-player-keyboard-control-right"
    style="--vertical-offset:calc(-{perSide * 2}vw + {verticalOffset *
      0.1}rem);--horizontal-offset:{horizontalOffset * 0.1 + 1}rem"
  >
    {#each right as letter (`${letter.key}-${layout.length}`)}
      {@render keyboardKey(letter.index, 'circles', hitObjectSize)}
    {/each}
  </div>
{/if}
<div class="vsrg-player-keyboard-circles">
  {#each layout as letter (`${letter.key}-${layout.length}`)}
    {@render keyboardKey(letter.index, keyboardLayout, hitObjectSize)}
  {/each}
</div>

<style>
  .vsrg-player-keyboard-circles {
    position: absolute;
    bottom: 0;
    display: flex;
    z-index: 2;
    width: 50vw;
    max-width: 35rem;
  }

  .vsrg-player-keyboard-control-left,
  .vsrg-player-keyboard-control-right {
    display: flex;
    flex-direction: column;
    position: absolute;
    bottom: var(--vertical-offset);
  }

  .vsrg-player-keyboard-control-left {
    left: var(--horizontal-offset);
    transform-origin: top left;
    transform: rotate(-35deg);
  }

  .vsrg-player-keyboard-control-right {
    flex-direction: column-reverse;
    right: var(--horizontal-offset);
    transform-origin: top right;
    transform: rotate(35deg);
  }

  .vsrg-player-keyboard-control-left .vsrg-player-key-circle,
  .vsrg-player-keyboard-control-right .vsrg-player-key-circle {
    width: 8vw !important;
    max-width: 5rem;
    height: 8vw !important;
    max-height: 5rem;
  }

  .vsrg-player-keyboard-control-left .vsrg-player-key-circle {
    transform: rotate(35deg);
  }

  .vsrg-player-keyboard-control-right .vsrg-player-key-circle {
    transform: rotate(-35deg);
  }

  /* A second, old .vsrg-player-keyboard-circles rule was empty (only a dead, commented-out
       declaration) - kept as a plain comment rather than an empty ruleset, since Svelte's compiler
       flags those. */

  .vsrg-player-key-hitbox-circle,
  .vsrg-player-key-hitbox-line {
    cursor: pointer;
    border: none;
    background: none;
    padding: 0;
    margin: 0;
    flex: 1;
  }

  .vsrg-player-key-hitbox-line {
    height: 50vh;
    display: flex;
    align-items: flex-end;
  }

  .vsrg-player-key-hitbox-line:nth-child(odd) {
    filter: brightness(0.8);
  }

  /* QUIRK: this rule is intentionally duplicated in VsrgKey.svelte's own style block too - each
       is a separately-scoped style block, so neither can reach the other's elements. It was once
       dropped from this file on the mistaken assumption that Svelte's scoped CSS could share a
       rule across files the way CSS Modules did; the result was a real, live regression (the
       default "line" keyboard layout's wing buttons lost every style below except the explicit
       !important overrides above, for every user - verified via getComputedStyle). Do not remove
       this rule as a "duplicate" without keeping VsrgKey.svelte's own copy in sync. */
  .vsrg-player-key-circle {
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.4rem;
    background-color: var(--background-layer-10);
    color: var(--background-text);
    width: 100%;
    height: 100%;
    border-radius: 50rem;
    margin: -0.15rem;
    border: solid 0.15rem var(--secondary);
  }

  .vsrg-player-key-line {
    width: 100%;
    height: 100%;
    background-color: var(--secondary);
  }

  .vsrg-key-pressed {
    background-color: var(--accent);
    color: var(--accent-text);
  }
</style>
