<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { setMenuContext, type MenuContextState } from './menuContext';

  // `style` targets the outer `.menu-wrapper` div; `menuStyle` targets the
  // inner `.menu` div (renamed from `style` since both live in one
  // component here).
  //
  // `wrapperEl` exposes `.menu-wrapper` via $bindable so a consumer can
  // apply its own `use:clickOutside` (or similar) externally - this
  // component doesn't wire one itself.
  let {
    children,
    panel,
    hamburger,
    wrapperEl = $bindable(),
    class: cls = '',
    style = '',
    menuStyle = '',
    opacity,
    current,
    setCurrent,
    open,
    setOpen,
    visible,
    setVisible,
  }: {
    children?: Snippet;
    panel?: Snippet;
    hamburger?: Snippet;
    wrapperEl?: HTMLDivElement;
    class?: ClassValue;
    style?: string;
    menuStyle?: string;
    opacity?: string;
  } & Partial<MenuContextState> = $props();

  const isVisible = $derived(visible ?? true);

  // Context is provided directly from this component's own (possibly controlled-via-props)
  // state via getters, so descendants (MenuItem/MenuPanelWrapper/MenuPanel, rendered through
  // `children`/`panel`) always see the current value without a manual re-provide step.
  setMenuContext({
    get current() {
      return current ?? '';
    },
    setCurrent: (c) => setCurrent?.(c),
    get open() {
      return open ?? false;
    },
    setOpen: (o) => setOpen?.(o),
    get visible() {
      return isVisible;
    },
    setVisible: (v) => setVisible?.(v),
  });
</script>

<div class={['menu-wrapper', cls]} {style} bind:this={wrapperEl}>
  {@render hamburger?.()}
  <div class={['menu', isVisible && 'menu-visible']} style="opacity:{opacity ?? ''};{menuStyle}">
    {@render children?.()}
  </div>
  {@render panel?.()}
</div>
