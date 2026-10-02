<script lang="ts">
  import IconArrowsLeftRight from '~icons/fa6-solid/arrows-left-right';

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

  // The sizes travel as custom properties, not as the `max-height`/`width` declarations they
  // used to be: an inline declaration outranks every stylesheet, so the portrait rules at the
  // bottom could never let the image grow past the column.
  const computedStyle = $derived(
    [
      maxHeight !== undefined ? `--blog-image-max-height:${maxHeight}` : '',
      width !== undefined ? `--blog-image-width:${width}` : '',
    ]
      .filter(Boolean)
      .join(';')
  );

  // A post that sized its own image (either prop) keeps that size in portrait: the author chose
  // it, and those images are small enough to read as they are. Only the default full-width
  // screenshots - which a phone column shrinks to about half their native size - become strips.
  const fluid = $derived(width === undefined && height === undefined);

  let scrollable = $state(false);

  // The hint appears only when the strip really does overflow: at a portrait tablet width most
  // of these images fit, and inviting a swipe that moves nothing is worse than no hint at all.
  // Both the frame (column width) and the image (its own layout width, which only settles once
  // the file has loaded) are watched, since either changing changes the answer. An attachment
  // rather than a bind:this and an effect, since the frame is all the measurement ever needs.
  function watchOverflow(node: HTMLElement) {
    const measure = () => (scrollable = node.scrollWidth - node.clientWidth > 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    for (const child of node.children) observer.observe(child);
    return () => observer.disconnect();
  }
</script>

<div
  class={['blog-image-frame', fluid && 'blog-image-fluid']}
  style={computedStyle}
  {@attach watchOverflow}
>
  <img {src} {alt} />
</div>
{#if fluid && scrollable}
  <div class="blog-image-hint">
    <IconArrowsLeftRight />
    Swipe the image to see all of it
  </div>
{/if}

<style>
  /* This was a <Row justify="center">. The flex row it produced is restated here because the
     portrait rules below have to own `justify-content` and `overflow-x`, and Row writes its
     justify-content as an inline style that no stylesheet can override. */
  .blog-image-frame {
    display: flex;
    flex-direction: row;
    justify-content: center;
  }

  .blog-image-frame img {
    max-height: var(--blog-image-max-height, none);
    width: var(--blog-image-width, auto);
    max-width: 100%;
    border-radius: 0.5rem;
    margin: 2rem 0;
    box-shadow: 0 0 0.5rem 0.5rem rgba(0, 0, 0, 0.1);
  }

  /* Never in landscape: nothing can overflow there (max-width: 100%), so `scrollable` stays
     false - but keeping the hint display:none outside portrait means a stray true can't add a
     line to a layout that has no strip to explain. */
  .blog-image-hint {
    display: none;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    margin-top: -1.4rem;
    font-size: 0.85rem;
    opacity: 0.7;
  }

  /* A phone column is roughly half these screenshots' native width, which leaves the numbered
     callouts the posts' lists refer to ("the item at number (7)") too small to read. In portrait
     the image keeps a legible height and its own frame scrolls sideways instead - the page body
     never does. `safe center` is what still centres an image narrower than the column while
     keeping an overflowing one's left edge reachable, which plain `center` would push out of
     the scrollable area. */
  @media (orientation: portrait) and (max-width: 920px) {
    .blog-image-fluid {
      overflow-x: auto;
      overscroll-behavior-x: contain;
      justify-content: safe center;
    }

    .blog-image-fluid img {
      max-width: none;
      max-height: min(22rem, 45vh);
    }

    .blog-image-hint {
      display: flex;
    }
  }
</style>
