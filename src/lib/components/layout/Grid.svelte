<script lang="ts">
    import type {Snippet} from 'svelte'
    import type {ClassValue} from 'svelte/elements'

    interface GridProps {
        gap?: string
        columns?: string
        rows?: string
        class?: ClassValue
        style?: string
        children?: Snippet
    }

    let {gap, rows, columns, style = '', class: cls, children}: GridProps = $props()

    const computedStyle = $derived([
        'display:grid',
        gap !== undefined ? `gap:${gap}` : '',
        columns !== undefined ? `grid-template-columns:${columns}` : '',
        rows !== undefined ? `grid-template-rows:${rows}` : '',
    ].filter(Boolean).join(';'))
</script>

<div style="{computedStyle};{style}" class={cls}>
    {@render children?.()}
</div>
