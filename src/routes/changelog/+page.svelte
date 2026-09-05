<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import PageHeading from '$cmp/shell/PageHeading.svelte';
  import SimpleMenu from '$cmp/shell/SimpleMenu.svelte';
  import MenuButton from '$cmp/menu/MenuButton.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import AppLink from '$cmp/AppLink.svelte';
  import ChangelogRow from '$cmp/pages/ChangelogRow.svelte';
  import { CHANGELOG } from '$core/changelog';
  import { APP_VERSION } from '$core/legacyConfig';
  import { clearClientCache } from '$core/utils/Utilities';
  import { logger } from '$stores/LoggerStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';

  const cacheVersion = import.meta.env.PUBLIC_SW_VERSION ?? '';

  onMount(() => {
    setPageVisited('changelog');
  });

  function clearCache() {
    clearClientCache()
      .then(() => {
        logger.success(t('cache:clear_cache'));
        setTimeout(() => {
          window.location.href = base || '/';
        }, 1000);
      })
      .catch((e) => {
        console.error(e);
        // QUIRK: raw i18n key string, not wrapped in t(...) - intentional, not a missed
        // translation call. delete-cache/+page.svelte has the identical pattern.
        logger.error('cache:error_clearing_cache');
      });
  }
</script>

{#snippet githubIcon()}
  <svg
    class="icon"
    stroke="currentColor"
    fill="currentColor"
    stroke-width="0"
    viewBox="0 0 496 512"
    height="1em"
    width="1em"
    xmlns="http://www.w3.org/2000/svg"
    ><path
      d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"
    /></svg
  >
{/snippet}

{#snippet changelogMenu()}
  <SimpleMenu>
    <a
      href="https://github.com/Specy/genshin-music"
      target="_blank"
      rel="noreferrer"
      title="Go to github"
    >
      <MenuButton ariaLabel="Go to github">
        {@render githubIcon()}
      </MenuButton>
    </a>
  </SimpleMenu>
{/snippet}

<DefaultPage excludeMenu={true} menu={changelogMenu}>
  <PageMetadata
    text={`${t('home:changelog_name')} V${APP_VERSION}`}
    description={`Changelog V${APP_VERSION}. ${CHANGELOG[0]?.changes.join('; ')}`}
  />
  <PageHeading text={`${t('home:changelog_name')} V${APP_VERSION}`} />
  <div class="changelog-page">
    <div class="changelog-page-title">
      {t('home:changelog_name')}
      <span class="changelog-version">v{APP_VERSION}</span>
    </div>
    <div class="row changelog-meta">
      <span class="changelog-cache">{t('cache:cache')}: {cacheVersion || 'DEV'}</span>
      <AppButton class="changelog-meta-button" onclick={clearCache}>
        {t('cache:clear_cache')}
      </AppButton>
      <AppLink href="/error" class="changelog-meta-link">
        <AppButton class="changelog-meta-button">{t('changelog:view_error_logs')}</AppButton>
      </AppLink>
    </div>
    <div style="margin-top:2rem"></div>
    {#each CHANGELOG as data (data.version)}
      <ChangelogRow version={data.version} date={data.date} changes={data.changes} />
    {/each}
    <div class="changelog-ending"></div>
  </div>
</DefaultPage>

<style>
  /* `display: contents` and nothing else: this wrapper exists only so the portrait block at the
     bottom has an ancestor Svelte can hash, which keeps the `:global()` overrides it needs (the
     meta row's button and link classes land inside AppButton/AppLink, out of reach of scoped CSS)
     from leaking to any other page. Every child stays a direct flex item of `.default-content`
     exactly as it was before the wrapper existed. */
  .changelog-page {
    display: contents;
  }

  .changelog-page-title {
    font-size: 2.5rem;
    color: var(--background-text);
  }

  /* Both of these were inline `style` attributes (on the version span and on the meta row) until
     portrait needed to restate them, and an inline declaration outranks every rule that isn't
     `!important`. Same declarations, same rendering - they just live somewhere a media query can
     reach now. */
  .changelog-version {
    font-size: 1.2rem;
    margin-left: 1rem;
  }

  .changelog-meta {
    font-size: 0.8rem;
    justify-content: space-between;
    align-items: center;
  }

  .changelog-ending {
    height: 2.5rem;
    min-height: 2.5rem;
    width: 1rem;
    border-left: dashed 2px var(--secondary);
    margin-left: 2.5rem;
  }

  /* PORTRAIT. Width-tiered as well as orientation-keyed on purpose, matching App.css's own
     `max-width: 920px and (orientation: portrait)` block: below that tier `.default-page` drops to
     a 1rem gutter and the page really is phone-narrow, while a portrait TABLET is a wide window
     that keeps the desktop 20vw margins and wants the desktop row of chip-sized buttons. */
  @media screen and (orientation: portrait) and (max-width: 920px) {
    .changelog-page-title {
      font-size: 2rem;
      line-height: 1.15;
    }

    .changelog-version {
      margin-left: 0.6rem;
    }

    /* The three-up `space-between` row can't survive 393px: the cache string and both labels wrap
       onto two lines each and the buttons end up as squashed blocks. Instead the cache version
       takes a line of its own (`flex-basis: 100%`) and the two buttons split the next one, at a
       height a thumb can actually hit - the page's only controls, so they earn the space. */
    .changelog-meta {
      flex-wrap: wrap;
      justify-content: flex-start;
      gap: 0.5rem;
      font-size: 0.9rem;
    }

    .changelog-cache {
      flex: 1 0 100%;
    }

    .changelog-page :global(.changelog-meta-link) {
      display: flex;
      flex: 1 1 0;
    }

    .changelog-page :global(.changelog-meta-button) {
      flex: 1 1 0;
      min-height: 2.75rem;
    }

    /* Follows ChangelogRow's own portrait `margin-left` so the dashed tail stays on the same
       vertical line as the timeline rail it continues. Change one, change the other. */
    .changelog-ending {
      margin-left: 1.25rem;
    }
  }
</style>
