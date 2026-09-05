# APP_NAME Audit → GameDefinition (final)

**Date**: 2026-07-19
**Branch**: `migration/next16-react19`
**Backs**: spec §5 (`GameDefinition` + two-tier branching rule),
`docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md`.
**Produces**: the categorized reference table + the FINAL `GameDefinition`
interface that Phase 2 implements as `src/lib/games/types.ts`. This closes the
spec's "exact fields finalized by the Phase-0 audit" clause.

This audit reconciles with two sibling Phase-0 docs and does not re-derive them:

- `docs/superpowers/audits/2026-07-19-storage-inventory.md` — the byte-identical
  storage/URL surface. Every `storage`-category row below is one of its keys.
- `test/fixtures/{Genshin,Sky}/config-surface.json` — the acceptance contract.
  Every top-level key there has a named `GameDefinition` home (Step 3 self-check).

## Collection method

```
rg -n "APP_NAME"                 src -g '*.ts' -g '*.tsx'   → 232 hits / 59 files
rg -n --pcre2 "(['\"])(Sky|Genshin)\1" src -g '*.ts' -g '*.tsx' → 81 hits / 34 files
```

The two greps overlap heavily. The string-literal grep surfaced **8 references the
`APP_NAME` grep cannot** (they use the lowercase serialized field `appName` or a
local `appName`, which does not match the uppercase token):

| File:line               | Ref                                  | Why APP_NAME grep misses it                         |
| ----------------------- | ------------------------------------ | --------------------------------------------------- |
| ComposedSong.ts:428,432 | `clone.data.appName ===/= 'Genshin'` | `toGenshin()` reads/writes the serialized `appName` |
| Track.ts:553,557        | `clone.data.appName ===/= 'Genshin'` | same, `Track.toGenshin()`                           |
| RecordedSong.ts:335,339 | `clone.data.appName ===/= "Genshin"` | same, `RecordedSong.toGenshin()`                    |
| site-metadata.ts:13     | `appName === 'Sky'`                  | local `appName` const, not the export               |
| Config.ts:771           | `type AppName = 'Sky' \| 'Genshin'`  | the type union itself                               |

**Total audited references: 240** (232 + 8). The tally below covers all 240.

**Table convention (for reviewability at 240 refs):** rows are grouped by file.
Pure `import { APP_NAME } from "$config"` lines and dev-only `console.log`/comment
lines are **mechanical** (category `—`): they vanish when a file imports from
`$game`/core instead. Runs of identical `localStorage` keys are given one row per
distinct key with every line number listed, so every line number is accounted for.

## Categories

- **data** — different values, same behavior → a `GameDefinition` field (`game.notes.perColumn`)
- **flag** — different behavior → `game.features.<capability>`, named for the behavior, never the game
- **storage** — legacy compatibility surface → `storageId` (cased) or `id` (lowercased); NEVER change
- **meta** — titles / manifest / SEO / analytics → `meta` / `display`
- **i18n** — game-conditional strings / interpolation vars → `i18n`
- **escape** — true one-off → `game.id === '<id>'` + `// game-escape-hatch:` comment
- **—** — mechanical (import / console / type alias): removed or trivially rewritten

### The two identity fields (key derivation)

Almost every `storage` row is one of these two forms:

- **`APP_NAME` cased** (`"Genshin"`/`"Sky"`) → **`storageId`** — IndexedDB name,
  every `localStorage`/`sessionStorage` key prefix, serialized `appName`, settings
  `settingVersion`, SW cache names, download filenames, WindowProtocol/BroadcastChannel names.
- **`APP_NAME.toLowerCase()`** (`"genshin"`/`"sky"`) → **`id`** — audio-sample folder,
  `appData`/`static` payload folder, file extensions (`genshinsheet`…), self-origin URLs.

For the two current games `id === storageId.toLowerCase()`; new games set `storageId === id`
(spec §5.1). Extensions/audio paths are `id`-derived **and** a compatibility surface
(existing files/caches must keep resolving), so they carry `id` but are flagged compat-locked.

## Reference table

### src/Config.ts — becomes the two game definition modules

| Line  | What it selects                                     | Category | GameDefinition field             |
| ----- | --------------------------------------------------- | -------- | -------------------------------- |
| 4     | `APP_NAME` env read (identity)                      | —        | source of `id` / `storageId`     |
| 6     | `console.log` boot banner                           | —        | (drop)                           |
| 7     | `UPDATE_MESSAGE` (both branches identical today)    | i18n     | `i18n.updateMessage`             |
| 27–31 | `NOTES_CSS_CLASSES` (`note` vs `note-sky` …)        | data     | `notes.cssClasses`               |
| 38    | `BASE_THEME_CONFIG.text.note` (`#aaaa82`/`#eae8e6`) | data     | `themes.baseConfig`              |
| 41    | `INSTRUMENTS` roster                                | data     | `instruments.list`               |
| 90    | `NOTES_PER_COLUMN` (21/15)                          | data     | `notes.perColumn`                |
| 168   | `MIDI_PRESETS.default.notes`                        | data     | `midi.presets`                   |
| 281   | `NOTE_NAME_TYPES` (Sky adds Playstation/Switch)     | data     | `notes.nameTypes`                |
| 326   | `BaseinstrumentsData` / `INSTRUMENTS_DATA`          | data     | `instruments.data`               |
| 714   | `COMPOSER_NOTE_POSITIONS`                           | data     | `notes.composerPositions`        |
| 715   | `IMPORT_NOTE_POSITIONS`                             | data     | `notes.importPositions`          |
| 771   | `type AppName = 'Sky' \| 'Genshin'`                 | meta     | `StorageId` union                |
| 775   | `MIDI_MAP_TO_NOTE`                                  | data     | `midi.mapToNote`                 |
| 856   | `MIDI_BOUNDS` (lower 48/60)                         | data     | `midi.bounds`                    |
| 888   | `LANG_PREFERENCE_KEY_NAME = APP_NAME + "_Lang"`     | storage  | `storageId` (`{storageId}_Lang`) |

Unconditional Config exports the config-surface also captures (not `APP_NAME`-branched,
same value both games, so no row above but a Step-3 home): `PITCHES`→`notes.pitches`,
`NOTE_SCALE`→`notes.scale`, `DO_RE_MI_NOTE_SCALE`→`notes.doReMiScale`,
`TEMPO_CHANGERS`→`composer.tempoChangers`, `LAYOUT_KINDS`→`layouts.layoutKinds`,
`LAYOUT_ICONS_KINDS`→`layouts.iconKinds`, `INSTRUMENT_NOTE_LAYOUT_KINDS`→`layouts.noteLayoutKinds`,
`INSTRUMENT_MIDI_LAYOUT_KINDS`→`layouts.midiLayoutKinds`, `NOTE_MAP_TO_MIDI`→derived from `midi.mapToNote`.
`BASE_LAYER_LIMIT` is **not** per-game (BigInt-capability `52/30`) → stays a shared core const (see Step 3).

### src/lib/Services/SettingsService.ts

| Line    | What it selects                     | Category | GameDefinition field                          |
| ------- | ----------------------------------- | -------- | --------------------------------------------- |
| 1       | import                              | —        | (from core; keys built from `game.storageId`) |
| 21,29   | `{storageId}_LastBackupWarningTime` | storage  | `storageId`                                   |
| 25,38   | `{storageId}_LastStateEdit`         | storage  | `storageId`                                   |
| 79,185  | `{storageId}_Composer_Settings`     | storage  | `storageId`                                   |
| 91,169  | `{storageId}_ZenKeyboard_Settings`  | storage  | `storageId`                                   |
| 103,161 | `{storageId}_VsrgComposer_Settings` | storage  | `storageId`                                   |
| 115,193 | `{storageId}_VsrgPlayer_Settings`   | storage  | `storageId`                                   |
| 127,177 | `{storageId}_Player_Settings`       | storage  | `storageId`                                   |
| 140,197 | `{storageId}_MIDI_Settings`         | storage  | `storageId`                                   |

### src/lib/BaseSettings.ts

| Line | What it selects                                 | Category | GameDefinition field                    |
| ---- | ----------------------------------------------- | -------- | --------------------------------------- |
| 3    | import                                          | —        |                                         |
| 46   | `settingVersion = APP_NAME + 71` (Composer)     | storage  | `storageId` (settings-blob compat)      |
| 178  | `settingVersion = APP_NAME + 81` (Player)       | storage  | `storageId`                             |
| 363  | `settingVersion = APP_NAME + 7` (MIDI)          | storage  | `storageId`                             |
| 466  | `settingVersion = APP_NAME + 16` (VsrgComposer) | storage  | `storageId`                             |
| 563  | `settingVersion = APP_NAME + 8` (VsrgPlayer)    | storage  | `storageId`                             |
| 650  | `settingVersion = APP_NAME + 26` (ZenKeyboard)  | storage  | `storageId`                             |
| 86   | composer default noteNameType (mobile-aware)    | data     | `settings.defaultNoteNameType.composer` |
| 251  | player default noteNameType (mobile-aware)      | data     | `settings.defaultNoteNameType.player`   |
| 715  | zen default noteNameType (mobile-aware)         | data     | `settings.defaultNoteNameType.zen`      |
| 434  | `note_background` default (`#fff9ef`/`#495466`) | data     | `themes.defaultNoteBackground`          |

### src/lib/Services/Database/Database.ts

| Line | What it selects                                       | Category | GameDefinition field           |
| ---- | ----------------------------------------------------- | -------- | ------------------------------ |
| 2    | import (`APP_NAME, IS_TAURI`)                         | —        | `IS_TAURI` branch deleted (§8) |
| 20   | `new ZangoDb.Db(APP_NAME, 4, …)` — **IndexedDB name** | storage  | `storageId` (canonical)        |

### src/service-worker.ts

| Line    | What it selects                             | Category | GameDefinition field |
| ------- | ------------------------------------------- | -------- | -------------------- |
| 13      | `APP_NAME` env read                         | storage  | `storageId`          |
| 14      | `CACHE = ${APP_NAME}-${SW_VERSION}`         | storage  | `storageId`          |
| 89      | `cacheKeys.filter(includes(APP_NAME))` (GC) | storage  | `storageId`          |
| 110     | `if (!APP_NAME)` guard                      | storage  | `storageId`          |
| 114     | `key.includes(APP_NAME)` (GC)               | storage  | `storageId`          |
| 103,111 | comment / console.error                     | —        |                      |

### src/components/AppBase.tsx

| Line        | What it selects                    | Category | GameDefinition field |
| ----------- | ---------------------------------- | -------- | -------------------- |
| 7           | import                             | —        |                      |
| 47,114,139  | `{storageId}_Visited`              | storage  | `storageId`          |
| 48,96       | `{storageId}_ShowHome`             | storage  | `storageId`          |
| 141,144,149 | `{storageId}_Version`              | storage  | `storageId`          |
| 142,148     | `{storageId}_repeat_update_notice` | storage  | `storageId`          |

### src/stores/GlobalConfigStore.ts

| Line  | What it selects        | Category | GameDefinition field |
| ----- | ---------------------- | -------- | -------------------- |
| 1     | import                 | —        |                      |
| 37,46 | `{storageId}_uma_mode` | storage  | `storageId`          |

### src/stores/KeybindsStore.ts

| Line    | What it selects                         | Category | GameDefinition field          |
| ------- | --------------------------------------- | -------- | ----------------------------- |
| 1       | import                                  | —        |                               |
| 56      | default keyboard row (21-key vs 15-key) | data     | `layouts.defaultKeyboardKeys` |
| 195,221 | `{storageId}_keybinds`                  | storage  | `storageId`                   |

### src/stores/ZenKeyboardStore.ts / src/stores/PlayerStore.ts

| Line                               | What it selects   | Category | GameDefinition field     |
| ---------------------------------- | ----------------- | -------- | ------------------------ |
| ZenKeyboardStore 1 / PlayerStore 1 | import            | —        |                          |
| ZenKeyboardStore 23                | `delay` (100/200) | data     | `notes.animationDelayMs` |
| PlayerStore 56                     | `delay` (100/200) | data     | `notes.animationDelayMs` |

### src/app/providers.tsx

| Line | What it selects                        | Category | GameDefinition field |
| ---- | -------------------------------------- | -------- | -------------------- |
| 11   | import (`APP_NAME, IS_TAURI`)          | —        | `IS_TAURI` deleted   |
| 88   | `{storageId}_repeat_update_notice` set | storage  | `storageId`          |

### src/app/site-metadata.ts

| Line | What it selects                      | Category | GameDefinition field |
| ---- | ------------------------------------ | -------- | -------------------- |
| 3    | `appName` (Sky?Sky:Genshin)          | meta     | `display.name`       |
| 12   | `title = appName + ' Music Nightly'` | meta     | `meta.title`         |
| 13   | per-game `description`               | meta     | `meta.description`   |

### src/app/_client-pages/composer/index.tsx

| Line | What it selects                                     | Category | GameDefinition field                 |
| ---- | --------------------------------------------------- | -------- | ------------------------------------ |
| 5    | import                                              | —        |                                      |
| 132  | `BroadcastChannel(APP_NAME + '_composer')`          | storage  | `storageId` (cross-tab id)           |
| 782  | `song.data.appName = APP_NAME` (serialize)          | storage  | `storageId`                          |
| 784  | `APP_NAME === 'Sky' && … toOldFormat()` on download | flag     | `features.downloadsSongsInOldFormat` |
| 788  | `${APP_NAME.toLowerCase()}sheet` extension          | storage  | `id` (compat-locked)                 |

### src/app/_client-pages/error/index.tsx

| Line | What it selects                                   | Category | GameDefinition field                 |
| ---- | ------------------------------------------------- | -------- | ------------------------------------ |
| 5    | import                                            | —        |                                      |
| 40   | `{storageId}_Composer_Settings` removeItem        | storage  | `storageId`                          |
| 41   | `{storageId}_Main_Settings` removeItem (dead key) | storage  | `storageId`                          |
| 48   | `APP_NAME === 'Sky' && … toOldFormat()`           | flag     | `features.downloadsSongsInOldFormat` |
| 52   | `${APP_NAME.toLowerCase()}sheet` extension        | storage  | `id` (compat-locked)                 |
| 102  | `{storageId}_logs` download filename              | storage  | `storageId`                          |

### src/lib/Songs/Song.ts / ComposedSong.ts / RecordedSong.ts / Track.ts / SongClasses.ts

| Line                                                                   | What it selects                              | Category | GameDefinition field        |
| ---------------------------------------------------------------------- | -------------------------------------------- | -------- | --------------------------- |
| Song 1 / ComposedSong 3 / RecordedSong 1 / Track 1,159 / SongClasses 2 | import                                       | —        |                             |
| Song 47                                                                | `appName: APP_NAME` (serialize)              | storage  | `storageId`                 |
| ComposedSong 62,209                                                    | `appName: APP_NAME` (serialize)              | storage  | `storageId`                 |
| ComposedSong 428,432                                                   | `data.appName ===/= 'Genshin'` (`toGenshin`) | storage  | `storageId`                 |
| ComposedSong 355                                                       | `layoutMax` (21/15)                          | data     | `notes.perColumn`           |
| RecordedSong 33                                                        | `appName: APP_NAME` (serialize)              | storage  | `storageId`                 |
| RecordedSong 335,339                                                   | `data.appName ===/= "Genshin"` (`toGenshin`) | storage  | `storageId`                 |
| Track 215,345                                                          | `appName: APP_NAME` (serialize)              | storage  | `storageId`                 |
| Track 553,557                                                          | `data.appName ===/= 'Genshin'` (`toGenshin`) | storage  | `storageId`                 |
| Track 19                                                               | default `volume` (90/100)                    | data     | `instruments.defaultVolume` |
| Track 481                                                              | `layoutMax` (21/15)                          | data     | `notes.perColumn`           |
| SongClasses 92                                                         | default `volume` (90/100)                    | data     | `instruments.defaultVolume` |

`toGenshin()` (§6.3, golden-tested) stays in the domain core; the only per-game inputs it
touches are `storageId` (the written `appName`) and note geometry (`notes.*`). Sky-direction
conversion (a `toSky()`) does not exist by design — the Sky build rejects foreign songs
instead of converting them (see the `SongService.ts` row below).

### src/lib/Services/SongService.ts

| Line | What it selects                                                                                                                            | Category | GameDefinition field           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------------------------ |
| 1    | import                                                                                                                                     | —        |                                |
| 126  | `APP_NAME === 'Sky' && song.appName !== 'Sky'` → rejects (throws; no `toSky()` exists — Sky-direction conversion does not exist by design) | storage  | `storageId` (import normalize) |
| 129  | `APP_NAME === 'Genshin' && song.appName === 'Sky'` → `toGenshin()`                                                                         | storage  | `storageId` (import normalize) |

Both compare the build's `storageId` against a serialized song's `storageId`; the normalize
action is a kept domain method. Generic rule for game #3: `song.appName !== game.storageId → convert`.

### src/lib/Services/ThemeService.ts / FileService.ts

| Line                            | What it selects                             | Category | GameDefinition field |
| ------------------------------- | ------------------------------------------- | -------- | -------------------- |
| ThemeService 1 / FileService 17 | import                                      | —        |                      |
| ThemeService 58,62              | `{storageId}_Theme`                         | storage  | `storageId`          |
| FileService 303,324             | `${APP_NAME.toLowerCase()}theme` extension  | storage  | `id` (compat-locked) |
| FileService 314                 | `${APP_NAME.toLowerCase()}sheet` extension  | storage  | `id` (compat-locked) |
| FileService 319                 | `${APP_NAME.toLowerCase()}folder` extension | storage  | `id` (compat-locked) |

### src/lib/audio/Instrument.ts

| Line | What it selects                             | Category | GameDefinition field                           |
| ---- | ------------------------------------------- | -------- | ---------------------------------------------- |
| 2    | import                                      | —        |                                                |
| 76   | `/assets/audio/${APP_NAME.toLowerCase()}/…` | storage  | `id` / `instruments.audioFolder` (locked §5.3) |
| 217  | default `noteImage` (`"do"`/`"cr"`)         | data     | `notes.defaultIcon`                            |

### src/lib/Songs/VisualSong.ts

| Line | What it selects                              | Category | GameDefinition field     |
| ---- | -------------------------------------------- | -------- | ------------------------ |
| 1    | import                                       | —        |                          |
| 18   | note-name case (`toLowerCase`/`toUpperCase`) | data     | `notes.visualNameCasing` |

### src/lib/needsUpdate.ts

| Line  | What it selects                                          | Category | GameDefinition field                    |
| ----- | -------------------------------------------------------- | -------- | --------------------------------------- |
| 1     | import (`APP_NAME, …, IS_TAURI`)                         | —        |                                         |
| 23,25 | `appUpdate[APP_NAME]` — updates.json keyed by cased name | meta     | `meta.updateChannelKey` (= `storageId`) |
| 45    | Tauri `tauri-${lower}.update.json` URL                   | —        | **deleted** (Tauri, §8)                 |

### src/lib/Hooks/useWindowProtocol.ts

| Line | What it selects                             | Category | GameDefinition field     |
| ---- | ------------------------------------------- | -------- | ------------------------ |
| 1    | import                                      | —        |                          |
| 41   | `name: APP_NAME` (WindowProtocol handshake) | storage  | `storageId` (kept, §6.7) |

### src/components/pages/Player/PlayerKeyboard.tsx

| Line        | What it selects                         | Category | GameDefinition field     |
| ----------- | --------------------------------------- | -------- | ------------------------ |
| 2           | import                                  | —        |                          |
| 66,189,336  | `Array2d.from(Sky?15:21)` approach grid | data     | `notes.perColumn`        |
| 308,400,420 | animation `delay` (100/200)             | data     | `notes.animationDelayMs` |

### src/components/pages/Player/PlayerNote.tsx

| Line | What it selects                          | Category | GameDefinition field     |
| ---- | ---------------------------------------- | -------- | ------------------------ |
| 2    | import                                   | —        |                          |
| 15   | `getTextColor` Genshin luminosity branch | flag     | `features.hasNoteFrame`  |
| 51   | transition ease/linear keyed on delay    | data     | `notes.animationDelayMs` |
| 87   | `<GenshinNoteBorder>` render             | flag     | `features.hasNoteFrame`  |
| 113  | `numOfNotes` (5/7)                       | data     | `notes.perRow`           |

### src/components/pages/ZenKeyboard/ZenNote.tsx

| Line | What it selects                         | Category | GameDefinition field    |
| ---- | --------------------------------------- | -------- | ----------------------- |
| 1    | import                                  | —        |                         |
| 44   | Genshin pulse vs Sky flip animation     | flag     | `features.hasNoteFrame` |
| 63   | `sky-zen-note` flip class (else branch) | flag     | `features.hasNoteFrame` |
| 71   | Genshin animation `<div>`               | flag     | `features.hasNoteFrame` |
| 84   | `<GenshinNoteBorder>` render            | flag     | `features.hasNoteFrame` |
| 126  | `getTextColor` luminosity branch        | flag     | `features.hasNoteFrame` |

### src/components/shared/Miscellaneous/BaseNote.tsx

| Line | What it selects                          | Category | GameDefinition field    |
| ---- | ---------------------------------------- | -------- | ----------------------- |
| 1    | import                                   | —        |                         |
| 54   | `<GenshinNoteBorder>` render             | flag     | `features.hasNoteFrame` |
| 91   | default border color (`#eae5ce`/`unset`) | flag     | `features.hasNoteFrame` |
| 96   | `getTextColor` luminosity branch         | flag     | `features.hasNoteFrame` |

### src/components/pages/Composer/ComposerNote.tsx / ComposerCanvas.tsx / ComposerMenu.tsx

| Line                                                 | What it selects                   | Category | GameDefinition field           |
| ---------------------------------------------------- | --------------------------------- | -------- | ------------------------------ |
| ComposerNote 2 / ComposerCanvas 17 / ComposerMenu 17 | import                            | —        |                                |
| ComposerNote 73                                      | `<GenshinNoteBorder>` render      | flag     | `features.hasNoteFrame`        |
| ComposerNote 87                                      | `note-name-sky`/`note-name` class | data     | `notes.cssClasses`             |
| ComposerCanvas 175,271                               | Sky row-height `* 0.95`           | data     | `notes.composerRowHeightScale` |

### src/components/pages/SheetVisualizer/SheetFrame.tsx / SheetFrame2.tsx

| Line                           | What it selects       | Category | GameDefinition field |
| ------------------------------ | --------------------- | -------- | -------------------- |
| SheetFrame 1 / SheetFrame2 1   | import                | —        |                      |
| SheetFrame 22 / SheetFrame2 41 | `columnsPerRow` (7/5) | data     | `notes.perRow`       |

### src/components/pages/VsrgComposer/VsrgTop.tsx / VsrgComposerMenu.tsx / VsrgPlayer/VsrgPlayerMenu.tsx

| Line                                                | What it selects           | Category | GameDefinition field |
| --------------------------------------------------- | ------------------------- | -------- | -------------------- |
| VsrgTop 1 / VsrgComposerMenu 46 / VsrgPlayerMenu 39 | import                    | —        |                      |
| VsrgTop 52                                          | `Array(Sky?15:21)`        | data     | `notes.perColumn`    |
| VsrgTop 114                                         | `perRow` (5/7)            | data     | `notes.perRow`       |
| VsrgComposerMenu 392                                | `${lower}sheet` extension | storage  | `id` (compat-locked) |
| VsrgPlayerMenu 249                                  | `${lower}sheet` extension | storage  | `id` (compat-locked) |

### src/components/pages/Player/PlayerMenu.tsx / PlayerPagesRenderer.tsx

| Line                                  | What it selects                                    | Category | GameDefinition field                          |
| ------------------------------------- | -------------------------------------------------- | -------- | --------------------------------------------- |
| PlayerMenu 21 / PlayerPagesRenderer 6 | import                                             | —        |                                               |
| PlayerMenu 169                        | `APP_NAME === 'Sky' ? toOldFormat() : serialize()` | flag     | `features.downloadsSongsInOldFormat`          |
| PlayerMenu 207                        | `if (APP_NAME === 'Sky')` backup toOldFormat       | flag     | `features.downloadsSongsInOldFormat`          |
| PlayerMenu 170                        | `${lower}sheet` extension                          | storage  | `id` (compat-locked)                          |
| PlayerMenu 217                        | `{storageId}_Backup_{date}.{id}backup`             | storage  | `storageId` + `id`                            |
| PlayerPagesRenderer 9                 | approach layout (`Keyboard layout`/`ABC`)          | data     | `settings.defaultNoteNameType.playerApproach` |

### src/components/pages/MidiSetup/index.tsx / keybinds page / sheet-visualizer page

| Line                                          | What it selects                          | Category | GameDefinition field                           |
| --------------------------------------------- | ---------------------------------------- | -------- | ---------------------------------------------- |
| MidiSetup 1 / keybinds 3 / sheet-visualizer 4 | import                                   | —        |                                                |
| MidiSetup 319                                 | `keyboard`/`keyboard keyboard-5` class   | data     | `notes.perRow` (5 ⇒ `keyboard-5`)              |
| keybinds/index 78                             | `keyboard-5` class (Sky)                 | data     | `notes.perRow`                                 |
| sheet-visualizer/index 38                     | default layout (`Keyboard layout`/`ABC`) | data     | `settings.defaultNoteNameType.sheetVisualizer` |
| sheet-visualizer/index 135                    | `{APP_NAME} Music Nightly` heading       | meta     | `display.name`                                 |

### src/components/pages/Index/Home.tsx

| Line  | What it selects                                          | Category | GameDefinition field                             |
| ----- | -------------------------------------------------------- | -------- | ------------------------------------------------ |
| 3     | import                                                   | —        |                                                  |
| 63,71 | `{storageId}-font-size` (**hyphen** key)                 | storage  | `storageId`                                      |
| 110   | `{APP_NAME} Music Nightly` title                         | meta     | `display.name`                                   |
| 113   | `t('app_description', {APP_NAME})`                       | i18n     | `i18n.interpolation.APP_NAME` (= `display.name`) |
| 157   | `no_affiliation` company (`thatgamecompany`/`HoYoverse`) | data     | `display.company.name`                           |
| 316   | `rights` company (`HoYoverse`/`TGC`)                     | data     | `display.company.shortName`                      |

### src/components/pages/Promotion/PromotionCard.tsx

| Line  | What it selects                                    | Category | GameDefinition field |
| ----- | -------------------------------------------------- | -------- | -------------------- |
| 2     | import                                             | —        |                      |
| 16,17 | promo title/description `{APP_NAME} Music Nightly` | meta     | `display.name`       |
| 31,36 | `{storageId}_viewed_promotions_before`             | storage  | `storageId`          |
| 32,41 | `{storageId}_viewed_promotion`                     | storage  | `storageId`          |

### src/components/pages/blog/BaseBlogPost.tsx + blog pages

| Line                              | What it selects                             | Category | GameDefinition field    |
| --------------------------------- | ------------------------------------------- | -------- | ----------------------- |
| BaseBlogPost 9 / blog/index 4     | import                                      | —        |                         |
| BaseBlogPost 29,31,118            | `{storageId}_visited_blog_posts`            | storage  | `storageId`             |
| blog/index 56,57,75               | `{APP_NAME} Music Nightly Blog` text        | meta     | `display.name`          |
| blog/posts/how-to-use-composer 41 | `APP_NAME !== "Genshin"` Sky-only paragraph | escape   | `game.id !== 'genshin'` |
| blog/posts/how-to-use-player 52   | `APP_NAME !== "Genshin"` Sky-only paragraph | escape   | `game.id !== 'genshin'` |

### src/components/shared/PageVisit/pageVisit.tsx / pagesLayout/Folder.tsx / PagesVersions.ts

| Line                                      | What it selects                    | Category | GameDefinition field                        |
| ----------------------------------------- | ---------------------------------- | -------- | ------------------------------------------- |
| pageVisit 4 / Folder 11 / PagesVersions 1 | import                             | —        |                                             |
| pageVisit 12                              | `{storageId}_visited_pages`        | storage  | `storageId`                                 |
| Folder 165                                | `${lower}sheet` extension          | storage  | `id` (compat-locked)                        |
| PagesVersions 18                          | player changelog Genshin-only line | i18n     | `i18n.overrides` (game-conditional content) |

### Remaining pages / misc

| Line                                                                                                       | What it selects                                                        | Category | GameDefinition field           |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- | ------------------------------ |
| uma-mode/index 6 / donate 9 / backup 18 / transfer 6 / ThemePreview 1 / GoogleAnalyticsScript / i18n index | import / env                                                           | —        |                                |
| uma-mode/index 54                                                                                          | `{storageId}_uma_mode` read                                            | storage  | `storageId`                    |
| donate/index 17                                                                                            | `${lower}` in description text                                         | meta     | `display.name` (lowercased)    |
| backup/index 230,252,272                                                                                   | `${lower}backup` extension                                             | storage  | `id` (compat-locked)           |
| transfer/index 19,20,21                                                                                    | self-origin URLs (`{id}-music.specy.app`, `specy.github.io/{id}Music`) | data     | `display.transferOrigins`      |
| ThemePreview 65                                                                                            | `{name}.{id}theme` (name fallback + ext)                               | storage  | `id` (compat) + `display.name` |
| GoogleAnalyticsScript 5                                                                                    | per-game GA tag/config ids                                             | data     | `meta.analytics`               |
| i18n/locales/en/index 119                                                                                  | `"…songs for {{APP_NAME}}"` interpolation                              | i18n     | `i18n.interpolation.APP_NAME`  |

## Tally

Counts are per-reference (one `(file,line)` per row; a line doing two things is
charged to its primary use). They reconcile to 240 exactly.

| Category     | Count   | Notes                                                                                                                                                                                         |
| ------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| storage      | 93      | `storageId` (cased keys/DB/SW/serialized/settingVersion) + `id` (compat-locked extensions/audio). Every row is a `storage-inventory.md` surface.                                              |
| data         | 53      | different values, same behavior → `GameDefinition` fields                                                                                                                                     |
| flag         | 15      | 2 capabilities: `hasNoteFrame` (11), `downloadsSongsInOldFormat` (4)                                                                                                                          |
| meta         | 13      | title / description / analytics / update-channel key / `AppName` type + `display.name` text                                                                                                   |
| i18n         | 4       | `UPDATE_MESSAGE`, `app_description` call + `{{APP_NAME}}` string, PagesVersions line                                                                                                          |
| **escape**   | **2**   | ✅ single digit — 2 Sky-only blog paragraphs                                                                                                                                                  |
| — mechanical | 60      | 55 import lines (incl. 4 multi-line `APP_NAME,` continuations the plain grep misses) + `Config.ts:4/6` decl+log + `service-worker.ts:103/111` comment+log + `needsUpdate.ts:45` deleted-Tauri |
| **Total**    | **240** | 232 `APP_NAME` + 8 string-literal-only                                                                                                                                                        |

Semantic (non-mechanical) total: **180**. `storage 93 + data 53 + flag 15 + meta 13 +
i18n 4 + escape 2 = 180`; `+ 60 mechanical = 240`.

**Escape budget: 2** (`game.id !== 'genshin'` in two hand-written blog posts). Well within
single digits. No candidate list grew past 9, so nothing was promoted to a feature flag.

## Final GameDefinition interface

```ts
// src/lib/games/types.ts  (Phase 2 target — this is the audited final shape)
//
// SIDE-EFFECT-FREE DATA MODULE CONTRACT (spec §5.5):
//   Each game's definition is a plain data object (component references for glyphs
//   are fine). No top-level browser access, no computed singletons. Shared components
//   read game-derived values live via `$game`; they never freeze them into module
//   constants, so a future runtime switch stays possible.
//
// TWO IDENTITY FIELDS:
//   id        — lowercase 'genshin' | 'sky'. Resolves the `$game` alias, names the
//               static asset payload + audio-sample folder, builds file extensions
//               and self-origin URLs.
//   storageId — LEGACY-LOCKED cased 'Genshin' | 'Sky'. IndexedDB database name
//               (schema v4), every localStorage/sessionStorage key prefix, the
//               serialized `appName` inside songs/backups, settings `settingVersion`
//               strings, service-worker cache names, download filenames, and the
//               WindowProtocol/BroadcastChannel identifiers. NEVER derived from `id`
//               (always explicit); new games set `storageId === id`.

// ---- primitive aliases (mirror src/Config.ts) ----
export type GameId = 'genshin' | 'sky'; // extend per new game
export type StorageId = 'Genshin' | 'Sky'; // legacy-locked; new games: === id

export type Pitch = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

export type BaseNote =
  // = keyof typeof NOTE_SCALE
  | 'Cb'
  | 'C'
  | 'C#'
  | 'Db'
  | 'D'
  | 'D#'
  | 'Eb'
  | 'E'
  | 'E#'
  | 'Fb'
  | 'F'
  | 'F#'
  | 'Gb'
  | 'G'
  | 'G#'
  | 'Ab'
  | 'A'
  | 'A#'
  | 'Bb'
  | 'B'
  | 'B#'
  | '';

export type NoteNameType =
  | 'Note name'
  | 'Keyboard layout'
  | 'Your Keyboard layout'
  | 'Do Re Mi'
  | 'ABC'
  | 'No Text'
  | 'Playstation'
  | 'Switch'
  | '1 2 3';

// SvgNote glyph key: 'do'|'re'|'reb'|'mi'|'mib'|'fa'|'so'|'la'|'lab'|'ti'|'tib' (Genshin)
// and 'cr'|'dm'|'dmcr' (Sky). Kept as the current NoteImage union.
export type NoteImage =
  | 'cr'
  | 'dm'
  | 'dmcr'
  | 'do'
  | 're'
  | 'reb'
  | 'mi'
  | 'mib'
  | 'fa'
  | 'so'
  | 'la'
  | 'lab'
  | 'ti'
  | 'tib';

// A Svelte 5 component for one glyph (the SvelteKit port of SvgNotes/*).
export type GlyphComponent = unknown; // import('svelte').Component<{ background?: string }>

export type LayoutKeys = {
  // typeof LAYOUT_KINDS[keyof …]
  keyboardLayout: string[];
  numberLayout?: string[];
  abcLayout: string[];
  playstationLayout: string[];
  switchLayout: string[];
};

export type InstrumentDataType = {
  // src/Config.ts InstrumentDataType
  notes: number;
  family: string;
  midiName: string;
  baseNotes: readonly BaseNote[];
  layout: LayoutKeys;
  icons: readonly NoteImage[];
  midiNotes: readonly number[];
  clickColor?: string;
  fill?: string;
};

export type TempoChanger = {
  // typeof TEMPO_CHANGERS[number]
  id: number;
  text: string;
  changer: number;
  color: number;
};

export type MIDIPreset = { name: string; notes: number[] };

export type NotesCssClasses = {
  // NOTES_CSS_CLASSES
  noteComposer: string;
  note: string;
  noteAnimation: string;
  approachCircle: string;
  noteName: string;
};

export type BaseThemeConfig = {
  // BASE_THEME_CONFIG
  text: { light: string; dark: string; note: string };
};

export type NoteNameTypeDefault = { desktop: NoteNameType; mobile: NoteNameType };

export interface GameDefinition {
  // ── identity ──────────────────────────────────────────────────────────────
  id: GameId;
  storageId: StorageId; // LEGACY-LOCKED — see header. Always explicit.

  // ── display / branding ────────────────────────────────────────────────────
  display: {
    name: string; // 'Genshin' | 'Sky' — "{name} Music Nightly", i18n {{APP_NAME}}
    company: {
      name: string; // 'HoYoverse' | 'thatgamecompany'  (no_affiliation)
      shortName: string; // 'HoYoverse' | 'TGC'              (rights)
    };
    transferOrigins: string[]; // /transfer WindowProtocol self-origins (id-derived)
  };

  // ── head / manifest / SEO / analytics ─────────────────────────────────────
  meta: {
    title: string; // '{name} Music Nightly'
    description: string; // per-game <meta> + manifest description
    themeColor: string; // viewport theme-color (#63aea7 today, both games)
    analytics: { tagId: string; configId: string }; // per-game Google Analytics ids
    updateChannelKey: StorageId; // key into updates.json (= storageId)
  };

  // ── note geometry / rendering data ────────────────────────────────────────
  notes: {
    perColumn: number; // NOTES_PER_COLUMN (21 | 15)
    perRow: number; // keyboard cols/row (7 | 5)
    pitches: readonly Pitch[]; // PITCHES
    scale: Readonly<Record<BaseNote, readonly string[]>>; // NOTE_SCALE
    doReMiScale: Readonly<Record<BaseNote, readonly string[]>>; // DO_RE_MI_NOTE_SCALE
    cssClasses: NotesCssClasses; // NOTES_CSS_CLASSES
    nameTypes: NoteNameType[]; // NOTE_NAME_TYPES
    composerPositions: number[]; // COMPOSER_NOTE_POSITIONS
    importPositions: number[]; // IMPORT_NOTE_POSITIONS
    animationDelayMs: number; // note press/animation delay (100 | 200)
    composerRowHeightScale: number; // ComposerCanvas (1 | 0.95)
    defaultIcon: NoteImage; // ObservableNote default ('do' | 'cr')
    visualNameCasing: 'lowercase' | 'uppercase'; // VisualSong note-name transform
    // Partial: each game supplies ONLY its own glyphs (Genshin solfège vs Sky cr/dm/dmcr),
    // fixing the current index.tsx that imports both games' glyphs into one module map (§5.5).
    svgGlyphs: Readonly<Partial<Record<NoteImage, GlyphComponent>>>; // per-game SvgNote glyph map
  };

  // ── instrument layout building blocks (referenced by instruments.data) ─────
  layouts: {
    layoutKinds: Readonly<Record<string, LayoutKeys>>; // LAYOUT_KINDS
    iconKinds: Readonly<Record<string, readonly NoteImage[]>>; // LAYOUT_ICONS_KINDS
    noteLayoutKinds: Readonly<Record<string, readonly BaseNote[]>>; // INSTRUMENT_NOTE_LAYOUT_KINDS
    midiLayoutKinds: Readonly<Record<string, readonly number[]>>; // INSTRUMENT_MIDI_LAYOUT_KINDS
    defaultKeyboardKeys: string[]; // KeybindsStore default row
  };

  // ── instruments ───────────────────────────────────────────────────────────
  instruments: {
    list: readonly string[]; // INSTRUMENTS (song appName-independent order)
    data: Readonly<Record<string, InstrumentDataType>>; // INSTRUMENTS_DATA (may hold extra keys, e.g. Sky Aurora_Short)
    defaultVolume: number; // Track/SongClasses default (90 | 100)
    audioFolder: GameId; // audio sample dir (= id); URL locked §5.3
  };

  // ── MIDI ──────────────────────────────────────────────────────────────────
  midi: {
    mapToNote: Readonly<Record<number, [number, boolean]>>; // MIDI_MAP_TO_NOTE (built into a Map)
    // noteMapToMidi is DERIVED from mapToNote (non-accidentals), Config.ts:870-871
    bounds: { upper: number; lower: number }; // MIDI_BOUNDS
    presets: MIDIPreset[]; // MIDI_PRESETS
  };

  // ── composer ──────────────────────────────────────────────────────────────
  composer: {
    tempoChangers: readonly TempoChanger[]; // TEMPO_CHANGERS
  };

  // ── themes ────────────────────────────────────────────────────────────────
  themes: {
    baseConfig: BaseThemeConfig; // BASE_THEME_CONFIG
    defaultNoteBackground: string; // BaseSettings note_background (#fff9ef | #495466)
  };

  // ── per-game settings defaults (BaseSettings overrides) ────────────────────
  settings: {
    defaultNoteNameType: {
      composer: NoteNameTypeDefault; // Genshin {KeyboardLayout, DoReMi} | Sky {Note name, Note name}
      player: NoteNameTypeDefault; // idem
      zen: NoteNameTypeDefault; // Genshin {KeyboardLayout, DoReMi} | Sky {No Text, No Text}
      sheetVisualizer: NoteNameType; // 'Keyboard layout' | 'ABC'
      playerApproach: NoteNameType; // 'Keyboard layout' | 'ABC'
    };
  };

  // ── behavior flags (named for the behavior, never the game) ────────────────
  features: {
    // Renders the decorative note-border SVG (GenshinNoteBorder) around every
    // note, uses the luminosity-aware light-note text rule, and a pulse click
    // animation. When false (Sky), notes have no frame and Zen uses a flip
    // animation. Refs: PlayerNote, BaseNote, ComposerNote, ZenNote.
    hasNoteFrame: boolean;
    // Exports/backs-up songs via `toOldFormat()` (pre-versioned Sky format) on
    // download instead of `serialize()`. Refs: PlayerMenu, composer, error page.
    downloadsSongsInOldFormat: boolean;
  };

  // ── i18n ──────────────────────────────────────────────────────────────────
  i18n: {
    interpolation: {
      APP_NAME: string; // {{APP_NAME}} var (= display.name)
    };
    updateMessage: string; // UPDATE_MESSAGE (changelog toast body)
    overrides?: Partial<Record<string, string>>; // game-conditional strings (e.g. PagesVersions line)
  };
}
```

> Implemented as src/lib/games/types.ts; GlyphComponent tightened to the Svelte component type and formatting normalized to repo style in Phase 3 Task 9.

## Step 3 self-check

### A. Every `config-surface.json` top-level key → a named home

| config-surface key          | GameDefinition home                                                                                                                                     | ✓                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `appName`                   | `storageId`                                                                                                                                             | ✓                        |
| `instruments`               | `instruments.list`                                                                                                                                      | ✓                        |
| `instrumentsData`           | `instruments.data`                                                                                                                                      | ✓                        |
| `pitches`                   | `notes.pitches`                                                                                                                                         | ✓                        |
| `tempoChangers`             | `composer.tempoChangers`                                                                                                                                | ✓                        |
| `baseLayerLimit`            | **NOT per-game** — shared core `BASE_LAYER_LIMIT` (BigInt cap 52/30); same value both games, captured in the fixture but sourced outside the definition | ✓ (documented exception) |
| `composerNotePositions`     | `notes.composerPositions`                                                                                                                               | ✓                        |
| `importNotePositions`       | `notes.importPositions`                                                                                                                                 | ✓                        |
| `notesCssClasses`           | `notes.cssClasses`                                                                                                                                      | ✓                        |
| `baseThemeConfig`           | `themes.baseConfig`                                                                                                                                     | ✓                        |
| `noteNameTypes`             | `notes.nameTypes`                                                                                                                                       | ✓                        |
| `midiMapToNote`             | `midi.mapToNote`                                                                                                                                        | ✓                        |
| `noteMapToMidi`             | derived from `midi.mapToNote` (Config.ts:870-871)                                                                                                       | ✓                        |
| `midiBounds`                | `midi.bounds`                                                                                                                                           | ✓                        |
| `midiPresets`               | `midi.presets`                                                                                                                                          | ✓                        |
| `layoutKinds`               | `layouts.layoutKinds`                                                                                                                                   | ✓                        |
| `layoutIconsKinds`          | `layouts.iconKinds`                                                                                                                                     | ✓                        |
| `noteScale`                 | `notes.scale`                                                                                                                                           | ✓                        |
| `doReMiNoteScale`           | `notes.doReMiScale`                                                                                                                                     | ✓                        |
| `instrumentNoteLayoutKinds` | `layouts.noteLayoutKinds`                                                                                                                               | ✓                        |
| `instrumentMidiLayoutKinds` | `layouts.midiLayoutKinds`                                                                                                                               | ✓                        |
| `notesPerColumn`            | `notes.perColumn`                                                                                                                                       | ✓                        |

**22/22 keys homed** (`baseLayerLimit` explicitly excluded as a runtime-capability constant,
not game data — matches the known NoteLayer quirk). The definition + the one shared const
reproduces every fixture key.

### B. Every `data`-category row → a field

`instruments.list`, `instruments.data`, `instruments.defaultVolume`, `instruments.audioFolder`,
`notes.perColumn`, `notes.perRow`, `notes.cssClasses`, `notes.nameTypes`, `notes.composerPositions`,
`notes.importPositions`, `notes.animationDelayMs`, `notes.composerRowHeightScale`, `notes.defaultIcon`,
`notes.visualNameCasing`, `notes.pitches`, `notes.scale`, `notes.doReMiScale`, `notes.svgGlyphs`,
`midi.mapToNote`, `midi.bounds`, `midi.presets`, `themes.baseConfig`, `themes.defaultNoteBackground`,
`composer.tempoChangers`, `layouts.*` (4), `layouts.defaultKeyboardKeys`, `settings.defaultNoteNameType.*`,
`display.company.*`, `display.transferOrigins`, `meta.analytics`. **Every data row has a field. ✓**

**Result: PASS.** No config-surface key and no data row is left without a home.

## Per-game asset inventory

### `src/appData/{genshin,sky}` (build-copied to `public/`, → `static/` in SvelteKit)

Identical file set per game (contents differ):
`favicon.ico`, `logo192.png`, `logo512.png`, `manifest.json`, `robots.txt`,
`manifestData/` (`composer.webp`, `composerIcon.png`, `player.webp`, `zenkeyboard.webp`).
→ Spec §5.4: each `games/<id>/static/` payload.

### `src/components/shared/SvgNotes/{genshin,sky}` (→ `notes.svgGlyphs`)

- **genshin/** (solfège glyphs): `do.tsx re.tsx reb.tsx mi.tsx mib.tsx fa.tsx la.tsx lab.tsx so.tsx ti.tsx tib.tsx` + `svg/`
- **sky/** (shape glyphs): `cr.tsx dm.tsx dmcr.tsx` + `sfxdm.svg` + `svg/`
- `index.tsx` currently imports **both** games' glyphs into one `noteIconsMap` — the exact
  module-level capture §5.5 forbids. Port: each game supplies only its own glyph set via
  `notes.svgGlyphs`; the shared `SvgNote` component looks up by `NoteImage` key.

### Audio sample folders (`public/assets/audio/<id>/<instrument>/<n>.mp3`, URL locked §5.3)

- **genshin/** (10): `Lyre Vintage-Lyre Zither Old-Zither Ukulele LingeringEuphonia LeapingSpiritPiano HarmonicKey DunDun DjemDjemDrum` — matches `INSTRUMENTS`.
- **sky/** (34 dirs): the 34 `INSTRUMENTS` entries. Note `INSTRUMENTS_DATA` has **35** keys
  (extra `Aurora_Short`, reusing Aurora's samples) — the known roster-vs-data mismatch; `instruments.data`
  is typed `Record<string, …>` (a superset of `list`) to hold it.

## Hardest categorization calls

1. **`APP_NAME` cased vs `.toLowerCase()` = two identity fields.** The single biggest
   structural decision: cased → `storageId` (persistence, legacy-locked), lowercase → `id`
   (assets/extensions/URLs). File extensions and audio paths are `id`-derived **and**
   compat-locked, so they sit in `storage` with field `id` — a deliberate straddle so they
   reconcile with `storage-inventory.md` while still deriving from `id`.

2. **The note-border cluster → one `hasNoteFrame` flag (not three).** `GenshinNoteBorder`
   rendering, the luminosity-aware light-note text rule, and pulse-vs-flip click animation
   all currently gate on `APP_NAME === 'Genshin'` and co-vary. I collapsed them into a single
   capability rather than inventing `hasLuminosityText` + `noteAnimationStyle` + `hasNoteBorder`,
   because they describe one visual identity ("the framed note skin"). A third game picks one flag.

3. **Song `appName` reads/writes/conversions → `storage`, not a conversion flag.** The
   `toGenshin()` method (Sky-direction conversion does not exist by design — the Sky build
   rejects foreign songs instead) and the SongService import-normalize branch all reduce to
   `song.appName (storageId)` comparisons; the conversion action is a kept, golden-tested domain
   method keyed on note geometry, not a `GameDefinition` field. So these rows carry `storageId`,
   and no `features.convertsImports` flag was minted — a third game normalizes generically via
   `song.appName !== game.storageId`.

4. **Sky PlayStation/Switch note names stayed `data`, despite the brief flagging them as a
   behavior example.** In this codebase they are realized purely as two extra entries in
   `NOTE_NAME_TYPES` (Config.ts:281) plus layout dictionaries both games already carry — there is
   no separate `if (APP_NAME)` branch. Faithful mapping is `data` (`notes.nameTypes`); inventing
   `features.hasControllerLayouts` would add an unused flag with no branch to gate.

5. **Blog paragraphs → `escape`, not `i18n`.** The two `APP_NAME !== "Genshin"` blocks are JSX
   content (a paragraph + link) inside hand-written blog components that port 1:1 (spec §4.4), not
   strings in the i18n namespaces. A `game.id !== 'genshin'` escape hatch inside the component is
   more honest than contorting them into `GameDefinition.i18n`. These are the only 2 escapes.

6. **`baseLayerLimit` excluded from the definition.** It is BigInt-capability-based (52/30), not
   game-based; it appears in `config-surface.json` but is homed to the shared core constant, the
   one documented Step-3 exception.
