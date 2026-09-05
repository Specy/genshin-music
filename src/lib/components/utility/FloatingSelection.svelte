<script lang="ts" generics="T extends string | number">
  import type { Snippet } from 'svelte';
  import { clickOutside } from '$lib/utils/clickOutside';
  import IconButton from '../inputs/IconButton.svelte';

  // The icon-triggered floating value picker ZenKeyboardMenu.svelte uses
  // for its pitch/instrument pickers.
  //
  // `Icon` here is a Snippet, not a Component (contrast
  // FloatingDropdown.svelte's `Icon: Component`) - a Snippet is this
  // migration's normal way to pass one-off inlined-SVG icon content across
  // a component boundary; Component is reserved for cases where a real
  // .svelte file is required (see icons/FaEllipsisH.svelte).
  //
  // `use:clickOutside` is applied directly on this component's own root div
  // below - no manual $effect indirection needed, since this component
  // (unlike some sibling menu files) renders its own wrapper directly
  // rather than binding into a child component's DOM node.
  let {
    items,
    value,
    onChange,
    Icon,
  }: {
    items: { value: T; label: string; key?: string }[];
    value: T;
    Icon: Snippet;
    onChange: (val: T) => void;
  } = $props();

  let open = $state(false);

  function selectItem(item: T) {
    onChange(item);
    open = false;
  }
</script>

<div
  class="column"
  style="align-items:flex-end;gap:0.5rem"
  use:clickOutside={{ active: open, onOutside: () => (open = false) }}
>
  <IconButton
    onclick={() => (open = !open)}
    style="z-index:2;border-radius:1rem;border:solid 0.1rem var(--secondary)"
    toggled={open}
  >
    {@render Icon()}
  </IconButton>
  {#if open}
    <div class="floating-selection-card" style="max-height:75vh">
      {#each items as item (item.key ?? item.label)}
        <button
          class="floating-selection-card-item"
          style={value === item.value
            ? 'background-color:var(--accent);color:var(--accent-text)'
            : ''}
          onclick={() => selectItem(item.value)}
        >
          {item.label}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .floating-selection-card {
    display: flex;
    flex-direction: column;
    background: var(--primary);
    color: var(--primary-text);
    border: 0.1rem solid var(--secondary);
    border-radius: 0.4rem;
    animation: fadeIn 0.2s;
    overflow-y: auto;
  }

  .floating-selection-card::-webkit-scrollbar-thumb {
    background: var(--secondary);
  }

  .floating-selection-card::-webkit-scrollbar {
    width: 0.2rem;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-0.3rem);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .floating-selection-card-item {
    padding: 0.4rem;
    background: var(--primary);
    cursor: pointer;
    color: var(--primary-text);
    border: none;
    border-bottom: 0.1rem solid var(--secondary);
  }

  .floating-selection-card-item:hover {
    background: var(--primary-5);
  }

  .floating-selection-card-item:last-child {
    border-bottom: none;
  }
</style>
