<script module lang="ts">
  import type { BlogMetadata } from '$cmp/blog/types';
  import { addToHomeScreenMetadata } from '$cmp/blog/posts/add-to-home-screen';
  import { easyplay1sMetadata } from '$cmp/blog/posts/easyplay-1s';
  import { composerTutorialMetadata } from '$cmp/blog/posts/how-to-use-composer';
  import { playerTutorialMetadata } from '$cmp/blog/posts/how-to-use-player';
  import { midiTransposeMetadata } from '$cmp/blog/posts/midi-transpose';
  import { midiDeviceMetadata } from '$cmp/blog/posts/connect-midi-device';
  import { aiTransposeMetadata } from '$cmp/blog/posts/video-audio-transpose';
  import { howUseVsrgComposerMetadata } from '$cmp/blog/posts/how-to-use-vsrg-composer';
  import { createBeatmapMetadata } from '$cmp/blog/posts/how-to-create-a-beatmap';

  // posts/tags are computed once at module scope, not per-render. Array.prototype.sort is
  // spec-guaranteed stable since ES2019, so the 6 posts sharing the 2024/03/19 createdAt
  // (composer, player, midi-transpose, connect-midi-device, video-audio-transpose,
  // vsrg-composer) keep this array's literal order after the descending sort below.
  const posts: BlogMetadata[] = [
    addToHomeScreenMetadata,
    easyplay1sMetadata,
    composerTutorialMetadata,
    playerTutorialMetadata,
    midiTransposeMetadata,
    midiDeviceMetadata,
    aiTransposeMetadata,
    howUseVsrgComposerMetadata,
    createBeatmapMetadata,
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const tags = Array.from(new Set(posts.flatMap((p) => p.tags)));
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import Header from '$cmp/header/Header.svelte';
  import Card from '$cmp/layout/Card.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import Row from '$cmp/layout/Row.svelte';
  import Grid from '$cmp/layout/Grid.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import PromotionCard from '$cmp/PromotionCard.svelte';
  import Partners from '$cmp/blog/Partners.svelte';
  import ComboBox, { comboBoxItem, comboBoxTitle } from '$cmp/inputs/ComboBox.svelte';
  import { blogNavbar, hasVisitedBlogPost } from '$cmp/blog/BaseBlogPost.svelte';
  import { blogAuthorRenderer, blogTagsRenderer } from '$cmp/blog/BlogMetadataRenderers.svelte';
  import { game } from '$game';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';

  // Distinct from BaseBlogPost.svelte's own per-post visited map: this call is the page-level
  // visit tracker only.
  //
  // mounted starts false and flips true onMount so prerendered/SSR output and the first client
  // paint both start every card "not visited" (shows "New!"), then correct once real
  // localStorage is available post-hydration.
  let mounted = $state(false);

  onMount(() => {
    setPageVisited('blog');
    mounted = true;
  });

  let selectedTags = $state(tags.map((item) => ({ item, selected: false })));

  const filteredPosts = $derived(
    selectedTags.every((t) => !t.selected)
      ? posts
      : posts.filter((p) => selectedTags.some((t) => t.selected && p.tags.includes(t.item)))
  );
</script>

{#snippet indexNavChildren()}
  <AppLink href="/">Home</AppLink>
  <AppLink href="/player">Player</AppLink>
  <AppLink href="/composer">Composer</AppLink>
{/snippet}

{#snippet selectTagsLabel()}Select tags{/snippet}

{#snippet blogPostCard(metadata: BlogMetadata)}
  {@const visited = mounted && hasVisitedBlogPost(metadata.relativeUrl)}
  {@const date = new Intl.DateTimeFormat(Intl.DateTimeFormat().resolvedOptions().locale).format(
    metadata.createdAt
  )}
  <AppLink href="/blog/posts/{metadata.relativeUrl}">
    <!-- padding="0": the title strip is edge-to-edge; radius matches .blog-card-title's own -->
    <Card
      radius="0.4rem"
      padding="0"
      class={['blog-card', !visited && 'blog-card-new']}
      style="height:100%"
    >
      <Header type="h2" class="blog-card-title" style="margin-bottom:-1.5rem">
        <div class="blog-card-image" style="background-image:url('{metadata.image}')"></div>
        <div class="blog-card-title-content">
          {metadata.title}
        </div>
        {#if metadata.author}
          <!-- Corner placed from CSS rather than inline: portrait has to move it out from under
               the "New!" ribbon, which no stylesheet could do against an inline `right`. -->
          <div class="blog-card-author">
            {@render blogAuthorRenderer(metadata.author, '2rem', true)}
          </div>
        {/if}
      </Header>
      <Column padding="1rem" style="padding-top:0.5rem" class="blog-card-description">
        {metadata.description}
      </Column>
      <Row justify="between" align="end" style="padding:0.5rem" flex1>
        <Row style="font-size:0.8rem">
          {@render blogTagsRenderer(metadata.tags)}
        </Row>
        <div>{date}</div>
      </Row>
    </Card>
  </AppLink>
{/snippet}

<!-- The portrait/mobile layout is decided entirely in CSS below. It used to be a $derived over
     globalConfigStore.IS_MOBILE, which only becomes true once AppInit's onMount has run: the
     sidebar was therefore always painted first and then yanked away (the layout shift), and on
     any device whose user agent `is-mobile` doesn't recognise it never went away at all. A
     media query has neither problem - it is right before the first paint, on any device. -->
<DefaultPage class="blog-index" contentStyle="gap:1rem">
  <PageMetadata
    text="{game.meta.title} Blog"
    description="Welcome to {game.meta
      .title} blog! Here there will be written guides, news and info about the app!"
  />
  {@render blogNavbar(indexNavChildren, 'border-radius:0.5rem;padding:1rem 1.5rem')}
  <Column gap="2rem">
    <!-- Header writes its size as an inline `font-size`, which no stylesheet can override, so the
         size portrait shrinks travels as a custom property instead (redefined in the portrait
         block at the bottom of this file). -->
    <Header textSize="var(--blog-welcome-size, 2.2rem)" style="text-align:center">
      Welcome to {game.meta.title} blog!
    </Header>
    <PromotionCard alwaysVisible />
    <Column gap="1rem">
      <Row justify="between" align="center" gap="1rem" style="flex-wrap:wrap">
        <Header>Posts</Header>
        <Row align="center" gap="0.5rem">
          <ComboBox
            items={selectedTags}
            onChange={(newItems) => (selectedTags = newItems)}
            style="z-index:3"
          >
            {#snippet title()}
              {@render comboBoxTitle(selectTagsLabel)}
            {/snippet}
            {#snippet children(item, onClick)}
              {#snippet tagLabel()}{item.item}{/snippet}
              {@render comboBoxItem(item.selected, onClick, tagLabel)}
            {/snippet}
          </ComboBox>
        </Row>
      </Row>

      <!-- auto-fit rather than a scripted 1fr/2fr swap: it collapses to one column exactly when
           a second one would no longer fit, at any width, with no JS involved -->
      <Grid columns="repeat(auto-fit, minmax(min(20rem, 100%), 1fr))" gap="1rem">
        {#each filteredPosts as metadata (metadata.relativeUrl)}
          {@render blogPostCard(metadata)}
        {/each}
      </Grid>
    </Column>

    <!-- The partners have no page of their own any more; this is where they live. Last on the
         index because the posts are what the page is for. -->
    <Column gap="1rem">
      <Header>{t('home:partners_name')}</Header>
      <Partners />
    </Column>
  </Column>
</DefaultPage>

<style>
  /* .blog-card/.blog-card-title/.blog-card-description are applied via Card/Header/Column's
       class prop (foreign elements), so they need :global() - as do the .blog-card:hover
       rules, rooted at that same foreign class. .blog-card-image/.blog-card-title-content are
       native divs passed as those components' CHILDREN, compiled as part of THIS file's
       template, so plain scoped CSS reaches them - only the base (non-hover) .blog-card-image
       rule can skip :global(). */

  /* .blog-nav lives in BaseBlogPost's snippet - a foreign element, hence :global(), and scoped
     under .blog-index so this page's rules can't reach the blog POSTS (which show .blog-nav at
     every width). */
  :global(.blog-index .blog-nav) {
    display: none;
  }

  /* In portrait the app's menu is a bar along the bottom of the screen (App.css, "PORTRAIT
     SHELL"), which is where this page's own text nav earns its place: the bar is icons only, and
     "Posts / Player / Composer" is what a reader of the index actually wants next. It used to be
     an either/or - the rail was a column down the left that this block hid outright, and the
     page reclaimed its 5rem - but a bottom bar costs the content nothing beyond the padding
     App.css already reserves under every .default-page, so both now show. */
  @media (orientation: portrait) {
    :global(.blog-index .blog-nav) {
      display: flex;
    }
  }

  :global(.blog-card) {
    position: relative;
    transition:
      transform 0.3s,
      box-shadow 0.3s;
    box-shadow: 0 0.25rem 0.5rem rgba(0, 0, 0, 0.05);
    min-height: 8rem;
  }

  :global(.blog-card-new::after) {
    content: 'New!';
    position: absolute;
    top: 0;
    transform: rotate(45deg) translate(18%, -80%);
    right: 0;
    background-color: var(--accent);
    color: var(--accent-text);
    font-size: 0.8rem;
    z-index: 4;
    border-radius: 0.2rem;
    padding: 0.2rem 0.5rem;
  }

  :global(.blog-card-title) {
    position: relative;
    padding: 1rem 1.2rem;
    overflow: hidden;
    border-top-left-radius: 0.4rem;
    border-top-right-radius: 0.4rem;
  }

  :global(.blog-card-description) {
    font-family: RobotoSerif, serif;
    opacity: 0.9;
  }

  .blog-card-author {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
  }

  .blog-card-title-content {
    z-index: 2;
    padding-bottom: 1.3rem;
    position: relative;
    text-shadow: 1px 1px 0.2rem #000000;
  }

  :global(.blog-card:hover) {
    transform: translateY(-0.05rem);
    box-shadow: 0 0.5rem 1rem rgba(0, 0, 0, 0.15);
  }

  :global(.blog-card:hover .blog-card-image) {
    transform: scale(1.03);
  }

  .blog-card-image {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-repeat: no-repeat;
    background-size: cover;
    filter: blur(3px);
    background-position: center;
    mask-image: linear-gradient(0deg, #00000000, rgba(0, 0, 0, 1));
    transition: transform 0.3s;
  }

  /* ==================================================================================
     PORTRAIT. One column of full-width cards, so the card's right edge IS the page's right edge
     and the two things the wide layout let hang past a card - the ribbon's corner and the promo
     button's line - have nowhere to hang any more.
     ================================================================================== */
  @media (orientation: portrait) and (max-width: 920px) {
    /* Same corner, same angle, 19px further in. `translate(18%, -80%)` reads along the ROTATED
       axes, where those two percentages resolve to "19px right, 6px up" - fine while a grid
       gutter was there to absorb the overhang, but at one column the card's right edge IS the
       page's: the badge pushed the document 3px past the viewport (a body that scrolls sideways)
       and lost its exclamation mark off the screen edge. -9% / -20% are the same two axes chosen
       so their sideways components cancel, leaving the 6px lift and nothing else. */
    :global(.blog-card-new::after) {
      transform: rotate(45deg) translate(-9%, -20%);
    }

    /* Pulled inside the card, the ribbon lands on the corner the author's picture sits in, so
       the picture moves to the other end of the same edge - still over the header image, still
       out of the way. Every card, not just the ribboned ones: one column of cards reads as a
       list, and a picture that hops corners down that list would look like a bug. The 1.9rem
       clears the title strip's own `margin-bottom: -1.5rem`, which pulls the description up
       under the strip's last 1.5rem - measuring from the strip's edge alone would drop the
       picture onto the description's first line. */
    .blog-card-author {
      top: auto;
      bottom: 1.9rem;
    }

    /* The same story from the text's side: at one column the titles are wide enough to run into
       that corner, which they never were inside a 20rem grid cell. */
    .blog-card-title-content {
      padding-right: 2.8rem;
    }

    /* Three lines of 2.2rem for "Welcome to Genshin Music Nightly blog!" is a whole screenful of
       greeting before the first post; the clamp brings it back to two. */
    :global(.blog-index) {
      --blog-welcome-size: clamp(1.5rem, 6.5vw, 2.2rem);
    }

    /* The promo card keeps its two columns - stacking them would push its button below the fold
       of a card that is only there to be tapped - but "Find out more" broke into three stacked
       words to fit the narrow right column. Held on one line it costs the description column
       about 30px, which it spends on one more wrapped line. */
    :global(.blog-index .promotion-card .app-button) {
      white-space: nowrap;
    }
  }
</style>
