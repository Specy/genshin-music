<script lang="ts">
    import Row from '../layout/Row.svelte'

    // Old: src/components/pages/blog/BlogImage.tsx (26 lines) - a single component (unlike its
    // BlogUl.tsx/BlogMetadataRenderers.tsx siblings), ported the same way as any other primitive
    // (BlogImage.tsx.svelte default export), matching the brief's own file list. Styles purely via
    // an inline `style` string (no CSS-module class in the old file) - no style block needed.
    interface BlogImageProps {
        src: string
        alt: string
        height?: string
        width?: string
    }

    let {src, alt, height, width}: BlogImageProps = $props()

    // old: `maxHeight: height ?? (width ? undefined : 'min(20rem, 70vh)')` - if an explicit
    // height is given it wins; otherwise a width-only image gets no max-height cap, but an image
    // with neither falls back to the default cap.
    const maxHeight = $derived(height ?? (width ? undefined : 'min(20rem, 70vh)'))

    const computedStyle = $derived([
        maxHeight !== undefined ? `max-height:${maxHeight}` : '',
        width !== undefined ? `width:${width}` : '',
        'max-width:100%',
        'border-radius:0.5rem',
        'margin:2rem 0',
        'box-shadow:0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1)',
    ].filter(Boolean).join(';'))
</script>

<Row justify="center">
    <img {src} {alt} style={computedStyle} />
</Row>
