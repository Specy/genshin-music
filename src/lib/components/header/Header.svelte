<script module lang="ts">
    // Old: src/components/shared/header/Header.tsx
    export const HEADER_TYPES = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const
    export type HeaderType = typeof HEADER_TYPES[number]
</script>

<script lang="ts">
    import type {Snippet} from 'svelte'

    interface HeaderProps {
        textSize?: string
        style?: string
        className?: string
        type?: HeaderType | string
        margin?: string
        children?: Snippet
    }

    // Old used a `Map<HeaderType, string>` here; module-scope `new Map(...)` used
    // only as a static lookup table (never touched by $state/$derived) doesn't need
    // reactive tracking, but a plain object sidesteps eslint-plugin-svelte's
    // prefer-svelte-reactivity rule entirely (it flagged an unrelated `new Map()`
    // in ThemeVars.svelte in P3 Task 4) while behaving identically as a lookup.
    const defaultTextSize: Record<HeaderType, string> = {
        h1: '2rem',
        h2: '1.5rem',
        h3: '1.25rem',
        h4: '1.1rem',
        h5: '1rem',
        h6: '1rem',
    }

    let {className, style = '', textSize, children, type = 'h1', margin = '0'}: HeaderProps = $props()

    // Old was a cascading if/else chain that returned <h1> through <h5> for an
    // exact match and fell back to <h6> for anything else (including a literal
    // "h6" and any unrecognized string, since `type` is typed `HeaderType | string`).
    // `HEADER_TYPES.includes(type) ? type : 'h6'` is behaviorally identical: every
    // value the old chain special-cased is exactly the HEADER_TYPES membership,
    // and everything else already fell through to 'h6' in both versions.
    const tag = $derived((HEADER_TYPES as readonly string[]).includes(type) ? (type as HeaderType) : 'h6')
    const computedStyle = $derived(
        `font-size:${textSize ? textSize : (defaultTextSize[type as HeaderType] ?? '2rem')};margin:${margin};${style}`
    )
</script>

<svelte:element this={tag} class={className} style={computedStyle}>
    {@render children?.()}
</svelte:element>
