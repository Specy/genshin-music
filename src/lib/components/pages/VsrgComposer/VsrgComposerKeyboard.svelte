<script lang="ts">
  // A pure, stateless "mini keyboard" grid used by VsrgTop.svelte's sidebar to highlight which
  // notes the currently-selected hit object plays.
  let {
    elements,
    selected,
    perRow,
    onClick,
  }: {
    elements: number[];
    selected?: number[];
    perRow: number;
    onClick: (index: number) => void;
  } = $props();
</script>

<div
  class="vsrg-keyboard"
  style="grid-template-columns:repeat({perRow}, 1fr);grid-template-rows:repeat({Math.ceil(
    elements.length / perRow
  )}, 1fr);opacity:{selected ? 1 : 0.5};pointer-events:{selected ? 'all' : 'none'};cursor:{selected
    ? 'pointer'
    : 'not-allowed'}"
>
  {#each elements as el (el)}
    <!-- A plain colored square, no text/icon/aria-label by design - not adding a label this
             control never had. -->
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button
      onclick={() => onClick(el)}
      style={selected?.includes(el) ? 'background-color:var(--accent)' : ''}
    ></button>
  {/each}
</div>

<style>
  .vsrg-keyboard {
    margin-top: auto;
    display: grid;
    gap: 0.15rem;
  }

  .vsrg-keyboard button {
    width: 100%;
    transition: all 0.2s;
    cursor: pointer;
    border-radius: 0.2rem;
    aspect-ratio: 1;
    min-height: 1.4rem;
    background-color: var(--icon-color);
    border: none;
  }

  @media only screen and (max-width: 1000px) {
    .vsrg-keyboard button {
      aspect-ratio: unset;
      min-height: 1.5rem;
    }
  }
</style>
