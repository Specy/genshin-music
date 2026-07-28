# Phase 3: Foundation UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the app's foundation UI on the ported core — runes stores replacing every shell-level MobX singleton, the CSS-variable theme injector, the i18next system with a Svelte binding, and the real app shell (providers, menus, toasts, prompts, Home overlay) — so every route stub renders inside the genuine chrome with themes, i18n, and persistence working.

**Architecture:** Stores are singleton classes in `.svelte.ts` files with `$state` fields — same names, same public APIs as the old MobX stores (the old-blob inventory is in this plan; minimal-behavior-diff, not byte-diff, since React→Svelte is a rewrite). The theme pipeline is: core `Theme` model (made reactive by converting its file to `.svelte.ts`, `observable()` → `$state()`) → a `ThemeVars.svelte` injector reproducing the old CSS-variable formulas EXACTLY → global CSS consuming them. i18n keeps i18next core (react-i18next dropped) with a ~50-line runes binding preserving the DB-cached lazy-locale system. Shell components port from the old React tree by conversion rules (JSX→Svelte template, hooks→runes, context→svelte context), each with a behavior checklist as its acceptance spec.

**Tech Stack:** additions this phase: `i18next` (core only), `worker-timers` (+`@types` if needed). Fonts + SVG glyph sources restored from the parent branch. NO react-* packages ever.

**Parent docs:** spec §6.1/§6.4/§6.5/§6.7 + §10 Phase 3; ledger `.superpowers/sdd/progress.md` block "P2 -> P3 PLAN OBLIGATIONS" (all ten items are distributed across tasks below); the old-code inventory lives in the task briefs themselves (old paths cited per item; source of truth `git show migration/next16-react19:<path>`).

## Global Constraints

- Branch `migration/sveltekit`, continuing from `17b22e17`. Nothing merges to `main`.
- Golden fixtures IMMUTABLE (never regenerate; `git log -1 -- test/fixtures` stays `5f24ae0e`). NEW test files are allowed and required this phase (new names only); `test/imports.ts` may gain NEW exports and may adjust the ThemeProvider specifier to its `.svelte` module form — existing export NAMES never change.
- Storage keys byte-locked (see `docs/superpowers/audits/2026-07-19-storage-inventory.md`): `${APP_NAME}_Theme`, `${APP_NAME}_keybinds` (version 13), `${APP_NAME}_uma_mode`, `${APP_NAME}_Visited`, `${APP_NAME}_ShowHome`, `${APP_NAME}_Version`, `${APP_NAME}_repeat_update_notice`, `${APP_NAME}_visited_pages`, `${APP_NAME}-font-size` (hyphen!), `LANG_PREFERENCE_KEY_NAME` from the old Config (verify its literal via `git show migration/next16-react19:src/Config.ts | grep LANG_PREFERENCE`). `APP_NAME` here = the adapter's export (= `game.storageId`).
- Two-tier rule: UI components read `$game` directly (never `$core/legacyConfig`); domain/core code may use the adapter. Stores are UI-tier: prefer `$game` fields where the old code read a Config constant that maps 1:1 (e.g. `game.layouts.defaultKeyboardKeys`), BUT keep the adapter where the old code's expression is locked by tests.
- Runes idiom: singleton class + `$state` fields in `.svelte.ts`; NO `svelte/store` writables; components read `store.field` directly. External subscription (for services/tests) via plain callback registries where the old store exposed `subscribe*` helpers.
- Old React code is the behavior spec: every ported component/store lists its old path; behavior checklists in tasks are the acceptance criteria. No visual redesigns — port CSS as-is.
- Phase-1/2 lessons (binding): NEVER `git add -A`; LF-only byte-check before every commit; 4-space indent, no brace-space; dual-game `npm run check` + `npm run check:sky` before commit; `npm test` must stay green after EVERY task (existing suite + this phase's new tests).
- Service-worker registration is Phase 5 — the shell skips it (leave a `// Phase 5: service worker registration` marker where providers.tsx had it).
- Audio engine + input providers (`AudioProvider`, `Instrument`, `KeyboardProvider`, `MIDIProvider`, metronome) port in Phase 4 — the old `GeneralProvidersWrapper` init calls for them are OMITTED with a `// Phase 4:` marker each. `KeybindsStore` ports WITHOUT the `KeyboardProvider`-dependent module-level listener factories (`createShortcutListener`, `createKeyboardListener`, `createKeyComboComposer` — Phase 4, listed as deferred).
- Deps: only `i18next` and `worker-timers` may be added (+`@types/worker-timers` if typings missing). Anything else → BLOCKED report.
- Documented refinement of spec §10 (like the P2 audio deferral): the settings-PANE components (`SettingsPane/SettingsRow/Input/Select/Slider/InstrumentInput`) and the page-specific inputs (`ColorPicker`, `InstrumentSelect`, `PitchSelect`, `SongActionButton`) are deferred to Phase 4 WITH their only consumers (page menus). Porting them now would create untestable dead components. They are named in the exit-criteria carry-forward list so Phase 4's plan must include them.

---

### Task 1: Runes store infrastructure — the six simple shell stores

**Files:**

- Create: `src/lib/stores/LoggerStore.svelte.ts`, `src/lib/stores/LogsStore.svelte.ts`, `src/lib/stores/HomeStore.svelte.ts`, `src/lib/stores/GlobalConfigStore.svelte.ts`, `src/lib/stores/PwaStore.svelte.ts`, `src/lib/stores/BrowserHistoryStore.ts`
- Create: `test/stores.test.ts`

**Interfaces:**

- Consumes: `$core/legacyConfig` (`APP_NAME`, `BASE_LAYER_LIMIT`), `$core/Songs/Layer` (`NoteLayer`), `$core/Errors` (`AppError`), `is-mobile`.
- Produces: singletons `logger`, `logsStore`, `homeStore`, `globalConfigStore`, `pwaStore`, `browserHistoryStore` with the OLD public APIs (old paths: `src/stores/{LoggerStore,LogsStore,HomeStore,GlobalConfigStore,PwaStore,BrowserHistoryStore}.ts` on the parent branch — port each class 1:1, `@observable` field → `$state` field, `makeObservable`/mobx imports deleted, everything else same names/signatures). `LoggerStatus` enum values are CSS colors — preserve exactly.

- [ ] **Step 1: Port the six stores**

Pattern (this is the normative shape — apply to each old class):

```ts
// src/lib/stores/LoggerStore.svelte.ts  (old: src/stores/LoggerStore.ts)
import { AppError } from '$core/Errors';

export enum LoggerStatus {
  ERROR = 'var(--red)',
  WARN = 'var(--orange)',
  SUCCESS = 'var(--accent)',
}

export type ToastState = {
  timestamp: number;
  visible: boolean;
  text: string;
  timeout: number;
  id: number;
  type: LoggerStatus;
};
export type PillState = { visible: boolean; text: string };

class LoggerStore {
  toasts: ToastState[] = $state([]);
  pillState: PillState = $state({ visible: false, text: '' });
  private lastId = 0;
  // ...every method from the old class, bodies unchanged except
  // observable-mutation idioms that translate directly (push/splice work on $state arrays)
}
export const logger = new LoggerStore();
```

Port ALL methods with old signatures: `log(text, timeout = 4500, type = LoggerStatus.SUCCESS)`, `error`, `success`, `warn`, `logAppError`, `showPill`, `hidePill`, `clearToasts`, `hideToast(id)`, `removeToast(id)`, `setState`, `setPillState`. Same for the other five (old blobs are the spec; `GlobalConfigStore.load()` keeps `is-mobile`, the `${APP_NAME}_uma_mode` key, and `NoteLayer.setMaxLayerCount(1024|BASE_LAYER_LIMIT)`; `PwaStore` keeps the `isTWA()` skip and `beforeinstallprompt` wiring with SSR guards (`if (typeof window === 'undefined') return`); `BrowserHistoryStore` stays a plain non-reactive class exactly as old).

- [ ] **Step 2: Write the store tests**

`test/stores.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, LoggerStatus } from '../src/lib/stores/LoggerStore.svelte';
import { homeStore } from '../src/lib/stores/HomeStore.svelte';
import { logsStore } from '../src/lib/stores/LogsStore.svelte';

describe('LoggerStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    logger.clearToasts();
  });
  it('log pushes a toast and auto-hides then removes it', () => {
    logger.log('hello', 1000, LoggerStatus.SUCCESS);
    expect(logger.toasts.length).toBe(1);
    expect(logger.toasts[0].text).toBe('hello');
    expect(logger.toasts[0].visible).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(logger.toasts[0]?.visible ?? false).toBe(false);
    vi.advanceTimersByTime(300);
    expect(logger.toasts.length).toBe(0);
  });
  it('pill shows and hides', () => {
    logger.showPill('working');
    expect(logger.pillState).toEqual({ visible: true, text: 'working' });
    logger.hidePill();
    expect(logger.pillState.visible).toBe(false);
  });
});

describe('HomeStore', () => {
  it('open/close set the old flag semantics', () => {
    vi.useFakeTimers();
    homeStore.open();
    expect(homeStore.state.visible).toBe(true);
    expect(homeStore.state.isInPosition).toBe(false);
    homeStore.close();
    expect(homeStore.state.isInPosition).toBe(true);
    vi.advanceTimersByTime(151);
    expect(homeStore.state.visible).toBe(false);
  });
});

describe('LogsStore', () => {
  it('dedupes by error identity', () => {
    logsStore.clearLogs();
    const err = new Error('x');
    logsStore.addLog({ error: err, message: 'a' });
    logsStore.addLog({ error: err, message: 'b' });
    expect(logsStore.logs.length).toBe(1);
  });
});
```

(If direct `.svelte.ts` importing needs the barrel treatment instead, route these imports through new named exports added to `test/imports.ts` — new names are allowed — and note it.)

- [ ] **Step 3: Run** `npx cross-env PUBLIC_GAME=genshin npx vitest run test/stores.test.ts` → all pass; then full `npm test` → previous suite still green (now +1 file both games). `npm run check` + `npm run check:sky`. LF check.

- [ ] **Step 4: Commit** `git add src/lib/stores test/stores.test.ts test/imports.ts` (if touched) → `feat: runes shell stores (logger, logs, home, global-config, pwa, history)`

---

### Task 2: Service-backed stores + Theme.save() restoration + definition-consistency guard

**Files:**

- Create: `src/lib/stores/SongsStore.svelte.ts`, `src/lib/stores/FoldersStore.svelte.ts`, `src/lib/stores/KeybindsStore.svelte.ts`, `src/lib/stores/ThemeStore.svelte.ts`
- Modify: `src/lib/core/utils/Utilities.ts` (restore `createDebouncer`, `debounce`, `Timer` type — byte-verbatim from the old blob, reuniting the orphaned `Debouncer` export), `src/lib/core/theme/ThemeProvider.ts` (restore the two stripped `themeStore` lines in `save()` — importing the NEW runes `themeStore`)
- Create: `test/serviceStores.test.ts`, `test/gameDefinitionConsistency.test.ts`

**Interfaces:**

- Consumes: `$core/Services/*` singletons, `$core/Folder`, `$core/Songs/Song` (`extractStorable`, `SongStorable`), the restored `createDebouncer`.
- Produces: `songsStore` (10ms-trailing-debounced `sync` exactly as old `src/stores/SongsStore.ts` — the debounce is HERE, not in folders), `folderStore` (non-debounced sync + `removeFolder` cascading `songsStore.clearSongsInFolder`), `keyBinds` (localStorage `${APP_NAME}_keybinds`, `version = 13`, per-game `keyboard` defaults read from `game.layouts.defaultKeyboardKeys` — VERIFY equal to the old ternary lists, they are fixture-checked below; the three `KeyboardProvider` listener factories DEFERRED with `// Phase 4:` markers), `themeStore` (themes list `$state`, `sync/add/update/remove/getCurrentThemeId/setCurrentThemeId` proxying `_themeService`). `Theme.save()` works again: `themeStore.setCurrentThemeId(this.getId())` + editable-guarded `themeStore.updateTheme(...)` — the old lines restored verbatim with the new import.

- [ ] **Step 1: Restore the Utilities functions** (byte-verbatim from `git show migration/next16-react19:src/lib/utils/Utilities.ts` — the `Timer`/`createDebouncer`/`debounce` block + export-list entries; same relocation-comment style as prior restorations).

- [ ] **Step 2: Port the four stores** (old blobs = spec; `@observable.shallow` arrays → plain `$state` arrays; the `splice(0, len, ...)` refresh idiom works on `$state` arrays — keep it).

- [ ] **Step 3: Restore `Theme.save()`** — delete the strip-comments, re-add the two old lines with `import {themeStore} from '$stores/ThemeStore.svelte'` (`$stores` alias exists from Phase 1). This makes core import a store — ACCEPTABLE and intended here (the old code had the same coupling; the strip was temporary). Note it in the report.

- [ ] **Step 4: Write the acceptance tests**

`test/serviceStores.test.ts` (fake-indexeddb is already in the setup):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { themeStore } from '../src/lib/stores/ThemeStore.svelte';
import { songsStore } from '../src/lib/stores/SongsStore.svelte';
import { keyBinds } from '../src/lib/stores/KeybindsStore.svelte';
import { BaseTheme, ThemeProvider } from './imports';

describe('theme persistence (P2 Important-1 acceptance: "theme edit persists across reload")', () => {
  it('Theme.save() persists the current theme id and the edited doc', async () => {
    const custom = new BaseTheme('My custom');
    const id = await themeStore.addTheme(custom.serialize());
    ThemeProvider.loadFromTheme({ ...custom.serialize(), id });
    ThemeProvider.set('accent', '#123456');
    await ThemeProvider.save();
    expect(themeStore.getCurrentThemeId()).toBe(id);
    await themeStore.sync();
    const persisted = themeStore.themes.find((t) => t.id === id);
    expect(persisted?.data.accent.value).toBe('#123456');
  });
});

describe('songsStore debounced sync', () => {
  it('collapses burst syncs into one read after 10ms', async () => {
    vi.useFakeTimers();
    const spy = vi.spyOn(await import('./imports').then((m) => m.songService), 'getStorableSongs');
    songsStore.sync();
    songsStore.sync();
    songsStore.sync();
    await vi.advanceTimersByTimeAsync(15);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe('keybinds persistence', () => {
  it('round-trips serialize/load at version 13 under the legacy key', () => {
    keyBinds.save();
    const raw = localStorage.getItem(`${'Genshin' /* replaced below */}_keybinds`);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).version).toBe(13);
  });
});
```

Adapt the storage-key literal to read `APP_NAME` from `./imports` (works per-game). If `ThemeProvider.set`'s exact signature differs from the old blob (`set(name, value)`), match the old blob — the test adapts to the REAL API, never the reverse.

`test/gameDefinitionConsistency.test.ts` (P2 Important-2 — locks definition fields to the legacy-computed values):

```ts
import { describe, expect, it } from 'vitest';
import { game } from '$game';
import {
  APP_NAME,
  ComposerSettings,
  INSTRUMENTS,
  NOTES_PER_COLUMN,
  PlayerSettings,
  ThemeSettings,
  ZenKeyboardSettings,
} from './imports';
import { InstrumentData } from './imports';

describe('GameDefinition fields match legacy-computed values (drift guard)', () => {
  it('identity + geometry', () => {
    expect(game.storageId).toBe(APP_NAME);
    expect(game.notes.perColumn).toBe(NOTES_PER_COLUMN);
    expect(game.instruments.list).toEqual(INSTRUMENTS);
  });
  it('defaults duplicated in core ternaries', () => {
    expect(new InstrumentData().volume).toBe(game.instruments.defaultVolume);
    expect(ThemeSettings.data.note_background.value).toBe(game.themes.defaultNoteBackground);
    expect(ComposerSettings.data.noteNameType.value).toBe(
      game.settings.defaultNoteNameType.composer.desktop
    );
    expect(PlayerSettings.data.noteNameType.value).toBe(
      game.settings.defaultNoteNameType.player.desktop
    );
    expect(ZenKeyboardSettings.data.noteNameType.value).toBe(
      game.settings.defaultNoteNameType.zen.desktop
    );
  });
});
```

(The settings paths reference the OLD BaseSettings shapes — verify the exact property paths against `$core/BaseSettings.ts` and adjust the accessors to the real shape; the ASSERTION pairs are the requirement. jsdom UA is desktop, so `.value` holds the desktop branch.)

- [ ] **Step 5: Run** the two new files, then full `npm test` (both games), `check` + `check:sky`, LF. Expected: all green; suite grows by 2 files per game.

- [ ] **Step 6: Commit** → `feat: service-backed runes stores; Theme.save restored; definition drift guard`

---

### Task 3: i18n system (i18next core + runes binding + narrowed types)

**Files:**

- Create: `src/lib/i18n/i18n.ts` (init + `setI18nLanguage` + types — old `src/i18n/i18n.ts` minus `initReactI18next`), `src/lib/i18n/i18nCache.ts` (old file, `BASE_PATH` → SvelteKit `base` from `$app/paths`), `src/lib/i18n/locales/en/index.ts` (old 1066-line bundle verbatim; its type imports point at `$core`), `src/lib/i18n/binding.svelte.ts` (NEW — the runes binding)
- Modify: `src/lib/core/Services/Database/Database.ts` (narrow `SerializedLocale` back to `{id: AppLanguage, version: number, locale: AppI18N}` importing the real types), `src/lib/core/types/SettingsPropriety.ts` (narrow `NameOrDescriptionKey` back to the old i18n-keyed type — copy the old definition), `src/lib/core/legacyConfig.ts` (add `LANG_PREFERENCE_KEY_NAME` + `IS_DEV` if missing — derive/copy from old Config exactly), `package.json` (+`i18next`)
- Create: `test/i18n.test.ts`

**Interfaces:**

- Consumes: `DbInstance.collections.translation`, `$app/paths` `base`.
- Produces: `i18n` instance, `setI18nLanguage(i18n, lang): Promise<boolean>`, `AVAILABLE_LANGUAGES`, `AppLanguage`, `AppI18N`, `isLanguageLoaded`; from the binding: `t` — a reactive translate function usable in components (`t('menu:settings')`), implemented as a `$state` tick bumped on i18next `languageChanged` + `loaded` + `added` events with `export function t(key, opts?) { void tick.value; return i18n.t(key, opts) }` shaped for runes tracking (the binding file is ~50 lines; design it so plain non-reactive `i18n.t` remains available for services — FileService uses that).

- [ ] **Step 1:** `npm install i18next@latest` (record version).
- [ ] **Step 2:** Port the three old files per the table above (mechanical; `pluralSeparator: '+'`, `fallbackLng: 'en'`, resources `{en: i18n_en}`, the `declare module 'i18next'` augmentation kept).
- [ ] **Step 3:** Write the binding (`binding.svelte.ts`): a class with `private version = $state(0)` incremented on the three i18next events (registered once), exposing `t` as above and `language` getter. Export singleton + `t`.
- [ ] **Step 4:** Narrow the two widened types (delete the `TODO(i18n)`-era widenings; the greppable prose comments from P2 point here — remove them as resolved).
- [ ] **Step 5:** `test/i18n.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { i18n, isLanguageLoaded, setI18nLanguage } from '../src/lib/i18n/i18n';

describe('i18n core', () => {
  it('boots with bundled english and translates a known key', () => {
    expect(isLanguageLoaded('en')).toBe(true);
    expect(i18n.t('common:confirm')).toBeTypeOf('string');
    expect(i18n.t('common:confirm').length).toBeGreaterThan(0);
  });
  it('setI18nLanguage falls back gracefully for an unfetchable locale', async () => {
    const ok = await setI18nLanguage(i18n, 'ja'); // fetch fails in vitest (no server) -> cache miss -> false
    expect(ok).toBe(false);
    expect(i18n.language ?? 'en').toBeTruthy();
  });
});
```

(Adjust the known-key assertion to a real key from the en bundle — check `locales/en/index.ts` for one, e.g. `common` namespace; the requirement is a non-empty translation, not a specific string.)

- [ ] **Step 6:** Full `npm test` both games + checks + LF; commit → `feat: i18n system (i18next core, runes binding, narrowed core types)`

---

### Task 4: Reactive theme + CSS-variable injector

**Files:**

- Rename/convert: `src/lib/core/theme/ThemeProvider.ts` → `src/lib/core/theme/ThemeProvider.svelte.ts` (git mv; then `this.state = observable-era plain clone` becomes `$state`: the class field `state: ThemeState` initialized with `$state(cloneDeep(baseTheme))` — the ONE reactive change; everything else untouched)
- Modify: `test/imports.ts` (ThemeProvider specifier gains `.svelte` — names unchanged)
- Create: `src/lib/components/theme/ThemeVars.svelte`, `src/lib/components/theme/AppBackground.svelte`
- Create: `test/reactiveTheme.test.ts`

**Interfaces:**

- Consumes: `ThemeProvider` (now reactive), `TEMPO_CHANGERS` via `game.composer.tempoChangers`, `color`.
- Produces: `<ThemeVars>{children}</ThemeVars>` — wraps content in the flex div carrying ALL inline CSS vars + emits the `:root` style block + `theme-color` meta; recomputes via `$derived` on the reactive theme state (the old 50ms debounce becomes unnecessary — runes are fine-grained; note this as a deliberate improvement). `AppBackground.svelte` (`page: 'Composer'|'Main'`) reading `theme.getOther('backgroundImage'+page)`.

- [ ] **Step 1:** Convert ThemeProvider to `.svelte.ts` (minimal one-line reactive change + file rename; update the handful of core/test import specifiers — `git grep -l "theme/ThemeProvider" src test`).
- [ ] **Step 2:** Write `ThemeVars.svelte` transcribing the OLD computation EXACTLY (old `src/components/shared/ProviderWrappers/ThemeProviderWrapper.tsx`):

```svelte
<script lang="ts">
  import Color from 'color';
  import { ThemeProvider as theme } from '$core/theme/ThemeProvider.svelte';
  import { game } from '$game';
  import { colorToRGB } from '$core/utils/Utilities';

  let { children } = $props();

  const vars = $derived.by(() => {
    const map = new Map<string, string>();
    const clickColor = theme.get('accent').isDark()
      ? theme.get('accent').mix(theme.get('note_background')).lighten(0.1)
      : theme.get('accent').mix(theme.get('note_background')).lighten(0.2);
    const backgroundDesaturate = theme.get('note_background').desaturate(0.6);
    const borderFill = backgroundDesaturate.isDark()
      ? backgroundDesaturate.lighten(0.5).toString()
      : backgroundDesaturate.darken(0.18).toString();
    map.set('--clicked-note', clickColor.toString());
    map.set('--note-border-fill', borderFill);
    for (const e of theme.toArray()) {
      const layers = [10, 20];
      const layersMore = [10, 15, 20];
      map.set(`--${e.css}`, e.value);
      map.set(`--${e.css}-rgb`, colorToRGB(theme.get(e.name)).join(','));
      map.set(`--${e.css}-text`, e.text);
      layers.forEach((v) =>
        map.set(
          `--${e.css}-darken-${v}`,
          theme
            .get(e.name)
            .darken(v / 100)
            .toString()
        )
      );
      layers.forEach((v) =>
        map.set(
          `--${e.css}-lighten-${v}`,
          theme
            .get(e.name)
            .lighten(v / 100)
            .toString()
        )
      );
      layersMore.forEach((v) =>
        map.set(`--${e.css}-layer-${v}`, theme.layer(e.name, v / 100).toString())
      );
    }
    for (const t of game.composer.tempoChangers) {
      map.set(`--tempo-changer-${t.id}`, Color(t.color).toString());
    }
    return map;
  });
  const styleString = $derived([...vars].map(([k, v]) => `${k}:${v}`).join(';'));
  const rootBlock = $derived(
    `:root{--html-background:${theme.get('background').alpha(1).toString()};--background:${theme.get('background').toString()};--primary:${theme.get('primary').toString()};--background-text:${theme.getText('background')};}`
  );
</script>

<svelte:head>
  {@html `<${'style'}>${rootBlock}</${'style'}>`}
  <meta name="theme-color" content={theme.get('primary').toString()} />
</svelte:head>

<div style={styleString} class="theme-vars-root">
  {@render children()}
</div>

<style>
  .theme-vars-root {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }
</style>
```

(If `colorToRGB` was among Utilities' surviving exports, import as shown; if it was deleted, restore it byte-verbatim — check first. If the `{@html}` style-tag trick fights the compiler, fall back to a `<svelte:element this="style">` or plain `document.adoptedStyleSheets` in an `$effect` — pick ONE, document which. The old app injected `:root` via a literal `<style>` tag; behavior parity is the goal.)

- [ ] **Step 3:** `test/reactiveTheme.test.ts` — non-component-level (component testing needs extra infra; test the reactive model instead):

```ts
import { describe, expect, it } from 'vitest';
import { ThemeProvider } from './imports';

describe('reactive theme model', () => {
  it('set() updates value and recomputes text color', () => {
    ThemeProvider.set('accent', '#000000');
    expect(ThemeProvider.getValue('accent')).toBe('#000000');
    expect(ThemeProvider.getText('accent').toString().toLowerCase()).not.toBe('#000000');
  });
  it('layer() lightens dark colors', () => {
    ThemeProvider.set('primary', '#101010');
    const layered = ThemeProvider.layer('primary', 0.15);
    expect(layered.luminosity()).toBeGreaterThan(ThemeProvider.get('primary').luminosity());
  });
});
```

- [ ] **Step 4:** Full test/check/LF gates; commit → `feat: reactive theme model + CSS-variable injector`

---

### Task 5: Global CSS, fonts, and shell primitives

**Files:**

- Create: `src/lib/css/App.css`, `src/lib/css/Utility.scss` (ported from old `src/app/_client-pages/App.css` + `Utility.scss` verbatim; `@font-face` URLs repointed to the restored fonts)
- Restore (byte-exact from parent branch): `src/lib/assets/font/*` (`git ls-tree migration/next16-react19 src/assets/font` for the list)
- Create (Svelte conversions of old `src/components/shared/...`): `src/lib/components/layout/{Card,Column,Row,Grid,DecoratedCard}.svelte`, `src/lib/components/layout/layoutConstants.ts`, `src/lib/components/header/Header.svelte`, `src/lib/components/inputs/{AppButton,IconButton,Select,Switch,FilePicker}.svelte`, `src/lib/components/utility/{Tooltip.svelte,tooltip.ts,BodyDropper.svelte,FloatingDropdown.svelte,HelpTooltip.svelte}`, `src/lib/components/AppLink.svelte`, `src/lib/components/Separator.svelte`

**Interfaces:**

- Consumes: theme CSS vars (Task 4).
- Produces: the primitive library later tasks compose. Conversion rules (normative for every component this phase): props via `$props()` with the old prop names; `children`/named snippets replace React children/render-props; `onClick`→`onclick` etc.; `style`/`className` props preserved where the old component exposed them; component-scoped CSS moves into `<style>`; module-scoped old `.module.css` content inlines into the component's `<style>`; `hasTooltip(text)` helper stays a plain ts export. `Memoized`/`MemoizedIcon` are NOT ported (React-perf idiom; Svelte doesn't need it — record as a documented omission).

- [ ] **Step 1:** Restore fonts byte-exact (hash-verify like the theme images); port the two global CSS files (only edit: font URLs → `./../assets/font/...` relative from the css location — verify vite resolves them in a build).
- [ ] **Step 2:** Convert the components per the rules (old blobs are the specs; keep DOM structure + class names IDENTICAL so the ported CSS applies).
- [ ] **Step 3:** Wire the global CSS: import both files in `src/routes/+layout.svelte` (this task may add the imports + `<ThemeVars>` wrapper skeleton around `{@render children()}` so the styles are live for verification; the full shell assembly is Task 7 — keep this minimal).
- [ ] **Step 4:** Verification: `npm run build` (genshin) succeeds; `npx cross-env PUBLIC_GAME=genshin npm run dev` in background + curl the home stub → response contains the ThemeVars wrapper div and the `:root` block (grep `--clicked-note` and `--html-background` in the served HTML; prerendered pages carry the inline vars). Full test/check gates. Kill the dev server (Stop-Process on the port PID — TaskStop alone won't kill it).
- [ ] **Step 5:** Commit → `feat: global css, fonts, and shell primitive components`

---

### Task 6: Toasts, async prompts, drop zone

**Files:**

- Create: `src/lib/stores/AsyncPromptStore.svelte.ts` (old `shared/Utility/AsyncPrompts.ts` — the `asyncPrompt`/`asyncConfirm` deferred-resolver API, `$state` fields), `src/lib/components/shell/Logger.svelte` (old `pages/Index/Logger.tsx` — toasts + pill; icons: inline the 3 SVGs from react-icons' fa Check/ExclamationTriangle/Times paths — copy the `d` attributes from the old rendered output or the react-icons source; no react-icons dep), `src/lib/components/shell/AsyncPrompt.svelte` (old `shared/Utility/AsyncPrompt.tsx` — prompt + confirm dialogs, Escape/Enter handling, overlay-click cancel, DecoratedCard chrome)

**Interfaces:**

- Consumes: `logger` store, `DecoratedCard`, `AppButton`, i18n `t`.
- Produces: `asyncPrompt(question: string): Promise<string|null>`, `asyncConfirm(question: string, cancellable = true): Promise<boolean|null>` — EXACT old semantics (a new call cancels the prior via `deferred(null)`); `<Logger/>` + `<AsyncPromptWrapper/>` mountables.

- [ ] **Step 1:** Port the store (deferred-resolver pattern identical; the observable state fields become `$state`).
- [ ] **Step 2:** Convert the two components (old blobs = spec; keyboard handling via `<svelte:window onkeydown>` scoped to visible state).
- [ ] **Step 3:** Test additions to `test/stores.test.ts` (append a describe):

```ts
describe('async prompts', () => {
  it('asyncConfirm resolves via answer and cancels prior prompt', async () => {
    const { asyncConfirm, asyncPromptStore } =
      await import('../src/lib/stores/AsyncPromptStore.svelte');
    const first = asyncConfirm('first?');
    const second = asyncConfirm('second?');
    expect(await first).toBe(null); // superseded
    asyncPromptStore.answerConfirm(true);
    expect(await second).toBe(true);
  });
});
```

(Adapt export names to the real ported surface — old file's exports are the contract.)

- [ ] **Step 4:** Gates; commit → `feat: toasts, async prompts, body drop zone`

---

### Task 7: FileService, shell orchestration, and the real root layout

**Files:**

- Create: `src/lib/core/Services/FileService.ts` (minimal-diff port of old `src/lib/Services/FileService.ts`: store imports → the new runes stores, `$i18n/i18n` → `$lib/i18n/i18n`, everything else verbatim; brings `SerializedSongKind` into `$core/types.ts` — old definition now constructible), `src/lib/core/Services/globalServices.ts` (verbatim port incl. the `themeSerivce` misspelling), `src/lib/core/needsUpdate.ts` (old file; `IS_TAURI` branch deleted; `delay` restored to Utilities byte-verbatim WITH `worker-timers` — install it), `src/lib/core/PagesVersions.ts` (old file; the `APP_NAME === "Genshin"` ternary PRESERVED via the adapter — documented decision: faithful parity beats inventing an overrides convention now), `src/lib/core/changelog.ts` (verbatim port)
- Create: `src/lib/stores/PageVisitStore.svelte.ts` (old `shared/PageVisit/pageVisit.tsx`'s internal store + helpers, sans React hooks — expose `hasVisitedPage(key)`, `setPageVisited(key)`, reading `${APP_NAME}_visited_pages`)
- Create: `src/lib/components/shell/AppInit.svelte` (the AppBase-equivalent orchestrator — effects only, no visual output except the rotate-screen overlay; see checklist), `src/lib/components/shell/PageMetadata.svelte` (svelte:head title+og/description)
- Modify: `src/routes/+layout.svelte` (final form — the provider stack), `package.json` (+`worker-timers`)

**Interfaces:**

- Consumes: everything prior.
- Produces: the working shell. Root layout final structure:

```svelte
<script lang="ts">
  import '$lib/css/App.css';
  import '$lib/css/Utility.scss';
  import ThemeVars from '$lib/components/theme/ThemeVars.svelte';
  import Logger from '$lib/components/shell/Logger.svelte';
  import AsyncPrompt from '$lib/components/shell/AsyncPrompt.svelte';
  import BodyDropper from '$lib/components/utility/BodyDropper.svelte';
  import AppInit from '$lib/components/shell/AppInit.svelte';

  let { children } = $props();
</script>

<ThemeVars>
  <BodyDropper>
    <Logger />
    <AsyncPrompt />
    <AppInit />
    <svelte:boundary onerror={handleShellError}>
      {@render children()}
    </svelte:boundary>
  </BodyDropper>
</ThemeVars>
```

(with `handleShellError` capturing to `logsStore` + `goto` to `/error` mirroring old ErrorBoundaryRedirect incl. the localhost skip; exact wiring per old blob.)

**AppInit behavior checklist (each item = an old AppBase/providers/GeneralProviders effect; implement in `onMount`/`$effect`/`afterNavigate`):** console.error + window-error capture → `logsStore`; `// Phase 5: service worker registration` marker; `// Phase 4: AudioProvider/metronome/KeyboardProvider/MIDIProvider init` markers; `globalConfigStore.load()` BEFORE `songsStore.sync()`; `folderStore.sync()`, `themeStore.sync()`, `keyBinds.load()`, `pwaStore.load()`, `ThemeProvider.load()`, `linkServices()`; language selection (exact old algorithm: stored pref → navigator → exact-then-root match → `document.documentElement.lang` + `setI18nLanguage`); `${APP_NAME}_Visited`/`_ShowHome` → homeStore (blog excluded); update-notice flow (`APP_VERSION` vs `${APP_NAME}_Version` + `_repeat_update_notice`); `checkIfneedsUpdate()`; backup warning (3 weeks via `settingsService.shouldShowBackupWarning` → `logger.warn(t('logs:suggest_backup'))`); `launchQueue` file-open consumer → `asyncConfirm` + `fileService.importAndLog`; page-view tracking → `browserHistoryStore.addPage` on `afterNavigate` (skip first); the rotate-screen overlay markup (mobile portrait); drop-zone handler already in BodyDropper → `fileService.importAndLog`. Analytics calls: OMIT with `// Phase 4/5: analytics` markers (GoogleAnalyticsScript is page-head territory, later).

- [ ] **Step 1:** `npm install worker-timers@latest`; restore `delay` to Utilities byte-verbatim; port the five core files per the Files table (minimal-diff; old blobs = spec; FileService's store imports point at the new runes stores).
- [ ] **Step 2:** Port `PageVisitStore.svelte.ts` and write `AppInit.svelte` against the behavior checklist above (every checklist item present or carrying its named `// Phase 4/5:` marker — the reviewer will tick them off).
- [ ] **Step 3:** Write `PageMetadata.svelte`; assemble the root layout exactly as the structure block shows; wire `handleShellError` per the old ErrorBoundaryRedirect (logsStore capture + `goto('/error')` + localhost skip).
- [ ] **Step 4:** **Verification:** dev-server smoke (background start + curl; kill via port-PID afterwards): served home stub carries the theme vars and `<title>`; `npm run build:all` green; full `npm test` both games; `check` + `check:sky`; LF.
- [ ] **Step 5:** Commit → `feat: FileService, app init orchestration, real root layout shell`

---

### Task 8: Menu system, DefaultPage, Home overlay

**Files:**

- Create: `src/lib/components/menu/{menuContext.ts,MenuSidebar.svelte,MenuItem.svelte,MenuButton.svelte,MenuPanelWrapper.svelte,MenuPanel.svelte}` (old `shared/Menu/*` — React context → `setContext`/`getContext` with a typed key)
- Create: `src/lib/components/shell/{DefaultPage.svelte,SimpleMenu.svelte,AppBackground already exists — wire it}`, `src/lib/components/shell/Home.svelte` + its CSS (old `pages/Index/Home.tsx` + `Home.css` — the 430-line launcher: nav cards for all pages, `DefaultLanguageSelector`, font-size control (`${APP_NAME}-font-size`), cache clear, PWA install via `pwaStore.install()`, TWA checks, persistent-storage ask), `src/lib/components/i18n/LanguageSelector.svelte` (+`DefaultLanguageSelector` wiring incl. the pill feedback)
- Modify: `src/lib/components/PageStub.svelte` (wrap its content in `DefaultPage` so every stub route exercises the real chrome), `src/routes/+layout.svelte` (mount `<Home/>` at shell level per old AppBase)

**Interfaces:**

- Consumes: everything.
- Produces: every route showing the real sidebar (back via `browserHistoryStore`, Discord link with leave-confirm via `asyncConfirm`, Home button opening the overlay), the Home overlay with working language switch + theme-aware styling. Old blobs are the specs; DOM/class parity so old CSS applies.

- [ ] **Step 1:** Convert the menu system (context via typed `setContext`/`getContext`; old `MenuContext.ts` state shape `{current, setCurrent, open, setOpen, visible}` preserved).
- [ ] **Step 2:** Convert `DefaultPage.svelte` (props `excludeMenu`, `menu` snippet, `className`, `style`, `contentStyle`, `cropped`; the `--left/right-mobile-padding` vars; `<main class="default-content appear-on-mount">`) and `SimpleMenu.svelte` (back button gated on `browserHistoryStore.hasNavigated`; Discord link with `asyncConfirm` leave-guard; Home button → `homeStore.open()`).
- [ ] **Step 3:** Convert `Home.svelte` + `LanguageSelector.svelte` per their old blobs (behavior checklist: overlay visibility classes from `homeStore.state`, nav cards for every route, `DefaultLanguageSelector` persisting `LANG_PREFERENCE_KEY_NAME` with pill feedback, font-size control on `${APP_NAME}-font-size`, PWA install via `pwaStore.install()`, cache-clear link, TWA hides, persistent-storage ask, beta banner placeholder for Task 9's IS_BETA).
- [ ] **Step 4:** Wrap `PageStub.svelte` content in `DefaultPage`; mount `<Home/>` in the root layout per old AppBase.
- [ ] **Step 5:** **Verification:** dev-server smoke — served HTML contains the sidebar and Home overlay markup; clicking-level checks via browser tools if available (menu opens, Home overlay toggles), else document curl-level evidence; `build:all` + full suite + checks + LF.
- [ ] **Step 6:** Commit → `feat: menu system, DefaultPage chrome, Home overlay`

---

### Task 9: Glyphs, IS_BETA, types finale, CI, exit verification

**Files:**

- Create: `src/lib/games/genshin/glyphs/*.svelte` (11 — converted from old `shared/SvgNotes/genshin/*.tsx`), `src/lib/games/sky/glyphs/*.svelte` (3), each game's `index.ts` populating `notes.svgGlyphs`; `src/lib/components/SvgNote.svelte` (lookup by `NoteImage` key)
- Modify: `src/lib/games/types.ts` — `GlyphComponent` → `import('svelte').Component<{background?: string}>` AND reformat the whole file to 4-space (the verbatim-vs-audit era ends HERE, in this same commit — note it in the audit doc with a one-line addendum "implemented as src/lib/games/types.ts; formatting normalized in <sha>")
- Create: `src/lib/env.ts` — `export const IS_BETA = PUBLIC_IS_BETA === 'true'` via `$env/static/public` (with the `PUBLIC_IS_BETA` optional-var handling kit requires — check kit's static-env optionality; if absent-var breaks the build, source from `import.meta.env` with a comment); consume it in Home's beta banner (old Home.tsx line ~328)
- Create: `.github/workflows/test.yml` — on push/PR to `migration/*` and `main`: node 22, `npm ci`, `npm test`, `npm run check`, `npm run check:sky`, `npm run lint`
- Exit steps: full matrix (`build:all`, `build:all-no-root`, `npm test` fresh `.svelte-kit`, checks, lint), storage-key grep vs the inventory doc, no-react/no-mobx greps, ledger completion line.

- [ ] Steps per above; glyph conversion rule: the old `.tsx` files are plain SVG-returning components with a `background` prop — mechanical to `.svelte`. Commit(s): `feat: per-game svg glyphs + GlyphComponent tightening`, `feat: IS_BETA via kit env; CI test workflow`, `chore: phase-3 exit verification`.

---

## Phase-3 exit criteria

1. `npm test` green both games: the Phase-0 11 files PLUS this phase's new test files (stores, serviceStores, gameDefinitionConsistency, i18n, reactiveTheme) — fixtures untouched (`5f24ae0e`).
2. Theme edit persists across reload (the named P2 acceptance test passes); definition drift guard green.
3. Every route stub renders inside the real shell (DefaultPage + SimpleMenu + Home overlay + toasts + prompts available), themed via the CSS-var injector, in both games' builds.
4. Language switching works end-to-end in dev (en bundled; others attempt DB-cached fetch from `/locales/*.json` — present in `static/locales`).
5. `check`, `check:sky`, `lint`, `build:all`, `build:all-no-root` all green; CI test workflow committed.
6. No react-*/mobx anywhere; storage-key grep matches the inventory doc byte-for-byte.
7. Ledger updated with completion + Phase-4 carry-forwards (deferred KeybindsStore listener factories; deleted Utilities fns still pending: preventDefault, cs, isComposedOrRecorded, parseMouseClick; analytics; Memoized omission; audio/input providers; Settings components + remaining inputs (ColorPicker→needs svelte colorpicker decision, InstrumentSelect, PitchSelect); pageVisit UI badges).
