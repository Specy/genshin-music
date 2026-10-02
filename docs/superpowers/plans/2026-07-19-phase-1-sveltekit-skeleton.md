# Phase 1: SvelteKit Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the repo root with a SvelteKit 2 + Svelte 5 skeleton on new branch `migration/sveltekit` — Next app and Tauri removed, per-game build pipeline and CI working, all 27 routes prerendering as stubs for both games — without touching the golden-fixture ground truth.

**Architecture:** Root replacement on a fork of `migration/next16-react19` (old code stays reachable via git). Game selection stays an env-var contract (`PUBLIC_GAME`, lowercase id) resolved at build time through a `$game` alias in `svelte.config.js`. Static export parity: every route prerendered, `trailingSlash` left at SvelteKit's default `'never'` so output is flat `<route>.html` files exactly like the current Next export. Shared runtime assets move `public/` → `static/`; per-game payloads move to `src/lib/games/<id>/static/` and are overlaid into `static/` by the build scripts (overlay paths gitignored — an improvement over today's committed-then-overwritten files).

**Tech Stack:** SvelteKit 2, Svelte 5, Vite, `@sveltejs/adapter-static`, TypeScript, sass, eslint (flat config) + `eslint-plugin-svelte`, `svelte-check`, Vitest (suite parked until Phase 2).

**Parent spec:** `docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md` (§4 architecture, §7 build pipeline, §8 Tauri removal, §10 Phase 1). Phase-0 carry-forwards: `.superpowers/sdd/progress.md`.

## Global Constraints

- All work lands on new branch `migration/sveltekit`, forked from `migration/next16-react19` AFTER this plan is committed there. Nothing merges to `main`.
- `test/` is ground truth: fixtures are NEVER modified or regenerated in this phase. The only permitted `test/` edit is the one named in Task 5 (a README paragraph, nothing else). The suite is EXPECTED RED until Phase 2 repoints `test/imports.ts`.
- npm script names are preserved verbatim: `dev:sky`, `dev:genshin`, `build:sky`, `build:genshin`, `build:sky-no-root`, `build:genshin-no-root`, `build:all`, `build:all-no-root`, `preview`, `preview:sky`, `preview:genshin`, `test`, `test:genshin`, `test:sky`, `test:update-fixtures`.
- Build output dirs are byte-named `build/skyMusic` and `build/genshinMusic`; root builds go to `build/`.
- **Base-path contract (quirky, preserve exactly):** `buildApp.js <Game>` with NO third arg → base path `''` (this is what production `build:all` uses); any third arg (the scripts pass the string `"false"`) → base path `/skyMusic` | `/genshinMusic`. I.e. the `-no-root` script variants are the ones WITH a subpath prefix. Do not "fix" this.
- Output URL shape: flat `player.html` (NOT `player/index.html`) — `trailingSlash` stays `'never'` (SvelteKit default). Do not set `trailingSlash: 'always'` anywhere.
- Game ids: lowercase `genshin` | `sky` (env `PUBLIC_GAME`, asset paths, folder names). `storageId` stays cased `Genshin` | `Sky` (games modules carry both; never derive one from the other).
- Survivors that must NOT be deleted: `static/` relocations from Task 1 (`assets/` 22MB shared audio+model, `locales/`, `updates.json`), `src/lib/games/*/static/` payloads, `test/`, `test-songs/`, `docs/`, `LICENSE`, all `README*.md`, `.github/` (3 deploy workflows, updated in Task 6).
- `events@^3.3.0` is a required runtime dependency (ZangoDB-under-Vite spike verdict) — added now even though zangodb arrives in Phase 2.
- No service worker in this phase (spec §10: SW is Phase 5). Nothing registers or emits one.
- Node ≥ 20.19.0. Every task ends with a commit on `migration/sveltekit`.
- Dependency versions: install `@latest` and record resolved versions in the task report — do not pin guessed versions in files by hand (exception: `events@^3.3.0`, an explicit spike requirement).

---

### Task 1: Branch, relocations, deletions

**Files:**

- Branch: create `migration/sveltekit`
- Move: `public/assets` → `static/assets`; `public/locales` → `static/locales`; `public/updates.json` → `static/updates.json`
- Move: `src/appData/genshin` → `src/lib/games/genshin/static`; `src/appData/sky` → `src/lib/games/sky/static`
- Delete (tracked): rest of `src/`, rest of `public/`, `src-tauri/`, `target/`, `next.config.js`, `next-env.d.ts`, `.eslintrc.json`, `tsconfig.json`, `tsconfig.tsbuildinfo`, `.env.example`, `vitest.config.ts`, `.github/workflows/BuildTauri.yml`

**Interfaces:**

- Consumes: nothing.
- Produces: the directory contract every later task assumes — `static/{assets,locales,updates.json}` committed; `src/lib/games/{genshin,sky}/static/` each containing exactly `favicon.ico`, `logo192.png`, `logo512.png`, `manifest.json`, `robots.txt`, `manifestData/`; `test/`, `test-songs/`, `docs/`, `scripts/`, `.github/` (3 workflows), `README*`, `LICENSE`, `.gitignore`, `.npmrc`, `package.json` still present (rewritten by later tasks).

- [ ] **Step 1: Create the branch**

```bash
git checkout -b migration/sveltekit
```

Expected: on `migration/sveltekit`, clean status (only untracked `.claude/`, which is never touched).

- [ ] **Step 2: Relocate shared public assets (history-preserving)**

```bash
mkdir -p static
git mv public/assets static/assets
git mv public/locales static/locales
git mv public/updates.json static/updates.json
```

- [ ] **Step 3: Relocate per-game payloads**

`src/appData` moves out before `src/` is deleted; two-step via repo-root temp name so `git mv` never fights the later delete:

```bash
git mv src/appData appData-tmp
mkdir -p src/lib/games
git mv appData-tmp/genshin src/lib/games/genshin/static
git mv appData-tmp/sky src/lib/games/sky/static
```

(`appData-tmp` is now empty and gone from the index automatically.)

- [ ] **Step 4: Delete the old app + Tauri + stale files**

Delete every tracked file under `src/` EXCEPT `src/lib/games/**` (Step 3 already moved the payloads there), then the rest:

```bash
git ls-files src | grep -v "^src/lib/games/" | xargs git rm -q
git rm -r -q public src-tauri target
git rm -q next.config.js next-env.d.ts .eslintrc.json tsconfig.json .env.example vitest.config.ts .github/workflows/BuildTauri.yml
git rm -q --ignore-unmatch tsconfig.tsbuildinfo
```

- [ ] **Step 5: Verify the survivor contract**

```bash
git status --porcelain | head -5
ls src/lib/games/genshin/static src/lib/games/sky/static
ls static
ls test | head -5
git ls-files src | grep -v "^src/lib/games/" | wc -l
```

Expected: `src/lib/games/{genshin,sky}/static/` each show `favicon.ico logo192.png logo512.png manifest.json manifestData robots.txt`; `static` shows `assets locales updates.json`; the final count is `0` (nothing tracked in src outside games); `test/` intact.

History check (spot): `git log --follow --oneline -- static/updates.json | head -3` shows pre-move history.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore!: remove Next app and Tauri; relocate shared and per-game assets

Root replacement for the SvelteKit skeleton (spec §10 Phase 1, §8 Tauri
removal). Old implementation remains on migration/next16-react19."
```

---

### Task 2: SvelteKit scaffold (buildable for both games)

**Files:**

- Create: `package.json` (full rewrite), `svelte.config.js`, `vite.config.ts`, `tsconfig.json`, `src/app.html`, `src/app.d.ts`, `src/lib/games/skeleton.ts`, `src/lib/games/genshin/index.ts`, `src/lib/games/sky/index.ts`, `src/routes/+layout.ts`, `src/routes/+layout.svelte`, `src/routes/+page.svelte`
- Modify: `.gitignore`
- Delete: `.npmrc`, `package-lock.json` (regenerated)

**Interfaces:**

- Consumes: Task 1's directory contract.
- Produces: `$game` alias resolving to `src/lib/games/<id>` from env `PUBLIC_GAME` (`'sky'` → sky, anything else → genshin); each game module exports `const game: GameSkeleton` where `GameSkeleton = {id: 'genshin'|'sky', storageId: 'Genshin'|'Sky', displayName: string}`; `npm run build` = `vite build` honoring `BUILD_PATH`/`PUBLIC_BASE_PATH`; aliases `$core`, `$cmp`, `$stores`, `$i18n` pre-declared for later phases.

- [ ] **Step 1: Write the new package.json**

```json
{
  "name": "genshin-music",
  "engines": {
    "node": ">=20.19.0"
  },
  "type": "module",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "preview": "npx serve@latest build",
    "preview:sky": "npx serve@latest build/skyMusic",
    "preview:genshin": "npx serve@latest build/genshinMusic",
    "check": "svelte-kit sync && svelte-check --tsconfig ./tsconfig.json",
    "lint": "eslint .",
    "build:sky": "node ./scripts/buildApp.js Sky",
    "build:genshin": "node ./scripts/buildApp.js Genshin",
    "build:sky-no-root": "node ./scripts/buildApp.js Sky false",
    "build:genshin-no-root": "node ./scripts/buildApp.js Genshin false",
    "build:all": "node ./scripts/buildApp.js All",
    "build:all-no-root": "node ./scripts/buildApp.js All false",
    "dev:sky": "node ./scripts/startApp.js Sky",
    "dev:genshin": "node ./scripts/startApp.js Genshin",
    "test": "npm run test:genshin && npm run test:sky",
    "test:genshin": "cross-env PUBLIC_GAME=genshin vitest run",
    "test:sky": "cross-env PUBLIC_GAME=sky vitest run",
    "test:update-fixtures": "cross-env UPDATE_FIXTURES=true npm run test"
  },
  "dependencies": {
    "events": "^3.3.0"
  }
}
```

Then delete `.npmrc` (the babel/eslint peer conflict left with the React stack — Phase-0 carry-forward) and the stale `package-lock.json`, and install the toolchain at latest:

```bash
rm .npmrc package-lock.json
npm install -D @sveltejs/kit@latest @sveltejs/adapter-static@latest @sveltejs/vite-plugin-svelte@latest svelte@latest vite@latest svelte-check@latest typescript@latest sass@latest vitest@latest jsdom@latest fake-indexeddb@latest eslint@latest eslint-plugin-svelte@latest typescript-eslint@latest globals@latest cross-env@latest fs-extra@latest cli-color@latest url-join@latest
```

Expected: clean install with NO peer-dependency errors and NO `.npmrc` present (record resolved major versions in your report). If ERESOLVE appears, STOP and report — do not re-add legacy-peer-deps.

- [ ] **Step 2: Write svelte.config.js**

```js
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Build-time game selection (spec §5.5): lowercase game id via PUBLIC_GAME.
// The unselected game's module tree is simply never imported.
const gameId = process.env.PUBLIC_GAME === 'sky' ? 'sky' : 'genshin';
const outDir = process.env.BUILD_PATH ?? 'build';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: outDir,
      assets: outDir,
      fallback: '404.html',
      precompress: false,
      strict: true,
    }),
    paths: {
      // '' for production build:all; '/skyMusic' | '/genshinMusic' for *-no-root builds
      base: process.env.PUBLIC_BASE_PATH ?? '',
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
  },
};

export default config;
```

- [ ] **Step 3: Write vite.config.ts**

```ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  // Golden-fixture suite (parked until Phase 2 repoints test/imports.ts).
  // jsdom's default UA is desktop — REQUIRED: settings fixtures were
  // captured with desktop defaults (see test/README.md).
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write tsconfig.json, app.html, app.d.ts**

`tsconfig.json`:

```json
{
  "extends": "./.svelte-kit/tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "moduleResolution": "bundler"
  }
}
```

`src/app.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover">
    <div style="display: contents">%sveltekit.body%</div>
  </body>
</html>
```

`src/app.d.ts`:

```ts
declare global {
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
```

- [ ] **Step 5: Write the game skeleton modules**

`src/lib/games/skeleton.ts`:

```ts
// Phase-1 placeholder shape. Phase 2 replaces this with the full
// GameDefinition from docs/superpowers/audits/2026-07-19-app-name-audit.md.
export interface GameSkeleton {
  /** lowercase id: asset paths, PUBLIC_GAME env, folder names */
  id: 'genshin' | 'sky';
  /** LEGACY-LOCKED cased id: IndexedDB name, localStorage prefixes,
   *  appName inside serialized songs. Never derived from `id`. */
  storageId: 'Genshin' | 'Sky';
  displayName: string;
}
```

`src/lib/games/genshin/index.ts`:

```ts
import type { GameSkeleton } from '../skeleton';

export const game: GameSkeleton = {
  id: 'genshin',
  storageId: 'Genshin',
  displayName: 'Genshin Music Nightly',
};
```

`src/lib/games/sky/index.ts`:

```ts
import type { GameSkeleton } from '../skeleton';

export const game: GameSkeleton = {
  id: 'sky',
  storageId: 'Sky',
  displayName: 'Sky Music Nightly',
};
```

- [ ] **Step 6: Write the root layout and home stub**

`src/routes/+layout.ts`:

```ts
// Spec §4.2: every route prerenders at build time; no runtime server.
export const prerender = true;
```

`src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  let { children } = $props();
</script>

{@render children()}
```

`src/routes/+page.svelte`:

```svelte
<script lang="ts">
  import { game } from '$game';
</script>

<svelte:head>
  <title>{game.displayName}</title>
</svelte:head>

<main>
  <h1>{game.displayName}</h1>
  <p>SvelteKit skeleton — Phase 1. Pages arrive in Phase 4.</p>
</main>
```

- [ ] **Step 7: Update .gitignore**

Replace the Next-era entries; final content:

```
# dependencies
/node_modules

# sveltekit
/.svelte-kit

# production
/build
/dist
/out

# per-game static overlay (copied from src/lib/games/<id>/static by scripts)
/static/favicon.ico
/static/logo192.png
/static/logo512.png
/static/robots.txt
/static/manifest.json
/static/manifestData

# testing
/coverage

# misc
.DS_Store
.VSCodeCounter
.env
.env.local
npm-debug.log*
.idea
build-stats.html
```

- [ ] **Step 8: Verify both games build**

```bash
npx svelte-kit sync
npx cross-env PUBLIC_GAME=genshin npm run build
grep -c "Genshin Music Nightly" build/index.html
npx cross-env PUBLIC_GAME=sky npm run build
grep -c "Sky Music Nightly" build/index.html
ls build | head
```

Expected: both builds succeed; each grep ≥ 1 (prerendered title/h1 in the HTML — proves the `$game` alias switches by env); `build/` contains `index.html` and `404.html` (flat files, no `index/` directory).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: SvelteKit 2 skeleton with env-selected \$game alias, static adapter"
```

---

### Task 3: All route stubs (27 pages + error page)

**Files:**

- Create: `src/lib/components/PageStub.svelte`, `src/routes/+error.svelte`
- Create: one `+page.svelte` per route listed in Step 2's table (26 new files; home exists from Task 2)

**Interfaces:**

- Consumes: `$game` (`game.displayName`), `PageStub` component.
- Produces: URL surface identical to the current app — later phases replace stub bodies in place, never move routes.

- [ ] **Step 1: Write the stub component and error page**

`src/lib/components/PageStub.svelte`:

```svelte
<script lang="ts">
  import { game } from '$game';

  let { title }: { title: string } = $props();
</script>

<svelte:head>
  <title>{title} - {game.displayName}</title>
</svelte:head>

<main>
  <h1>{title}</h1>
  <p>Stub — ported in Phase 4.</p>
</main>
```

`src/routes/+error.svelte`:

```svelte
<script lang="ts">
  import { page } from '$app/state';
</script>

<main>
  <h1>{page.status}</h1>
  <p>{page.error?.message ?? 'Something went wrong'}</p>
</main>
```

- [ ] **Step 2: Create every route stub**

Each file below is EXACTLY this content, with its row's title substituted:

```svelte
<script lang="ts">
  import PageStub from '$cmp/PageStub.svelte';
</script>

<PageStub title="Player" />
```

| Route file                                                    | title                    |
| ------------------------------------------------------------- | ------------------------ |
| `src/routes/player/+page.svelte`                              | Player                   |
| `src/routes/composer/+page.svelte`                            | Composer                 |
| `src/routes/vsrg-composer/+page.svelte`                       | Vsrg Composer            |
| `src/routes/vsrg-player/+page.svelte`                         | Vsrg Player              |
| `src/routes/zen-keyboard/+page.svelte`                        | Zen Keyboard             |
| `src/routes/sheet-visualizer/+page.svelte`                    | Sheet Visualizer         |
| `src/routes/theme/+page.svelte`                               | Theme                    |
| `src/routes/keybinds/+page.svelte`                            | Keybinds                 |
| `src/routes/backup/+page.svelte`                              | Backup                   |
| `src/routes/transfer/+page.svelte`                            | Transfer                 |
| `src/routes/changelog/+page.svelte`                           | Changelog                |
| `src/routes/partners/+page.svelte`                            | Partners                 |
| `src/routes/donate/+page.svelte`                              | Donate                   |
| `src/routes/privacy/+page.svelte`                             | Privacy                  |
| `src/routes/delete-cache/+page.svelte`                        | Delete Cache             |
| `src/routes/error/+page.svelte`                               | Error                    |
| `src/routes/uma-mode/+page.svelte`                            | Uma Mode                 |
| `src/routes/blog/+page.svelte`                                | Blog                     |
| `src/routes/blog/posts/add-to-home-screen/+page.svelte`       | Add To Home Screen       |
| `src/routes/blog/posts/connect-midi-device/+page.svelte`      | Connect Midi Device      |
| `src/routes/blog/posts/easyplay-1s/+page.svelte`              | Easyplay 1s              |
| `src/routes/blog/posts/how-to-use-composer/+page.svelte`      | How To Use Composer      |
| `src/routes/blog/posts/how-to-use-player/+page.svelte`        | How To Use Player        |
| `src/routes/blog/posts/how-to-use-vsrg-composer/+page.svelte` | How To Use Vsrg Composer |
| `src/routes/blog/posts/midi-transpose/+page.svelte`           | Midi Transpose           |
| `src/routes/blog/posts/video-audio-transpose/+page.svelte`    | Video Audio Transpose    |

(The 8 blog slugs are verbatim from the current `src/app/blog/posts/` on the parent branch — also listed in `docs/superpowers/audits/2026-07-19-storage-inventory.md`.)

- [ ] **Step 3: Verify the exact output surface**

```bash
npx cross-env PUBLIC_GAME=genshin npm run build
node -e "
const fs = require('fs');
const expected = ['404.html','backup.html','blog.html','changelog.html','composer.html','delete-cache.html','donate.html','error.html','index.html','keybinds.html','partners.html','player.html','privacy.html','sheet-visualizer.html','theme.html','transfer.html','uma-mode.html','vsrg-composer.html','vsrg-player.html','zen-keyboard.html'];
const got = fs.readdirSync('build').filter(f => f.endsWith('.html')).sort();
const missing = expected.filter(e => !got.includes(e));
const posts = fs.readdirSync('build/blog/posts').sort();
const expectedPosts = ['add-to-home-screen.html','connect-midi-device.html','easyplay-1s.html','how-to-use-composer.html','how-to-use-player.html','how-to-use-vsrg-composer.html','midi-transpose.html','video-audio-transpose.html'];
const missingPosts = expectedPosts.filter(e => !posts.includes(e));
if (missing.length || missingPosts.length) { console.error('MISSING', missing, missingPosts); process.exit(1); }
console.log('ROUTE SURFACE OK:', got.length, 'root html files,', posts.filter(p=>p.endsWith('.html')).length, 'blog posts');
"
```

Expected: `ROUTE SURFACE OK: 20 root html files, 8 blog posts`. (Flat `.html` naming throughout — if you see `player/index.html`, `trailingSlash` got changed somewhere: stop and fix that instead.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: stub all 27 routes with prerendered flat-html output parity"
```

---

### Task 4: Per-game build & dev scripts

**Files:**

- Create: `scripts/gameStatic.js` (shared helper)
- Rewrite: `scripts/buildApp.js`, `scripts/startApp.js`
- Delete: `scripts/buildAndPrepareTauriRelease.js`, `scripts/checkAppRouterMigration.mjs`

**Interfaces:**

- Consumes: game payloads at `src/lib/games/<id>/static/`; `npm run build` (Task 2); env contract `PUBLIC_GAME`/`PUBLIC_BASE_PATH`/`BUILD_PATH`/`PUBLIC_SW_VERSION`.
- Produces: the exact npm-script surface named in Global Constraints, producing `build/{skyMusic,genshinMusic}` (or root `build/`); `prepareGameStatic(id: string, basePath: string): Promise<void>` from `scripts/gameStatic.js` (copies the game payload into `static/` and rewrites the manifest for the base path).

- [ ] **Step 0: Write the shared helper scripts/gameStatic.js**

```js
import fse from 'fs-extra';
import urlJoin from 'url-join';
import clc from 'cli-color';

/**
 * Copy src/lib/games/<id>/static into static/ (gitignored overlay paths)
 * and rewrite static/manifest.json for the given base path.
 * Mirrors the old public/-copy + updateManifest behavior byte-for-byte.
 */
export async function prepareGameStatic(id, basePath) {
  await fse.copy(`./src/lib/games/${id}/static`, './static', { overwrite: true });
  try {
    const manifest = await fse.readJson('./static/manifest.json');
    if (manifest.icons)
      manifest.icons = manifest.icons.map((icon) => ({
        ...icon,
        src: urlJoin(basePath, icon.src),
      }));
    if (manifest.start_url) manifest.start_url = basePath || '.';
    if (manifest.screenshots)
      manifest.screenshots = manifest.screenshots.map((screenshot) => ({
        ...screenshot,
        src: urlJoin(basePath, screenshot.src),
      }));
    if (manifest.file_handlers) {
      manifest.file_handlers = manifest.file_handlers.map((handler) => {
        const icons = handler.icons.map((icon) => ({ ...icon, src: urlJoin(basePath, icon.src) }));
        const action = basePath || '.';
        return { ...handler, icons, action };
      });
    }
    await fse.writeFile('./static/manifest.json', JSON.stringify(manifest, null, 2));
  } catch (e) {
    console.log(clc.red('[Error]: There was an error updating the manifest'));
    console.error(e);
    process.exit(1);
  }
}
```

(Behavior note vs the old scripts: the old `startApp.js` set `start_url` to `""` while `buildApp.js` set `"."` — both resolve identically for a dev server; the helper standardizes on the build script's `basePath || '.'`.)

- [ ] **Step 1: Rewrite scripts/buildApp.js**

```js
import clc from 'cli-color';
import { execSync } from 'child_process';
import { prepareGameStatic } from './gameStatic.js';

const GAMES = {
  Sky: { id: 'sky', outDir: 'skyMusic' },
  Genshin: { id: 'genshin', outDir: 'genshinMusic' },
};
const chosenApp = process.argv[2];
const date = new Date();
const SW_VERSION = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`;

if (!['Genshin', 'Sky', 'All'].includes(chosenApp)) {
  console.error('Please specify an app name [Sky / Genshin / All]');
  process.exit(1);
}

async function execute() {
  const toBuild = chosenApp === 'All' ? ['Sky', 'Genshin'] : [chosenApp];
  try {
    for (const app of toBuild) {
      const { id, outDir } = GAMES[app];
      // Historical quirk, preserved: NO third argv → base '' (production
      // build:all); ANY third argv (scripts pass "false") → subpath base.
      const basePath = Boolean(process.argv[3]) ? `/${outDir}` : '';
      console.log(clc.bold.yellow(`Building ${app}...`));
      await prepareGameStatic(id, basePath);
      execSync('npm run build', {
        stdio: 'inherit',
        env: {
          ...process.env,
          PUBLIC_GAME: id,
          PUBLIC_SW_VERSION: SW_VERSION,
          PUBLIC_BASE_PATH: basePath,
          BUILD_PATH: `./build/${outDir}`,
        },
      });
      console.log(clc.green(`${app} build complete \n`));
    }
    console.log(clc.bold.green('Build complete \n'));
    process.exit(0);
  } catch (e) {
    console.log(clc.red('[Error]: There was an error building'));
    console.error(e);
    process.exit(1);
  }
}

execute();
```

(Cross-platform note: the old script had Windows/Linux `set X=…&&` branches; passing `env:` to `execSync` replaces both — keep it that way.)

- [ ] **Step 2: Rewrite scripts/startApp.js**

```js
import clc from 'cli-color';
import { execSync } from 'child_process';
import { prepareGameStatic } from './gameStatic.js';

const GAMES = {
  Sky: { id: 'sky' },
  Genshin: { id: 'genshin' },
};
const chosenApp = process.argv[2];

if (!['Genshin', 'Sky'].includes(chosenApp)) {
  console.error('Please specify an app name [Sky/Genshin]');
  process.exit(1);
}

async function execute() {
  const { id } = GAMES[chosenApp];
  await prepareGameStatic(id, '');
  console.log(clc.yellow.bold(`Starting ${chosenApp} dev server`));
  execSync('npm run dev', {
    stdio: 'inherit',
    env: { ...process.env, PUBLIC_GAME: id },
  });
}

execute();
```

- [ ] **Step 3: Delete the obsolete scripts**

```bash
git rm scripts/buildAndPrepareTauriRelease.js scripts/checkAppRouterMigration.mjs
```

- [ ] **Step 4: Verify all four build shapes**

```bash
npm run build:all
ls build/genshinMusic/player.html build/skyMusic/player.html
grep -c "Sky Music Nightly" build/skyMusic/index.html
node -e "const m=require('fs').readFileSync('build/genshinMusic/manifest.json','utf8');const j=JSON.parse(m);console.log('start_url:',j.start_url)"
npm run build:all-no-root
grep -c "/genshinMusic/_app" build/genshinMusic/index.html
```

Expected: `build:all` → both dirs exist with flat `player.html`, Sky title in Sky build, manifest `start_url: .` (empty base). `build:all-no-root` → asset URLs prefixed `/genshinMusic` (base path applied). Note `build:all` overwrites the per-game dirs from the previous run — expected.

Dev smoke:

```bash
npm run dev:genshin &   # or run_in_background
sleep 6 && curl -s http://localhost:5173 | grep -c "Genshin Music Nightly"
kill %1
```

Expected: `1` (title served). (On Windows, kill the background process via the harness's background-task stop instead of `kill %1`.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: per-game build/dev scripts for SvelteKit (env contract preserved)"
```

---

### Task 5: Lint, check, and parked-test wiring

**Files:**

- Create: `eslint.config.js`
- Modify: `test/README.md` (one paragraph — the ONLY permitted test/ edit)

**Interfaces:**

- Consumes: toolchain devDeps from Task 2.
- Produces: `npm run check` and `npm run lint` green; `npm test` in its documented parked state.

- [ ] **Step 1: Write eslint.config.js (flat config)**

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';

export default ts.config(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs['flat/recommended'],
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
  {
    // Parked until Phase 2 repoints the barrel; fixtures are data.
    ignores: ['build/', '.svelte-kit/', 'static/', 'test/', 'node_modules/'],
  }
);
```

(If the installed `eslint-plugin-svelte` major exposes `svelte.configs.recommended` instead of `['flat/recommended']`, use the installed package's documented flat-config export — check its README in node_modules; adjust only that line.)

- [ ] **Step 2: Verify check and lint**

```bash
npm run check
npm run lint
```

Expected: `svelte-check` → 0 errors, 0 warnings; eslint → no output (clean). If svelte-check reports errors inside `test/` (it should not — `test/` is outside the generated include set), add `"exclude": ["test"]` next to `"extends"` in `tsconfig.json` and re-run.

- [ ] **Step 3: Document the parked suite**

In `test/README.md`, append this paragraph at the end:

```markdown
## Phase 1 status (parked)

The app source this suite verified was removed with the Next app; the suite
resumes in Phase 2 when `test/imports.ts` is repointed at the ported core
(`$core/...`). Until then `npm test` fails at import resolution — that is the
expected state; fixtures remain the untouched ground truth. Env var changed:
game selection is now `PUBLIC_GAME=genshin|sky` (fixture directories keep
their legacy cased names `Genshin`/`Sky`; the barrel will export the game's
`storageId` under the name `APP_NAME` to bridge that).
```

- [ ] **Step 4: Verify the parked state is the EXPECTED failure**

```bash
npm run test:genshin; echo "exit: $?"
```

Expected: vitest fails during COLLECTION with unresolved imports (e.g. `Failed to resolve import "$lib/Songs/Layer"` or `$config`) — NOT with a config/plugin crash. Exit code nonzero. If the failure is a vite/sveltekit plugin crash instead of import resolution, replace the `test` block approach: create `vitest.config.ts` WITHOUT the sveltekit plugin, mirroring the aliases manually:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
  resolve: {
    alias: {
      $game: path.resolve(
        `./src/lib/games/${process.env.PUBLIC_GAME === 'sky' ? 'sky' : 'genshin'}`
      ),
      $core: path.resolve('./src/lib/core'),
      $cmp: path.resolve('./src/lib/components'),
      $stores: path.resolve('./src/lib/stores'),
      $i18n: path.resolve('./src/lib/i18n'),
    },
  },
});
```

(and remove the `test` block from `vite.config.ts`). Record which variant you landed in the report.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: eslint flat config, svelte-check green, golden suite parked for Phase 2"
```

---

### Task 6: CI workflows

**Files:**

- Modify: `.github/workflows/Deploy.yml`, `.github/workflows/deployBeta.yml`, `.github/workflows/deployBetaSingleDomain.yml`

**Interfaces:**

- Consumes: npm scripts from Task 4 (names unchanged, so build steps keep working by name).
- Produces: CI that builds the SvelteKit app and publishes to the SAME Cloudflare Pages projects and directories as today.

- [ ] **Step 1: Update each workflow's environment, not its shape**

In ALL THREE files apply exactly these edits (the publish steps, project names, secrets — `CF_PAGES_TOKEN`, `CF_ACCOUNT_ID` — and published directories stay untouched):

1. `node-version` → `22` (was 20.2.0 / 16.x — below the new `engines` floor).
2. The dependency-install step → `run: npm ci`.
3. Any `NEXT_PUBLIC_IS_BETA` env key → `PUBLIC_IS_BETA` (same value; deployBeta.yml and deployBetaSingleDomain.yml only). The variable is consumed again in a later phase; keeping it wired now costs nothing.
4. No other keys change: triggers, build commands (`npm run build:all`, `npm run build:all-no-root`), wrangler-action steps, artifact dirs (`./build/genshinMusic`, `./build/skyMusic`, `./build/`) are already correct because the npm-script surface and output dirs were preserved.

- [ ] **Step 2: Verify by inspection greps**

```bash
grep -rn "node-version" .github/workflows
grep -rn "NEXT_PUBLIC" .github/workflows; echo "expect no output above"
grep -rn "npm ci\|npm i" .github/workflows
grep -rn "build:all" .github/workflows
ls .github/workflows
```

Expected: every `node-version: 22`; zero `NEXT_PUBLIC` hits; `npm ci` in all three; `build:all`/`build:all-no-root` intact; exactly 3 workflow files (BuildTauri.yml gone since Task 1).

- [ ] **Step 3: Commit**

```bash
git add .github
git commit -m "ci: node 22, npm ci, PUBLIC_IS_BETA for SvelteKit builds"
```

---

### Task 7: Phase-1 exit verification

**Files:** none created (verification only; fixes go in amendment commits if anything fails).

**Interfaces:** consumes everything; produces the phase gate.

- [ ] **Step 1: Old-world remnant greps**

```bash
node -e "const p=require('./package.json');const all={...p.dependencies,...p.devDependencies};const bad=Object.keys(all).filter(d=>/react|next|mobx|@pixi|tauri|serwist|i18next/.test(d));console.log(bad.length?'BAD DEPS: '+bad:'DEPS CLEAN')"
git ls-files | grep -iE "tauri|next\.config|\.eslintrc" ; echo "expect no output above"
git grep -l "NEXT_PUBLIC" -- ':!docs' ':!test' ; echo "expect no output above (docs/test keep historical references)"
```

Expected: `DEPS CLEAN`; no tracked tauri/next files; no `NEXT_PUBLIC` outside docs/ and the parked test/ barrel.

- [ ] **Step 2: Full build-matrix run**

```bash
npm run build:all
npm run build:all-no-root
npm run check
npm run lint
```

Expected: all green. Confirm once more: `ls build/genshinMusic | grep -c "\.html$"` ≥ 20 (flat files).

- [ ] **Step 3: Survivor spot-checks**

```bash
ls static/assets/audio | head -4
ls static/locales
node -e "console.log(Object.keys(require('./static/updates.json')))"
git log --oneline -1 -- test/fixtures
```

Expected: audio folders (`genshin`, `sky`, `MetronomeSFX`, …), 9 locale JSONs, updates.json parses, and the fixtures' last commit is still the Phase-0 one (untouched this phase).

- [ ] **Step 4: Commit any verification fixes; final ledger note**

If Steps 1-3 required fixes, commit them as `fix: phase-1 exit criteria — <what>`. Then append one line to `.superpowers/sdd/progress.md` marking Phase 1 complete with the HEAD SHA.

---

## Phase-1 exit criteria (all must hold)

1. Branch `migration/sveltekit` exists; root is a SvelteKit app; the Next app, Tauri, and their configs/deps are gone (Task 7 greps clean).
2. `npm run build:all` → `build/genshinMusic` + `build/skyMusic`, and `build:all-no-root` → root `build/`, all with flat `<route>.html` output (20 root pages + 8 blog posts + 404.html) and correct per-game titles/base paths.
3. `npm run dev:genshin` / `dev:sky` serve the correct game.
4. `npm run check` and `npm run lint` green.
5. `npm test` fails ONLY with the documented import-resolution parked state; `test/fixtures/**` untouched since Phase 0.
6. Three CI workflows target node 22 / `npm ci` / `PUBLIC_IS_BETA`, publish steps unchanged; `BuildTauri.yml` deleted.
7. `static/` carries the shared survivors; `src/lib/games/{genshin,sky}/static/` carry the per-game payloads; overlay paths are gitignored.
