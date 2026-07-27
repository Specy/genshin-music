<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'

    let {
        background = 'var(--primary)',
        color = 'var(--primary-text)',
        height = '0.3rem',
        style = '',
        class: cls = '',
        children,
        pillBackground,
        verticalMargin = '0.2rem',
        shadow = false,
    }: {
        background?: string
        color?: string
        height?: string
        verticalMargin?: string
        style?: string
        class?: ClassValue
        pillBackground?: string
        shadow?: boolean | string
        children?: Snippet
    } = $props()

    const shadowColor = $derived(typeof shadow === 'string' ? shadow : 'shadow')
    const shadowDecl = $derived(shadow ? `box-shadow:0 0rem 0.6rem ${shadowColor};` : '')
</script>

<div class="separator {cls}" style="color:{color};margin:{verticalMargin} 0;{style}">
    <div
        class="separator-part"
        style="background-color:{background};height:{height};{shadowDecl}border-top-left-radius:0.6rem;border-bottom-left-radius:0.6rem;"
    ></div>
    {#if children}
        <div
            class="separator-content"
            style="background-color:{pillBackground ?? ''};{shadowDecl}color:{color};border:solid 0.2rem {color};"
        >
            {@render children()}
        </div>
        <!-- QUIRK: uses var(--{color}) while the left part above uses {color}
             directly. `color` defaults to the string 'var(--primary-text)', so
             the default case doubles the wrapper into an invalid
             `var(--var(--primary-text))`, and this part's background silently
             falls back to transparent unless a caller passes a bare color
             string. Reproduced byte-for-byte, not "fixed". -->
        <div
            class="separator-part"
            style="height:{height};background-color:var(--{color});{shadowDecl}border-top-right-radius:0.6rem;border-bottom-right-radius:0.6rem;"
        ></div>
    {/if}
</div>

<style>
    .separator {
        display: flex;
        align-items: center;
        position: relative;
        margin: 0.2rem 0;
        border-radius: var(--circle);
    }

    .separator-content {
        border-radius: var(--circle);
        font-size: 0.8rem;
        padding: 0.2rem 0.8rem;
    }

    .separator-part {
        flex: 1;
    }
</style>
