# SvelteKit Migration + Multi-Game Architecture — Design

**Date**: 2026-07-19
**Status**: Approved by user (brainstorming session)
**Supersedes direction of**: `2026-06-25-nextjs-pixi-migration-design.md` and `2026-07-19-app-router-migration-design.md` (the React/Next track). Those migrations landed on `migration/next16-react19` and remain the reference/fallback implementation; this spec replaces the framework, not the product.

## 1. Goal

Rewrite the webapp from Next.js 16 / React 19 to **SvelteKit 2 / Svelte 5**, with **full feature and behavior parity**, and restructure all game-specific code behind a **`GameDefinition`** abstraction so the app supports *any* game — Genshin and Sky today, more later — selected **at build time** (runtime switching is future work this design must not block). Remove the Tauri desktop wrapper entirely.

Motivation (user): recurring friction with the React ecosystem and unsatisfying performance, particularly around the pixi-heavy pages.

## 2. Decisions (locked during brainstorming)

| Question | Decision |
|---|---|
| Existing user data | **Full transparent compatibility.** Same IndexedDB database names (`Genshin`, `Sky`), same localStorage key prefixes, same serialized song/theme/folder/backup formats, same URLs. An existing user opens the new app and everything is there. |
| Repo strategy | **Same repo, replace in place.** New branch `migration/sveltekit` forked from `migration/next16-react19` (the newest code: Next 16 + pixi 8 + App Router). The SvelteKit app replaces the root; old code stays reachable via git. Nothing merges to `main` until parity is proven. |
| Svelte state idiom | **Runes**: singleton classes with `$state` fields in `.svelte.ts` files. No `svelte/store` writables. |
| Parity verification | **Golden-format tests (Vitest) + structured manual checklist per page.** No E2E suite. |
| Migration approach | **A — abstract while porting.** Design `GameDefinition` first from an audit of all current `APP_NAME` references, then port each file exactly once, directly against it. |
| Pixi | **Raw `pixi.js` v8** (keep current pixi version), no `@pixi/react`, no svelte-pixi wrapper. |
| i18n | **Keep i18next core** (drop only react-i18next), custom ~50-line Svelte binding. |
| Tauri | **Delete entirely** (it is already inert: `IS_TAURI` is hardcoded false). This supersedes the June decision to leave it as-is. |

## 3. Current-state summary (what is being ported)

- 19 routes + 8 blog posts; ~140 React components; 15 MobX singleton stores consumed via a custom `useObservable*` hook layer (not mobx-react).
- Framework-agnostic plain-TS domain core: song models + serialization (`src/lib/Songs`), audio engine (`AudioProvider`, `Instrument`, recorder, metronome, basic-pitch), `KeyboardProvider` / `MIDIProvider`, services (`SongService`, `FolderService`, `ThemeService`, `SettingsService`, `FileService`), ZangoDB persistence (`Database.ts`, collections: `songs`, `themes`, `folders`, `translation`).
- Game switching: `NEXT_PUBLIC_APP_NAME` env var read in `src/Config.ts` (~890 lines of per-game constants); **~232 `APP_NAME` references across 59 files**; per-game asset trees `src/appData/{sky,genshin}` (copied to `public/` at build) and `src/components/shared/SvgNotes/{sky,genshin}`.
- Pixi pages: Composer, VSRG Composer, VSRG Player — `@pixi/react` v8, with the Composer canvas already a lifecycle-heavy class component whose comments request a manual pixi rewrite.
- Styling: global CSS/SCSS + CSS modules; theme system = CSS custom properties computed from observable theme state.
- i18n: i18next, 26 namespaces, 10 languages; only `en` bundled, others lazy-loaded from the `translation` IndexedDB collection.
- PWA: Serwist 9 service worker, runtime-caching only (empty precache), cache name `{APP_NAME}` + build-stamped version, manual registration, SKIP_WAITING update prompt.
- Builds: `scripts/buildApp.js` → per-game env + asset copy + manifest base-path rewrite → `build/skyMusic`, `build/genshinMusic` (plus no-root variants), static export (`output: 'export'`), optional `NEXT_PUBLIC_BASE_PATH`.

## 4. Target architecture

### 4.1 Stack

SvelteKit 2 + Svelte 5 (runes), TypeScript strict, Vite, `@sveltejs/adapter-static`, sass, Vitest, `eslint-plugin-svelte` + `svelte-check`, `rollup-plugin-visualizer` (replaces `@next/bundle-analyzer`). npm and Node ≥ 20 stay.

### 4.2 Rendering model

Every route sets `prerender = true` and renders once at build time into a static HTML shell — no runtime server ever, mirroring today's `output: 'export'`. Browser-only work lives in `onMount`/`$effect` (never run at build); the codebase already survives one server render under Next static export, so the same guards carry over. Per-page `<title>`/meta via `<svelte:head>` with per-game values from the game definition. Trailing-slash and output-file naming are configured to match the current export byte-for-byte so static hosting, existing URLs, and the service worker are unaffected.

### 4.3 Repo layout (after root replacement)

```
src/
  routes/                  # thin +page.svelte per URL — all 19 routes + blog posts, path-identical
  lib/
    core/                  # ported plain-TS domain: Songs, audio, Providers, Services, utils
    games/
      types.ts             # GameDefinition interface
      genshin/             # definition module + assets (incl. current appData payload)
      sky/
    stores/                # runes singleton classes (.svelte.ts)
    components/            # shared + per-page Svelte components
    i18n/                  # i18next core setup + Svelte binding + en locale + DB locale cache
static/                    # populated per-game by the build script (today's public/)
scripts/                   # buildApp/startApp equivalents
```

Aliases: `$lib` (native) plus **`$game` → `src/lib/games/<selected>`**, resolved in `svelte.config.js` from a `PUBLIC_GAME` env var. Static imports through `$game` mean the unselected games tree-shake to zero.

### 4.4 Routing details

- All URLs identical: `/`, `/player`, `/composer`, `/vsrg-composer`, `/vsrg-player`, `/zen-keyboard`, `/sheet-visualizer`, `/theme`, `/keybinds`, `/backup`, `/transfer`, `/changelog`, `/partners`, `/donate`, `/privacy`, `/delete-cache`, `/error`, `/uma-mode`, `/blog` + 8 posts. `/` and `/player` render the same page component.
- Blog posts port 1:1 as hand-written Svelte components (no mdsvex conversion — parity first).
- The guarded-navigation contract (composer unsaved-work prompt, currently `src/app/_navigation/`) reimplements on SvelteKit's native `beforeNavigate`.
- 404 page generated for static hosts (parity with exported `404.html`).
- `paths.base` from env: `/skyMusic`, `/genshinMusic`, or empty (root builds), matching `NEXT_PUBLIC_BASE_PATH` behavior today.

## 5. Multi-game system: `GameDefinition`

### 5.1 Shape

One interface; shared code imports game specifics **only via `$game`**, never from a concrete game folder. Field list below is the design intent; exact fields are finalized by the Phase-0 audit of all ~232 `APP_NAME` references (a defined deliverable, not an open question):

```ts
interface GameDefinition {
  id: string            // 'genshin' | 'sky' | future ids — code checks, asset paths
  storageId: string     // LEGACY-LOCKED: 'Genshin' | 'Sky'. IndexedDB db name,
                        // localStorage prefixes, appName field inside serialized
                        // songs/backups. New games: storageId === id.
                        // Always explicit, never derived from id.
  display: {...}        // app title, domain, promo links to sibling apps
  meta: {...}           // per-game head metadata, theme color, manifest values
  notes: {...}          // note count (21/15/N), row geometry, CSS classes,
                        // SVG glyph component map, note-name display modes
  layouts: {...}        // keyboard / ABC / numbers (+ PlayStation / Switch where present)
  instruments: {...}    // roster, per-instrument data, audio folder names, default
  midi: {...}           // note maps, bounds, presets
  themes: {...}         // base palette (BASE_THEME_CONFIG) + default theme list
  settings: {...}       // per-game default settings objects (player/composer/vsrg/…)
  features: {...}       // capability flags for behavior branches surfaced by the audit
  i18n: {...}           // game-specific string overrides + interpolation vars (game name)
}
```

### 5.2 The two-tier branching rule

Every current `APP_NAME === 'Sky'` branch becomes exactly one of:

1. **Data lookup** — different values, same behavior → a `GameDefinition` field (`game.notes.count`).
2. **Feature flag** — different behavior → `game.features.<capability>`, named for what it does, not who uses it (`hasSwitchLayout`, not `isSky`), so a third game picks capabilities instead of impersonating an existing game.

True one-offs may use `game.id === 'sky'` as an escape hatch, each carrying a `// game-escape-hatch:` comment so they are greppable. Expected count: single digits; each reviewed at the end of the port.

### 5.3 Compatibility locks

- `storageId` keeps exact legacy casing → IndexedDB database names (`Genshin`, `Sky`, schema version 4), localStorage key prefixes, and `appName` values inside serialized songs/backups stay byte-identical.
- Audio sample URLs (`/assets/audio/{game}/{instrument}/{n}.mp3`) already namespace by game and stay unchanged — existing service-worker audio caches remain valid.
- Backup import/export (`FileService`) keeps accepting every legacy format it accepts today.

### 5.4 Assets

Each game folder carries its `static/` payload (favicon, logos, `manifest.json`, screenshots — today's `src/appData/*`) and its SVG note glyphs as Svelte components referenced from `notes.svgGlyphs`. The build script copies the selected game's payload into `static/` before `vite build` (same mechanism as today's `public/` copy).

### 5.5 Build-time now, runtime later

Selection = the `$game` alias (env-resolved, tree-shaken). Definitions are self-contained data modules with no side effects, so a future runtime switcher becomes: import all registered definitions, hold the active one in a `$state` wrapper, and solve the genuinely runtime-hostile bits then (manifest/favicon `<link>` swap, SW cache naming, instrument buffer reload). Nothing in this design hard-blocks that; nothing pays its cost now. Shared components must not capture game-derived values in module-level constants (deriving inside game definition modules themselves is fine — they are per-game by construction).

**Adding game #3** = create `games/<id>/` (definition + static payload + SVG glyphs + audio samples under `static/assets/audio/<id>/`), register it in the build script. Zero shared-code edits expected.

## 6. Porting design

### 6.1 State (MobX → runes)

Each of the 15 stores becomes a plain class with `$state` fields in `src/lib/stores/<name>.svelte.ts`, exported as a singleton with the same names, public methods, and shapes. Components read properties directly (runes auto-track), so the custom hook layer (`useObservable*`, `useTheme`, `useConfig`, `useSongs`, …) is deleted, not ported. Non-component consumers (pixi renderers, audio provider) that used `subscribeObservable*` get an explicit `subscribe(cb)` helper built on `$effect.root`, added per store where needed. `ObservableNote` becomes a `$state` object on the note.

### 6.2 Pixi (`@pixi/react` → raw pixi.js)

One plain-TS renderer class per canvas — `ComposerRenderer`, `VsrgComposerRenderer`, `VsrgPlayerRenderer` — owning `Application` init, manual resize, texture caches (`ComposerCache` / `VsrgComposerCache` / `VsgPlayerCache` port as-is), native event wiring, and explicit `update(state)` methods. The Svelte component owns lifecycle only: `onMount` constructs with the container element, `$effect` pushes reactive inputs into `update()`, `onDestroy` destroys. This is the manual rewrite the current `ComposerCanvas.tsx` comments already request and removes React-reconciler overhead from the hottest pages. These three canvases are the largest work items in the port.

### 6.3 Domain core

`src/lib/{Songs, audio, Providers, Services, utils}` ports nearly verbatim into `lib/core/`: strip the few MobX touches, keep every `serialize()`/`deserialize()` byte-identical (enforced by golden tests), keep `AudioProvider`/`KeyboardProvider`/`MIDIProvider` as framework-agnostic singletons. `Database.ts` keeps ZangoDB with the same database name, schema version, and collections; `TauriCollection` is deleted and the `Collection` indirection collapses to the ZangoDB implementation.

### 6.4 Theme system

Same CSS-variable contract. The `ThemeProviderWrapper` computation (all `--primary` / `--accent` / `--*-layer-N` / text-color derivations via the `color` lib) moves into a `$derived` map in a root layout component injecting identical variable names. Every stylesheet ports untouched: global CSS/SCSS stay global imports; CSS-module styles fold into each component's scoped `<style lang="scss">`.

### 6.5 i18n

Keep i18next core; drop only react-i18next. A ~50-line Svelte binding exposes the same `t()` surface backed by a `$state` tick bumped on `languageChanged`/`resourcesAdded` events. The 26 namespaces, `en`-bundled + DB-lazy-loaded locale system, and the `translation` IndexedDB collection stay exactly as they are. Game-specific strings resolve via `GameDefinition.i18n` (interpolation vars + per-game overrides).

### 6.6 Service worker / PWA

Port `service-worker.ts` to SvelteKit's native service-worker entry using the plain `serwist` library (the current worker is runtime-caching only with an empty precache, so it barely used the Next integration). Same cache naming (`{storageId}` + build-stamped `SW_VERSION`), same `NetworkFirst` catch-all + `CacheFirst` audio strategy, same manual registration and SKIP_WAITING update prompt. Installed PWAs update seamlessly because cache names and the manifest URL do not change.

### 6.7 Error handling & app shell

React's `ErrorBoundaryRedirect` becomes Svelte 5's native `<svelte:boundary onerror>` at the layout level: capture to `logsStore`, redirect to `/error`. `AsyncPrompt`, toasts (`logger`), and the drop-zone provider port as shared Svelte components/stores. TWA/Android detection (`isTwa`) is kept — it is the Play Store wrapper, not Tauri. `WindowProtocol` + `/transfer` are kept — cross-domain data transfer, not Tauri.

## 7. Build pipeline

`scripts/buildApp.js` gets a direct equivalent: for each target, copy `games/<id>/static/` → `static/`, rewrite manifest paths for the base path, set `PUBLIC_GAME` + `BASE_PATH` + `PUBLIC_SW_VERSION`, run `vite build` into `build/{skyMusic|genshinMusic}`, restore. npm script names are preserved (`dev:sky`, `dev:genshin`, `build:sky`, `build:genshin`, `build:all`, `build:*-no-root`, `preview:*`) so muscle memory and CI keep working. GitHub workflows update to the new build; `BuildTauri.yml` is deleted.

## 8. Tauri removal

Clean delete (already inert — `IS_TAURI` hardcoded false): `src-tauri/`, `@tauri-apps/*` dependencies, all `tauri` / `build-tauri` / `dev-tauri` scripts, `src/types/TauriTypes.ts`, `TauriCollection`, every `IS_TAURI` branch, `.github/workflows/BuildTauri.yml`. Explicitly kept: `WindowProtocol` (used by `/transfer`) and TWA detection.

## 9. Verification

1. **Golden fixtures first, on the current code** (before any Svelte exists): a Vitest suite runs against the current codebase on `migration/next16-react19`, generating committed fixture files — serialized `ComposedSong` / `RecordedSong` / `VsrgSong` (every format version `FileService` can import), folders, themes, full backups, `NoteLayer` bit-field encodings, cross-game `toGenshin()` / `toSky()` conversions, MIDI export, per-game settings defaults. The ported core must reproduce every fixture byte-for-byte.
2. **Manual parity checklist per page**: each page's implementation task ends with a checklist (visual, interactions, keybinds, both games, mobile + desktop) verified against the live app before the page is called done.
3. **Final audits**: every `game-escape-hatch` reviewed; no stray `'Genshin'` / `'Sky'` literals outside game folders and compat shims; DB names + localStorage keys diffed against a capture from the live app; bundle-size comparison vs the current app.

## 10. Phases

Each phase lands green before the next starts.

- **Phase 0 — on current code** (`migration/next16-react19`): golden-fixture suite + committed fixtures; audit of all ~232 `APP_NAME` references → categorized table (data / feature flag / escape hatch) → final `GameDefinition` fields; spike: `@insertish/zangodb` bundles and runs under Vite.
- **Phase 1 — skeleton**: branch `migration/sveltekit`; SvelteKit scaffold replaces root; aliases, sass, lint/check, Vitest, build scripts, CI; empty routes render for both games.
- **Phase 2 — core**: both game definitions; ported domain core and storage layer; golden tests green. No UI.
- **Phase 3 — foundation UI**: stores, theme injection, i18n binding, app shell (menus, `DefaultPage`, settings components, inputs, toasts, prompts).
- **Phase 4 — pages, simplest → hardest**: static/info (privacy, donate, changelog, partners, blog, error, delete-cache) → utility (backup, transfer, keybinds, MIDI setup, theme editor, uma-mode) → keyboard (zen-keyboard, sheet-visualizer, player) → pixi (composer, vsrg-composer, vsrg-player). Each page: port → parity checklist → next.
- **Phase 5 — PWA & release**: service worker, per-game builds + manifests, 404, metadata parity, bundle comparison, full-app parity pass on both games, root replacement finalized (old app files gone), workflows + README updated, deploy.

The pixi pages in Phase 4 are roughly half the total effort; the implementation plan will break each canvas into sub-tasks. Until Phase 5 completes, the existing Next app remains intact on its branches and deployable.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `@insertish/zangodb` misbehaves under Vite bundling | Phase-0 spike, before any commitment. Fallback: patch/fork the package or vendor it; the `Collection` interface isolates the blast radius. |
| `GameDefinition` shape proves wrong mid-port | Interface is derived empirically from the full 232-reference audit before any UI port; escape hatch absorbs stragglers without blocking. |
| Serialization drift corrupts user data | Golden fixtures generated from current code; byte-for-byte reproduction required from Phase 2 onward. |
| Pixi rewrite behavior drift (scroll, zoom, selection, timing) | Renderer classes port the existing imperative logic (already class-shaped); per-canvas parity checklists include interaction inventories. |
| Prerender breaks on browser-global access at module scope | The code already survives Next static export's server render; same guards carry over. `svelte-check` + a build per page during Phase 4 catches regressions early. |
| SW cache naming/URL drift logs out installed PWAs from offline use | Cache names, manifest URL, and asset URL structure are locked in §5.3/§6.6; Phase 5 verifies an in-place update of an installed PWA. |

## 12. Out of scope

- Runtime game switching (designed-for, not built).
- Any third game's actual content.
- Visual redesigns, new features, mdsvex/blog rework, E2E test suite.
- Tauri replacement (desktop packaging of any kind).

## 13. Success criteria

1. Both games build to `build/skyMusic` / `build/genshinMusic` (plus root variants) as fully static output, deployable on current hosting with unchanged URLs.
2. A user with existing local data (songs, folders, themes, settings, cached locales) opens the new app and everything loads with zero action.
3. All golden-format fixtures reproduce byte-for-byte; backup files exported by the old app import into the new one and vice versa.
4. Every page passes its parity checklist on both games, mobile and desktop.
5. No `@pixi/react`, `react`, `next`, `mobx`, or `@tauri-apps/*` in the dependency tree; no Tauri files in the repo.
6. Adding a hypothetical game requires only a new `games/<id>/` folder and build-script registration (validated by code review of the final structure, not by shipping a third game).
