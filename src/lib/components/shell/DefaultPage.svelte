<script lang="ts">
    import type {Snippet} from 'svelte'
    import SimpleMenu from './SimpleMenu.svelte'

    // Old: src/components/shared/pagesLayout/DefaultPage.tsx. Deliberately does NOT wrap
    // AppBackground (theme/AppBackground.svelte, already ported in P3 Task 4) - verified against
    // the old blob, which never references it either; AppBackground is wired directly by
    // individual page components in Phase 4, not by this shared chrome.
    let {
        excludeMenu = false,
        children,
        menu,
        className = '',
        style = '',
        contentStyle = '',
        cropped = true,
    }: {
        excludeMenu?: boolean
        children?: Snippet
        menu?: Snippet
        className?: string
        style?: string
        contentStyle?: string
        cropped?: boolean
    } = $props()

    const hasMenu = $derived(Boolean(menu) || !excludeMenu)
    // old: `!cropped ? {...style, padding: 0} : style` - padding:0 applied first so an explicit
    // `style` prop (appended after, CSS-cascade-last-wins) can still override it, same effective
    // precedence as the old object-spread order.
    const pageStyle = $derived(cropped ? style : `padding:0;${style}`)
</script>

<div
    class="default-page {className}"
    style="--left-mobile-padding:{hasMenu ? '5rem' : '1rem'};--right-mobile-padding:{hasMenu ? '1.4rem' : '1rem'};{pageStyle}"
>
    {#if menu}
        {@render menu()}
    {:else if !excludeMenu}
        <SimpleMenu/>
    {/if}
    <main class="default-content appear-on-mount" style={contentStyle}>
        {@render children?.()}
    </main>
</div>
