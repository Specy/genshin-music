<script lang="ts">
  import { base } from '$app/paths';
  import { page } from '$app/state';
  import { IS_BETA } from '$lib/env';
  import { CANONICAL_ORIGIN } from '$lib/seo';
  import { appPathname } from '$lib/utils/appPathname';

  // One canonical per page, which is why it lives here and not in PageMetadata: several
  // routes mount more than one of those on purpose (routes/theme/+page.svelte), and Svelte
  // dedupes <title> but not <link>.
  //
  // The same pages are served from the per-game domain, the /skyMusic and /genshinMusic
  // subpath builds and the beta; all of them name the game's own canonical origin so the
  // copies consolidate onto it instead of competing. appPathname drops the base, which is
  // exactly the part that differs between those builds.
  let canonicalUrl = $derived(`${CANONICAL_ORIGIN}${appPathname(page.url.pathname)}`);

  // Carries every root-level head element old's metadata cascade produced
  // EXCEPT <title>/<meta name="description"> and the favicon - see the two
  // exclusions below.
  //
  // Two <meta name="theme-color"> tags exist in this app: the dynamic one
  // (ThemeVars.svelte) and the static fallback below. Per the HTML spec a
  // browser uses the FIRST valid theme-color it finds, so ORDER MATTERS:
  // the dynamic one must render first for it to actually govern chrome
  // color; the static one is a real redundant fallback, not dead weight.
  //
  // This component must stay mounted as a SIBLING AFTER <ThemeVars> in the
  // root layout, not merged into it or placed before it: Svelte's SSR/
  // hydration head insertion appends each <svelte:head> in component-render
  // order, so this mount position is what guarantees the dynamic
  // theme-color (ThemeVars) renders before the static fallback below.
  //
  // Deliberately excludes:
  // - <link rel="icon">: already emitted by app.html's %sveltekit.assets% -
  //   adding one here would duplicate it.
  // - <title>/<meta name="description">: Svelte's <svelte:head> has no
  //   cascade the way Next's metadata did, so a root <title> here would
  //   leave TWO <title> elements on every page (this one plus each page's
  //   own PageMetadata call) - every page provides its own instead.
</script>

<svelte:head>
  <link rel="canonical" href={canonicalUrl} />
  <meta property="og:url" content={canonicalUrl} />
  <link rel="manifest" href="{base}/manifest.json" />
  <link rel="apple-touch-icon" href="{base}/logo192.png" />
  {#if IS_BETA}
    <meta name="robots" content="noindex, nofollow" />
  {/if}
  <!-- This is the SECOND theme-color meta in document order (see header) -
         the dynamic FIRST one comes from ThemeVars.svelte. -->
  <meta name="theme-color" content="#63aea7" />
</svelte:head>
