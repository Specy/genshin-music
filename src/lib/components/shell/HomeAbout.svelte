<script lang="ts">
  // THE HOME PAGE'S ABOUT TEXT: what the app is, its tools and the game's instruments, below the
  // first screen of the home page. It is there for whoever arrives without knowing the app, and
  // for crawlers, which read the prerendered HTML and so always get it. Per game, in the locale as
  // markdown (`home:about_<game>`), rendered through Markdown.svelte.
  //
  // SHOWN ON THE FIRST HOME VIEW OF A BROWSER SESSION ONLY, by a sessionStorage flag.
  // - The initial page load always RENDERS it, so hydration matches the prerendered HTML; onMount
  //   then hides it if the flag says this session has seen it already, or sets the flag otherwise.
  // - An in-app navigation back to '/' reads the flag while the component initialises, so a hidden
  //   block never appears for a frame first. There is no prerendered HTML to match there.
  // Which of the two created this instance is the same signal HomePage's `animateEntry` reads (see
  // there for why it is only valid at init). HomePage keeps this below the fold, so hiding it
  // after hydration moves nothing the user can see.
  import { onMount } from 'svelte';
  import { browserHistoryStore } from '$stores/BrowserHistoryStore';
  import { APP_NAME } from '$core/legacyConfig';
  import { game } from '$game';
  import type { GameId } from '$lib/games/types';
  import { t, tInstrument } from '$i18n/binding.svelte';
  import Markdown from '../utility/Markdown.svelte';
  import { escapeMarkdown } from '../utility/markdown';

  const ABOUT_KEYS = {
    genshin: 'home:about_genshin',
    sky: 'home:about_sky',
  } as const satisfies Record<GameId, string>;

  const SEEN_KEY = `${APP_NAME}_seen_home_about`;

  // sessionStorage can throw (storage blocked, some private modes). Unreadable means "not seen",
  // so the text shows, which is the side to fail on.
  function hasSeen(): boolean {
    try {
      return sessionStorage.getItem(SEEN_KEY) === 'true';
    } catch {
      return false;
    }
  }

  const isInitialLoad = !browserHistoryStore.hasSettledFirstNavigation;
  // Short-circuits on the initial load, so the prerender never touches sessionStorage.
  let visible = $state(isInitialLoad || !hasSeen());

  onMount(() => {
    if (hasSeen()) {
      visible = false;
      return;
    }
    try {
      sessionStorage.setItem(SEEN_KEY, 'true');
    } catch {
      // Nowhere to remember it: the text simply shows on every home view.
    }
  });

  // Generated from the game's instrument list, so a new instrument is in the text the moment it
  // is in the game. Escaped, because the names are interpolated into markdown.
  const instruments = $derived(
    game.instruments.list.map((name) => escapeMarkdown(tInstrument(name))).join(', ')
  );
  const source = $derived(
    t(ABOUT_KEYS[game.id], { APP_NAME: game.display.name, INSTRUMENTS: instruments })
  );
</script>

{#if visible}
  <section class="home-about">
    <Markdown {source} />
  </section>
{/if}

<style>
  /* Typeset like a blog post, so the text reads as the same kind of content wherever it appears.
     The values mirror the blog's own rules: the article column (BaseBlogPost's
     `.blog-article-cropped`, including its phone-tier padding), section headers (the posts'
     `<Header type="h2" textSize="2rem" margin="1rem 0">`), `.blog-p`, `.blog-b`, the `.blog-ol`
     item spacing and `.blog-article a`. Change them together. Set off from the home screen by the
     separator line it already uses (`.home-separator`). */
  .home-about {
    flex-shrink: 0;
    width: 100%;
    max-width: 60rem;
    margin: 0 auto;
    padding: 2rem;
    border-top: 1px solid var(--secondary);
    color: var(--background-text);
    line-height: 1.6;
  }

  @media (orientation: portrait) and (max-width: 920px) {
    .home-about {
      padding: 1.25rem;
    }
  }

  .home-about :global(h2) {
    margin: 1rem 0;
    font-size: 2rem;
  }

  /* The posts have no h3; Header's default h2 size keeps the step down from the 2rem above. */
  .home-about :global(h3) {
    margin: 1rem 0;
    font-size: 1.5rem;
  }

  /* Font and opacity come from App.css's global `p` rule, as they do for `.blog-p`. */
  .home-about :global(p) {
    margin: 1rem 0;
    user-select: text;
  }

  .home-about :global(ul),
  .home-about :global(ol) {
    margin: 0;
    padding-left: 2rem;
  }

  .home-about :global(li) {
    margin: 1rem 0;
    font-family: var(--font-reading);
    opacity: 0.9;
    user-select: text;
  }

  .home-about :global(strong) {
    font-family: var(--font-reading);
  }

  .home-about :global(a) {
    color: var(--accent);
    text-decoration: underline;
  }
</style>
