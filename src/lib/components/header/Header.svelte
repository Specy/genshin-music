<script module lang="ts">
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

    // A plain object, not a Map: this is a static lookup table (never touched
    // by $state/$derived), and a Map here would trip eslint-plugin-svelte's
    // prefer-svelte-reactivity rule despite needing no reactivity.
    const defaultTextSize: Record<HeaderType, string> = {
        h1: '2rem',
        h2: '1.5rem',
        h3: '1.25rem',
        h4: '1.1rem',
        h5: '1rem',
        h6: '1rem',
    }

    let {className, style = '', textSize, children, type = 'h1', margin = '0'}: HeaderProps = $props()

    const tag = $derived((HEADER_TYPES as readonly string[]).includes(type) ? (type as HeaderType) : 'h6')
    const computedStyle = $derived(
        `font-size:${textSize ? textSize : (defaultTextSize[type as HeaderType] ?? '2rem')};margin:${margin};${style}`
    )
</script>

<svelte:element this={tag} class={className} style={computedStyle}>
    {@render children?.()}
</svelte:element>
