<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'
    import SimpleMenu from './SimpleMenu.svelte'

    // Deliberately does NOT render AppBackground: each page wires its own
    // directly, not this shared chrome.
    let {
        excludeMenu = false,
        children,
        menu,
        class: cls = '',
        style = '',
        contentStyle = '',
        cropped = true,
    }: {
        excludeMenu?: boolean
        children?: Snippet
        menu?: Snippet
        class?: ClassValue
        style?: string
        contentStyle?: string
        cropped?: boolean
    } = $props()

    const hasMenu = $derived(Boolean(menu) || !excludeMenu)
    // padding:0 comes first so a caller's own `style` (appended after) can
    // still override it.
    const pageStyle = $derived(cropped ? style : `padding:0;${style}`)
</script>

<div
    class={['default-page', cls]}
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
