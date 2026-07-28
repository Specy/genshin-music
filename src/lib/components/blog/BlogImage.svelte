<script lang="ts">
  import Row from '../layout/Row.svelte';

  interface BlogImageProps {
    src: string;
    alt: string;
    height?: string;
    width?: string;
  }

  let { src, alt, height, width }: BlogImageProps = $props();

  // If height is given, it wins. Otherwise a width-only image gets no
  // max-height cap; an image with neither falls back to the default cap.
  const maxHeight = $derived(height ?? (width ? undefined : 'min(20rem, 70vh)'));

  const computedStyle = $derived(
    [
      maxHeight !== undefined ? `max-height:${maxHeight}` : '',
      width !== undefined ? `width:${width}` : '',
      'max-width:100%',
      'border-radius:0.5rem',
      'margin:2rem 0',
      'box-shadow:0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1)',
    ]
      .filter(Boolean)
      .join(';')
  );
</script>

<Row justify="center">
  <img {src} {alt} style={computedStyle} />
</Row>
