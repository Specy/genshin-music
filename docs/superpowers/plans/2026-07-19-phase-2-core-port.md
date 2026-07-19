# Phase 2: Domain Core Port + GameDefinition — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the golden-tested domain core (song models, serialization, storage, services, settings, theme model) from the old app into `src/lib/core/`, implement the real `GameDefinition` for both games, repoint `test/imports.ts`, and end with the whole golden-fixture suite green for both games.

**Architecture:** The scope contract is `test/imports.ts` — every symbol it exports must exist at its new home with byte-identical behavior (the committed fixtures are the acceptance tests). Porting is **minimal-diff**: each old file is copied from `git show migration/next16-react19:<path>` and receives ONLY the transformations its task lists (import-path rewrites, MobX strips, Tauri deletions); everything else stays byte-identical so reviewers can verify by diffing against the old blob. Game data flows from two `GameDefinition` modules through a **domain-core legacy adapter** (`$core/legacyConfig.ts`) that re-derives every old `Config.ts` constant name — one indirection point, validated by the `config-surface` fixture. Verification is **check-gated per task** (svelte-check green — the type graph validates cross-module contracts) and **suite-gated at the finale** (the barrel repoint makes all tests runnable only once everything is ported; that is expected).

**Tech Stack:** additions this phase: `@insertish/zangodb@1.0.12-nomemo`, `@tonejs/midi`, `lodash.clonedeep` (+`@types/lodash.clonedeep`), `color` (+`@types/color`), `is-mobile`. (`events` is already installed from Phase 1.)

**Parent docs:** spec `docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md` (§5, §6.3, §10 Phase 2); audit `docs/superpowers/audits/2026-07-19-app-name-audit.md` (the FINAL `GameDefinition` interface at line ~416 and the reference table — the audit's old-symbol→field mapping is normative); ledger `.superpowers/sdd/progress.md` ("P1 -> P2 CARRY-FORWARDS").

## Global Constraints

- Branch: `migration/sveltekit`, continuing from `f82389bf`. Nothing merges to `main`.
- `test/` fixtures are ground truth — NEVER modified or regenerated. The ONLY permitted `test/` edits this phase: (a) rewriting import paths in `test/imports.ts` (Task 8; old export NAMES stay identical), (b) updating the "Phase 1 status (parked)" paragraph in `test/README.md` to "resumed" (Task 8). Nothing else under `test/`.
- Old code source of truth: `git show migration/next16-react19:<path>`. Ported files receive ONLY their task's listed transformations; a reviewer must be able to `git show` the old blob and see nothing else changed.
- `storageId` legacy lock (spec §5.3): IndexedDB name = `game.storageId` (`Genshin`/`Sky`, schema version 4, collections `songs`/`themes`/`folders`/`translation`); every localStorage key template unchanged (see `docs/superpowers/audits/2026-07-19-storage-inventory.md`); serialized `appName` = `game.storageId`.
- The two-tier rule (spec §5.2): ported DOMAIN code may consume the legacy adapter (`$core/legacyConfig`); NEW code and future UI phases read `$game` fields directly. No file outside `src/lib/games/` may contain game-value literals like `'Lyre'`, `21`, `'#aaaa82'` — they come from the definition.
- MobX is deleted, not ported: every `observable(...)`/`makeObservable`/decorator strip is listed per task. No `mobx` dependency may appear.
- Tauri remnants are deleted where encountered (`TauriCollection`, `IS_TAURI` branches) per spec §8.
- `PUBLIC_IS_BETA` is explicitly NOT consumed this phase — its consumers (site metadata, home banner) are Phase 3/4 UI; the ledger carry-forward moves to Phase 3. Do not invent a core `IS_BETA`.
- Phase-1 lessons (binding): NEVER `git add -A` — stage explicit paths only; all new/ported files LF-only (byte-check before each commit: `node -e "const fs=require('fs');const{execSync}=require('child_process');execSync('git diff --cached --name-only').toString().trim().split('\n').filter(f=>/\.(ts|js|svelte|json|md)$/.test(f)).forEach(f=>{if(fs.readFileSync(f).includes(Buffer.from([13])))throw new Error(f+' has CRLF')});console.log('LF OK')"`); 4-space indentation, no spaces inside destructuring braces.
- Every task ends with: `npm run check` green (0 errors) + LF check + commit. Task 8 additionally gates on the full suite.
- Audio engine (`Instrument`, `AudioProvider`, recorder, metronome) and input providers (`KeyboardProvider`, `MIDIProvider`) are deliberately NOT in this phase: nothing tests them until UI consumes them. They port at the start of Phase 4 with their first consumer. This is a documented refinement of spec §10's "domain core" phrasing — the golden-testable core is the Phase-2 unit.
- Deps: install with the exact pins/ranges named in Task 1; anything else that turns out to be imported by a ported file → STOP, report BLOCKED with the import chain (do not silently add dependencies).

---

### Task 1: Dependencies, `GameDefinition` types, shared core constants

**Files:**
- Create: `src/lib/games/types.ts`
- Create: `src/lib/core/sharedConfig.ts`
- Modify: `package.json` + `package-lock.json` (deps only)

**Interfaces:**
- Consumes: the audit doc's final interface text.
- Produces: `GameDefinition`, `GameId`, `StorageId`, `Pitch`, `BaseNote`, `NoteNameType`, `NoteImage`, `GlyphComponent`, `LayoutKeys`, `InstrumentDataType`, `TempoChanger`, `MIDIPreset`, `NotesCssClasses`, `BaseThemeConfig`, `NoteNameTypeDefault` from `$game/../types` (i.e. `src/lib/games/types.ts`); `APP_VERSION: '3.7.0'`, `HAS_BIGINT: boolean`, `BASE_LAYER_LIMIT: number` from `$core/sharedConfig`. Tasks 2-7 import these exact names.

- [ ] **Step 1: Install the Phase-2 dependencies**

```bash
npm install @insertish/zangodb@1.0.12-nomemo @tonejs/midi@latest lodash.clonedeep@latest color@latest is-mobile@latest
npm install -D @types/lodash.clonedeep@latest @types/color@latest
```
Expected: clean install, no peer errors. Record resolved versions in the report.

- [ ] **Step 2: Write `src/lib/games/types.ts`**

Transcribe the ENTIRE fenced `ts` block under "## Final GameDefinition interface" in `docs/superpowers/audits/2026-07-19-app-name-audit.md` (starts `// src/lib/games/types.ts`, ends with the closing brace of `GameDefinition`) — verbatim, including every comment. One permitted adjustment: `GlyphComponent` stays `unknown` exactly as the audit wrote it (the Svelte component type lands in a later phase).

- [ ] **Step 3: Write `src/lib/core/sharedConfig.ts`**

Values verbatim from the old `src/Config.ts` (verify against `git show migration/next16-react19:src/Config.ts | grep -n "APP_VERSION\|HAS_BIGINT\|BASE_LAYER_LIMIT"`):

```ts
// Shared, game-INDEPENDENT constants. BASE_LAYER_LIMIT is deliberately NOT in
// GameDefinition: it is BigInt-capability-based, not game data (audit Step-3
// documented exception; both games' config-surface fixtures carry 52).
export const APP_VERSION = '3.7.0' as const

export const HAS_BIGINT = typeof BigInt !== 'undefined'

export const BASE_LAYER_LIMIT = HAS_BIGINT ? 52 : 30
```

If the old Config.ts computes any of these differently (e.g. `HAS_BIGINT` via a different probe), copy the OLD expression verbatim instead of the sketch above and note it in the report.

- [ ] **Step 4: Check, LF, commit**

```bash
npm run check
git add src/lib/games/types.ts src/lib/core/sharedConfig.ts package.json package-lock.json
git commit -m "feat: GameDefinition types, shared core constants, phase-2 deps"
```

---

### Task 2: Genshin `GameDefinition` data module

**Files:**
- Rewrite: `src/lib/games/genshin/index.ts` (replaces the `GameSkeleton` stub)
- Modify: `src/routes/+page.svelte`, `src/lib/components/PageStub.svelte` (only the `game.displayName` → `game.meta.title` read)

**Interfaces:**
- Consumes: `GameDefinition` from `../types` (Task 1).
- Produces: `export const game: GameDefinition` for genshin — the shape every later task and UI phase reads. (`sky/index.ts` still exports the old skeleton until Task 3; the app must keep building for BOTH games throughout, so do not touch shared code in ways that assume the new shape beyond the two title-read lines.)

- [ ] **Step 1: Extract the genshin data**

Source of truth: `git show migration/next16-react19:src/Config.ts` (the Genshin branch of every ternary/conditional) plus these audit-mapped extras (each with its old location noted in the audit's reference table): `notes.perRow` 7, `notes.animationDelayMs` and `notes.composerRowHeightScale` (Genshin values per audit: delay 100, scale 1 — VERIFY both against the audit table rows before writing), `notes.defaultIcon` `'do'`, `notes.visualNameCasing` (VERIFY from audit row for VisualSong), `layouts.defaultKeyboardKeys` (from old `KeybindsStore` defaults — `git show migration/next16-react19:src/stores/KeybindsStore.ts`), `instruments.defaultVolume` 90, `display.company` `{name: 'HoYoverse', shortName: 'HoYoverse'}`, `meta.analytics` (from old site-metadata/analytics wiring — audit table names the file), `themes.defaultNoteBackground` `'#fff9ef'`, `settings.defaultNoteNameType` per audit (`composer`/`player`/`zen` `{desktop: 'Keyboard layout', mobile: 'Do Re Mi'}` — VERIFY vs `git show migration/next16-react19:src/lib/BaseSettings.ts` lines ~86/251/715, `sheetVisualizer`/`playerApproach` `'Keyboard layout'`), `features` `{hasNoteFrame: true, downloadsSongsInOldFormat: false}`, `i18n.updateMessage` (old `UPDATE_MESSAGE` Genshin branch), `display.transferOrigins` (old `useWindowProtocol.ts` domains for genshin), `midi.mapToNote` as a plain `Record` (the old `MIDI_MAP_TO_NOTE` Map literal's entries).

`notes.svgGlyphs`: `{}` for now (glyph components arrive with the UI phases) — the field is `Partial`, so this type-checks.

- [ ] **Step 2: Write the module**

Shape (data values from Step 1 — the structure below is normative, the `…` are the extracted literals; the finished file will be several hundred lines of data):

```ts
import type {GameDefinition} from '../types'

export const game: GameDefinition = {
    id: 'genshin',
    storageId: 'Genshin',
    display: {name: 'Genshin', company: {…}, transferOrigins: […]},
    meta: {title: 'Genshin Music Nightly', description: '…', themeColor: '…', analytics: {…}, updateChannelKey: 'Genshin'},
    notes: {perColumn: 21, perRow: 7, pitches: […], scale: {…}, doReMiScale: {…}, cssClasses: {…}, nameTypes: […], composerPositions: […], importPositions: […], animationDelayMs: …, composerRowHeightScale: …, defaultIcon: 'do', visualNameCasing: '…', svgGlyphs: {}},
    layouts: {layoutKinds: {…}, iconKinds: {…}, noteLayoutKinds: {…}, midiLayoutKinds: {…}, defaultKeyboardKeys: […]},
    instruments: {list: […10 names…], data: {…}, defaultVolume: 90, audioFolder: 'genshin'},
    midi: {mapToNote: {…}, bounds: {…}, presets: […]},
    composer: {tempoChangers: […]},
    themes: {baseConfig: {…}, defaultNoteBackground: '#fff9ef'},
    settings: {defaultNoteNameType: {…}},
    features: {hasNoteFrame: true, downloadsSongsInOldFormat: false},
    i18n: {interpolation: {APP_NAME: 'Genshin'}, updateMessage: `…`, overrides: undefined},
}
```

The acceptance test for every value is `test/fixtures/Genshin/config-surface.json` (compare while writing — it IS the old Config's serialized output) plus the audit table for non-fixture fields.

- [ ] **Step 3: Update the two title reads**

In `src/routes/+page.svelte` and `src/lib/components/PageStub.svelte`, change `game.displayName` to `game.meta.title`. PROBLEM: `sky/index.ts` still exports `GameSkeleton` (no `meta`) until Task 3 — so ALSO add, in `src/lib/games/skeleton.ts`, a temporary union note and give the sky skeleton a `meta` object now: edit `src/lib/games/sky/index.ts` minimally to `{id: 'sky', storageId: 'Sky', displayName: 'Sky Music Nightly', meta: {title: 'Sky Music Nightly'}}` and widen `GameSkeleton` with `meta: {title: string}`. (Task 3 deletes all of this.)

- [ ] **Step 4: Verify both games still build + check green**

```bash
npm run check
npx cross-env PUBLIC_GAME=genshin npm run build
npx cross-env PUBLIC_GAME=sky npm run build
grep -c "Sky Music Nightly" build/index.html
```
Expected: check 0 errors; both builds pass; Sky title present (skeleton still working).

- [ ] **Step 5: LF check, commit**

```bash
git add src/lib/games src/routes/+page.svelte src/lib/components/PageStub.svelte
git commit -m "feat: genshin GameDefinition data module"
```

---

### Task 3: Sky `GameDefinition` data module + skeleton retirement

**Files:**
- Rewrite: `src/lib/games/sky/index.ts`
- Delete: `src/lib/games/skeleton.ts`

**Interfaces:**
- Consumes: `GameDefinition` (Task 1); the extraction method of Task 2.
- Produces: `export const game: GameDefinition` for sky. After this task BOTH game modules satisfy `GameDefinition` and nothing imports `skeleton.ts`.

- [ ] **Step 1: Extract + write the sky module**

Same method as Task 2, Sky branch of every conditional. Sky-specific values (verify each against `test/fixtures/Sky/config-surface.json` and the audit): `perColumn` 15, `perRow` 5, `instruments.list` = the 34 Sky names, `instruments.data` = the **35**-key record INCLUDING `Aurora_Short` (known quirk — preserve it; do not "fix" the roster mismatch), `defaultVolume` 100, `defaultIcon` `'cr'`, `features` `{hasNoteFrame: false, downloadsSongsInOldFormat: true}`, `display.company` `{name: 'thatgamecompany', shortName: 'TGC'}`, `themes.defaultNoteBackground` `'#495466'`, `settings.defaultNoteNameType` per audit (`composer`/`player` `{desktop: 'Note name', mobile: 'Note name'}`, `zen` `{desktop: 'No Text', mobile: 'No Text'}` — VERIFY vs old BaseSettings, `sheetVisualizer`/`playerApproach` `'ABC'`), `meta.title` `'Sky Music Nightly'`, `audioFolder` `'sky'`.

- [ ] **Step 2: Delete the skeleton**

```bash
git rm src/lib/games/skeleton.ts
grep -rn "skeleton" src --include="*.ts" --include="*.svelte"; echo "expect no output above"
```

- [ ] **Step 3: Verify, LF, commit**

```bash
npm run check
npx cross-env PUBLIC_GAME=sky npm run build && grep -c "Sky Music Nightly" build/index.html
npx cross-env PUBLIC_GAME=genshin npm run build
git add src/lib/games
git commit -m "feat: sky GameDefinition data module; retire skeleton"
```

---

### Task 4: Legacy adapter + core types

**Files:**
- Create: `src/lib/core/legacyConfig.ts`
- Create: `src/lib/core/types.ts` (ported subset of old `src/types/GeneralTypes.ts` + `src/types/SongTypes.ts`)

**Interfaces:**
- Consumes: `$game` (`game: GameDefinition`), `$core/sharedConfig`.
- Produces (from `$core/legacyConfig`, names EXACTLY as the old `$config` exported them — this is what the barrel and every ported file consume): `APP_NAME` (= `game.storageId`), `APP_VERSION`, `HAS_BIGINT`, `BASE_LAYER_LIMIT`, `PITCHES`, `PITCH_TO_INDEX` (if old files import it — check), `INSTRUMENTS`, `INSTRUMENTS_DATA`, `NOTES_PER_COLUMN`, `NOTE_SCALE`, `DO_RE_MI_NOTE_SCALE`, `INSTRUMENT_NOTE_LAYOUT_KINDS`, `INSTRUMENT_MIDI_LAYOUT_KINDS`, `LAYOUT_KINDS`, `LAYOUT_ICONS_KINDS`, `TEMPO_CHANGERS`, `COMPOSER_NOTE_POSITIONS`, `IMPORT_NOTE_POSITIONS`, `NOTES_CSS_CLASSES`, `BASE_THEME_CONFIG`, `NOTE_NAME_TYPES`, `MIDI_MAP_TO_NOTE` (a `Map`, built from `game.midi.mapToNote`), `NOTE_MAP_TO_MIDI` (derived — copy the old derivation loop from `git show migration/next16-react19:src/Config.ts` around lines 860-880 EXACTLY), `MIDI_BOUNDS`, `MIDI_PRESETS`, `FOLDER_FILTER_TYPES`, plus the type aliases old files import from `$config` (`Pitch`, `NoteNameType`, `TempoChanger`, `MIDIPreset`, `AppName` — alias `AppName = StorageId`).
- From `$core/types`: `InstrumentName` and the old SongTypes types (`OldFormat`, `OldNote`, `SerializedSongKind`, `_LegacySongInstruments`) — port them from `git show migration/next16-react19:src/types/GeneralTypes.ts` and `.../SongTypes.ts` with ONE permitted widening: if `InstrumentName` was `typeof INSTRUMENTS[number]`, define `export type InstrumentName = string` with a comment (`// widened from the per-game literal union: cross-game code (toGenshin) needs names from both rosters; runtime behavior is untyped anyway`). Everything else verbatim.

- [ ] **Step 1: Write the adapter**

Header comment (verbatim):

```ts
// DOMAIN-CORE LEGACY ADAPTER.
// Re-derives every old src/Config.ts constant from the selected GameDefinition
// so ported domain files change only their import path ($config -> $core/legacyConfig).
// Frozen at build time BY DESIGN (the $game alias is static). UI code must NOT
// import this file - it reads $game fields directly (spec §5.2/§5.5).
// The config-surface golden fixture is the acceptance test for these derivations.
```

Every export is a one-liner deriving from `game.*` per the audit's Step-3 mapping table (e.g. `export const INSTRUMENTS = game.instruments.list`, `export const NOTES_PER_COLUMN = game.notes.perColumn`, …). The two non-trivial ones: `MIDI_MAP_TO_NOTE = new Map(Object.entries(game.midi.mapToNote).map(...))` shaped exactly like the old Map (string keys? CHECK the old Config — the old Map's keys were STRINGS per `MIDI_MAP_TO_NOTE.get(\`${midiNote}\`)`; preserve that), and the `NOTE_MAP_TO_MIDI` derivation loop copied verbatim from old Config. `FOLDER_FILTER_TYPES = ['alphabetical', 'date-created'] as const` (game-independent — verify old spelling via `git show migration/next16-react19:src/Config.ts | grep FOLDER_FILTER`).

- [ ] **Step 2: Port the type modules**

As specified in Produces. Check what old core files actually import first:

```bash
git show migration/next16-react19:src/lib/Songs/ComposedSong.ts | head -20
git show migration/next16-react19:src/lib/Songs/RecordedSong.ts | head -12
git show migration/next16-react19:src/lib/BaseSettings.ts | head -25
```
Port exactly the types those imports need into `$core/types.ts` (from the old `$types/*` files), nothing more (YAGNI). `SettingsPropriety` types (imported by BaseSettings from `$types/SettingsPropriety`) — port that file too, verbatim, as `src/lib/core/types/SettingsPropriety.ts` if BaseSettings needs it (it does — check its import list).

- [ ] **Step 3: Smoke the derivations against a fixture value**

```bash
node -e "console.log('deferred to task 8 - type-level check only here')"
npm run check
```
Expected: check 0 errors (this proves `GameDefinition` → adapter → type-consumers all line up for the genshin build). Then also: `npx cross-env PUBLIC_GAME=sky npx svelte-kit sync && npx cross-env PUBLIC_GAME=sky npx svelte-check --tsconfig ./tsconfig.json` — 0 errors for sky too (the ledger's dual-game check concern; the adapter is the first file where the two data modules could diverge in shape).

- [ ] **Step 4: LF, commit**

```bash
git add src/lib/core
git commit -m "feat: legacy config adapter derived from GameDefinition; core types"
```

---

### Task 5: Port the pure model layer (Layer, SongClasses, Song, Folder, utils)

**Files:**
- Create: `src/lib/core/Songs/Layer.ts`, `src/lib/core/Songs/SongClasses.ts`, `src/lib/core/Songs/Song.ts`, `src/lib/core/Folder.ts`, `src/lib/core/utils/Utilities.ts`, `src/lib/core/Errors.ts`

**Interfaces:**
- Consumes: `$core/legacyConfig`, `$core/types`, `$core/sharedConfig`.
- Produces: the classes/exports the barrel needs (`NoteLayer`; `ColumnNote`, `NoteColumn`, `InstrumentData`, `RecordedNote`; `Song`, `extractStorable`; `Folder`) plus `getSongType`, `groupByNotes`, `groupNotesByIndex`, `mergeLayers`, `clamp`, `MIDIShortcut`, `AppError` for later tasks — exact old signatures.

- [ ] **Step 1: Port each file (minimal-diff)**

For each: `git show migration/next16-react19:<old path> > <new path>`, then apply ONLY:

| File | Transformations |
|---|---|
| `src/lib/Songs/Layer.ts` → `core/Songs/Layer.ts` | import `{BASE_LAYER_LIMIT, HAS_BIGINT}` from `$core/sharedConfig` (was `$config`); `./SongClasses` unchanged. NOTHING else. |
| `src/lib/Songs/SongClasses.ts` → `core/Songs/SongClasses.ts` | `$config` imports → `$core/legacyConfig`; `$types/GeneralTypes` → `$core/types`. NOTHING else (the `ApproachingNote`/`MidiNote` classes port as-is even though unused by tests — minimal diff beats pruning). |
| `src/lib/Songs/Song.ts` → `core/Songs/Song.ts` | `$config` → `$core/legacyConfig`. |
| `src/lib/Folder.ts` → `core/Folder.ts` | `$config` → `$core/legacyConfig`; `./Songs/Song` unchanged. |
| `src/lib/utils/Utilities.ts` → `core/utils/Utilities.ts` | `$config` → `$core/legacyConfig`; `$types/*` → `$core/types`; DELETE any import/usage of pixi, react, or `$cmp` if present (check the old file top — if a function body needs a deleted import, delete that FUNCTION and list it in the report; expected deletions are UI-only helpers like `blurEvent`/`isFocusable` ONLY IF they import UI modules — plain-DOM ones stay). Keep `setIfInTWA`/`isTwa` (sessionStorage at call time is fine). |
| `src/lib/Errors.ts` → `core/Errors.ts` | verbatim (check imports; expected none beyond std). |

- [ ] **Step 2: Check + dual-game check, LF, commit**

```bash
npm run check
npx cross-env PUBLIC_GAME=sky npx svelte-check --tsconfig ./tsconfig.json
git add src/lib/core
git commit -m "feat: port pure model layer (Layer, SongClasses, Song, Folder, utils, errors)"
```
Expected: 0 errors both games. If a ported file drags an import you weren't told about (e.g. Utilities needs `color`), it's in this phase's dep list — wire it; anything OUTSIDE the dep list → BLOCKED report.

---

### Task 6: Port the storage layer (Database, Collections, Settings/Theme/Folder services)

**Files:**
- Create: `src/lib/core/Services/Database/Database.ts`, `src/lib/core/Services/Database/Collection.ts`, `src/lib/core/Services/SettingsService.ts`, `src/lib/core/Services/ThemeService.ts`, `src/lib/core/Services/FolderService.ts`, `src/lib/core/BaseSettings.ts`, `src/lib/core/types/SettingsPropriety.ts` (if not already in Task 4)

**Interfaces:**
- Consumes: everything prior.
- Produces: `DbInstance` (ZangoDB, name = `APP_NAME` from the adapter = `game.storageId`, version 4, four collections), `settingsService`, `_themeService`, `_folderService`, and the seven settings-default exports the barrel needs (`ComposerSettings`, `PlayerSettings`, `MIDISettings`, `ThemeSettings`, `VsrgComposerSettings`, `VsrgPlayerSettings`, `ZenKeyboardSettings`).

- [ ] **Step 1: Port with these transformations**

| File | Transformations |
|---|---|
| `Database/Collection.ts` | DELETE the entire `TauriCollection` class and its exports/imports (spec §8); keep `Collection` interface + `ZangoCollection` verbatim. |
| `Database/Database.ts` | `$config` → `$core/legacyConfig`; DELETE the `IS_TAURI` import and the whole `if (IS_TAURI) {...} else {...}` — keep only the Zango branch's body; DELETE the `TauriCollection` import; `$i18n/i18nCache` type import (`SerializedLocale`) → declare the type locally in this file (copy the real shape: `git show migration/next16-react19:src/i18n/i18nCache.ts | grep -B2 -A6 "SerializedLocale"`); `$stores/ThemeStore/ThemeProvider` type import (`SerializedTheme`) → `import type {SerializedTheme} from '../theme/ThemeProvider'` — valid because the theme model is ported in THIS task (Step 2), which is exactly why it lives here and not in Task 7. |
| `SettingsService.ts` | `$config` → `$core/legacyConfig`; `$lib/BaseSettings` → `$core/BaseSettings`; strip any store imports if present (check old file — expected: none; it's localStorage only). |
| `ThemeService.ts` | `$lib/Services/Database/Database` → relative `./Database/Database`; strip store imports if present (expected: none). |
| `FolderService.ts` | same pattern; if it imports `folderStore` (check!), DELETE that import and any lines using it, listing each deleted line in the report (stores are Phase 3; the service keeps only its DB methods). |
| `BaseSettings.ts` | `$config` → `$core/legacyConfig`; `$types/SettingsPropriety` → `$core/types/SettingsPropriety` (port that file verbatim); `$cmp/pages/VsrgPlayer/VsrgPlayerKeyboard` type import (`VsrgKeyboardLayout`) → define in `$core/types.ts`: copy the type's definition from the old component file (`git show migration/next16-react19:src/components/pages/VsrgPlayer/VsrgPlayerKeyboard.tsx | grep -B2 -A8 "VsrgKeyboardLayout"`) and import from there; `./utils/Utilities` (MIDIShortcut) → `$core/utils/Utilities` or relative; `./Songs/VsrgSong` type (`VsrgSongKeys`) → relative to Task 7's file (type-only; svelte-check passes once Task 7 lands — see Step 3 note). Per-game default VALUES stay EXACTLY as the old file computes them (`APP_NAME === 'Genshin' ? … : …` ternaries keep working via the adapter's APP_NAME) — do NOT rewrite them to read `game.settings.*`; that refactor is not this phase (fixtures lock the ternary outputs either way). |

- [ ] **Step 2: Port the theme model into this task**

`src/stores/ThemeStore/ThemeProvider.ts` → `src/lib/core/theme/ThemeProvider.ts`, transformations:
- DELETE `import {observable} from "mobx"`; in the `Theme` class constructor, `observable(cloneDeep(baseTheme))` → `cloneDeep(baseTheme)`.
- DELETE `import {logger} from '$stores/LoggerStore'`; every `logger.<x>(...)` call line → `console.error(...)` with the same message argument (list each replaced line in the report).
- `$lib/BaseSettings` → `$core/BaseSettings`; `$config` → `$core/legacyConfig`; `$lib/Services/ThemeService` → `../Services/ThemeService`.
- DELETE `import {themeStore} from "./ThemeStore"` and any method lines using `themeStore` (list them) — the Phase-3 runes store re-adds live-list behavior.
- `./defaultThemes` → port `src/stores/ThemeStore/defaultThemes.ts` → `src/lib/core/theme/defaultThemes.ts` (transformations: `$config`→adapter if imported; else verbatim).
- Everything else byte-identical — `BaseTheme`, `Theme` (incl. `sanitize`, `isSerializedType`, getters), `ThemeProvider` export, `SerializedTheme`.

- [ ] **Step 3: Check (both games), LF, commit**

Note: `BaseSettings.ts` imports a `VsrgSong` TYPE that lands in Task 7 — to keep this task green, port `VsrgSongKeys` as a standalone type into `$core/types.ts` now (`export type VsrgSongKeys = 4 | 6` — VERIFY the literal union from `git show migration/next16-react19:src/lib/Songs/VsrgSong.ts | grep "VsrgSongKeys"`) and have BaseSettings import it from `$core/types`; Task 7's VsrgSong re-imports the same type from `$core/types` (single source).

```bash
npm run check
npx cross-env PUBLIC_GAME=sky npx svelte-check --tsconfig ./tsconfig.json
git add src/lib/core
git commit -m "feat: port storage layer, settings, and theme model (mobx/tauri stripped)"
```

---

### Task 7: Port the song models (Composed, Recorded, Vsrg + import-graph closure)

**Files:**
- Create: `src/lib/core/Songs/ComposedSong.ts`, `src/lib/core/Songs/RecordedSong.ts`, `src/lib/core/Songs/VsrgSong.ts`; plus `src/lib/core/Songs/Track.ts` and/or `src/lib/core/Songs/MidiSong.ts` ONLY IF the three primary files import them (follow the import graph; check first: `git show migration/next16-react19:src/lib/Songs/RecordedSong.ts | grep -n "import"` etc.)

**Interfaces:**
- Consumes: Tasks 4-6.
- Produces: `ComposedSong`, `defaultInstrumentMap`; `RecordedSong`; `VsrgSong`, `VsrgTrack`, `VsrgTrackModifier`, `VsrgHitObject` — exact old exports.

- [ ] **Step 1: Port with transformations**

All three (+ any closure files): `$config` → `$core/legacyConfig`; `$types/GeneralTypes`/`$types/SongTypes` → `$core/types`; `$lib/utils/Utilities` → `../utils/Utilities`; relative `./Layer`/`./SongClasses`/`./Song` unchanged; `lodash.clonedeep` and `@tonejs/midi` imports unchanged (deps installed Task 1). One single-source edit in `VsrgSong.ts`: Task 6 already placed `VsrgSongKeys` in `$core/types` (BaseSettings needs it early) — replace VsrgSong's local `export type VsrgSongKeys = ...` definition with `export type {VsrgSongKeys} from '../types'` so the name keeps re-exporting from its old import site with one definition. KNOWN QUIRKS to preserve byte-identical (the fixtures lock them): the v1 reversed-binary parsing in ComposedSong.deserialize; `RecordedSong.ts:70`-area legacy decimal-layer-as-hex behavior; `VsrgTrackModifier.clone()` NOT copying `alias`; `VsrgSong.toGenshin()` NOT rewriting `data.appName`. If any of these lines "look wrong" — they are, deliberately; port them anyway.

- [ ] **Step 2: Check (both games), LF, commit**

```bash
npm run check
npx cross-env PUBLIC_GAME=sky npx svelte-check --tsconfig ./tsconfig.json
git add src/lib/core
git commit -m "feat: port song models (quirks preserved byte-identical)"
```

---

### Task 8: SongService, barrel repoint, suite green (the phase gate)

**Files:**
- Create: `src/lib/core/Services/SongService.ts`
- Modify: `test/imports.ts` (paths only), `test/README.md` (parked → resumed paragraph), `package.json` (add `check:sky` script)

**Interfaces:**
- Consumes: everything.
- Produces: `songService` (with `parseSong`); the resumed suite as the phase gate.

- [ ] **Step 1: Port SongService**

`src/lib/Services/SongService.ts` → `core/Services/SongService.ts`: `$config` → `$core/legacyConfig`; `$lib/Songs/*` → relative `../Songs/*`; `$lib/utils/Utilities` → `../utils/Utilities`; `./Database/Database` + `./SettingsService` relative unchanged; `../Errors` relative. NOTHING else — `parseSong`'s cross-game branches (`APP_NAME === 'Sky'` rejection, `toGenshin()` conversion) keep working via the adapter's `APP_NAME`.

- [ ] **Step 2: Repoint the barrel**

In `test/imports.ts` change ONLY the module specifiers (every exported NAME stays identical):

```ts
} from '$core/legacyConfig'          // was '$config'
export {NoteLayer} from '$core/Songs/Layer'
export {ColumnNote, NoteColumn, InstrumentData, RecordedNote} from '$core/Songs/SongClasses'
export {Song, extractStorable} from '$core/Songs/Song'
export {ComposedSong, defaultInstrumentMap} from '$core/Songs/ComposedSong'
export {RecordedSong} from '$core/Songs/RecordedSong'
export {VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier} from '$core/Songs/VsrgSong'
export {Folder} from '$core/Folder'
export {BaseTheme, Theme, ThemeProvider} from '$core/theme/ThemeProvider'
export {
    ...same seven names...
} from '$core/BaseSettings'
export {songService} from '$core/Services/SongService'
```

- [ ] **Step 3: Run the suite — the real gate**

```bash
npm test
```
Expected: **both games green** — 12 test files, 18 passed + 1 skipped (Genshin) / 17 passed + 2 skipped (Sky), exactly the Phase-0 final counts. EVERY failure here is a port bug (fixtures are ground truth — never regenerate): diff the failing value against `git show migration/next16-react19:<old file>` to find the divergence. Iterate until green.

- [ ] **Step 4: Fresh-clone-equivalent vitest verification + dual-game script**

```bash
rm -rf .svelte-kit
npm test
```
Expected: still green (ledger carry-forward: vitest-through-sveltekit-plugin works without a pre-existing `.svelte-kit`; if it crashes at CONFIG level, apply the Phase-1-plan's pre-approved fallback — standalone `vitest.config.ts` mirroring the aliases — and record which variant landed).

Add to `package.json` scripts: `"check:sky": "cross-env PUBLIC_GAME=sky npm run check"` and run it once green.

- [ ] **Step 5: Update test/README.md**

Replace the "## Phase 1 status (parked)" section with:

```markdown
## Phase 2 status (resumed)

The suite runs against the ported core (`test/imports.ts` → `$core/...`,
`$core/legacyConfig` bridging the old `$config` names — `APP_NAME` is the
game's `storageId`). Both games green as of Phase 2 close. Fixtures remain
the untouched Phase-0 ground truth.
```

- [ ] **Step 6: Exit greps, LF, commit**

```bash
git grep -n "from '\$config'\|from \"\$config\"" -- src test; echo "expect no output above"
git grep -ln "mobx\|@tauri" -- src package.json; echo "expect no output above"
npm run check && npm run check:sky
git add src/lib/core test/imports.ts test/README.md package.json
git commit -m "feat: port SongService; repoint golden barrel; suite green both games"
```

---

## Phase-2 exit criteria

1. `npm test` green for BOTH games with the exact Phase-0 counts (12 files; 18+1 / 17+2) and zero fixture modifications (`git log --oneline -1 -- test/fixtures` still `5f24ae0e`).
2. `npm run check` AND `npm run check:sky` green; both game builds succeed.
3. `GameDefinition` fully implemented for both games; `skeleton.ts` gone; no `$config` references; no mobx/tauri anywhere.
4. Every ported file is minimal-diff verifiable against `git show migration/next16-react19:<path>` (reviewers spot-checked this per task).
5. Ledger updated with Phase-2 completion + any new carry-forwards (e.g. which vitest variant landed; deleted Utilities functions to restore with their UI consumers).
