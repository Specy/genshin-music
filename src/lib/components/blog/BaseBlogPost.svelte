<script module lang="ts">
  import { base } from '$app/paths';
  import { APP_NAME } from '$core/legacyConfig';
  import type { Snippet } from 'svelte';
  import type { BlogAuthor } from './types';
  import Row from '../layout/Row.svelte';

  // `blogNavbar` is a snippet defined in the markup below (not inside this
  // module script) and re-exported here via `export {blogNavbar}` - the
  // Svelte 5.5+ mechanism for exporting a snippet from a module block.
  export const SpecyAuthor: BlogAuthor = {
    name: 'Specy',
    picture: `${base}/assets/images/specy.png`,
  };

  const visitedBlogPostsKey = `${APP_NAME}_visited_blog_posts`;

  // Reads localStorage synchronously - unlike a mount-gated hook, this has
  // no built-in SSR safety. Callers that render during SSR/prerender must
  // gate their own call behind a mounted flag to avoid a hydration
  // mismatch (see routes/blog/+page.svelte).
  export function hasVisitedBlogPost(name: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}');
    return visited[name] ?? false;
  }

  export { blogNavbar };
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '../shell/DefaultPage.svelte';
  import PageMetadata from '../shell/PageMetadata.svelte';
  import AppLink from '../AppLink.svelte';
  import Header from '../header/Header.svelte';
  import BlogElements from './BlogElements.svelte';
  import { blogAuthorRenderer, blogTagsRenderer } from './BlogMetadataRenderers.svelte';
  import type { BlogMetadata } from './types';

  interface BaseBlogPostProps {
    metadata: BlogMetadata;
    cropped?: boolean;
    children?: Snippet;
  }

  let { metadata, cropped = true, children }: BaseBlogPostProps = $props();

  onMount(() => {
    const visited = JSON.parse(localStorage.getItem(visitedBlogPostsKey) ?? '{}');
    visited[metadata.relativeUrl] = true;
    localStorage.setItem(visitedBlogPostsKey, JSON.stringify(visited));
  });

  // Locale-dependent (Intl.DateTimeFormat with the runtime's own locale), so
  // server- and client-rendered text can differ - this can produce a
  // hydration warning in the console; it's expected, not a bug to chase.
  const date = $derived(
    new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(
      metadata.createdAt
    )
  );

  // The portrait/mobile layout is decided entirely in CSS at the bottom of this file, driven by
  // --blog-menu-inset. It used to be a $derived over globalConfigStore.IS_MOBILE, which only
  // becomes true once AppInit's onMount has run: the sidebar was therefore always painted first
  // and then yanked away (the layout shift), and on any device whose user agent `is-mobile`
  // doesn't recognise it never went away at all.
</script>

{#snippet blogNavbar(children: Snippet, style: string = '')}
  <Row justify="between" {style} class="blog-nav">
    {@render children()}
  </Row>
{/snippet}

{#snippet navChildren()}
  <AppLink href="/blog">Posts</AppLink>
  <AppLink href="/player">Player</AppLink>
  <AppLink href="/composer">Composer</AppLink>
{/snippet}

<DefaultPage
  cropped={false}
  class="blog-post"
  style="padding-left:var(--blog-menu-inset);gap:1rem;line-height:1.5"
>
  <PageMetadata text={metadata.title} description={metadata.description} image={metadata.image}>
    <meta name="author" content={metadata.author?.name ?? 'Specy'} />
    <meta name="date" content={metadata.createdAt.toISOString()} />
    <meta name="keywords" content={metadata.tags.join(', ')} />
  </PageMetadata>
  {@render blogNavbar(navChildren)}
  <div class="blog-header">
    <img
      src={metadata.image ?? ''}
      alt="{metadata.title} image"
      style="object-fit:cover;width:100%;height:100%"
    />
    <div class="blog-image-mask"></div>
    <div class="blog-header-content">
      <!-- Header writes its size as an inline `font-size`, which no stylesheet can override, so
           the size portrait shrinks travels the one way that still works from CSS: a custom
           property, redefined in the portrait block at the bottom of this file. -->
      <Header
        class="blog-title"
        style="padding:1rem;font-weight:bold"
        textSize="var(--blog-title-size, 2.5rem)"
      >
        {metadata.title}
      </Header>
    </div>
  </div>

  <!-- Classes, not the inline style this used to be, for the same reason as the title above: the
       portrait block at the bottom has to be able to tighten the padding. -->
  <article class={['blog-article', cropped && 'blog-article-cropped']}>
    <Row align="center" gap="2rem" style="font-size:1.2rem;margin-bottom:1rem;flex-wrap:wrap">
      {#if metadata.author}
        {@render blogAuthorRenderer(metadata.author)}
      {/if}
      <div>{date}</div>
      {@render blogTagsRenderer(metadata.tags, '0.2rem 1rem')}
    </Row>

    <BlogElements>
      {@render children?.()}
    </BlogElements>
  </article>
</DefaultPage>

<style>
  /* `.blog-nav`/`.blog-title` are applied via Row/Header's `class` prop
       (foreign elements); `.blog-nav a` (plain and :hover) targets an <a> two
       component boundaries away (Row, then AppLink) - all need :global().
       QUIRK: `.blog-back`/`.blog-tag` below are unused - no current template
       applies either class to an element - but are kept, wrapped in
       :global(), so svelte-check's unused-selector check doesn't flag them.
       Not dead code to prune. */

  /* --blog-menu-inset is how much room the sidebar takes beside the content: the page's own
     padding-left, the navbar's and the article's all resolve through it, so where the sidebar is
     and what space it costs are one decision made in one place - and made in CSS, so it is
     already correct at the first paint (see the note in the script block). */
  :global(.blog-post) {
    --blog-menu-inset: var(--menu-size);
  }

  /* Orientation alone, no width bound: in portrait the shared shell lays the menu out as a bar
     along the BOTTOM of the screen (App.css, "PORTRAIT SHELL"), so there is nothing beside the
     article to leave room for at any width - a portrait tablet would otherwise carry an empty
     4rem gutter down its left edge. What the bar does cost is room UNDER the article, reserved
     by the portrait block at the bottom of this file (it has to sit after `.blog-article`'s own
     padding, which is a shorthand and would otherwise win on source order).
     The rail is no longer hidden here either (this block used to do that, back when it was a
     column down the left with no room for it): from a blog page it is the only way back into
     the app. */
  @media (orientation: portrait) {
    :global(.blog-post) {
      --blog-menu-inset: 0rem;
    }
  }

  :global(.blog-nav) {
    display: flex;
    align-items: center;
    padding: 0.5rem 2rem;
    border-bottom: solid 0.1rem var(--secondary);
    background-color: var(--primary);
    padding-left: calc(var(--blog-menu-inset, var(--menu-size)) + 2rem);
    z-index: 1;
    height: calc(var(--menu-size) - 0.1rem);
    box-shadow: 0 0.5rem 0.7rem 0.5rem rgba(0, 0, 0, 0.2);
  }

  :global(.blog-nav a) {
    color: var(--primary-text);
    font-size: 1.2rem;
    user-select: text;
  }

  :global(.blog-article a) {
    color: var(--accent);
    text-decoration: underline;
  }

  /* Pointer-only (see App.css's `.app-button:hover`), for uniformity rather than a bug of its own:
     every link this nav renders leads somewhere else - Posts/Player/Composer on a post page (:77),
     Home/Player/Composer on the index (blog/+page.svelte's `indexNavChildren`) - so each tap
     unmounts the nav with the page and the latched hover goes with it. The guard is what keeps
     that a property of the ROUTING rather than of the rule: add a self-link here and the accent
     and underline would otherwise sit on it until the reader tapped something else. */
  @media (hover: hover) {
    :global(.blog-nav a:hover) {
      color: var(--accent);
      text-decoration: underline;
    }
  }

  .blog-article {
    padding: 2rem;
  }

  /* After `.blog-article` in source order on purpose: its `padding-left` has to win over that
     shorthand, and both selectors weigh the same.

     `width: 100%` is what keeps the column at the window's width rather than its content's. The
     auto side margins that centre it also opt the article out of the flex column's stretch, so
     without a stated width it falls back to sizing itself around its widest child - which, once
     the portrait rules let a screenshot spill out of the column into its own scroll strip, made
     the ARTICLE 667px wide inside a 393px page and handed the body a sideways scrollbar. */
  .blog-article-cropped {
    max-width: 60rem;
    width: 100%;
    margin: 0 auto;
    padding-left: calc(var(--blog-menu-inset) + 2rem);
  }

  .blog-header {
    width: 100%;
    position: relative;
    height: 50vh;
  }

  :global(.blog-back) {
    position: absolute;
    top: 0;
    left: var(--menu-size);
    border: none;
    background: rgba(var(--primary-rgb), 0.8);
    border-bottom: solid 0.1rem var(--secondary);
    border-right: solid 0.1rem var(--secondary);
    transition: background 0.3s;
    border-bottom-right-radius: 0.4rem;
    font-size: 1.2rem;
    color: var(--primary-text);
    z-index: 4;
    cursor: pointer;
    padding: 1rem 1.5rem;
  }

  :global(.blog-back:hover) {
    background: rgba(var(--primary-rgb), 1);
  }

  :global(.blog-title) {
    text-align: center;
    text-shadow: 0.1rem 0.1rem 0.3rem rgba(0, 0, 0, 0.6);
    user-select: text;
  }

  :global(.blog-tag) {
    background-color: var(--secondary);
    color: var(--secondary-text);
    text-align: center;
    border-radius: 1rem;
    padding: 0.2rem 0.8rem;
  }

  .blog-header-content {
    z-index: 3;
    top: 0;
    position: absolute;
    height: 100%;
    width: 100%;
    align-items: flex-end;
    padding-bottom: 3rem;
    justify-content: center;
    display: flex;
  }

  .blog-image-mask {
    z-index: 2;
    backdrop-filter: blur(8px);
    position: absolute;
    mask: linear-gradient(transparent, black 60%);
    background: linear-gradient(
      180deg,
      rgba(var(--background-rgb), 0) 24%,
      rgba(var(--background-rgb), 1) 94%,
      rgba(var(--background-rgb), 1) 100%
    );
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
  }

  /* Room under the article for the menu bar the shell puts along the bottom edge in portrait -
     see the --blog-menu-inset block near the top for why a blog post has to reserve it itself.
     Every portrait width, not just the phone tier: the bar is there on a portrait tablet too. */
  @media (orientation: portrait) {
    .blog-article {
      padding-bottom: calc(var(--menu-size) + 2rem);
    }
  }

  /* ==================================================================================
     PORTRAIT, PHONE TIER. The hero is the one thing a tall screen gets wrong on its own:
     `height: 50vh` of a 393px-wide column is a 16:9 header image blown up past 2x and cropped to
     a strip of its middle, half the screen tall, before a single word of the post. Sized by the
     images' own aspect instead, the whole header image fits across the column and the article
     starts within a thumb's reach - the min-height is there for the few posts whose header is
     squarer.
     ================================================================================== */
  @media (orientation: portrait) and (max-width: 920px) {
    .blog-header {
      height: auto;
      aspect-ratio: 16 / 9;
      min-height: 11rem;
    }

    .blog-header-content {
      padding-bottom: 1.2rem;
    }

    /* Bare text in a 4rem bar is a 24px-tall thing to hit with a thumb. The padding grows each
       link to a comfortable target without moving its text, since the row centres them - and it
       reaches the index's copy of this navbar too (that page imports the snippet, and with it
       this stylesheet). */
    :global(.blog-nav a) {
      padding: 0.7rem 0.5rem;
    }

    /* Down from 2.5rem, which wrapped a title like "MIDI music transposition" across three lines
       of a header that is now half as tall. The clamp keeps it fluid between phone widths. */
    :global(.blog-post) {
      --blog-title-size: clamp(1.5rem, 7.5vw, 2.5rem);
    }

    /* 2rem of padding on each side spends a ninth of a phone's width on nothing. Stated side by
       side rather than as a shorthand so the bottom reserve set above survives. */
    .blog-article {
      padding-top: 1.25rem;
      padding-left: 1.25rem;
      padding-right: 1.25rem;
    }

    .blog-article-cropped {
      padding-left: 1.25rem;
    }
  }
</style>
