<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { ClassValue } from 'svelte/elements';
  import { setMenuContext, type MenuContextState } from './menuContext';

  // `style` targets the outer `.menu-wrapper` div. A `menuStyle` prop used to
  // target the inner `.menu` div as well; it carried nothing but
  // `justify-content: flex-end`, which is now the shared rule for every rail
  // (App.css, `.menu`), and as an INLINE declaration it was unreachable to the
  // portrait shell that has to re-lay-out the same rail as a bottom bar - that
  // block needed !important purely to outrank it. Keep it that way: rail layout
  // belongs in App.css, not in a per-page prop.
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
  <div class={['menu', isVisible && 'menu-visible']} style="opacity:{opacity ?? ''}">
    {@render children?.()}
  </div>
  {@render panel?.()}
</div>
