<script module lang="ts">
  // App-wide "at most one dropdown open" rule: opening any instance closes the
  // one that was open before it. Without this each instance only knew its own
  // `isActive`, so the 3-dots menus of several song rows stayed open together
  // (clicking another row's toggle is a <button>, which `hasFocusable` below
  // deliberately exempts from click-outside, so nothing closed the first one).
  type OpenDropdown = { close: () => void };

  // Plain module variable, not `$state`: nothing renders from it, it only routes
  // one close call to one instance. Only a click ever writes it, so it stays null
  // through prerendering.
  let openDropdown: OpenDropdown | null = null;

  function openExclusively(instance: OpenDropdown) {
    // Claim the token BEFORE closing the previous instance: that instance's
    // close() calls releaseIfOpen on itself, which would otherwise clear the
    // token we just set and leave nothing registered as open.
    const previous = openDropdown;
    openDropdown = instance;
    if (previous && previous !== instance) previous.close();
  }

  function releaseIfOpen(instance: OpenDropdown) {
    if (openDropdown === instance) openDropdown = null;
  }
</script>

<script lang="ts">
  import type { Component, Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import SongActionButton from '../inputs/SongActionButton.svelte';

  // `.floating-dropdown*` CSS lives in global App.css.
  //
  // QUIRK: the toggle button below MUST use SongActionButton, not AppButton
  // - AppButton compiles fine (a compatible prop superset) but renders
  // `.app-button` instead of `.song-button`, which carries different
  // padding/min-width and makes the "..." toggle ~2.5x wider than the icon
  // buttons beside it.
  let {
    children,
    Icon,
    class: cls = '',
    style = '',
    onClose,
    tooltip,
    offset = 3,
    ignoreClickOutside = false,
  }: {
    children: Snippet;
    tooltip?: string;
    Icon: Component;
    class?: ClassValue;
    offset?: number;
    style?: string;
    ignoreClickOutside?: boolean;
    onClose?: () => void;
  } = $props();

  let isActive = $state(false);
  let overflows = $state(false);
  let ref: HTMLDivElement | undefined = $state();

  // Own local click-outside handling below (hasFocusable + the $effect
  // further down), not the shared `clickOutside` action from
  // $lib/utils/clickOutside.ts - `ignoreClickOutside` here is checked inside
  // the click callback itself, not via the action's `active` gating.
  function hasFocusable(e: MouseEvent): boolean {
    const path = e.composedPath();
    return path.some((el) => {
      const element = el as HTMLElement;
      if (element.tagName === 'INPUT' || element.tagName === 'BUTTON') {
        return !(element.classList?.contains?.('include_click_outside') ?? false);
      }
      return element.classList?.contains?.('ignore_click_outside') ?? false;
    });
  }

  // Identity for the module-level single-open token; `close` is what another
  // instance calls when it supersedes this one. Note this ignores
  // `ignoreClickOutside`: being superseded is not a click-outside, and the
  // single-open rule wins even mid-rename - the caller's `onClose` still runs,
  // so its rename state is reset rather than stranded on a closed menu.
  const instance: OpenDropdown = { close };

  function close() {
    if (!isActive) return;
    isActive = false;
    releaseIfOpen(instance);
    onClose?.();
  }

  function handleClickOutside(e: MouseEvent) {
    if (ignoreClickOutside) return;
    const clickedOutside = !(ref?.contains(e.target as Node) ?? false);
    if (clickedOutside) {
      if (hasFocusable(e)) return;
      close();
    }
  }

  $effect(() => {
    if (!isActive) return;
    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
      // Also covers destroy-while-open: a token left pointing at a torn-down
      // instance would have the next `openExclusively` close a dead component.
      // No `onClose` here - whatever this component is inside is going away.
      releaseIfOpen(instance);
    };
  });

  $effect(() => {
    void isActive;
    if (!ref) return;
    const bounds = ref.getBoundingClientRect();
    const overflowsBottom = bounds.top + bounds.height > (window.innerHeight ?? 0);
    const overflowsTop = bounds.top - bounds.height - 2 * 16 < 0;
    // if it overflows on top, force it to overflow on bottom
    overflows = overflowsTop ? false : overflowsBottom;
  });

  const transform = $derived(
    `translateX(calc(-100% + ${offset}rem)) ${overflows ? 'translateY(calc(-100% - 2rem))' : ''}`
  );

  function toggle() {
    if (isActive) {
      close();
      return;
    }
    isActive = true;
    openExclusively(instance);
  }
</script>

<div class={[cls, 'floating-dropdown', isActive && 'floating-dropdown-active']}>
  <!-- the `;` after {style} is load-bearing: callers pass declarations without a trailing one
       (e.g. the song rows' `background-color:...`), so without it the two run together into a
       single invalid declaration and the browser drops the accent background, leaving the X
       icon in --accent-text on the untouched default background. -->
  <SongActionButton
    style="margin:0;{style};{isActive
      ? 'background-color:var(--accent);color:var(--accent-text);'
      : ''}"
    onclick={toggle}
    ariaLabel={isActive ? 'Close' : 'Open'}
    {tooltip}
  >
    {#if isActive}
      <svg
        stroke="currentColor"
        fill="currentColor"
        stroke-width="0"
        viewBox="0 0 352 512"
        height="1em"
        width="1em"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M242.72 256l100.07-100.07c12.28-12.28 12.28-32.19 0-44.48l-22.24-22.24c-12.28-12.28-32.19-12.28-44.48 0L176 189.28 75.93 89.21c-12.28-12.28-32.19-12.28-44.48 0L9.21 111.45c-12.28 12.28-12.28 32.19 0 44.48L109.28 256 9.21 356.07c-12.28 12.28-12.28 32.19 0 44.48l22.24 22.24c12.28 12.28 32.2 12.28 44.48 0L176 322.72l100.07 100.07c12.28 12.28 32.2 12.28 44.48 0l22.24-22.24c12.28-12.28 12.28-32.19 0-44.48L242.72 256z"
        />
      </svg>
    {:else}
      <Icon />
    {/if}
  </SongActionButton>
  <div
    bind:this={ref}
    class="floating-dropdown-children"
    style="transform:{transform};--existing-transform:{transform};transform-origin:{overflows
      ? 'bottom'
      : 'top'}"
  >
    {@render children()}
  </div>
</div>
