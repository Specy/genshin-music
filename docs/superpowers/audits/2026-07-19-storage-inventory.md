# Storage & URL Inventory (pre-SvelteKit baseline)

Captured on branch `migration/next16-react19`. The SvelteKit port MUST produce
byte-identical keys/names. Verified against spec §5.3 compatibility locks
(`docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md`), which this
document backs: `storageId` casing, IndexedDB database names, localStorage key
prefixes, and `appName` values inside serialized songs/backups must stay
byte-identical, and audio sample URLs must stay unchanged. This capture is the
baseline that Phase 5's final audit ("DB names + localStorage keys diffed
against a capture from the live app") diffs against.

## Scope & method

Every `.ts`/`.tsx` file under `src/` was checked for `localStorage`,
`sessionStorage`, IndexedDB (`ZangoDb`) usage, and `APP_NAME`-templated
identifiers. Required greps (task brief Step 1):

| Grep | Raw hits | Distinct files |
|---|---|---|
| `rg -n "localStorage" src -g '*.ts' -g '*.tsx'` | 47 | 13 |
| `rg -n "sessionStorage" src -g '*.ts' -g '*.tsx'` | 2 | 1 |
| `rg -n "new ZangoDb.Db\|collection\(" src/lib/Services/Database` | 5 | 1 (`Database.ts`) |
| `` rg -n "APP_NAME \+|`\$\{APP_NAME\}" src -g '*.ts' -g '*.tsx' `` | 42 | 10 |

**Methodology note (important for whoever re-runs Step 1):** the fourth grep,
copied verbatim from the brief, only matches the `APP_NAME + "literal"`
concatenation style. Its second alternative — intended to also catch
`` `${APP_NAME}_key` `` template-literal usages — never matches anything. Bash
strips the backslash from `\$` inside the double-quoted pattern (since `$` is
shell-special), so ripgrep receives a bare, unescaped `$` in the regex, which
it parses as an end-of-line anchor rather than a literal dollar sign. Verified
by isolating the two alternatives: the single-quoted equivalent
`` rg 'APP_NAME \+|`\$\{APP_NAME\}' `` (note the second `\$`, unmolested by bash)
correctly matches. As a result, naively trusting the brief's Step 1 output alone
would have **silently missed** every template-literal key: `GlobalConfigStore.ts`
(`_uma_mode`), `KeybindsStore.ts` (`_keybinds`), `PromotionCard.tsx`
(`_viewed_promotions_before`, `_viewed_promotion`), `pageVisit.tsx`
(`_visited_pages`), and two of `SettingsService.ts`'s own lines (`_MIDI_Settings`).
All of these are still fully captured below because the plain `localStorage`/
`sessionStorage` greps (Step 1, lines 1–2) don't depend on matching `APP_NAME`
at all, and every file they list was opened and read in full (see Step 3
completeness cross-check in the task report).

Supplementary greps run beyond the brief, all clean (zero hits, so no
additional surprises from these angles): non-`.ts`/`.tsx` files touching
`localStorage`/`sessionStorage` under `src/`; `document.cookie`; generic
`.getItem(`/`.setItem(`/`.removeItem(` calls not already prefixed by
`localStorage`/`sessionStorage` (i.e. hidden via destructuring); direct
`indexedDB.*` calls bypassing ZangoDB. One supplementary grep was NOT clean:
`APP_NAME.toLowerCase()` surfaced a file extension (`.{app}backup`) not in the
task brief's seed list — see File extensions below.

## IndexedDB

| Property | Value |
|---|---|
| Database name | `Genshin` / `Sky` (= `APP_NAME`, `src/Config.ts:4`) |
| Opened via | `new ZangoDb.Db(APP_NAME, 4, {...})` — `src/lib/Services/Database/Database.ts:20` |
| Name transformation | none — verified in `@insertish/zangodb`'s `db.js`: `indexedDB.open(this._name, this._version)` is called with the name as-is, no prefix/suffix added |
| Schema version | `4` |
| Collections (object stores) | `songs`, `themes`, `folders`, `translation` |
| Object store keyPath | `_id`, `autoIncrement: true` (ZangoDB's own internal primary key — distinct from the app-level `id` field below) |
| App-level id generation | `DbInstance.generateId()` — `Database.ts:43-51`. Four groups of 4 lowercase hex chars, NOT a standard UUID: `s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4()` where `s4()` is `Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1)`. Produces e.g. `a1b2-c3d4-e5f6-0789` |
| Non-browser fallback | when `IS_TAURI`, `TauriCollection` (filesystem JSON files, one per record) is used instead of ZangoDB (`Collection.ts`). Out of scope per migration memory (Tauri builds are unused/ignored), noted only for completeness since it's in the same file the grep targeted. |

Collection → consumer (who actually reads/writes each collection):

| Collection | Consumer | Content |
|---|---|---|
| `songs` | `src/lib/Services/SongService.ts` | `SerializedSong` (composed / recorded / vsrg songs) |
| `themes` | `src/lib/Services/ThemeService.ts` | `SerializedTheme` |
| `folders` | `src/lib/Services/FolderService.ts` | `SerializedFolder` |
| `translation` | `src/i18n/i18nCache.ts` | `SerializedLocale` (cached downloaded language packs, lazy-loaded) |

## localStorage keys (all prefixed with `{APP_NAME}`, except where noted)

Seed rows (settings blobs, all read/written by `SettingsService`,
`src/lib/Services/SettingsService.ts`):

| Key | Written by | Content |
|---|---|---|
| `{APP_NAME}_Composer_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_Player_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_MIDI_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_VsrgComposer_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_VsrgPlayer_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_ZenKeyboard_Settings` | SettingsService | serialized settings |
| `{APP_NAME}_LastBackupWarningTime` | SettingsService | epoch ms |
| `{APP_NAME}_LastStateEdit` | SettingsService | epoch ms |

Every additional key found by the greps:

| Key | Written by | Content |
|---|---|---|
| `{APP_NAME}_Visited` | `src/components/AppBase.tsx` (read on mount + in update-check effect; written in `closeWelcomeScreen()`) | JSON-boolean string (`"true"`) — welcome screen dismissed flag |
| `{APP_NAME}_ShowHome` | `src/components/AppBase.tsx` (`setDontShowHome()`) | JSON-boolean string — user override to hide the home/player-select screen |
| `{APP_NAME}_Lang` (const `LANG_PREFERENCE_KEY_NAME` = `APP_NAME + "_Lang"`, defined `src/Config.ts:888`) | read: `src/components/AppBase.tsx:120`; write: `src/components/shared/i18n/LanguageSelector.tsx:90` (`DefaultLanguageSelector`) | raw language code string, e.g. `"en"` |
| `{APP_NAME}_Version` | `src/components/AppBase.tsx` | raw `APP_VERSION` string (currently `"3.7.0"`, `src/Config.ts:5`) — last-seen version, drives the update-notice log |
| `{APP_NAME}_repeat_update_notice` | read + reset to `"false"`: `src/components/AppBase.tsx`; set to `"true"`: `src/app/providers.tsx:88` (on accepting a service-worker update prompt) | string literal `"true"` / `"false"` |
| `{APP_NAME}_uma_mode` | read/write: `src/stores/GlobalConfigStore.ts` (`setUmaMode`/`load`); read only: `src/app/_client-pages/uma-mode/index.tsx` | JSON-boolean string |
| `{APP_NAME}_keybinds` | `src/stores/KeybindsStore.ts` (`load()`/`save()`) | JSON `{version, vsrg, shortcuts}`; `version` is currently `13` ("change only if breaking changes are made") |
| `{APP_NAME}-font-size` (**hyphen**, not underscore — the only key that breaks the `_` naming convention) | `src/components/pages/Index/Home.tsx:63,71` | numeric string `"75"`–`"125"`; out-of-range values reset to `"100"` client-side |
| `{APP_NAME}_visited_blog_posts` | `src/components/pages/blog/BaseBlogPost.tsx` (write in the component effect; read also in `useHasVisitedBlogPost`, same file) | JSON object `{ [relativeUrl]: true }` |
| `{APP_NAME}_Theme` | `src/lib/Services/ThemeService.ts` (`getCurrentThemeId`/`setCurrentThemeId`) | current theme id string, or `""` when none selected |
| `{APP_NAME}_viewed_promotions_before` | `src/components/pages/Promotion/PromotionCard.tsx` | presence flag, value `"true"`; read via `Boolean(localStorage.getItem(...))`, which is truthy for **any** stored string (including `"false"`) |
| `{APP_NAME}_viewed_promotion` | `src/components/pages/Promotion/PromotionCard.tsx` | last-dismissed promotion id string, e.g. `"1"` |
| `{APP_NAME}_visited_pages` | `src/components/shared/PageVisit/pageVisit.tsx` (`usePageVisit` reads, `useSetPageVisited` writes) | JSON object `{ [pageKey]: versionNumber }`; `pageKey` values enumerated in `src/PagesVersions.ts` (one per route except home) |
| `{APP_NAME}_Main_Settings` | **no writer exists anywhere in `src/`** — only ever `localStorage.removeItem(...)`'d, in `src/app/_client-pages/error/index.tsx:41` (`resetSettings`) | legacy/dead key — see Surprises below |

Settings-blob `settingVersion` values (embedded *inside* the JSON content of
the six `_*_Settings` keys above, from `src/lib/BaseSettings.ts`). These are
part of the byte-identical compatibility surface: if the SvelteKit port
computes a different `settingVersion` string, `SettingsService.getLatestSettings`
treats every existing user's stored settings as stale and silently resets them
to defaults on first load.

| Settings key | `settingVersion` template | Notes |
|---|---|---|
| `_Composer_Settings` | `APP_NAME + 71` | `BaseSettings.ts:46` |
| `_Player_Settings` | `APP_NAME + 81` | `BaseSettings.ts:178` |
| `_MIDI_Settings` | `APP_NAME + 7` | `BaseSettings.ts:363` — flat (no `.other` wrapper), compared directly against `settings.settingVersion` |
| `_VsrgComposer_Settings` | `APP_NAME + 16` | `BaseSettings.ts:466` |
| `_VsrgPlayer_Settings` | `APP_NAME + 8` | `BaseSettings.ts:563` |
| `_ZenKeyboard_Settings` | `APP_NAME + 26` | `BaseSettings.ts:650` |

## sessionStorage keys

| Key | Written by | Content |
|---|---|---|
| `isTwa` | `src/lib/utils/Utilities.ts` — write: `setIfInTWA()`; read: `isTWA()` | JSON-boolean string — whether the app was launched as a Trusted Web Activity (`document.referrer` includes `android-app://`) |

Note: `isTwa` is the only storage key in the whole app that is **not**
`APP_NAME`-prefixed. Kept intentionally per spec §6.7 ("TWA/Android detection
(`isTwa`) is kept").

## Service worker

Exact template literals, copied from `src/service-worker.ts`:

```ts
const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME as string;
const CACHE = `${APP_NAME}-${process.env.NEXT_PUBLIC_SW_VERSION}`;
const MAJOR_VERSION = 3;
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`;
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`;
```

| Cache | Template | Example |
|---|---|---|
| Precache | `${MAJOR_VERSION}-precache-${APP_NAME}-${SW_VERSION}` | `3-precache-Genshin-2026-7-19_14-25` |
| Runtime | `${MAJOR_VERSION}-runtime-${APP_NAME}-${SW_VERSION}` | `3-runtime-Genshin-2026-7-19_14-25` |

`NEXT_PUBLIC_SW_VERSION` is injected at build time by `scripts/buildApp.js:10`:

```js
const SW_VERSION = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}_${date.getHours()}-${date.getMinutes()}`
```

Not zero-padded — month/day/hour/minute below 10 render as a single digit
(e.g. `2026-7-19_14-5`, not `2026-07-19_14-05`).

Cache GC (`activate` listener): any existing cache key containing `APP_NAME`
that isn't the current `PRECACHE_CACHE`/`RUNTIME_CACHE` is deleted; any key
containing the literal substring `"workbox"` is also deleted (leftover from
the pre-Serwist worker). On a `MAJOR_VERSION` bump the `install` listener
detects no cache key starts with the new major version, skips waiting, and
force-reloads every open tab.

Separately, `clearClientCache()` in `src/lib/utils/Utilities.ts:334` (used by
the `/delete-cache` route) deletes **all** `caches.keys()` unconditionally —
no `APP_NAME` filtering, no naming template involved.

## URLs (must stay identical)

Enumerated from `src/app/**/page.tsx` (App Router: route = folder containing
`page.tsx`; `_`-prefixed folders — `_client-pages`, `_components`, `_navigation`
— are not routes, they hold the client-component implementations that each
thin `page.tsx` re-exports). Found exactly 27 `page.tsx` files: **19 top-level
routes + 8 blog post slugs**, matching the brief's expected count with no
deviation.

19 top-level routes:

1. `/`
2. `/backup`
3. `/blog`
4. `/changelog`
5. `/composer`
6. `/delete-cache`
7. `/donate`
8. `/error`
9. `/keybinds`
10. `/partners`
11. `/player`
12. `/privacy`
13. `/sheet-visualizer`
14. `/theme`
15. `/transfer`
16. `/uma-mode`
17. `/vsrg-composer`
18. `/vsrg-player`
19. `/zen-keyboard`

8 blog post slugs (under `/blog/posts/<slug>`, each its own static folder —
no `[slug]` dynamic segment exists anywhere in `src/app/`):

1. `add-to-home-screen`
2. `connect-midi-device`
3. `easyplay-1s`
4. `how-to-use-composer`
5. `how-to-use-player`
6. `how-to-use-vsrg-composer`
7. `midi-transpose`
8. `video-audio-transpose`

Cross-checked: each post's in-code `relativeUrl` metadata (in
`src/app/_client-pages/blog/posts/*.tsx`) matches its folder name exactly, and
`/blog/posts/${metadata.relativeUrl}` (`src/app/_client-pages/blog/index.tsx:121`)
is the only place post links are constructed.

Non-route special files under `src/app/` (Next.js App Router conventions —
these do not have their own addressable path): `layout.tsx` (root layout),
`not-found.tsx` (renders `$pages/404` for any unmatched path — not a route
with its own URL), `global-error.tsx` (top-level error boundary), `providers.tsx`,
`site-metadata.ts`.

All routes are served under `NEXT_PUBLIC_BASE_PATH` (empty for local dev;
`/genshinMusic` or `/skyMusic` in the multi-app static build — see
`scripts/buildApp.js:26` and `next.config.js:12`). The base path is a deployment
prefix applied uniformly; it does not change route *structure*.

Other `APP_NAME`-templated URLs found (not "routes" in the src/app/ sense, but
surfaced by the same audit and worth recording since spec §5.3 explicitly
locks one of them):

| Pattern | Source | Notes |
|---|---|---|
| `${BASE_PATH}/assets/audio/${APP_NAME.toLowerCase()}/${instrument}/${n}.mp3` | `src/lib/audio/Instrument.ts:76` | **Explicitly locked by spec §5.3**: "Audio sample URLs already namespace by game and stay unchanged — existing service-worker audio caches remain valid." |
| `https://${APP_NAME.toLowerCase()}-music.specy.app`, `https://beta.${APP_NAME.toLowerCase()}-music.specy.app`, `https://specy.github.io/${APP_NAME.toLowerCase()}Music` | `src/app/_client-pages/transfer/index.tsx:19-21` | Cross-domain "import from another instance of this site" targets for the `/transfer` page (`WindowProtocol`, kept per spec §6.7) — external site URLs, not app routes |
| `https://raw.githubusercontent.com/Specy/genshin-music/main/src-tauri/tauri-${APP_NAME.toLowerCase()}.update.json` | `src/lib/needsUpdate.ts:45` | Tauri auto-update manifest URL — commented-out dead code (inside a block comment spanning `needsUpdate.ts:43-51`), removed entirely with Tauri per spec §8 |

## File extensions (import/export)

| Extension | Template | Example | Source |
|---|---|---|---|
| Song sheet | `${APP_NAME.toLowerCase()}sheet` | `genshinsheet` / `skysheet` | `FileService.getUnknownFileExtensionAndName` (`FileService.ts:314`); also built inline at every song-download call site (`error/index.tsx:52`, `composer/index.tsx:788`, `PlayerMenu.tsx:170`, `VsrgComposerMenu.tsx:392`, `VsrgPlayerMenu.tsx:249`, `Folder.tsx:165`) |
| Folder | `${APP_NAME.toLowerCase()}folder` | `genshinfolder` / `skyfolder` | `FileService.getUnknownFileExtensionAndName` (`FileService.ts:319`) — used when zip-exporting a folder as an individual per-item entry (see note below) |
| Theme | `${APP_NAME.toLowerCase()}theme` | `genshintheme` / `skytheme` | `FileService.downloadTheme` (`FileService.ts:303`) and `getUnknownFileExtensionAndName` (`FileService.ts:324`); also `ThemePreview.tsx:65` |
| **Backup (not in seed list — surprise)** | `${APP_NAME.toLowerCase()}backup` | `genshinbackup` / `skybackup` | `src/app/_client-pages/backup/index.tsx:230,252,272` (`{date}-all/songs/themes.{app}backup`) and `PlayerMenu.tsx:217` (`{APP_NAME}_Backup_{date}.{app}backup`) |
| MIDI | `.mid` | — | `FileService.downloadMidi` (`FileService.ts:294-299`) |
| WAV | `.wav` | — | `FileService.downloadBlobAsWav` (`FileService.ts:281-288`) |
| Generic / legacy | `.json` | — | `FileService.downloadObject` (`FileService.ts:277-279`, e.g. `{APP_NAME}_logs.json` from the error page); also the legacy old-format song/theme import path (`Song.isOldFormatSerializedType` et al.) that `FileService.importUnknownFile` still accepts |

The `{date}` prefix comes from a local `getDateString()` helper
(`backup/index.tsx:370-373`): `` `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` ``
— note `getMonth()` is **not** adjusted (`+1`), unlike the SW version string
above, so e.g. July renders as month `6`, not `7`. Cosmetic only (the string
is never parsed back), but a second, differently-formatted "date in a name"
helper worth knowing about if either gets ported.

Backup zip nesting (from `src/app/_client-pages/backup/index.tsx:143-173`,
`fflate`'s `zip()`): when the user picks the "zip" download format instead of
"json", the final downloaded file is named `<fileName>.zip` where `fileName`
is still the `.{app}backup`-suffixed name above — i.e. the file on disk ends
up double-suffixed, e.g. `2026-6-19-all.genshinbackup.zip`. Inside the zip:
one entry at the root named `<fileName>` (the same `.{app}backup` name) holding
the entire JSON array, plus an `individualFiles/` folder with one entry per
song/folder/theme, each named via `getUnknownFileExtensionAndName` (hence
`.{app}folder` is real output, even though the plain "download a folder"
button (`Folder.tsx:165`) instead flattens a folder's songs into a single
`.{app}sheet` file).

## Other APP_NAME-templated identifiers found (non-storage)

Surfaced by the required `APP_NAME \+` / `` `${APP_NAME}` `` grep but not a
storage key or URL — recorded for completeness since the grep was run as
specified:

| Identifier | Template | Source | Notes |
|---|---|---|---|
| `BroadcastChannel` name | `APP_NAME + '_composer'` | `src/app/_client-pages/composer/index.tsx:132` | Same-origin cross-tab play/stop sync for the composer. Not persisted, not read back from storage — doesn't need byte-identical treatment for data compatibility, only for cross-tab sync between an old-app tab and a new-app tab (edge case, likely irrelevant since users won't run both simultaneously across a migration). |

## Surprises (not in the brief's seed list)

- **`{APP_NAME}_Main_Settings`** (localStorage): referenced only via
  `removeItem` in `src/app/_client-pages/error/index.tsx:41`; no code anywhere
  in `src/` ever writes it. Dead/legacy key — likely a stale reference to a
  settings key that was renamed or removed. The "reset settings" button on the
  error page silently no-ops for this half of its job.
- **`.{app}backup` file extension**: a fully-functional, actively-used file
  extension for full/song/theme backups (`backup/index.tsx`, `PlayerMenu.tsx`)
  that is not in the brief's seed extension list (`{app}sheet`/`{app}folder`/
  `{app}theme`, `.mid`, `.wav`, legacy `.json`). Must be added to any
  compatibility checklist or the SvelteKit port will fail to recognize
  existing users' backup files on import.
- **`{APP_NAME}-font-size`**: uses a hyphen, not the underscore every other
  key uses. Easy to typo away during a port.
- **Step 1's fourth grep command silently under-matches** — see "Scope &
  method" above. Documented so Phase 2/5 don't re-run it verbatim and
  conclude the template-literal keys don't exist.
- **Route count matched exactly**: 19 + 8 = 27, no deviation from the brief's
  expected shape. `not-found.tsx` / `global-error.tsx` / `layout.tsx` exist as
  App Router special files but are not additional routes.

## Appendix (added Phase 5 Task 8 — final audit)

This document's body above is the immutable pre-SvelteKit baseline (captured on
`migration/next16-react19`) and is left byte-for-byte as originally written, per
this migration's own convention. The two rows below are new surface this phase
newly exercises that the baseline capture predates by construction (they did
not exist as ported code until Phase 5); they are recorded here as an appendix
rather than edited into the body above.

### `${APP_NAME}_repeat_update_notice` (localStorage, byte-match confirmed)

Ported byte-identical to the baseline's own row (line 99 above): same key
template, same `"true"`/`"false"` string values, same three logical
operations, just consolidated file-wise now that `AppBase.tsx`/`providers.tsx`
are one `AppInit.svelte`:

| Operation | Old site | New site |
|---|---|---|
| Read + reset to `"false"` | `src/components/AppBase.tsx` | `AppInit.svelte:250,257` (update-notice toast effect) |
| Set to `"true"` on accepting an update | `src/app/providers.tsx:88` | `AppInit.svelte:141` (`serviceWorker.register`'s `onUpdate` callback) |

### Cache Storage names (Phase 5 Task 1/2 — the SvelteKit-native service worker)

`src/service-worker.ts` (verified directly, this session):

```ts
const APP_NAME = GAME_IDENTITY.storageId
const CACHE = `${APP_NAME}-${PUBLIC_SW_VERSION}`
const MAJOR_VERSION = 3
const PRECACHE_CACHE = `${MAJOR_VERSION}-precache-${CACHE}`
const RUNTIME_CACHE = `${MAJOR_VERSION}-runtime-${CACHE}`
```

| Cache | Template | Byte-match vs. this doc's Service-worker section (line 148/151 above) |
|---|---|---|
| Precache | `${MAJOR_VERSION}-precache-${APP_NAME}-${SW_VERSION}` | Yes — identical template |
| Runtime | `${MAJOR_VERSION}-runtime-${APP_NAME}-${SW_VERSION}` | Yes — identical template |

Only the *source* of the two interpolated values changed, not the template or
the resulting string shape for equivalent inputs: `APP_NAME` now comes from
`GAME_IDENTITY.storageId` (`$game/identity`, still the legacy-locked
`'Genshin'`/`'Sky'` casing — see games/types.ts) instead of
`process.env.NEXT_PUBLIC_APP_NAME`, and `PUBLIC_SW_VERSION` comes from
`$env/static/public` instead of `process.env.NEXT_PUBLIC_SW_VERSION`. The cache
GC (`activate` listener, keyed on `.includes(APP_NAME)`/`.includes('workbox')`)
and the `MAJOR_VERSION`-bump reload-all-tabs logic (`install` listener) are
also byte-verified unchanged against this same file.

Flagging, not fixing (already disclosed in `service-worker.ts`'s own header
comment, re-confirmed this session, not a new finding): in the current
**production** build only, `PUBLIC_SW_VERSION` is not correctly injected into
the isolated service-worker bundle SvelteKit builds separately (Kit's isolated
`vite.build()` call for `src/service-worker.ts` never applies this project's
`envPrefix`), so today's shipped cache name is literally
`3-precache-Genshin-undefined` rather than e.g.
`3-precache-Genshin-2026-7-19_14-25` — a real, already-flagged regression
versus old (whose webpack `DefinePlugin` substituted the equivalent value
uniformly, including inside its service worker), not a template mismatch. The
GC logic is unaffected (it does not compare version segments, only the
`APP_NAME` substring and the current vs. stored cache-key equality), so stale
caches still get cleaned up correctly; only the version segment itself is
wrong. Left exactly as Phase 5 Task 1/2 disclosed it — out of this task's
comment/doc-only scope to fix.
