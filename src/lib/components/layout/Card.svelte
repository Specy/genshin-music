<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { ThemeProvider, type ThemeKeys } from '$core/theme/ThemeProvider.svelte';

  // A caller's `style` is appended after the computed styles below, so a
  // caller's own declaration still wins on any shared CSS property.
  interface CardProps {
    /**
     * A theme key, NOT a css color - the card's text color is whatever the
     * theme pairs with that background, so the two can never drift apart.
     * `'none'` makes an outlined card: no fill, text inherited from the page.
     */
    background?: ThemeKeys | 'none';
    /** A theme key: outlines the card in that color. */
    border?: ThemeKeys;
    padding?: string;
    radius?: string;
    gap?: string;
    /** Lays the children out in a row instead of the default column. */
    row?: boolean;
    class?: ClassValue;
    style?: string;
    children?: Snippet;
  }

  let {
    background = 'primary',
    border,
    padding = '1rem',
    radius = '0.6rem',
    gap,
    row = false,
    class: cls = '',
    style = '',
    children,
  }: CardProps = $props();

  // ThemeVars publishes --<css> and --<css>-text for every theme key, and `css` is the theme's
  // own dashed spelling of that key (menu_background -> menu-background), so it is read from
  // the theme rather than guessed from the key.
  const cssName = $derived(background === 'none' ? null : ThemeProvider.state.data[background].css);
  const borderCssName = $derived(
    border !== undefined ? ThemeProvider.state.data[border].css : null
  );

  const computedStyle = $derived(
    [
      //no declaration at all when there is no fill, so the card inherits both from the page
      cssName !== null ? `background:var(--${cssName})` : '',
      cssName !== null ? `color:var(--${cssName}-text)` : '',
      borderCssName !== null ? `border:solid 0.1rem var(--${borderCssName})` : '',
      `border-radius:${radius}`,
      `padding:${padding}`,
      gap !== undefined ? `gap:${gap}` : '',
    ]
      .filter(Boolean)
      .join(';')
  );
</script>

<div class={[cls, row ? 'row' : 'column']} style="{computedStyle};{style}">
  {@render children?.()}
</div>
