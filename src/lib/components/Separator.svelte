<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/separator/Separator.tsx + separator.module.scss
    // The old CSS module was dedicated entirely to this component, so it
    // inlines below verbatim (Svelte's own style scoping replaces the CSS
    // Modules hashing).
    //
    // PRESERVED QUIRK (flagging per the "old code is the behavior spec /
    // preserve quirks" convention used throughout this migration): the third
    // `.separator-part` (right side, only rendered when there are children)
    // sets `background-color: var(--${color})` instead of `background-color:
    // color` like the first (left) part does. `color` defaults to the string
    // `'var(--primary-text)'`, which is ALREADY a var() expression, so the
    // default case resolves to the invalid custom-property reference
    // `var(--var(--primary-text))` - meaning the right separator part's
    // background silently falls back to its initial value (transparent) any
    // time a caller doesn't pass a bare CSS-color-keyword/hex string for
    // `color`. This is reproduced byte-for-byte below rather than "fixed",
    // since it is a genuine pre-existing rendering quirk of the old app, not
    // a transcription slip.
    let {
        background = 'var(--primary)',
        color = 'var(--primary-text)',
        height = '0.3rem',
        style = '',
        className = '',
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
        className?: string
        pillBackground?: string
        shadow?: boolean | string
        children?: Snippet
    } = $props()

    const shadowColor = $derived(typeof shadow === 'string' ? shadow : 'shadow')
    const shadowDecl = $derived(shadow ? `box-shadow:0 0rem 0.6rem ${shadowColor};` : '')
</script>

<div class="separator {className}" style="color:{color};margin:{verticalMargin} 0;{style}">
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
