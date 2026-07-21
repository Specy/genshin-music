# Phase 4a: Providers, Settings Panes & Simple/Utility Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the first Phase-4 wave: audio + input providers, the settings-pane family, the page-menu infrastructure bundle, and the twelve simple/utility pages (privacy, donate, changelog, partners, blog + 8 posts, error, delete-cache, uma-mode, backup, transfer, keybinds incl. MIDI setup, theme) as real Svelte pages replacing their stubs.

**Architecture:** Same conversion discipline as Phase 3: old React blobs (`git show migration/next16-react19:<path>`) are the behavior specs; DOM/class parity so ported CSS applies; provider singletons port minimal-diff with the one mobx touch (`ObservableNote.data`) becoming `$state`. Pages replace their `PageStub` with real components adopting `PageMetadata` + `DefaultPage`. CSS that lives in 4b/4c files but is consumed by 4a (`.keyboard*` from Player/Keyboard.css, `svs` selectors from VsrgPlayerKeyboard.module.css) is pulled forward verbatim with SKIP delimiters, mirroring the rotate-screen precedent.

**Tech Stack:** new deps this wave (each in its named task only): `fflate` (backup zip), `fuzzy-search` + `@types/fuzzy-search` (SongMenu), `svelte-awesome-color-picker` (the ColorPicker pre-decision — wrapped in our own component so old API + CSS classes stay). Old-branch binaries restored hash-exact: donate/partner images.

**Parent docs:** spec §10 Phase 4 (this is wave a of three); ledger `.superpowers/sdd/progress.md` blocks "P3 -> P4 PLANNING INPUTS" (authoritative conventions) and the P3 task entries' carry-forwards.

## Global Constraints

- Branch `migration/sveltekit` from `a32f52f7`. Fixtures IMMUTABLE (`5f24ae0e`); new test files allowed.
- **Conventions (binding, from the P3 final review):** any pathname comparison imports `appPathname` from `$lib/utils/appPathname` (never compare `page.url.pathname` to route literals); UI may import ONLY the legacyConfig identity/shared allowlist (APP_NAME, APP_VERSION, LANG_PREFERENCE_KEY_NAME, UPDATE_MESSAGE, IS_DEV, BASE_LAYER_LIMIT — Task 1 adds the BASE_LAYER_LIMIT line to the header doc) — game-data constants come from `$game`; collections in `$state` classes use `SvelteMap`/`SvelteSet`; every new page adopts `PageMetadata` and drops its `PageStub`; fixer/implementer reports paste RAW command output only.
- Old blobs = behavior specs; per-file provenance headers; every deviation disclosed with rationale; quirks preserved (do not fix old bugs — flag them).
- Storage keys byte-locked per `docs/superpowers/audits/2026-07-19-storage-inventory.md` (this wave touches: `${APP_NAME}_uma_mode`, `${APP_NAME}_visited_blog_posts`, `${APP_NAME}_Composer_Settings`/`_Main_Settings` (error page), backup/download extensions `.${id}backup`/`.${id}sheet`/`.${id}theme`).
- Next-isms convert: `next/image` → plain `<img>` with Vite asset imports; `process.env.NEXT_PUBLIC_SW_VERSION` → `import.meta.env.PUBLIC_SW_VERSION` (envPrefix already exposes it); no react-* deps ever.
- LF-only byte-checks; 4-space; never `git add -A`; lint stays 0 (new files clean; `src/lib/core` ignore stands — NEW provider files go under `src/lib/audio`/`src/lib/providers` OUTSIDE the core ignore so they ARE linted).
- Gates per task: `npm test` both games + `npm run check` + `check:sky` + eslint on new files + `npm run build:genshin` green before commit. Exit task adds the full matrix + a no-root base-sensitive smoke.
- Dev-server smokes: background start, curl, kill via port PID (TaskStop won't kill vite children).

---

### Task 1: Input providers bundle (KeyboardProvider, listener factories, useClickOutside)

**Files:**
- Create: `src/lib/providers/KeyboardProvider/index.ts` (old `src/lib/Providers/KeyboardProvider/index.ts`, 150 lines — minimal-diff; the line-117 input-focus guard byte-identical), `src/lib/providers/KeyboardProvider/KeyboardTypes.ts` (verbatim), `src/lib/utils/clickOutside.ts` (Svelte ACTION `use:clickOutside={{active, ignoreFocusable, onOutside}}` reproducing old useClickOutside semantics + `hasFocusable` + `IGNORE_CLICK_CLASS` exports — the hook's ref becomes the action's node)
- Modify: `src/lib/stores/KeybindsStore.svelte.ts` (restore the three deferred listener factories `createShortcutListener`/`createKeyboardListener`/`createKeyComboComposer` byte-verbatim from old KeybindsStore.ts — their `// Phase 4:` markers replaced), `src/lib/i18n/i18n.ts` or `$core` home (restore `DEFAULT_ENG_KEYBOARD_MAP` verbatim where old i18n.ts had it — verify its old location first), `src/lib/components/shell/AppInit.svelte` (replace the KeyboardProvider marker: `KeyboardProvider.create()` on mount / `destroy()` on cleanup, position per old GeneralProvidersWrapper), `src/lib/components/shell/AsyncPrompt.svelte` (reconcile the input-focus-guard divergence: now that KeyboardProvider exists, EITHER route the dialogs' keys through it (old behavior) or keep the window handler but add the same `document.activeElement?.tagName === "INPUT"` guard — pick the option that byte-matches old UX, document), `src/lib/core/legacyConfig.ts` (the BASE_LAYER_LIMIT allowlist doc line — P3 closing Minor-1)
- Test: `test/keyboardProvider.test.ts` (register/dispatch/shift-filter/unregisterById/focus-guard — jsdom KeyboardEvent dispatch)

**Interfaces:**
- Produces: `KeyboardProvider` singleton (old API: create/destroy/listen/register/registerLetter/registerNumber/unregisterById/getTextOfCode), the three factories, the `clickOutside` action. Tasks 3/8 consume.

- [ ] Port per the table; write the test (real KeyboardEvent dispatches asserting handler firing, shift filtering, INPUT-focus suppression); gates; commit `feat(4a): keyboard provider, listener factories, clickOutside action`.

---

### Task 2: Audio engine + MIDI provider

**Files:**
- Create: `src/lib/audio/Instrument.svelte.ts` (old Instrument.ts; `ObservableNote.data` becomes `$state` — the makeObservable call deleted; everything else minimal-diff incl. the Safari decodeAudioData comment + INSTRUMENT_BUFFER_POOL; audio URL uses `game.instruments.audioFolder` via the adapter's APP_NAME.toLowerCase() equivalence — keep the adapter expression for byte-parity), `src/lib/audio/AudioPlayer.ts`, `src/lib/audio/AudioRecorder.ts`, `src/lib/audio/Metronome.ts`, `src/lib/audio/MediaRecorderPolyfill.ts` (verbatim — stringified-worker + ScriptProcessorNode preserved as-is; flag deprecation, do not modernize), `src/lib/audio/BasicPitchLoader.ts` (verbatim; its @spotify/basic-pitch dynamic import stays — dep NOT installed until 4b's MidiParser; therefore guard: this file type-checks against `import('@spotify/basic-pitch')` — if check fails without the dep, defer this ONE file to 4b with a ledger note), `src/lib/providers/AudioProvider/index.ts` (old file; reverb chain byte-parity incl. gain 2.5 + reverb4.wav URL), `src/lib/providers/MIDIProvider.ts` (old file; settingsService persistence; debounce(50) via the restored Utilities debounce)
- Modify: `src/lib/components/shell/AppInit.svelte` (replace audio markers: `AudioProvider.init()`, `metronome.init(AudioProvider.getAudioContext())`, `MIDIProvider.init()`, destroy trio in cleanup, MIDI connect/disconnect toasts per old GeneralProvidersWrapper second effect)
- Test: `test/audioModels.test.ts` — NOT playback (jsdom has no AudioContext): test the pure logic only — `Instrument.getNoteText` for each NoteNameType (mock keyBinds layout), note index/code mapping, `AudioPlayer.syncInstruments` diffing logic with a stubbed Instrument (constructor-injection or module mock), MIDIProvider preset math (loadPreset/update/delete against a fake settingsService — or the real one on fake-indexeddb/localStorage)

**Interfaces:**
- Produces: `AudioProvider`, `Instrument` (+`ObservableNote` reactive), `AudioPlayer`, `metronome`, `MIDIProvider` — old APIs exactly. Tasks 8 (MidiSetup) + waves 4b/4c consume.

- [ ] Port per the table (each file provenance-headed); tests; gates (note: AppInit's init calls must be SSR-guarded — old wrapper ran client-only via useEffect; onMount equivalence); dev smoke confirming no console errors on load with providers active; commit `feat(4a): audio engine, audio/midi providers wired into shell`.

---

### Task 3: Menu-port bundle (menu.css, hamburger, BaseNote, keyboard CSS pull)

**Files:**
- Create: `src/lib/components/BaseNote.svelte` (old shared/Miscellaneous/BaseNote.tsx 105 — theme-reactive text via the reactive ThemeProvider; `game.features.hasNoteFrame` gates the border svg; uses GenshinNoteBorder), `src/lib/components/GenshinNoteBorder.svelte` (old 18-line svg component)
- Modify: `src/lib/css/App.css` (TWO delimited pull-forward blocks: (a) old `Player/menu.css` REMAINING content — everything except the already-pulled rotate-screen block — verbatim, delimiter `/* pulled from Player/menu.css — 4b MUST SKIP when porting player styles */`; (b) `.keyboard` + `.keyboard-5` selectors from old `Player/Keyboard.css` — ONLY those selectors, delimiter noting 4b skips them), `src/lib/components/menu/MenuSidebar.svelte` (add the `hamburger` snippet prop rendered as a sibling inside `.menu-wrapper` before the sidebar, + `bind:this` element exposure via a bindable `wrapperEl` prop — the useClickOutside integration point the P3 review scoped)
- Test: none new (CSS + structural props; check + eslint + a dev smoke grep for `.hamburger` in served CSS)

**Interfaces:**
- Produces: `BaseNote` (props per old: note/handleClick/noteText etc — read the old blob), MenuSidebar's `hamburger` snippet + `wrapperEl`. Tasks 8/9 + 4b/4c consume.

- [ ] Port; gates; commit `feat(4a): menu css + hamburger slot, BaseNote, keyboard css pull-forward`.

---

### Task 4: Settings-pane family + selects + ColorPicker

**Files:**
- Create: `src/lib/components/settings/{SettingsPane,SettingsRow,SettingsInput,SettingsSelect,SettingsSlider,InstrumentInput}.svelte` (old shared/Settings/* — the SettingsRow type-dispatch switch preserved; Settings.module.css inlined across them; memo dropped per Memoized precedent), `src/lib/components/inputs/{InstrumentSelect,PitchSelect,SongActionButton}.svelte` (old Inputs/*; InstrumentSelect reads `game.instruments.list` for the optgroup split — NOT the adapter (game-data rule)), `src/lib/components/inputs/ColorPicker.svelte` (NEW DEP `svelte-awesome-color-picker` wrapped to reproduce old API `{onChange, value, absolute=true, style}` + the check/cancel commit flow + `.color-picker*` classes — those classes come with Theme.css in Task 9; until then the component carries its own minimal scoped fallback styles, replaced when Theme.css lands — document)
- Test: `test/settingsDispatch.test.ts` — the SettingsRow dispatch logic as a pure mapping test if extractable, else a component-free check that each `SettingsPropriety.type` maps to the right component name via an exported lookup (design the dispatch as an exported map so it's testable — small sanctioned refactor, documented)

**Interfaces:**
- Produces: the settings family with old prop names; `InstrumentSelect({selected,onChange,style,className})`, `PitchSelect`, `SongActionButton`, `ColorPicker`. Pages (Tasks 5-9) + 4b menus consume.

- [ ] `npm install svelte-awesome-color-picker@latest` (record version); port; test; gates; commit `feat(4a): settings pane family, instrument/pitch selects, color picker`.

---

### Task 5: SongMenu + first page wave (error, privacy, 404, delete-cache, changelog)

**Files:**
- Create: `src/lib/components/SongMenu.svelte` (old pagesLayout/SongMenu.tsx 231 — NEW DEP `fuzzy-search`; list virtualization none in old — keep), `src/routes/error/+page.svelte` (old error page 149: settings-reset buttons w/ the exact localStorage keys incl. the DEAD `_Main_Settings` key — preserve the dead key removal attempt quirk; song recovery list via SongMenu + download w/ `downloadsSongsInOldFormat` feature flag via `$game`; logs display from logsStore), `src/routes/privacy/+page.svelte` (28 lines, static), `src/routes/delete-cache/+page.svelte` (63 — clearClientCache port: find old `clearClientCache` util location and port it), `src/routes/changelog/+page.svelte` + `src/lib/components/pages/ChangelogRow.svelte` (CHANGELOG data from `$core/changelog`; SW version via `import.meta.env.PUBLIC_SW_VERSION ?? ''`), update `src/routes/+error.svelte` if the old 404 page content (21 lines, page404 ns) belongs there (adjudicate: old had a dedicated 404 route file — SvelteKit's +error covers it; port the CONTENT into +error for unknown routes, document)
- Each page: PageStub replaced; `PageMetadata` adopted; `useSetPageVisited` equivalent (`setPageVisited(id)` from PageVisitStore on mount) wired; module-css inlined.
- Test: extend `test/stores.test.ts` or new `test/pages.smoke.test.ts` ONLY if pure logic warrants; otherwise page verification = build + dev smoke greps per page (title + a distinctive class), documented per page in the report.

**Interfaces:**
- Produces: `SongMenu` (props per old: songs/SongComponent/componentProps/className/style/exclude/onCreateFolder etc — read old blob), the five real routes.

- Utilities restoration rule (applies to this task and every 4a page task): if an old blob imports any of the still-deleted Utilities functions (`preventDefault`, `cs`, `isComposedOrRecorded`, `parseMouseClick` + their types), restore that function byte-verbatim to `$core/utils/Utilities.ts` in the same commit (established restore-with-consumer pattern), listing each in the report.
- [ ] `npm install fuzzy-search@latest @types/fuzzy-search@latest`; port; gates + per-page dev-smoke evidence; commit `feat(4a): song menu + error/privacy/404/delete-cache/changelog pages`.

---

### Task 6: Donate + partners (asset restoration) 

**Files:**
- Restore (hash-exact): old `src/app/_client-pages/donate/{paypalme,kofi}.png` + partners images (`git ls-tree migration/next16-react19` the donate/partners dirs for exact lists) → `src/lib/assets/images/{donate,partners}/`
- Create: `src/routes/donate/+page.svelte` (Vite asset imports replace next/image; Donate.module.css inlined), `src/routes/partners/+page.svelte` (+ local Partner/PartnerImg/Iframe subcomponents in the same file or siblings; Partners.module.css inlined; iframes keep their old sources)
- [ ] Restore w/ hash table; port; gates + smokes; commit `feat(4a): donate and partners pages with restored assets`.

---

### Task 7: Blog system (index + 8 posts + PromotionCard)

**Files:**
- Create: `src/lib/components/blog/{BaseBlogPost,BlogElements,BlogMetadataRenderers,BlogImage}.svelte` + `src/lib/components/blog/types.ts` (old pages/blog/* — BlogUl/Ol/Li/P/B/Iframe/Link become either snippets or small components preserving class names; BOTH old blog.module.scss files inlined at their consumers; `${APP_NAME}_visited_blog_posts` key exact; `useHasVisitedBlogPost` → store helper), `src/lib/components/PromotionCard.svelte` (old Promotion/PromotionCard.tsx — the P3 Home sweep item; wire into Home.svelte where old Home rendered it AND into blog index; its own localStorage keys per old blob), `src/routes/blog/+page.svelte` (index 171: metadata aggregation — each post exports its metadata const; tag ComboBox filter; BlogNavbar), the 8 post pages `src/routes/blog/posts/<slug>/+page.svelte` (static JSX→svelte prose conversions, 67-272 lines each — content byte-parity of text/structure)
- Modify: `src/lib/components/shell/Home.svelte` (mount PromotionCard per old Home.tsx hasVisited branch)
- [ ] Port (posts are bulk-mechanical — verify each against its old blob for content completeness: heading/paragraph/image counts per post listed in the report); gates + smokes (blog index + 2 sample posts); commit `feat(4a): blog system, 8 posts, promotion card`.

---

### Task 8: uma-mode + backup + transfer pages

**Files:**
- Create: `src/routes/uma-mode/+page.svelte` (168: particle system via setInterval 50ms — svelte-ize with onMount/cleanup; passphrase flow via asyncPrompt; UmaMode.module.scss inlined), `src/lib/components/MultipleOptionSlider.svelte` (RELOCATED from old VsrgComposer folder to shared — ledger note: 4c must import from here, not re-port), `src/routes/backup/+page.svelte` (373: NEW DEP `fflate` (strToU8, zip); full backup/restore flows w/ pill progress; `.${id}backup` extension exact; validation prompts), `src/lib/protocol/WindowProtocol.ts` (old lib/WindowProtocol.ts 215 verbatim), `src/lib/protocol/appProtocol.ts` (old useWindowProtocol.ts 50 — the Protocol type + `protocol` singleton + `setupProtocol`; domains list byte-exact incl. localhost dev entries — note this is where the P2-era transferOrigins judgment reconciles: the PROTOCOL validDomains keep the full old list including localhost), `src/routes/transfer/+page.svelte` (169: hidden iframe + connect + ask flows; env conversions)
- Modify: `src/lib/components/shell/AppInit.svelte` (wire `setupProtocol()` per old GeneralProvidersWrapper)
- Test: `test/windowProtocol.test.ts` — the RPC correlation logic (ask/tell/response routing with mocked postMessage windows; origin validation; ping/pong; timeout)
- [ ] `npm install fflate@latest`; port; test; gates + smokes; commit `feat(4a): uma-mode, backup, transfer pages + window protocol`.

---

### Task 9: Keybinds page + MidiSetup + Theme page

**Files:**
- Create: `src/lib/components/pages/keybinds/{ShortcutEditor,VsrgKey}.svelte` (ShortcutEditor 109 w/ createKeyComboComposer; VsrgKey w/ `use:clickOutside={{active: isSelected, ignoreFocusable: true}}`), `src/lib/components/pages/keybinds/MidiSetup.svelte` (the 354-line class-component conversion — owns an `AudioPlayer('C')`, drives MIDIProvider fully, BaseNote grid, MidiShortcut buttons, MidiSetup.module.css inlined; the largest single conversion in 4a — its behavior checklist: init/destroy lifecycle, requestAccess flow, preset CRUD incl. builtin guard, note-click learning mode, shortcut learning, connect/disconnect reactions), `src/lib/components/pages/keybinds/MidiShortcut.svelte`, `src/routes/keybinds/+page.svelte` (217: keyboard-keybind capture via KeyboardProvider.listen, vsrg k4/k6 editors, `keyboard-5` class per `game.notes.perColumn === 15` — NOT APP_NAME string compare (two-tier)), pull the `svs`-referenced selectors from old VsrgPlayerKeyboard.module.css into the page/component styles (delimited: 4c skips)
- Create: `src/lib/components/pages/theme/{ThemePropriety,ThemeInput,ThemePreview}.svelte` + `src/routes/theme/+page.svelte` (220) + port old `theme/Theme.css` (288) as global import or page styles matching old global load (VERIFY which selectors ColorPicker/settings need — Task 4's fallback styles removed now); the live Player/Composer preview: STUB with a themed placeholder Card labeled "preview arrives with the player/composer port (4b)" — documented deviation, ledger note for 4b to complete; everything else full-function (CRUD, clone-on-edit prompt flow, background image URLs via setBackground, import/export w/ `.${id}theme`)
- [ ] Port; gates; interactive smoke via browser tools where feasible (theme color edit persists across reload — the P2 acceptance re-verified through real UI); commit `feat(4a): keybinds + midi setup + theme pages`.

---

### Task 10: 4a exit verification

- PageStub audit: 4a routes render real pages (grep: no PageStub import in the 12 converted routes; remaining stubs = exactly the 4b/4c set: player, composer, vsrg-composer, vsrg-player, zen-keyboard, sheet-visualizer + home `/` which is the Home-overlay host... verify `/` + `/player` equivalence handling — old `/` rendered the player page; decide: `/` keeps stub-with-shell until 4b ports player, ledger note).
- CI: bump test.yml actions to v4 + `cache: 'npm'` + add `npm run build:all` step (P3 Minor-6).
- Full matrix: fresh `.svelte-kit` `npm test` both games; check ×2; lint 0; build:all + build:all-no-root; **no-root base smoke** (the P3-mandated one): serve `build/` root output, curl `/genshinMusic/changelog.html`, grep the current-page highlight class appears for the changelog nav card in Home markup — or an equivalent base-sensitive assertion via the built HTML (document the chosen probe + evidence).
- Storage-key grep vs inventory (the wave's keys); react/mobx greps; ledger completion + 4b carry-forwards (theme preview completion, `/` route decision, BasicPitchLoader if deferred, MultipleOptionSlider relocation note for 4c, `svs`/keyboard-css skip markers).
- [ ] Run; fix-commits only if criteria fail; ledger line; commit if needed `chore: phase-4a exit verification`.

---

## Exit criteria

1. All 12 4a routes are real pages (PageMetadata + DefaultPage, no PageStub), both games, all gates green incl. the no-root base-sensitive smoke.
2. Providers live in the shell (Keyboard/Audio/MIDI init+destroy per old lifecycle), MidiSetup functional against them.
3. Theme-edit-persists re-verified through the real UI; settings panes render all propriety types.
4. New deps limited to: fflate, fuzzy-search(+types), svelte-awesome-color-picker. All images hash-verified.
5. Ledger updated with 4b inputs (player/zen/sheet wave: stores PlayerStore/PlayerControlsStore/ZenKeyboardStore port then; theme-preview completion; `/` route; Keyboard.css + menu.css skip-blocks; VisualSong port; slider components).
