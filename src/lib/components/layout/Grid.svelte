<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/layout/Grid.tsx
    interface GridProps {
        gap?: string
        columns?: string
        rows?: string
        className?: string
        style?: string
        children?: Snippet
    }

    let {gap, rows, columns, style = '', className, children}: GridProps = $props()

    const computedStyle = $derived([
        'display:grid',
        gap !== undefined ? `gap:${gap}` : '',
        columns !== undefined ? `grid-template-columns:${columns}` : '',
        rows !== undefined ? `grid-template-rows:${rows}` : '',
    ].filter(Boolean).join(';'))
</script>

<div style="{computedStyle};{style}" class={className}>
    {@render children?.()}
</div>
