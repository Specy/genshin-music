<script module lang="ts">
  import type { Snippet } from 'svelte';

  // `comboBoxItem`/`comboBoxTitle` are snippets defined below and
  // re-exported here - the Svelte 5.5+ mechanism for exporting a snippet
  // from a module block. `comboBoxItem` takes a plain `selected: boolean`,
  // not a generic item object, because its only real call site only ever
  // reads that one field.
  export { comboBoxItem, comboBoxTitle };
</script>

<script lang="ts" generics="T">
  import type { ClassValue } from 'svelte/elements';
  import { clickOutside } from '$lib/utils/clickOutside';

  interface ComboBoxItemData<T> {
    item: T;
    selected: boolean;
  }

  interface ComboBoxProps<T> {
    items: ComboBoxItemData<T>[];
    position?: 'left' | 'right' | 'center';
    title: Snippet;
    onChange: (items: ComboBoxItemData<T>[]) => void;
    children: Snippet<[ComboBoxItemData<T>, () => void]>;
    style?: string;
    class?: ClassValue;
  }

  const positionMap = {
    left: 'left:0',
    right: 'right:0;transform:translateX(100%)',
    center: 'left:50%;transform:translateX(-50%)',
  } satisfies Record<'left' | 'right' | 'center', string>;

  let {
    items,
    onChange,
    children,
    title,
    position = 'left',
    style = '',
    class: cls = '',
  }: ComboBoxProps<T> = $props();

  let open = $state(false);
</script>

{#snippet comboBoxItem(selected: boolean, onClick: () => void, children: Snippet)}
  <button onclick={onClick} class={['combo-box-item', selected && 'combo-box-item-selected']}>
    {@render children()}
  </button>
{/snippet}

{#snippet comboBoxTitle(children: Snippet)}
  <div class="combo-box-title-item">
    {@render children()}
  </div>
{/snippet}

<div
  use:clickOutside={{ active: open, onOutside: () => (open = false) }}
  class={['combo-box-wrapper', cls]}
  {style}
>
  <button onclick={() => (open = !open)} class="combo-box-title">
    {@render title()}
  </button>
  {#if open}
    <div class="combo-box-items" style={positionMap[position]}>
      {#each items as item, i (i)}
        {@render children(item, () => {
          onChange(items.map((it, j) => (i === j ? { ...it, selected: !it.selected } : it)));
        })}
      {/each}
    </div>
  {/if}
</div>

<style>
  /* No :global() needed anywhere here, even though comboBoxItem/
       comboBoxTitle are rendered from other files via {@render}: a snippet's
       compiled style scope stays with the file that defines it, not the file
       that renders it. */
  .combo-box-title {
    background-color: transparent;
    padding: 0;
    margin: 0;
    border: none;
  }

  .combo-box-title-item {
    padding: 0.5rem 1rem;
    transition: background-color 0.3s;
    cursor: pointer;
    color: var(--primary-text);
    background-color: var(--primary);
    border-radius: 0.3rem;
  }

  /* Pointer-only (see App.css's `.app-button:hover`): the trigger stays mounted under the open
     list, so on touch it would hold the raised background for as long as the dropdown is up. */
  @media (hover: hover) {
    .combo-box-title-item:hover {
      background-color: var(--primary-layer-10);
    }
  }

  .combo-box-wrapper {
    position: relative;
    width: fit-content;
  }

  .combo-box-items {
    display: flex;
    gap: 0.3rem;
    flex-direction: column;
    position: absolute;
    background-color: var(--primary);
    box-shadow: 0 0.5rem 0.7rem 0.5rem rgba(0, 0, 0, 0.2);
    transform: translateY(0.2rem);
    min-width: 100%;
    padding: 0.3rem;
    border-radius: 0.4rem;
    animation: fadeIn 0.2s;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      translate: 0 -0.2rem;
    }
    to {
      opacity: 1;
      translate: 0 0;
    }
  }

  .combo-box-item {
    padding: 0.5rem;
    transition: background-color 0.3s;
    background-color: var(--primary);
    cursor: pointer;
    border-radius: 0.2rem;
    color: var(--primary-text);
    border: none;
  }

  /* Pointer-only, and here the `:not()` is the point: the rule exists to say "not the selected
     one", so a latched hover on touch would leave an UNSELECTED item painted beside the selected
     one and two rows would claim to be picked. */
  @media (hover: hover) {
    .combo-box-item:hover:not(.combo-box-item-selected) {
      background-color: var(--primary-layer-20);
    }
  }

  .combo-box-item:last-child {
    border-bottom: none;
  }

  .combo-box-item-selected {
    background-color: var(--secondary);
    color: var(--secondary-text);
    border-radius: 0.2rem;
  }
</style>
