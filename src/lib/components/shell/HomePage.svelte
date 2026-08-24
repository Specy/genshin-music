<script lang="ts">
  // The live home screen: the '/' route's whole body. Home.svelte is the same content in the old
  // floating-popup wrapper, kept dormant - see HomeContent.svelte's header for the revert steps.
  import { afterNavigate } from '$app/navigation';
  import IconXmark from '~icons/fa6-solid/xmark';
  import { ThemeProvider } from '$core/theme/ThemeProvider.svelte';
  import { APP_NAME } from '$core/legacyConfig';
  import { game } from '$game';
  import { t } from '$i18n/binding.svelte';
  import MenuButton from '../menu/MenuButton.svelte';
  import PageMetadata from './PageMetadata.svelte';
  import HomeContent from './HomeContent.svelte';

  // THE CLOSE BUTTON ONLY EXISTS WHEN THERE IS SOMETHING TO CLOSE BACK TO. As a page, '/' is also
  // where a direct link, a bookmark and an installed PWA all land (manifest start_url is '.'), and
  // on those there is no in-app page behind this one - a × would either dead-end or walk the user
  // out of the app. afterNavigate runs once on mount with the navigation that produced the current
  // page: `from` is null exactly for that first entry (type 'enter'), and non-null for every
  // client-side navigation that came from another route of this app.
  //
  // POPSTATE IS EXCLUDED, and `from !== null` alone is NOT enough. Arriving by Back means the
  // entry we land on was pushed earlier, and it can perfectly well be the document's FIRST one:
  // land on '/' directly, open /changelog, press Back, and `from` is /changelog even though
  // nothing of this app sits behind '/'. Measured before this guard existed: the × appeared and
  // clicking it left the app entirely (about:blank in a fresh context; whatever preceded the app
  // in a real tab). SvelteKit gives no way to tell that first entry apart from a deeper one -
  // history.state's index is seeded from Date.now() at document load, so its value says nothing
  // on its own - so only a forward navigation, which always pushes an app page behind this one,
  // earns the ×. A user who arrived by Back still has the browser's own Back to go on with.
  let arrivedInApp = $state(false);
  afterNavigate((navigation) => {
    arrivedInApp = navigation.from !== null && navigation.type !== 'popstate';
  });

  // Same fade the popup used over the page it covered: here it lets AppBackground's image read
  // through the page's own ground instead of a flat fill.
  const backgroundColor = $derived(ThemeProvider.get('background').fade(0.1).toString());
</script>

<PageMetadata text={game.meta.title} description={t('home:app_description', { APP_NAME })} />

<div class="home-page column" style="background-color:{backgroundColor}">
  {#if arrivedInApp}
    <div class="home-page-header">
      <!-- `window.history.back()` needs no leave-guard code of its own: the root layout's
           `beforeNavigate` intercepts this popstate like any other in-app navigation (same as
           SimpleMenu's back button and AppLink). -->
      <MenuButton onclick={() => window.history.back()} ariaLabel={t('menu:go_back')}>
        <IconXmark />
      </MenuButton>
    </div>
  {/if}
  <HomeContent alwaysShowTitle />
</div>

<style>
  /* THE PAGE SCROLLS ITSELF, the way the popup did. `height: 100%` alone would NOT cap it: `.app`
     (AppBackground) is a stretched flex item of an auto-height shell, so it grows to whatever this
     page's content wants and 100% grows with it - content taller than the window ends up scrolling
     the document instead (measured: an 852x393 window gave a 686px-tall `.app`). `100dvh` is the
     cap that makes this element the scroller, and dvh rather than vh so a phone's collapsing
     browser toolbar takes room from the scroll area instead of hiding the bottom bar under it. */
  .home-page {
    position: relative;
    width: 100%;
    height: 100%;
    max-height: 100dvh;
    overflow-y: auto;
    overflow-x: hidden;
    color: var(--background-text);
  }

  .home-page-header {
    display: flex;
    flex-shrink: 0;
    padding: 0.5rem 0.5rem 0;
  }

  /* The bottom bar sits at the bottom of a SHORT page and directly under the content of a tall one.
     `.home` got this from `justify-content: space-between`, which as a page would also push the
     cards away from the title on a tall portrait screen. */
  .home-page :global(.home-bottom) {
    margin-top: auto;
    padding-top: 0.6rem;
  }

  /* App.css's mobile block pads `.home-padded` 3.6rem on its LEFT to clear the popup's close button
     and the menu rail behind it. This page has neither, and on a phone that missing 3rem of card
     width is worth more than the asymmetry, which reads as a mistake once the content is the whole
     window. Same 920px breakpoint as that block, so this lands after it. */
  @media (max-width: 920px) {
    .home-page :global(.home-padded) {
      padding: 0.8rem 0.8rem 0.4rem;
    }
  }

  /* PORTRAIT IS A REAL ORIENTATION FOR THIS PAGE, which it never was for the popup: it floated over
     game pages that only work in landscape, so its two-up card grid, its row of middle-size pages
     and its three-column bottom bar all assumed a window wider than it is tall. As a page, '/' is
     also where a phone in portrait lands from a bookmark or the installed app, so everything wide
     stacks. Keyed on orientation and NOT on width: a landscape phone is the app's own primary
     window, and there the two-up grid is what fits - stacking by width made an 852x393 window
     scroll for content that used to fit in it. */
  @media (orientation: portrait) {
    .home-page :global(.home-content) {
      grid-template-columns: 1fr;
    }

    .home-page :global(.middle-size-pages-wrapper) {
      flex-direction: column;
    }

    .home-page :global(.middle-size-page) {
      max-width: unset;
    }

    .home-page :global(.home-bottom) {
      flex-wrap: wrap;
      justify-content: center;
      gap: 0.5rem 1rem;
      padding: 0.6rem 0.4rem 0.4rem;
    }

    /* Its own row under the two control groups, rather than a squeezed column between them. */
    .home-page :global(.home-rights) {
      order: 3;
      width: 100%;
      padding: 0;
    }
  }
</style>
