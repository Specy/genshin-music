<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { blurEvent } from '$core/utils/Utilities';

  // Unlike MenuItem (sibling file), this never reads menu context - it's a
  // plain action button styled like a menu item, for actions that don't
  // switch a "current" panel (back/discord/home-open/close-home).
  let {
    class: cls = '',
    style = '',
    onclick,
    children,
    ariaLabel,
    // For a button that is still meaningful to show but has nothing to do right now - the rail's
    // home button while '/' IS the current page. A real `disabled`, not a swallowed onclick, so
    // the button also leaves the tab order and stops answering the pointer.
    disabled = false,
  }: {
    class?: ClassValue;
    style?: string;
    onclick?: () => void;
    children?: Snippet;
    ariaLabel: string;
    disabled?: boolean;
  } = $props();

  function handleClick(e: MouseEvent) {
    blurEvent(e);
    onclick?.();
  }
</script>

<button class={['menu-item', cls]} {style} aria-label={ariaLabel} {disabled} onclick={handleClick}>
  {@render children?.()}
</button>
