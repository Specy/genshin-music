<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';
  import AppBackground from '$cmp/theme/AppBackground.svelte';
  import Composer from '$cmp/pages/Composer/Composer.svelte';
  import { setPageVisited } from '$stores/PageVisitStore.svelte';
  import PageHeading from '$cmp/shell/PageHeading.svelte';
  import { t } from '$i18n/binding.svelte';

  // QUIRK (load-bearing - read before "fixing" this): page.url.searchParams ($app/state) throws
  // during svelte-kit's prerender crawl on a page with prerendering enabled (this whole app
  // prerenders every route, src/routes/+layout.ts) - reproduced live as a real 500 on GET
  // /composer before this fix. `browser` (from $app/environment) gates a plain
  // window.location-based read instead, computed once as a top-level const so it resolves
  // before <Composer> below is instantiated (Svelte runs a component's own script fully before
  // creating its children) - Composer.svelte's onMount always observes the already-resolved
  // value, both during SSR/prerender (browser false, falls back to null/false) and after real
  // client-side hydration (browser true, the actual query string).
  const searchParams = browser ? new URL(window.location.href).searchParams : null;
  const songId = searchParams?.get('songId') ?? null;
  // QUIRK: Boolean(...) on a URLSearchParams value means any non-empty string is truthy,
  // including the literal string "false" - so ?showMidi=false still opens the MIDI importer.
  // Preserved verbatim, not "fixed", matching old's identical behavior.
  const showMidi = Boolean(searchParams?.get('showMidi'));

  onMount(() => {
    setPageVisited('composer');
  });
</script>

<AppBackground page="Composer">
  <PageHeading text={t('home:composer_name')} />
  <Composer {songId} {showMidi} />
</AppBackground>
