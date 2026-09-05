<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  // The star decoration is a local snippet, not a separate component: it
  // has no consumers outside this file, and Svelte can't export two named
  // components from one file.
  //
  // No ref-forwarding: a future caller can reach the root div directly via
  // bind:this if one is ever needed.
  interface DecoratedCardProps {
    children: Snippet;
    size?: string;
    decorationColor?: string;
    isRelative?: boolean;
    onclick?: () => void;
    offset?: string;
    class?: ClassValue;
    style?: string;
  }

  let {
    children,
    size,
    decorationColor,
    isRelative = true,
    onclick,
    offset = '0',
    class: cls,
    style = '',
  }: DecoratedCardProps = $props();

  const starStyle = $derived(
    `position:absolute;width:${size ?? '0.8rem'};height:${size ?? '0.8rem'};color:${decorationColor ?? 'var(--secondary)'}`
  );

  // `onclick` is optional (most decorated cards are purely decorative), so
  // role/tabindex/keydown are only added when a click handler is actually
  // supplied - a purely decorative card stays out of the tab order instead
  // of gaining meaningless keyboard-focus stops.
  function handleKeydown(event: KeyboardEvent) {
    if ((event.key === 'Enter' || event.key === ' ') && onclick) {
      event.preventDefault();
      onclick();
    }
  }
</script>

{#snippet starBorderSvg(extraStyle: string)}
  <svg
    style="{starStyle};{extraStyle}"
    viewBox="0 0 121 121"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M115.674 57.8647C117.754 58.9629 117.77 61.9275 115.739 63.113C89.4847 78.4378 76.7901 90.8857 63.8487 114.065C62.3174 116.808 58.346 116.913 56.6888 114.244C41.4088 89.6383 28.3853 77.334 3.39872 62.2065C2.08229 61.4095 2.11774 59.4753 3.467 58.7352C46.8754 34.9254 72.7237 35.1787 115.674 57.8647Z"
    />
  </svg>
{/snippet}

<!-- role/tabindex/onkeydown below are all conditioned on the same `onclick`
     check together (see above): the element is only ever focusable when it's
     actually interactive. The static analyzer only sees a dynamic `role`
     expression, not that it's correlated with tabindex, and conservatively
     assumes the element could stay "noninteractive" while still gaining a
     tabindex - which never happens at runtime, hence the ignore below. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  style="{isRelative ? 'position:relative;' : ''}{style}"
  class={cls}
  {onclick}
  role={onclick ? 'button' : undefined}
  tabindex={onclick ? 0 : undefined}
  onkeydown={onclick ? handleKeydown : undefined}
>
  {@render children()}
  {@render starBorderSvg(
    `top:${offset};right:${offset};transform:translate(50%, -50%) rotate(-135deg);`
  )}
  {@render starBorderSvg(
    `top:${offset};left:${offset};transform:translate(-50%, -50%) rotate(135deg);`
  )}
  {@render starBorderSvg(
    `bottom:${offset};right:${offset};transform:translate(50%, 50%) rotate(-45deg);`
  )}
  {@render starBorderSvg(
    `bottom:${offset};left:${offset};transform:translate(-50%, 50%) rotate(45deg);`
  )}
</div>
