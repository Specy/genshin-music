<script lang="ts">
    import type {Snippet} from 'svelte'
    import {getMenuContext} from './menuContext'

    // Old: src/components/shared/Menu/MenuPanel.tsx (MenuPanelWrapper export). Not exercised by
    // this task's own SimpleMenu (which has no side panel), but part of "the menu system" that
    // Phase-4 page menus (ComposerMenu.tsx, PlayerMenu.tsx, etc.) build on - see MenuSidebar.svelte's
    // `panel` snippet prop, the intended sibling slot for this component.
    let {
        children,
        className = '',
        style = '',
    }: {
        children?: Snippet
        className?: string
        style?: string
    } = $props()

    const ctx = getMenuContext()
    const isOpen = $derived(ctx.open && ctx.visible)
</script>

<div class="side-menu {isOpen ? 'side-menu-open' : ''} {className}" style={style}>
    {@render children?.()}
</div>
