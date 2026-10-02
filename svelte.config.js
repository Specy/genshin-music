import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import fs from 'node:fs';

// Build-time DEFAULT-game selection (spec §5.5 + ADR-0003): games are DISCOVERED
// from src/lib/games/<id>/game.json folders; PUBLIC_GAME picks which one the
// `$game` alias resolves to (fallback: genshin). All games' JSON metadata is
// bundled regardless via games/registry.ts — a future runtime game switch only
// replaces the alias consumer, not this discovery.
const discoveredGames = fs
  .readdirSync('./src/lib/games', { withFileTypes: true })
  .filter((d) => d.isDirectory() && fs.existsSync(`./src/lib/games/${d.name}/game.json`))
  .map((d) => d.name);
const gameId = discoveredGames.includes(process.env.PUBLIC_GAME)
  ? process.env.PUBLIC_GAME
  : 'genshin';
const outDir = process.env.BUILD_PATH ?? 'build';
// '' for production build:all; '/skyMusic' | '/genshinMusic' for *-no-root builds
const basePath = process.env.PUBLIC_BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // scripts/buildApp.js sets BUILD_VERSION_NAME to the same per-build timestamp it gives
    // PUBLIC_SW_VERSION, so every deploy publishes a distinct `_app/version.json`. This value is
    // NOT inert even though no app code reads `updated` from `$app/state`: Kit's own client
    // fetches version.json whenever a load throws or a navigation resolves >= 400, and on a
    // mismatch updates the service worker and does a full `location.href` navigation to the
    // target URL instead of rendering +error.svelte (runtime/client/client.js). That is the only
    // thing rescuing a tab left open across a deploy when a hashed chunk it imports is gone -
    // the SW's SKIP_WAITING prompt handles the precache side, not this one. Pinning it to a
    // constant silently disables that recovery; scripts/commentOnlyCheck.js and
    // scripts/classAttrCheck.js do pin it deliberately, to prove two builds of identical source
    // are byte-identical. The 'dev' fallback only applies to a bare `vite build`/`vite dev`.
    version: { name: process.env.BUILD_VERSION_NAME || 'dev' },
    adapter: adapter({
      pages: outDir,
      assets: outDir,
      // P5 Task 4 DECISION (disclosed deviation, not fixed): this fallback is an
      // UN-PRERENDERED app shell - no component tree ever renders at build time for it, so
      // none of +layout.svelte's <svelte:head> content survives into the file (RootMetadata's
      // manifest/apple-touch-icon/theme-color, ThemeVars' dynamic theme-color, or any page's
      // own PageMetadata title/description) - only app.html's own static markup (viewport,
      // favicon) does. Old's Next export PRERENDERED a real not-found.tsx ->
      // _client-pages/404/index.tsx, so old's 404.html DID carry the full root metadata
      // cascade plus a real <title>404</title>. Accepted as a disclosed deviation rather than
      // adding a prerendered 404 route: the browser executes the same app.js immediately
      // (same script tag as every other page), so the client hydrates and re-renders
      // identically to a real navigation - full <svelte:head> cascade included, plus
      // +error.svelte's own <PageMetadata text="404" description="oh no!"/> - and this
      // fallback is only ever served for a genuinely unmatched path (this app prerenders all
      // 27 real routes), so the gap is a sub-second first-paint window, not a persistent
      // difference. Revisit only if Task 9's exit matrix shows a real user-visible
      // consequence.
      fallback: '404.html',
      precompress: false,
      strict: true,
    }),
    paths: {
      base: basePath,
      // absolute asset URLs, mirroring the old app's output; relative refs
      // would break bare /genshinMusic (no trailing slash) on the
      // single-domain deploy
      relative: false,
    },
    alias: {
      $game: `./src/lib/games/${gameId}`,
      $core: './src/lib/core',
      $cmp: './src/lib/components',
      $stores: './src/lib/stores',
      $i18n: './src/lib/i18n',
    },
    // Phase 5 Task 1: Kit auto-registers src/service-worker.ts by default; this app
    // registers it manually instead (Task 2), exactly as old's next.config.js set
    // `register: false` on its `withSerwist` call for the same reason (see
    // src/service-worker.ts's own header). Must land in the same commit as that file
    // — without this, Kit's default auto-registration and Task 2's manual one would
    // both run.
    serviceWorker: {
      register: false,
    },
    prerender: {
      // Nothing links to the sitemap, so the crawler never reaches it on its own. Written
      // base-RELATIVE: Kit prepends the configured base to each entry itself, and a
      // base-prefixed one here builds /skyMusic/skyMusic/sitemap.xml and fails the *-no-root
      // builds. Any broken internal link or asset the crawler finds fails the build (Kit's
      // default handleHttpError) - on the *-no-root builds that includes every href/src that
      // forgot `base`/AppLink.
      entries: ['*', '/sitemap.xml'],
    },
  },
};

export default config;
