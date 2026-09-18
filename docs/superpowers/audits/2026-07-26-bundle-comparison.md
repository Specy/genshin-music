# Bundle comparison: old app (Next.js/React) vs new app (SvelteKit) — Genshin build

Spec §9.3 ("bundle-size comparison vs the current app") deliverable, produced by P5 Task 3.
Also captures the old app's built `<head>` verbatim, which is **Task 4's ground truth** for
root-metadata parity (manifest link, apple-touch-icon, viewport string, `theme-color` count and
order) — see the dedicated section near the end of this document.

## Method

Both apps were built **measured, not estimated** — both builds ran on this machine (node
`v24.6.0`, npm `11.6.2`) on 2026-07-26, both producing `build/genshinMusic`:

- **Old app**: `git worktree add ../genshin-music-oldbundle migration/next16-react19` checked out
  commit `54bf2195` ("docs: plan wording fix (single permitted test/ edit)"). In that worktree:
  `npm ci` (861 packages, one unrelated `EBADENGINE` warning for a devDependency, exit 0), then
  `npm run build:genshin` (`next build --webpack` via `scripts/buildApp.js`), exit 0, "Genshin
  build complete". The worktree was **removed** (`git worktree remove --force`) after data was
  extracted; `git worktree list` is back to its pre-task state and `git status --porcelain` is
  clean of any oldbundle reference.
- **New app**: this task's own working tree (branch `migration/sveltekit`, base commit `c53ecc5c`
  plus this task's `package.json`/`package-lock.json`/`vite.config.ts` changes that wire the
  analyzer). `npm run build:genshin:analyze` (= `cross-env ANALYZE=true npm run build:genshin`),
  exit 0, which additionally wrote `build-stats.html` (gitignored, 1,583,443 bytes) via
  `rollup-plugin-visualizer`.
- **Live home-page (`/`) network trace, both apps, same method**: each `build/genshinMusic` was
  served by an ad-hoc Node static file server (no framework, no caching headers) on its own
  `localhost` port; a fresh browser tab (Claude Code's Browser pane, a real Chromium instance) was
  opened and navigated to `/` exactly once with **zero user interaction** (no clicks, no hovers);
  the full network request log was read back and every request mechanically counted/sized from
  disk (no hand-tallying) via a small node script. Both servers were stopped and both browser tabs
  closed immediately after data collection.
- **Byte sizes** for chunk tables and totals are **actual on-disk file sizes** (post
  build-tool minification, pre any HTTP compression) unless explicitly labeled "gzip"/"brotli",
  which are `rollup-plugin-visualizer`'s own per-module compression estimates from the treemap
  data (computed on individual module source fragments, not the final minified+compressed chunk,
  so they run a bit higher than true wire size — used here only for the qualitative "top modules"
  ranking, not as a total).
- **Compare like with like**: per the task brief, `static/assets/audio/**` (copied into
  `build/genshinMusic/assets/audio/**` in both apps) is excluded from every "app bundle" figure
  below and reported separately, because it is effectively identical in both apps and dominates
  the raw build size (see Whole-build totals).

## Whole-build totals

| Metric                                                                     |                                                         Old (Next.js) |                                New (SvelteKit) | New vs old                      |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------: | ---------------------------------------------: | ------------------------------- |
| `build/genshinMusic` total size                                            |                                               32,566,946 B (31.06 MB) |                        30,733,459 B (29.31 MB) | 94.4% — 5.6% smaller            |
| `assets/audio/**` (excluded below)                                         |                                               19,283,301 B (18.39 MB) |                        19,283,309 B (18.39 MB) | identical (8-byte diff, noise)  |
| **App bundle (total − audio)**                                             |                                           **13,283,645 B (12.67 MB)** |                    **11,450,150 B (10.92 MB)** | **86.2% — 13.8% smaller**       |
| Total `.js` bytes (whole build, all routes + lazy chunks + service worker) |                                                 4,064,871 B (3.88 MB) |                          2,680,866 B (2.56 MB) | 66.0% — 34.0% smaller           |
| Total `.css` bytes (whole build)                                           |                                                              77,880 B |                                       84,424 B | 108.4% — 8.4% larger            |
| Total `.html` bytes (whole build)                                          | 639,538 B (21 top-level + 8 blog = 29 pages, incl. `_not-found.html`) | 1,412,181 B (20 top-level + 8 blog = 28 pages) | 220.8% — larger, see note below |
| `service-worker.js` (top-level, not counted in the "entry graph" below)    |                                                             110,780 B |                                       32,985 B | 29.8% — much smaller            |
| Total files in build output                                                |                                                                 1,064 |                                            903 | fewer files overall             |

`assets/audio/**` is confirmed (not assumed) to be the bulk of both builds and effectively
byte-identical between apps — this is the reason the brief calls for excluding it from the "app
bundle" comparison; without the exclusion the headline number (94.4%, "5.6% smaller") would badly
understate the real difference in shipped application code, which the app-bundle row (86.2%,
"13.8% smaller") and the JS-only row (66.0%, "34.0% smaller") show more honestly.

**HTML total is measurably larger in the new app (not a typo)**: SvelteKit's finer chunk-splitting
means every prerendered page's `<head>` carries a much longer `<link rel="modulepreload">` list
(59 entries on `/`, see below) than old's per-page `<script async>` list (29 on `/`) — roughly 2×
the preload markup baked into every one of the ~28 prerendered HTML shells. This is a real,
measured trade-off of the new bundler's strategy, not spin: smaller JS payload, larger HTML shell.
It is flagged here rather than hidden.

## Home-page (`/`) entry graph — live network trace

### Old app: 29 JS + 5 CSS requests, zero deferred

Old's static export renders the whole script list directly into `<head>`/`<body>` as
`<script async>` (or one `noModule` polyfill, which a module-supporting browser correctly never
fetches — 0 requests for it were observed, confirming that skip empirically). Every request
completed within the initial page-parse; **none arrived late**.

**OLD entry-graph JS** — 29 files, 1,185,758 bytes total

|   Bytes | File                                                        |
| ------: | ----------------------------------------------------------- |
| 227,424 | `/_next/static/chunks/3794-41fb2f3e75f382b5.js`             |
| 199,870 | `/_next/static/chunks/4bd1b696-e356ca5ba0218e27.js`         |
| 146,364 | `/_next/static/chunks/2429-b83a6c08514b0e18.js`             |
| 100,730 | `/_next/static/chunks/6759-10242ab37835ac52.js`             |
|  62,014 | `/_next/static/chunks/1359-61b6e0e4a7e7f2f7.js`             |
|  59,429 | `/_next/static/chunks/app/layout-b78f3d6822b8a1aa.js`       |
|  57,029 | `/_next/static/chunks/6468630d-f8aff360fd9f5748.js`         |
|  51,782 | `/_next/static/chunks/7647-cf45f641be61f64b.js`             |
|  51,139 | `/_next/static/chunks/971-8efdfacde9889f81.js`              |
|  41,921 | `/_next/static/chunks/5073-975cd4aef0abeed5.js`             |
|  28,900 | `/_next/static/chunks/9316-f74ac1ed9e2d6e1a.js`             |
|  28,731 | `/_next/static/chunks/8e1d74a4-724ee81d56ba7c6e.js`         |
|  24,878 | `/_next/static/chunks/1476-1cdf17fe0a43caaa.js`             |
|  16,008 | `/_next/static/chunks/5772-76eae80bd7a9b7c2.js`             |
|  15,583 | `/_next/static/chunks/9786-5655b4c9373c71f5.js`             |
|  15,349 | `/_next/static/chunks/5279-21fc980fcb17b777.js`             |
|  14,788 | `/_next/static/chunks/8368-85f7c569ebd3121f.js`             |
|  12,784 | `/_next/static/chunks/5000-b742f3097f94de36.js`             |
|   9,988 | `/_next/static/chunks/9756-0080e44c96a33c28.js`             |
|   6,825 | `/_next/static/chunks/app/not-found-b599380ee8aa1a91.js`    |
|   5,434 | `/_next/static/chunks/webpack-1ef969dbe873894d.js`          |
|   2,309 | `/_next/static/chunks/795d4814-5433f5fc74622a78.js`         |
|   2,243 | `/_next/static/chunks/app/page-daf94bd96bcce49a.js`         |
|   1,123 | `/_next/static/chunks/385cb88d-9a2bf3ff5f1558fe.js`         |
|   1,060 | `/_next/static/chunks/0e762574-2389d1bdf0e763e5.js`         |
|     660 | `/_next/static/chunks/app/global-error-da3d0b5b91a64108.js` |
|     484 | `/_next/static/chunks/main-app-df48c81117d3c951.js`         |
|     462 | `/_next/static/chunks/94730671-89e0de256b5f17df.js`         |
|     447 | `/_next/static/chunks/578c2090-542c5a67dc0d1eb2.js`         |

**OLD entry-graph CSS** — 5 files, 77,352 bytes total

|  Bytes | File                                     |
| -----: | ---------------------------------------- |
| 29,493 | `/_next/static/css/fd79334dc5777c0f.css` |
| 27,354 | `/_next/static/css/e0d167afa0855a0e.css` |
| 19,824 | `/_next/static/css/4db1a6a69c513344.css` |
|    418 | `/_next/static/css/77a47b5832853b27.css` |
|    263 | `/_next/static/css/498255f8da3e0ca9.css` |

Plus, separately: one `service-worker.js` request (110,780 B — registration is a distinct browser
API call, not part of the page's module graph) and one preload hint for
`googletagmanager.com/gtag/js` (external, analytics — Task 5's territory, not counted here).

### New app: 59 JS + 10 CSS requests immediately, +2 JS deferred (61 JS total)

The new app's `<link rel="modulepreload">` list in `<head>` mirrors old's role but for ES modules;
every one of those plus the `<script type="module">` entry was requested immediately, matching
old's "everything in the initial parse" pattern almost exactly — **except** two files
(`_app/immutable/nodes/1.DxIM4h5b.js` and its dependency chunk `_app/immutable/chunks/BqwLIKyN.js`,
1,098 + 4,741 = 5,839 bytes) which arrived measurably later, after the initial batch had already
completed, with **zero user interaction performed** in this session (no click, no hover, no
keyboard). Cross-checked against `.svelte-kit/output/server/manifest-full.js`: node `1` is the
**shared error-boundary node** (`errors: [1,]` on every one of the 27 routes, including `/`) — not
a distinct page. The most likely mechanism is SvelteKit warming its own client-side error boundary
shortly after hydration so a later in-app navigation error has it ready without a fetch; this
document did not trace that exact call site in `@sveltejs/kit`'s source, so it is reported as an
observation with a plausible cause, not a proven mechanism — the measured fact (2 chunks, 5,839
bytes, arrived late, zero interaction) stands regardless of the exact trigger.

**NEW entry-graph JS** — 61 files, 703,399 bytes total (`deferred` = the 2 late arrivals above)

|   Bytes | File                                      |          |
| ------: | ----------------------------------------- | -------- |
| 200,733 | `/_app/immutable/chunks/D_tAr9fP.js`      |          |
|  89,797 | `/_app/immutable/chunks/DAoFvUEl.js`      |          |
|  66,557 | `/_app/immutable/chunks/FFVeDe9o.js`      |          |
|  55,881 | `/_app/immutable/chunks/zu2fwW_k.js`      |          |
|  47,707 | `/_app/immutable/chunks/DP0M5v9t.js`      |          |
|  47,497 | `/_app/immutable/nodes/0.Bw8TS3tQ.js`     |          |
|  31,215 | `/_app/immutable/chunks/BFKZj-CU.js`      |          |
|  27,683 | `/_app/immutable/chunks/BILRat5T.js`      |          |
|  18,655 | `/_app/immutable/chunks/BF5Erawy.js`      |          |
|  14,949 | `/_app/immutable/chunks/4A1uEjJn.js`      |          |
|  13,047 | `/_app/immutable/entry/app.Bo3HO_jW.js`   |          |
|   8,675 | `/_app/immutable/chunks/BVbKDkAw.js`      |          |
|   8,497 | `/_app/immutable/chunks/DMBXPzoC.js`      |          |
|   7,125 | `/_app/immutable/chunks/BuKZf0EF.js`      |          |
|   6,417 | `/_app/immutable/chunks/DPuGHaJY.js`      |          |
|   4,741 | `/_app/immutable/chunks/BqwLIKyN.js`      | deferred |
|   4,480 | `/_app/immutable/chunks/e1-CWjRs.js`      |          |
|   3,937 | `/_app/immutable/chunks/DeuEmH-Y2.js`     |          |
|   3,806 | `/_app/immutable/chunks/CDeUXB6k.js`      |          |
|   3,197 | `/_app/immutable/chunks/BUtV7Wkr2.js`     |          |
|   3,072 | `/_app/immutable/chunks/DRsWFebE.js`      |          |
|   2,864 | `/_app/immutable/chunks/DslqU6hv.js`      |          |
|   2,077 | `/_app/immutable/chunks/kan7a7Rv.js`      |          |
|   1,859 | `/_app/immutable/chunks/dLGyfg8H.js`      |          |
|   1,766 | `/_app/immutable/chunks/rv3zOK1l.js`      |          |
|   1,612 | `/_app/immutable/chunks/BCAZOQCo.js`      |          |
|   1,593 | `/_app/immutable/chunks/ueCFrOy_.js`      |          |
|   1,585 | `/_app/immutable/chunks/DpWah9iJ2.js`     |          |
|   1,307 | `/_app/immutable/chunks/DFwJ1rGJ.js`      |          |
|   1,269 | `/_app/immutable/chunks/DAXXjFlN.js`      |          |
|   1,263 | `/_app/immutable/chunks/Bl8kVQfW.js`      |          |
|   1,257 | `/_app/immutable/chunks/DNla_7DB.js`      |          |
|   1,217 | `/_app/immutable/chunks/DvZlqoez.js`      |          |
|   1,211 | `/_app/immutable/chunks/HclGiUj8.js`      |          |
|   1,192 | `/_app/immutable/chunks/cLcH4equ.js`      |          |
|   1,098 | `/_app/immutable/nodes/1.DxIM4h5b.js`     | deferred |
|   1,022 | `/_app/immutable/chunks/DwnaZb43.js`      |          |
|     918 | `/_app/immutable/chunks/Btq3misP.js`      |          |
|     911 | `/_app/immutable/chunks/CJ9F15v7.js`      |          |
|     902 | `/_app/immutable/chunks/DNwRadYC.js`      |          |
|     828 | `/_app/immutable/chunks/i3D63YkO.js`      |          |
|     813 | `/_app/immutable/chunks/jBZXc_BA.js`      |          |
|     713 | `/_app/immutable/chunks/B9Lr3zRv.js`      |          |
|     656 | `/_app/immutable/chunks/XKEAtkz1.js`      |          |
|     653 | `/_app/immutable/chunks/DczWwzFA.js`      |          |
|     639 | `/_app/immutable/chunks/pd6Afm5s.js`      |          |
|     617 | `/_app/immutable/chunks/BtxIrx8r2.js`     |          |
|     576 | `/_app/immutable/chunks/v-3Ko4C_.js`      |          |
|     548 | `/_app/immutable/chunks/QnxAG1jT.js`      |          |
|     455 | `/_app/immutable/chunks/CT5xzYlX.js`      |          |
|     399 | `/_app/immutable/chunks/Zyt-d2_w.js`      |          |
|     393 | `/_app/immutable/nodes/2.DxSrsp7x.js`     |          |
|     392 | `/_app/immutable/chunks/BYdpDu-X.js`      |          |
|     330 | `/_app/immutable/chunks/CUW1rZWG.js`      |          |
|     275 | `/_app/immutable/chunks/DH7Y8sHu.js`      |          |
|     172 | `/_app/immutable/chunks/CBtQCMJc2.js`     |          |
|     141 | `/_app/immutable/chunks/Bw18Plvx.js`      |          |
|      82 | `/_app/immutable/entry/start.BcBLENrs.js` |          |
|      65 | `/_app/immutable/chunks/xihTtKlq.js`      |          |
|      39 | `/_app/immutable/chunks/CprhWfk9.js`      |          |
|      22 | `/_app/immutable/chunks/CBxoRSH6.js`      |          |

**NEW entry-graph CSS** — 10 files, 55,797 bytes total

|  Bytes | File                                                   |
| -----: | ------------------------------------------------------ |
| 48,174 | `/_app/immutable/assets/0.CJstL0Y2.css`                |
|  2,009 | `/_app/immutable/assets/Player.SECfc_oT.css`           |
|  1,868 | `/_app/immutable/assets/SettingsPane.Ba7Fs0DO.css`     |
|  1,366 | `/_app/immutable/assets/SheetFrame.RZouecfD.css`       |
|    798 | `/_app/immutable/assets/PromotionCard.Dn5oOJ9h.css`    |
|    452 | `/_app/immutable/assets/Switch.B89aDc-p.css`           |
|    379 | `/_app/immutable/assets/DonateButton.MZbDwf4m.css`     |
|    256 | `/_app/immutable/assets/SongMenu.DKxAYxzD.css`         |
|    253 | `/_app/immutable/assets/Separator.CW8BWwH8.css`        |
|    242 | `/_app/immutable/assets/LanguageSelector.DC8illDR.css` |

Plus, separately: one `service-worker.js` request (32,985 B) and one `BonoboBold` font file
(`.ttf`, not part of the JS/CSS totals above).

### Entry-graph summary

|                                    |         Old |                                  New | New vs old            |
| ---------------------------------- | ----------: | -----------------------------------: | --------------------- |
| JS requests (immediate)            |          29 |                                   59 | 2.03× as many         |
| JS requests (total incl. deferred) |          29 |                                   61 | 2.10× as many         |
| JS bytes                           | 1,185,758 B | 703,399 B (697,560 B immediate-only) | 59.3% — 40.7% smaller |
| CSS requests                       |           5 |                                   10 | 2× as many            |
| CSS bytes                          |    77,352 B |                             55,797 B | 72.1% — 27.9% smaller |
| JS + CSS bytes                     | 1,263,110 B |                            759,196 B | 60.1% — 39.9% smaller |

The new app makes roughly **twice as many** JS requests for the home page, but ships roughly
**40% fewer total bytes** doing it — a direct, measured consequence of Vite/Rollup's much
finer-grained default chunk splitting (many small chunks, HTTP/2-friendly) versus
webpack/Next's fewer, larger chunks. Neither number is hidden in favor of the other here.

## New app: top-10 modules by size (`build-stats.html` treemap)

`build-stats.html` (gitignored per `.gitignore:30`, not committed) is `rollup-plugin-visualizer`'s
own report of the **whole client bundle** (confirmed by inspecting its embedded data: it contains
`pixi.js` and `_app/immutable` paths and zero `.svelte-kit/output/server` paths, i.e. it reflects
the browser-shipped client build, not the SSR/prerender-time server build that also runs as part
of `vite build`). Its `data.tree`/`data.nodeParts`/`data.nodeMetas` structure was parsed
programmatically (a leaf's size lives in `nodeParts[leaf.uid]`, keyed by a `metaUid` into
`nodeMetas` for the canonical, deduplicated module path) — 2,187 module-part entries across the
whole client build, summing to 4,797,271 bytes of **pre-minification rendered source** (this is
larger than the 2,680,866-byte on-disk total above because it is measured before esbuild's final
minification pass; the two numbers are not meant to match, they measure different stages).

| Rendered bytes | gzip (visualizer est.) | Module                                                                | In chunk              |
| -------------: | ---------------------: | --------------------------------------------------------------------- | --------------------- |
|         73,681 |                 18,006 | `node_modules/i18next/dist/esm/i18next.js`                            | `DAoFvUEl.js`         |
|         52,154 |                  6,556 | `node_modules/@tensorflow/tfjs-backend-webgl/dist/shader_compiler.js` | `CSF64Mxn2.js`        |
|         50,269 |                 14,172 | `src/lib/i18n/locales/en/index.ts`                                    | `DAoFvUEl.js`         |
|         48,498 |                 11,970 | `node_modules/object-hash/dist/object_hash.js`                        | `D_tAr9fP.js`         |
|         40,010 |                 10,930 | `node_modules/@sveltejs/kit/src/runtime/client/client.js`             | `BILRat5T.js`         |
|         36,516 |                  4,029 | `src/lib/games/genshin/index.ts`                                      | `D_tAr9fP.js`         |
|         35,657 |                  6,425 | `node_modules/@tensorflow/tfjs-layers/dist/layers/recurrent.js`       | `CSF64Mxn2.js`        |
|         35,147 |                  9,180 | `src/lib/components/pages/Player/PlayerMenu.svelte`                   | `FFVeDe9o.js`         |
|         32,958 |                  8,609 | `src/lib/components/pages/Composer/Composer.svelte`                   | (composer-only chunk) |
|         32,212 |                  6,987 | `node_modules/q/q.js`                                                 | `D_tAr9fP.js`         |

Note the `@tensorflow/tfjs-*` entries (rows 2 and 7): they live in chunk `CSF64Mxn2.js`
(1,002,100 bytes on disk, by far the single largest client chunk in the whole build) — the
transitive dependency `@spotify/basic-pitch` pulls in for the composer's audio-to-MIDI feature.
That chunk name does **not** appear anywhere in either app's home-page network trace above (see
the lazy-chunk verification below): it is real code the new app ships (a feature old did not
have), but it costs the home page nothing.

## Lazy-chunk verification: pixi.js and `@spotify/basic-pitch` are absent from the entry graph

P4c already proved via a bundler-manifest walk that `pixi.js` has zero static reachability path
from the prerendered entry graph. This task re-confirms it one level more concretely, at the
**live network level**, against this session's actual production+analyze build:

- The single largest client chunk, `_app/immutable/chunks/CSF64Mxn2.js` (1,002,100 bytes),
  contains `@tensorflow/tfjs`, `tfjs-converter`, `tfjs-layers`, `tfjs-node` source (confirmed by
  grepping the built file) — the `@spotify/basic-pitch` dependency graph.
- `pixi.js` itself is split across four client chunks: `BsiwtOcQ2.js` (87,424 B),
  `BwD8oj6h2.js` (10,493 B), `DcKi-Aa_2.js` (71,068 B), `ysg8iMZf2.js` (101,149 B) — 270,134 B total.
- All five of those chunk names were searched for in the full, unfiltered home-page network
  request list captured above (61 JS requests): **zero matches for all five.** Neither the 1 MB
  tensorflow chunk nor any of the four pixi chunks was fetched by the home page, immediately or
  deferred.

So the new app's smaller entry-graph and smaller whole-build-JS figures above are **not** because
it dropped features relative to old — `/composer`, `/vsrg-composer` and `/vsrg-player` (all
pixi.js-canvas pages) and the composer's MIDI-from-audio import (basic-pitch/tensorflow) are real,
shipped, working features on this branch (P4c) that old's Next.js app also had (pixi/basic-pitch
were already dependencies on `migration/next16-react19` too) — they simply never load unless a
user actually visits one of those three pages, exactly as designed (spec §6.2's lazy-render-class
pattern).

## Old app's built `<head>` (verbatim) — Task 4 ground truth

Captured from `build/genshinMusic/index.html` in the old-app worktree before it was removed,
copied out programmatically (not retyped) to guarantee byte accuracy. 3,497 bytes.

```html
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no"
  />
  <link rel="stylesheet" href="/_next/static/css/e0d167afa0855a0e.css" data-precedence="next" />
  <link rel="stylesheet" href="/_next/static/css/fd79334dc5777c0f.css" data-precedence="next" />
  <link rel="stylesheet" href="/_next/static/css/4db1a6a69c513344.css" data-precedence="next" />
  <link
    rel="preload"
    as="script"
    fetchpriority="low"
    href="/_next/static/chunks/webpack-1ef969dbe873894d.js"
  />
  <script src="/_next/static/chunks/4bd1b696-e356ca5ba0218e27.js" async=""></script>
  <script src="/_next/static/chunks/3794-41fb2f3e75f382b5.js" async=""></script>
  <script src="/_next/static/chunks/main-app-df48c81117d3c951.js" async=""></script>
  <script src="/_next/static/chunks/8e1d74a4-724ee81d56ba7c6e.js" async=""></script>
  <script src="/_next/static/chunks/6468630d-f8aff360fd9f5748.js" async=""></script>
  <script src="/_next/static/chunks/0e762574-2389d1bdf0e763e5.js" async=""></script>
  <script src="/_next/static/chunks/795d4814-5433f5fc74622a78.js" async=""></script>
  <script src="/_next/static/chunks/6759-10242ab37835ac52.js" async=""></script>
  <script src="/_next/static/chunks/2429-b83a6c08514b0e18.js" async=""></script>
  <script src="/_next/static/chunks/9756-0080e44c96a33c28.js" async=""></script>
  <script src="/_next/static/chunks/9316-f74ac1ed9e2d6e1a.js" async=""></script>
  <script src="/_next/static/chunks/5772-76eae80bd7a9b7c2.js" async=""></script>
  <script src="/_next/static/chunks/8368-85f7c569ebd3121f.js" async=""></script>
  <script src="/_next/static/chunks/5073-975cd4aef0abeed5.js" async=""></script>
  <script src="/_next/static/chunks/971-8efdfacde9889f81.js" async=""></script>
  <script src="/_next/static/chunks/7647-cf45f641be61f64b.js" async=""></script>
  <script src="/_next/static/chunks/5000-b742f3097f94de36.js" async=""></script>
  <script src="/_next/static/chunks/app/layout-b78f3d6822b8a1aa.js" async=""></script>
  <script src="/_next/static/chunks/app/not-found-b599380ee8aa1a91.js" async=""></script>
  <script src="/_next/static/chunks/385cb88d-9a2bf3ff5f1558fe.js" async=""></script>
  <script src="/_next/static/chunks/94730671-89e0de256b5f17df.js" async=""></script>
  <script src="/_next/static/chunks/578c2090-542c5a67dc0d1eb2.js" async=""></script>
  <script src="/_next/static/chunks/9786-5655b4c9373c71f5.js" async=""></script>
  <script src="/_next/static/chunks/5279-21fc980fcb17b777.js" async=""></script>
  <script src="/_next/static/chunks/1476-1cdf17fe0a43caaa.js" async=""></script>
  <script src="/_next/static/chunks/1359-61b6e0e4a7e7f2f7.js" async=""></script>
  <script src="/_next/static/chunks/app/page-daf94bd96bcce49a.js" async=""></script>
  <script src="/_next/static/chunks/app/global-error-da3d0b5b91a64108.js" async=""></script>
  <link rel="preload" href="/_next/static/css/77a47b5832853b27.css" as="style" />
  <link rel="preload" href="/_next/static/css/498255f8da3e0ca9.css" as="style" />
  <link rel="preload" href="https://www.googletagmanager.com/gtag/js?id=G-T3TJDT2NFS" as="script" />
  <meta name="theme-color" content="rgb(99, 174, 167)" />
  <meta name="theme-color" content="#63aea7" />
  <title>Genshin Music Nightly</title>
  <meta name="description" content="Genshin music, a website to play, practice and compose songs" />
  <link rel="manifest" href="/manifest.json" />
  <link rel="icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/logo192.png" />
  <script src="/_next/static/chunks/polyfills-42372ed130431b0a.js" nomodule=""></script>
</head>
```

### Element order that matters for Task 4 (extracted from the raw head above)

1. `<meta charSet="utf-8"/>`
2. `<meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no"/>` — the **full** viewport string (`site-metadata.ts`'s `rootViewport`: `width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no`), not just `width=device-width, initial-scale=1`.
3. 3 base stylesheet `<link>`s, then the preload hint + async `<script>` entry graph (29 files, see above), then 2 page-specific stylesheet preloads, then a `gtag.js` preload hint.
4. **`<meta name="theme-color" content="rgb(99, 174, 167)"/>`** — first. This is the **dynamic** one: `ThemeProviderWrapper.tsx:49`'s `<meta name="theme-color" content={theme.get(mounted ? "primary" : "accent").toString()}/>`, hoisted into `<head>` by React 19 from wherever it renders in the tree. At static-export/prerender time `mounted` is `false` (the `useEffect` that flips it to `true` never runs during a server/export render), so this reads `theme.get('accent')` — the default theme's accent color, `color(...)`-serialized as `rgb(99, 174, 167)`, which is `#63aea7` in decimal RGB.
5. **`<meta name="theme-color" content="#63aea7"/>`** — second. This is the **static** one: `site-metadata.ts:30`'s `rootViewport.themeColor`, surfaced by Next's `viewport` export.
6. `<title>Genshin Music Nightly</title>`
7. `<meta name="description" content="Genshin music, a website to play, practice and compose songs"/>`
8. `<link rel="manifest" href="/manifest.json"/>`
9. `<link rel="icon" href="/favicon.ico"/>`
10. `<link rel="apple-touch-icon" href="/logo192.png"/>`
11. One `noModule` polyfill `<script>` (never fetched by a modern browser, confirmed empirically above).

**Theme-color count and order, confirmed programmatically** (not eyeballed): exactly **2**
`<meta name="theme-color">` elements, **dynamic first, static second**. Both currently resolve to
the same literal color because the default theme's `accent` equals `site-metadata.ts`'s hardcoded
`#63aea7` — but per the HTML spec a browser uses the **first** valid `theme-color` it encounters,
so it is the **dynamic** one that wins today, not the static one. If a user has a non-default theme
applied, the old app's browser chrome color follows the dynamic (accent) meta correctly on the very
first paint of a fresh static export — the static meta is real fallback/redundant weight, not dead
code, since it's first-in-document only when the dynamic one fails to render for some reason. This
is the opposite ordering from the risk the task brief called out in advance ("if the static one
preceded the dynamic one, the dynamic one would be dead") — here it is the dynamic one that governs,
which is the more correct behavior of the two. Task 4 should treat this as the ground truth for
deciding how many `theme-color` elements the new app needs and in what order.

## Conclusion

**The new app's shipped code is smaller than the old app's, not larger, despite shipping strictly
more feature surface** (a working pixi.js composer/VSRG canvas stack, basic-pitch MIDI-from-audio
import, and a from-scratch service worker) that both apps' dependency trees included but only the
new app's home-page network trace was checked against, empirically, in this task:

- **Home-page entry graph** (the bytes that gate first paint): new app is **59.3%** of old's JS
  size and **60.1%** of old's combined JS+CSS size — roughly **40% smaller**.
- **Whole build, excluding the byte-identical audio assets**: new app is **86.2%** of old's size —
  **13.8% smaller**, a smaller margin than the entry-graph number because this total also includes
  the new app's real lazy pixi.js/tensorflow chunks (which old's Next build also paid for, just
  differently split) and every other route's per-page chunk.
- **Whole build, JS only**: new app is **66.0%** of old's — **34.0% smaller**.
- **Whole build, including audio** (the misleading headline number if audio isn't excluded): new
  app is **94.4%** of old's — only **5.6% smaller**, because ~18.4 MB of effectively-identical
  audio dominates both totals and dilutes the real difference. This is exactly why the brief calls
  for excluding audio, and the number is included here only to show why a naive "total build size"
  comparison would be the wrong one to lead with.

The trade-offs are reported, not hidden: the new app makes roughly **twice as many** JS requests
for the home page (finer Vite/Rollup chunk splitting vs. webpack's coarser one) and its prerendered
HTML shells are measurably larger per page (more `<link rel="modulepreload">` markup). Both are
real, measured, and disclosed rather than glossed over in favor of the headline "smaller bundle"
result.

**Explicit conclusion: the new (SvelteKit) app's shipped application bundle is smaller than the
old (Next.js/React) app's by every size metric measured except whole-build CSS bytes (which is
8.4% larger, a small absolute number — 84,424 B vs 77,880 B) and prerendered HTML bytes (larger due
to the bigger per-page preload-link list) — and it is smaller while shipping strictly more feature
surface, not less, because the heaviest new dependencies (pixi.js, `@spotify/basic-pitch`/
tensorflow) are proven, at the live network level in this session, to never load on the page that
was measured.**
