<script lang="ts">
    import type {Snippet} from 'svelte'

    // Old: src/components/shared/layout/Card.tsx
    // `style` is ported as a plain CSS-text string (Svelte idiom) rather than
    // a CSSProperties object; callers append their own declarations after the
    // computed ones below, so a caller value still wins on any shared
    // property - same override order as the old object spread `...style`.
    interface CardProps {
        background?: string
        color?: string
        radius?: string
        padding?: string
        gap?: string
        row?: boolean
        border?: string
        withShadow?: boolean
        className?: string
        style?: string
        children?: Snippet
    }

    let {
        background = 'var(--primary)',
        color = 'var(--primary-text)',
        gap,
        radius = '0.4rem',
        padding,
        className = '',
        style = '',
        row = false,
        border,
        children,
        withShadow,
    }: CardProps = $props()

    // Old code interpolated `className` unguarded (`${className} ${row ? ... }`),
    // which rendered the literal string "undefined" into the class list whenever
    // a caller omitted className (Card.tsx never defaulted it, unlike Column/Row
    // which use `className ?? ""`). Harmless (no selector ever matches ".undefined")
    // but clearly unintentional, so normalized here to the safe `?? ''` pattern
    // Column/Row already used - not a behavior change since no CSS ever targeted it.
    const computedStyle = $derived([
        `background:${background}`,
        `color:${color}`,
        gap !== undefined ? `gap:${gap}` : '',
        `border-radius:${radius}`,
        padding !== undefined ? `padding:${padding}` : '',
        border !== undefined ? `border:${border}` : '',
        withShadow ? 'box-shadow:0 0 0.5rem 0.2rem rgba(var(--shadow-rgb), 0.25)' : '',
    ].filter(Boolean).join(';'))
</script>

<div class="{className} {row ? 'row' : 'column'}" style="{computedStyle};{style}">
    {@render children?.()}
</div>
