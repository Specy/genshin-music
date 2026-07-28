<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';

  // A caller's `style` is appended after the computed styles below, so a
  // caller's own declaration still wins on any shared CSS property.
  interface CardProps {
    background?: string;
    color?: string;
    radius?: string;
    padding?: string;
    gap?: string;
    row?: boolean;
    border?: string;
    withShadow?: boolean;
    class?: ClassValue;
    style?: string;
    children?: Snippet;
  }

  let {
    background = 'var(--primary)',
    color = 'var(--primary-text)',
    gap,
    radius = '0.4rem',
    padding,
    class: cls = '',
    style = '',
    row = false,
    border,
    children,
    withShadow,
  }: CardProps = $props();

  const computedStyle = $derived(
    [
      `background:${background}`,
      `color:${color}`,
      gap !== undefined ? `gap:${gap}` : '',
      `border-radius:${radius}`,
      padding !== undefined ? `padding:${padding}` : '',
      border !== undefined ? `border:${border}` : '',
      withShadow ? 'box-shadow:0 0 0.5rem 0.2rem rgba(var(--shadow-rgb), 0.25)' : '',
    ]
      .filter(Boolean)
      .join(';')
  );
</script>

<div class={[cls, row ? 'row' : 'column']} style="{computedStyle};{style}">
  {@render children?.()}
</div>
