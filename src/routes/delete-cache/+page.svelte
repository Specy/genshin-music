<script lang="ts">
  import { onMount } from 'svelte';
  import { base } from '$app/paths';
  import DefaultPage from '$cmp/shell/DefaultPage.svelte';
  import PageMetadata from '$cmp/shell/PageMetadata.svelte';
  import Header from '$cmp/header/Header.svelte';
  import Column from '$cmp/layout/Column.svelte';
  import AppButton from '$cmp/inputs/AppButton.svelte';
  import { clearClientCache } from '$core/utils/Utilities';
  import { logger } from '$stores/LoggerStore.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import { t } from '$i18n/binding.svelte';
  import { game } from '$game';

  // SvelteKit's <svelte:head> has no cross-navigation fallback the way Next's metadata cascade
  // did - a page that renders no <title> leaves the PREVIOUS page's title showing, not a root
  // default. PageMetadata below reproduces the root title explicitly for that reason, even
  // though old never had a metadata call for this specific route.
  onMount(() => {
    setPageVisited('deleteCache');
    run();
  });

  async function run() {
    try {
      if (await clearClientCache()) {
        logger.success(t('home:cache_cleared'));
        setTimeout(() => {
          window.location.href = base || '/'; //important, "" causes a reload loop
        }, 1000);
      }
    } catch (e) {
      console.error(e);
      logger.error(t('home:error_clearing_cache'));
    }
  }

  function clearCache() {
    clearClientCache()
      .then(() => {
        // QUIRK: raw i18n key strings below, not wrapped in t(...) - unlike run()'s
        // t(...) calls above, this shows the literal text "home:cache_cleared" as the
        // toast, not a translation. Preserved inconsistency, not unified with run().
        logger.success('home:cache_cleared');
        setTimeout(() => {
          window.location.href = base || '/';
        }, 1000);
      })
      .catch((e) => {
        console.error(e);
        logger.error('home:error_clearing_cache');
      });
  }
</script>

<DefaultPage>
  <PageMetadata text={game.meta.title} />
  <Column gap="1rem">
    <Header>{t('cache:reset_cache')}</Header>
    <div>{t('cache:reset_cache_message')}</div>
    <AppButton onclick={clearCache}>{t('cache:clear_cache')}</AppButton>
  </Column>
</DefaultPage>
