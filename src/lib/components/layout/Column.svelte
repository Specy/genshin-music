<script lang="ts">
    import type {Snippet} from 'svelte'
    import {justifyMap, type Justify} from './layoutConstants'

    // Old: src/components/shared/layout/Column.tsx
    interface ColumnProps {
        gap?: string
        flex1?: boolean
        justify?: Justify
        align?: Justify
        padding?: string
        className?: string
        style?: string
        children?: Snippet
    }

    let {children, className = '', style = '', gap, flex1, justify, align, padding}: ColumnProps = $props()

    const computedStyle = $derived([
        gap !== undefined ? `gap:${gap}` : '',
        flex1 ? 'flex:1' : '',
        justify !== undefined ? `justify-content:${justifyMap[justify]}` : '',
        align !== undefined ? `align-items:${justifyMap[align]}` : '',
        padding !== undefined ? `padding:${padding}` : '',
    ].filter(Boolean).join(';'))
</script>

<div class="column {className}" style="{computedStyle};{style}">
    {@render children?.()}
</div>
