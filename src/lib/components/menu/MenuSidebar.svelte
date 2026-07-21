<script lang="ts">
    import type {Snippet} from 'svelte'
    import {setMenuContext, type MenuContextState} from './menuContext'

    // Old: src/components/shared/Menu/MenuContent.tsx, which exported TWO components -
    // MenuSidebar (the narrow icon column, `.menu`) and MenuContextProvider (the context-setting
    // outer wrapper, `.menu-wrapper`). The new file list collapses that file down to a single
    // "MenuSidebar.svelte", and every real old call site (SimpleMenu.tsx, ComposerMenu.tsx,
    // PlayerMenu.tsx, etc.) nested MenuContextProvider directly around MenuSidebar (plus, for the
    // "full" menus, a sibling MenuPanelWrapper under the same provider) - so both are folded into
    // this one component, rendering both old divs together.
    //
    // Prop mapping (renamed only where folding the two old prop sets into one made the original
    // names ambiguous):
    //   className / style   -> old MenuContextProviderProps (Partial<MenuContextState> &
    //                           Stylable): the outer `.menu-wrapper` div. This is the "whole
    //                           sidebar" customization point real callers used (e.g. SimpleMenu
    //                           forwarding its own className/style prop).
    //   menuStyle / opacity -> old MenuProps (style/opacity, on MenuSidebar itself): the inner
    //                           `.menu` div. Renamed old `style` to `menuStyle` only because
    //                           `style` was already claimed above for the outer div now that both
    //                           live in one component.
    //   current/setCurrent/open/setOpen/visible/setVisible -> unchanged old
    //                           MenuContextProviderProps names, all optional exactly as before
    //                           (Partial<MenuContextState<T>>), defaulting the same way the old
    //                           _MenuContextProvider did.
    //   panel               -> new: an optional sibling snippet rendered inside `.menu-wrapper`
    //                           alongside `.menu`, for a Phase-4 MenuPanelWrapper to occupy (see
    //                           ComposerMenu.tsx/PlayerMenu.tsx: MenuPanelWrapper is always a
    //                           sibling of MenuSidebar under the same MenuContextProvider). Unused
    //                           by this task's own SimpleMenu, which has no side panel.
    //   hamburger            -> new (P4a Task 3, P3 Task 8 carry-forward): an optional sibling
    //                           snippet rendered FIRST inside `.menu-wrapper`, before `.menu`. 4 of
    //                           the 6 old page menus (Composer/VsrgComposer/VsrgPlayer/ZenKeyboard
    //                           - e.g. old ZenKeyboardMenu.tsx) render a `.hamburger`/
    //                           `.hamburger-top` div as MenuContextProvider's FIRST child, ahead of
    //                           <MenuSidebar>/<MenuPanelWrapper> - this snippet is that slot.
    //                           Unused (undefined) by SimpleMenu, which has no hamburger of its own.
    //   wrapperEl            -> new (same carry-forward): a $bindable exposing the `.menu-wrapper`
    //                           div itself - the Svelte-action equivalent of old
    //                           MenuContextProvider's forwarded `ref` (old: useClickOutside's
    //                           returned ref, attached via `ref={menuRef}`, e.g. ZenKeyboardMenu.tsx
    //                           again). NOT wired to the `clickOutside` action here - the pages that
    //                           need it (Task 8/9) bind this and apply `use:clickOutside`
    //                           themselves once they exist.
    let {
        children,
        panel,
        hamburger,
        wrapperEl = $bindable(),
        className = '',
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
        children?: Snippet
        panel?: Snippet
        hamburger?: Snippet
        wrapperEl?: HTMLDivElement
        className?: string
        style?: string
        menuStyle?: string
        opacity?: string
    } & Partial<MenuContextState> = $props()

    const isVisible = $derived(visible ?? true)

    // Context is provided directly from this component's own (possibly controlled-via-props)
    // state via getters, so descendants (MenuItem/MenuPanelWrapper/MenuPanel, rendered through
    // `children`/`panel`) always see the current value without a manual re-provide step.
    setMenuContext({
        get current() {
            return current ?? ''
        },
        setCurrent: (c) => setCurrent?.(c),
        get open() {
            return open ?? false
        },
        setOpen: (o) => setOpen?.(o),
        get visible() {
            return isVisible
        },
        setVisible: (v) => setVisible?.(v),
    })
</script>

<div class="menu-wrapper {className}" style={style} bind:this={wrapperEl}>
    {@render hamburger?.()}
    <div class="menu {isVisible ? 'menu-visible' : ''}" style="opacity:{opacity ?? ''};{menuStyle}">
        {@render children?.()}
    </div>
    {@render panel?.()}
</div>
