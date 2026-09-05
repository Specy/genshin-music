# Phase 0: Golden Fixtures, APP_NAME Audit & ZangoDB Spike — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lock the current app's data formats into a committed golden-fixture Vitest suite, produce the APP_NAME audit that finalizes the `GameDefinition` interface, and de-risk ZangoDB-under-Vite — all on the CURRENT Next.js code, before any SvelteKit code exists.

**Architecture:** Additive-only work on branch `migration/next16-react19`. A `test/` folder holds a Vitest suite whose tests import app code ONLY through a single barrel (`test/imports.ts`) so the whole suite + fixtures copy to the SvelteKit repo later with a one-file change. Fixtures are per-game JSON files generated once and committed; after that they are read-only ground truth the SvelteKit port must reproduce. Two analysis documents (storage inventory, APP_NAME audit) and one spike document complete the phase.

**Tech Stack:** Vitest (jsdom environment), `fake-indexeddb` (ZangoDB needs IndexedDB at import time), `vite-tsconfig-paths` (resolves `$lib`/`$config`/`$stores` from tsconfig), `cross-env` (already installed). Spike: plain Vite vanilla-ts app in the scratchpad.

**Parent spec:** `docs/superpowers/specs/2026-07-19-sveltekit-migration-design.md` (§9.1, §10 Phase 0, §11 risks).

## Global Constraints

- Branch: all commits land on `migration/next16-react19`. Do NOT create the SvelteKit branch in this phase.
- Phase 0 is additive: NO file under `src/` may be modified. Only `test/`, `docs/`, `package.json`, and new config files are touched.
- Every test file imports app code ONLY from `./imports` (the barrel). Never import `$lib/...` directly in a test.
- Fixtures live in `test/fixtures/<APP_NAME>/` (`Genshin` and `Sky` — exact casing, these mirror the legacy `storageId`). Committed input files shared by both games live in `test/inputs/`.
- Once a fixture is committed it is ground truth: if a later run mismatches, the code change is wrong, not the fixture. Fixtures are only regenerated when deliberately extending coverage (new fixture names), never edited to make a failing test pass.
- The suite must pass for BOTH games: `npm test` runs Genshin then Sky. A task is not done until both pass.
- `NEXT_PUBLIC_APP_NAME` selects the game (`Genshin` default when unset — always set it explicitly in scripts).
- Node ≥ 20.9 (repo engine), npm. Every task ends with a commit.

---

### Task 1: Vitest infrastructure + smoke test

**Files:**

- Create: `vitest.config.ts`
- Create: `test/setup.ts`
- Create: `test/imports.ts`
- Create: `test/smoke.test.ts`
- Modify: `package.json` (devDependencies + scripts only)

**Interfaces:**

- Consumes: existing tsconfig path aliases (`$lib`, `$config`, `$stores`, `$i18n`, `$types`, `$cmp`, `$/*`).
- Produces: `test/imports.ts` barrel re-exporting every symbol later tasks use (exact list below); npm scripts `test`, `test:genshin`, `test:sky`, `test:update-fixtures`. All later tasks depend on these existing verbatim.

- [ ] **Step 1: Install dev dependencies**

Run: `npm install -D vitest jsdom fake-indexeddb vite-tsconfig-paths`
Expected: packages added to `devDependencies`, install succeeds with no peer-dependency errors.

- [ ] **Step 2: Create vitest config and setup file**

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
  },
});
```

`test/setup.ts`:

```ts
// ZangoDB (imported transitively via services) requires IndexedDB at module load.
import 'fake-indexeddb/auto';
```

- [ ] **Step 3: Create the imports barrel**

`test/imports.ts` — the ONLY place tests may import app code from. During the SvelteKit port this single file is repointed to `lib/core/...` and the whole suite carries over.

```ts
// Config constants (game-dependent surface)
export {
  APP_NAME,
  APP_VERSION,
  PITCHES,
  INSTRUMENTS,
  INSTRUMENTS_DATA,
  TEMPO_CHANGERS,
  BASE_LAYER_LIMIT,
  COMPOSER_NOTE_POSITIONS,
  IMPORT_NOTE_POSITIONS,
  NOTES_CSS_CLASSES,
  BASE_THEME_CONFIG,
  NOTE_NAME_TYPES,
  MIDI_MAP_TO_NOTE,
  NOTE_MAP_TO_MIDI,
  MIDI_BOUNDS,
  MIDI_PRESETS,
} from '$config';
// Domain models
export { NoteLayer } from '$lib/Songs/Layer';
export { ColumnNote, NoteColumn, InstrumentData, RecordedNote } from '$lib/Songs/SongClasses';
export { Song, extractStorable } from '$lib/Songs/Song';
export { ComposedSong, defaultInstrumentMap } from '$lib/Songs/ComposedSong';
export { RecordedSong } from '$lib/Songs/RecordedSong';
export { VsrgSong, VsrgTrack, VsrgTrackModifier } from '$lib/Songs/VsrgSong';
export { Folder } from '$lib/Folder';
// Theme
export { BaseTheme, Theme, ThemeProvider } from '$stores/ThemeStore/ThemeProvider';
// Settings defaults
export {
  ComposerSettings,
  PlayerSettings,
  MIDISettings,
  ThemeSettings,
  VsrgComposerSettings,
  VsrgPlayerSettings,
  ZenKeyboardSettings,
} from '$lib/BaseSettings';
// Import pipeline (pulls DbInstance -> ZangoDB -> needs fake-indexeddb from setup)
export { songService } from '$lib/Services/SongService';
```

Before committing, verify every name against the source exports:

Run: `rg -n "export (const|class|function|enum)" src/Config.ts src/lib/Songs/Layer.ts src/lib/Songs/SongClasses.ts src/lib/Songs/Song.ts src/lib/Songs/ComposedSong.ts src/lib/Songs/RecordedSong.ts src/lib/Songs/VsrgSong.ts src/lib/Folder.ts src/stores/ThemeStore/ThemeProvider.ts src/lib/BaseSettings.ts src/lib/Services/SongService.ts`

If a name differs (e.g. a constant is named differently in `Config.ts`), fix the BARREL to match the source — never rename anything in `src/`. Two symbols are known-verified: `ThemeProvider` (has static `sanitize`, used by `FileService.importUnknownFile`) and `songService` (has `parseSong`).

- [ ] **Step 4: Add npm scripts**

In `package.json` `scripts`, add:

```json
"test": "npm run test:genshin && npm run test:sky",
"test:genshin": "cross-env NEXT_PUBLIC_APP_NAME=Genshin vitest run",
"test:sky": "cross-env NEXT_PUBLIC_APP_NAME=Sky vitest run",
"test:update-fixtures": "cross-env UPDATE_FIXTURES=true npm run test"
```

- [ ] **Step 5: Write the failing smoke test**

`test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { APP_NAME, INSTRUMENTS, NoteLayer } from './imports';

describe('environment smoke test', () => {
  it('runs against a selected game', () => {
    expect(['Genshin', 'Sky']).toContain(APP_NAME);
    // Genshin has 10 instruments, Sky has 33 (from Config.ts)
    expect(INSTRUMENTS.length).toBe(APP_NAME === 'Genshin' ? 10 : 33);
  });

  it('NoteLayer bit operations work', () => {
    const layer = new NoteLayer();
    layer.set(0, true);
    layer.set(3, true);
    expect(layer.serializeHex()).toBe('9'); // 0b1001
    expect(layer.test(3)).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify current state**

Run: `npm run test:genshin`
Expected: PASS (2 tests). If the barrel has a wrong export name, this fails with "No matching export" — fix the barrel per Step 3. If ZangoDB import errors appear, the setup file isn't loading — check `setupFiles` path.

Run: `npm run test:sky`
Expected: PASS (2 tests) — this proves per-game env selection works (33 instruments seen).

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts test/ package.json package-lock.json
git commit -m "test: add vitest infrastructure with per-game runs (phase 0)"
```

---

### Task 2: Golden-fixture harness + NoteLayer fixtures

**Files:**

- Create: `test/golden.ts`
- Create: `test/noteLayer.test.ts`
- Create (generated): `test/fixtures/Genshin/note-layer.json`, `test/fixtures/Sky/note-layer.json`

**Interfaces:**

- Consumes: `test/imports.ts` barrel (Task 1).
- Produces: `expectGolden(name: string, value: unknown): void` from `test/golden.ts` — compares `value` (after JSON round-trip) against `test/fixtures/<APP_NAME>/<name>.json`; writes the file instead when `UPDATE_FIXTURES=true`; throws with a helpful message when the fixture is missing. Every later fixture task calls exactly this function.

- [ ] **Step 1: Write the harness**

`test/golden.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { APP_NAME } from './imports';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(HERE, 'fixtures', APP_NAME);
const UPDATE = process.env.UPDATE_FIXTURES === 'true';

/**
 * Golden-file assertion. `value` is normalized through JSON so functions are
 * dropped and Maps must be converted by the caller before passing.
 * Fixtures are per-game ground truth: never hand-edit to make a test pass.
 */
export function expectGolden(name: string, value: unknown): void {
  const file = path.join(FIXTURE_DIR, `${name}.json`);
  const normalized = JSON.parse(JSON.stringify(value));
  if (UPDATE) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2) + '\n');
    return;
  }
  if (!fs.existsSync(file)) {
    throw new Error(
      `Missing fixture ${path.relative(process.cwd(), file)} — run: npm run test:update-fixtures`
    );
  }
  expect(normalized).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
}

/** Read a committed input file shared by both games (test/inputs/). */
export function readInput(name: string): any {
  return JSON.parse(fs.readFileSync(path.join(HERE, 'inputs', name), 'utf8'));
}
```

- [ ] **Step 2: Write the NoteLayer golden test**

`test/noteLayer.test.ts` — locks the bit-field wire format (hex/bin/dec + status logic), which every song format depends on:

```ts
import { describe, it } from 'vitest';
import { InstrumentData, NoteLayer } from './imports';
import { expectGolden } from './golden';

function layerFromBits(...positions: number[]): NoteLayer {
  const layer = new NoteLayer();
  positions.forEach((p) => layer.set(p, true));
  return layer;
}

describe('NoteLayer wire format', () => {
  it('serialization formats are stable', () => {
    const cases = [
      layerFromBits(), // empty
      layerFromBits(0), // single first layer
      layerFromBits(1),
      layerFromBits(0, 1),
      layerFromBits(3),
      layerFromBits(0, 3, 7),
      layerFromBits(15),
      layerFromBits(29), // near BASE_LAYER_LIMIT
      layerFromBits(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10),
    ];
    expectGolden(
      'note-layer',
      cases.map((layer) => ({
        hex: layer.serializeHex(),
        bin: layer.serializeBin(),
        array: layer.toArray(),
        isEmpty: layer.isEmpty(),
        roundTripHex: NoteLayer.deserializeHex(layer.serializeHex()).serializeHex(),
        roundTripBin: NoteLayer.deserializeBin(layer.serializeBin()).serializeHex(),
        roundTripDec: NoteLayer.deserializeDec(String(layer.asNumber())).serializeHex(),
        statusNoInstruments: [0, 1, 2].map((p) => layer.toLayerStatus(p)),
        statusWithInstruments: [0, 1, 2].map((p) =>
          layer.toLayerStatus(p, [
            new InstrumentData({ icon: 'border' }),
            new InstrumentData({ icon: 'circle' }),
            new InstrumentData({ icon: 'line' }),
          ])
        ),
      }))
    );
  });
});
```

- [ ] **Step 3: Run to verify it fails for the right reason**

Run: `npm run test:genshin`
Expected: FAIL with `Missing fixture test/fixtures/Genshin/note-layer.json — run: npm run test:update-fixtures`

- [ ] **Step 4: Generate fixtures for both games**

Run: `npm run test:update-fixtures`
Expected: PASS for both games; files `test/fixtures/Genshin/note-layer.json` and `test/fixtures/Sky/note-layer.json` now exist. Open one and sanity-check it contains hex strings like `"9"` and status arrays — not `{}` placeholders.

- [ ] **Step 5: Run in verify mode**

Run: `npm test`
Expected: PASS for both games (smoke + noteLayer).

- [ ] **Step 6: Commit**

```bash
git add test/
git commit -m "test: add golden-fixture harness and NoteLayer wire-format fixtures"
```

---

### Task 3: Primitive serialization fixtures (InstrumentData, columns, Folder)

**Files:**

- Create: `test/primitives.test.ts`
- Create (generated): `test/fixtures/{Genshin,Sky}/instrument-data.json`, `column.json`, `folder.json`

**Interfaces:**

- Consumes: `expectGolden` (Task 2), barrel (Task 1).
- Produces: committed fixtures only; no new code surface.

- [ ] **Step 1: Write the test**

`test/primitives.test.ts`:

```ts
import { describe, it } from 'vitest';
import { ColumnNote, Folder, InstrumentData, NoteColumn, NoteLayer, RecordedNote } from './imports';
import { expectGolden } from './golden';

describe('primitive serialization', () => {
  it('InstrumentData defaults and roundtrip are stable', () => {
    const defaults = new InstrumentData(); // volume differs per game: 90 Genshin / 100 Sky
    const custom = new InstrumentData({
      volume: 55,
      pitch: 'F',
      visible: false,
      icon: 'line',
      alias: 'my alias',
      muted: true,
      reverbOverride: true,
    });
    expectGolden('instrument-data', {
      defaults: defaults.serialize(),
      custom: custom.serialize(),
      roundtrip: InstrumentData.deserialize(custom.serialize()).serialize(),
      // deserialize of an empty object exercises every fallback default
      fromEmpty: InstrumentData.deserialize({} as any).serialize(),
      noteIcons: [defaults.toNoteIcon(), custom.toNoteIcon()],
    });
  });

  it('NoteColumn / ColumnNote / RecordedNote wire formats are stable', () => {
    const column = new NoteColumn();
    column.tempoChanger = 2;
    column.addNote(0); // default empty layer -> dropped on deserialize
    column.addNote(3, NoteLayer.deserializeBin('101'));
    column.addNote(new ColumnNote(7, NoteLayer.deserializeBin('1')));
    const serialized = column.serialize();
    expectGolden('column', {
      serialized,
      // deserialize filters empty-layer notes — that behavior is part of the format
      roundtrip: NoteColumn.deserialize(serialized).serialize(),
      recordedNote: new RecordedNote(5, 1234, NoteLayer.deserializeBin('11')).serialize(),
      recordedNoteDefault: new RecordedNote().serialize(),
    });
  });

  it('Folder serialization is stable', () => {
    const folder = new Folder('My folder', 'abc-123');
    folder.filterType = 'alfabetical';
    expectGolden('folder', {
      named: folder.serialize(),
      defaults: new Folder().serialize(),
      roundtrip: Folder.deserialize(folder.serialize()).serialize(),
      fromPartial: Folder.deserialize({ name: 'only name' }).serialize(),
    });
  });
});
```

Note: `filterType: 'alfabetical'` — check the actual union values first:

Run: `rg -n "FOLDER_FILTER_TYPES" src/Config.ts`
Use one non-default value exactly as spelled in `Config.ts` (the codebase may use a misspelling like `alfabetical` — copy it verbatim; do not correct it).

- [ ] **Step 2: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL with missing-fixture errors.
Run: `npm run test:update-fixtures` — Expected: PASS, 6 fixture files created (3 per game).
Run: `npm test` — Expected: PASS both games. Diff the two `instrument-data.json`: Genshin `defaults.volume` must be `90`, Sky `100` — confirming per-game fixtures genuinely differ.

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for InstrumentData, columns, Folder"
```

---

### Task 4: RecordedSong fixtures (current, v1-legacy, old-format, oldFormat-export)

**Files:**

- Create: `test/builders.ts`
- Create: `test/recordedSong.test.ts`
- Create (generated): `test/fixtures/{Genshin,Sky}/recorded-song.json`

**Interfaces:**

- Consumes: `expectGolden`, barrel.
- Produces: fixture files; `buildRecordedSong(): RecordedSong` exported from `test/builders.ts` (which imports only from `./imports`), reused by Task 7. Task 5 adds `buildComposedSong` to the same file.

- [ ] **Step 1: Write the builder and the test**

`test/builders.ts`:

```ts
import { INSTRUMENTS, NoteLayer, RecordedNote, RecordedSong } from './imports';

export function buildRecordedSong(): RecordedSong {
  const song = new RecordedSong('Golden recorded', [], [INSTRUMENTS[0], INSTRUMENTS[1]]);
  song.bpm = 180;
  song.pitch = 'D';
  song.reverb = true;
  song.notes = [
    new RecordedNote(0, 100, NoteLayer.deserializeBin('1')),
    new RecordedNote(3, 350, NoteLayer.deserializeBin('10')),
    new RecordedNote(7, 350, NoteLayer.deserializeBin('11')),
    new RecordedNote(14, 900, NoteLayer.deserializeBin('1')),
  ];
  return song;
}
```

`test/recordedSong.test.ts`:

```ts
import { describe, it } from 'vitest';
import { RecordedSong } from './imports';
import { buildRecordedSong } from './builders';
import { expectGolden } from './golden';

describe('RecordedSong formats', () => {
  it('serialize / deserialize / legacy v1 / old-format export are stable', () => {
    const song = buildRecordedSong();
    const serialized = song.serialize();

    // v1 legacy: version omitted, notes as [index, time] pairs (layer defaults to 1)
    const v1Payload = {
      name: 'Legacy v1',
      bpm: 220,
      pitch: 'C',
      data: { isComposed: false, isComposedVersion: false, appName: serialized.data.appName },
      notes: [
        [0, 100],
        [5, 400],
      ],
    };

    expectGolden('recorded-song', {
      serialized,
      roundtrip: RecordedSong.deserialize(serialized).serialize(),
      deserializedV1: RecordedSong.deserialize(v1Payload as any).serialize(),
      oldFormatExport: song.toOldFormat(),
    });
  });
});
```

- [ ] **Step 2: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL (missing fixture).
Run: `npm run test:update-fixtures` — Expected: PASS, fixtures created.
Run: `npm test` — Expected: PASS both games. Sanity-check `recorded-song.json`: `serialized.notes[0]` must be `[0, 100, "1"]` and `oldFormatExport.songNotes[0].key` must be `"1Key0"`.

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for RecordedSong formats"
```

---

### Task 5: ComposedSong fixtures (current v3, legacy v1/v2, oldFormat-export)

**Files:**

- Create: `test/composedSong.test.ts`
- Modify: `test/builders.ts` (add `buildComposedSong`)
- Create (generated): `test/fixtures/{Genshin,Sky}/composed-song.json`

**Interfaces:**

- Consumes: `expectGolden`, barrel, `test/builders.ts` (Task 4).
- Produces: fixture files; `buildComposedSong(): ComposedSong` exported from `test/builders.ts`, reused by Task 7.

- [ ] **Step 1: Write the builder and the test**

Append to `test/builders.ts` (extend the existing import line with `ComposedSong`):

```ts
export function buildComposedSong(): ComposedSong {
  const song = new ComposedSong('Golden composed', [INSTRUMENTS[0], INSTRUMENTS[1]]);
  song.bpm = 160;
  song.pitch = 'E';
  song.reverb = true;
  // constructor creates 100 empty columns; fill a few deterministically
  song.columns[0].addNote(0, NoteLayer.deserializeBin('1'));
  song.columns[0].addNote(4, NoteLayer.deserializeBin('11'));
  song.columns[1].tempoChanger = 1;
  song.columns[1].addNote(2, NoteLayer.deserializeBin('10'));
  song.columns[3].tempoChanger = 3;
  song.columns[3].addNote(10, NoteLayer.deserializeBin('1'));
  song.breakpoints = [0, 3];
  return song;
}
```

`test/composedSong.test.ts`:

```ts
import { describe, it } from 'vitest';
import { ComposedSong, INSTRUMENTS, NoteLayer } from './imports';
import { buildComposedSong } from './builders';
import { expectGolden } from './golden';

describe('ComposedSong formats', () => {
  it('serialize v3 / roundtrip / legacy v1+v2 / old-format export are stable', () => {
    const song = buildComposedSong();
    const serialized = song.serialize();
    const appName = serialized.data.appName;

    // v1: columns [[tempoChanger, [[index, REVERSED-bin-layer], ...]], instruments as name array
    const v1Payload = {
      version: 1,
      name: 'Legacy v1',
      bpm: 220,
      pitch: 'C',
      data: { isComposed: true, isComposedVersion: true, appName },
      breakpoints: [0],
      instruments: [INSTRUMENTS[0], INSTRUMENTS[0]],
      columns: [
        [0, [[0, '1']]], // bit 0 (single char, reverse = itself)
        [1, [[3, '01']]], // reversed -> '10' -> bit 1
      ],
    };
    // v2: columns in current format, instruments still a name array
    const v2Payload = {
      version: 2,
      name: 'Legacy v2',
      bpm: 200,
      pitch: 'C',
      data: { isComposed: true, isComposedVersion: true, appName },
      breakpoints: [],
      instruments: [INSTRUMENTS[0]],
      columns: [
        [0, [[0, '1']]], // hex layer '1' -> bit 0
        [2, [[5, '3']]], // hex '3' -> bits 0+1
      ],
    };

    expectGolden('composed-song', {
      serialized,
      roundtrip: ComposedSong.deserialize(serialized).serialize(),
      deserializedV1: ComposedSong.deserialize(v1Payload as any).serialize(),
      deserializedV2: ComposedSong.deserialize(v2Payload as any).serialize(),
      oldFormatExport: song.toOldFormat(),
      toRecorded: song.toRecordedSong().serialize(),
    });
  });
});
```

- [ ] **Step 2: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL (missing fixture).
Run: `npm run test:update-fixtures` — Expected: PASS, fixtures created.
Run: `npm test` — Expected: PASS both games. Sanity-check: `serialized.columns.length` is 100; `serialized.columns[0]` is `[0, [[0, "1"], [4, "3"]]]`; `deserializedV1.instruments.length` is 2.

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for ComposedSong formats"
```

---

### Task 6: VsrgSong fixtures

**Files:**

- Create: `test/vsrgSong.test.ts`
- Create (generated): `test/fixtures/{Genshin,Sky}/vsrg-song.json`

**Interfaces:**

- Consumes: `expectGolden`, barrel (`VsrgSong`, `VsrgTrack`, `VsrgTrackModifier`).
- Produces: fixture files.

- [ ] **Step 1: Inspect VsrgHitObject construction**

`VsrgTrack` takes `(instrument?, alias?, hitObjects?)` and `VsrgHitObject` has `constructor(index: number, timestamp: number)` plus a `serialize()`. Check whether `VsrgHitObject` is exported from `$lib/Songs/VsrgSong` and what fields serialize:

Run: `rg -n "export class VsrgHitObject|serialize\(\)|holdDuration|notes" src/lib/Songs/VsrgSong.ts`

If `VsrgHitObject` is exported, add it to `test/imports.ts` barrel (this is the one permitted barrel edit in this task). If it is not exported, build hit objects through `VsrgTrack`/`VsrgSong` public methods found in the same file (e.g. a `createHitObject`-style method) — copy the exact API you find.

- [ ] **Step 2: Write the test**

`test/vsrgSong.test.ts` (adjust hit-object creation to the API found in Step 1; the shape below assumes `VsrgHitObject` is exported):

```ts
import { describe, it } from 'vitest';
import { INSTRUMENTS, VsrgHitObject, VsrgSong, VsrgTrack, VsrgTrackModifier } from './imports';
import { expectGolden } from './golden';

function buildVsrgSong(): VsrgSong {
  const song = new VsrgSong('Golden vsrg');
  song.bpm = 140;
  song.keys = 6;
  song.duration = 30000;
  song.difficulty = 7;
  const track = new VsrgTrack(INSTRUMENTS[0], 'lead');
  const hit1 = new VsrgHitObject(0, 500);
  const hit2 = new VsrgHitObject(3, 1250);
  track.hitObjects = [hit1, hit2];
  track.color = '#FF0000';
  song.tracks = [track];
  const modifier = new VsrgTrackModifier();
  modifier.alias = 'muted layer';
  modifier.muted = true;
  song.trackModifiers = [modifier];
  return song;
}

describe('VsrgSong formats', () => {
  it('serialize and roundtrip are stable', () => {
    const song = buildVsrgSong();
    const serialized = song.serialize();
    expectGolden('vsrg-song', {
      serialized,
      roundtrip: VsrgSong.deserialize(serialized).serialize(),
      defaults: new VsrgSong('Empty vsrg').serialize(),
    });
  });
});
```

- [ ] **Step 3: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL (missing fixture).
Run: `npm run test:update-fixtures` — Expected: PASS.
Run: `npm test` — Expected: PASS both games. Sanity-check: `serialized.type` is `"vsrg"`, `serialized.keys` is 6, `serialized.tracks[0].hitObjects.length` is 2.

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for VsrgSong format"
```

---

### Task 7: Cross-game conversion + MIDI export fixtures

**Files:**

- Create: `test/conversion.test.ts`
- Create (generated): `test/fixtures/Genshin/conversion.json`, `test/fixtures/{Genshin,Sky}/midi-export.json`

**Interfaces:**

- Consumes: `expectGolden`, barrel (`songService.parseSong`), `buildRecordedSong` + `buildComposedSong` from `test/builders.ts` (Tasks 4-5).
- Produces: fixture files locking the Sky→Genshin import conversion and `.mid` binary output.

- [ ] **Step 1: Write the test**

`test/conversion.test.ts`:

```ts
import { Buffer } from 'node:buffer';
import { describe, it } from 'vitest';
import { APP_NAME, songService } from './imports';
import { buildComposedSong, buildRecordedSong } from './builders';
import { expectGolden } from './golden';

// A serialized Sky composed song, crafted as the SKY build would emit it.
// Kept inline (not built via classes) so the Genshin run has a Sky payload to import.
const SKY_COMPOSED_PAYLOAD = {
  id: null,
  folderId: null,
  name: 'Sky import',
  type: 'composed',
  version: 3,
  bpm: 240,
  pitch: 'C',
  data: { isComposed: true, isComposedVersion: true, appName: 'Sky' },
  reverb: false,
  breakpoints: [0],
  instruments: [
    {
      name: 'Piano',
      volume: 100,
      pitch: '',
      visible: true,
      icon: 'border',
      alias: '',
      muted: false,
      reverbOverride: null,
    },
  ],
  columns: [
    [
      0,
      [
        [0, '1'],
        [7, '1'],
      ],
    ],
    [1, [[14, '1']]],
  ],
};

describe('cross-game import conversion (Genshin build only)', () => {
  it.runIf(APP_NAME === 'Genshin')('Sky composed song converts via parseSong', () => {
    const parsed = songService.parseSong(JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD)));
    expectGolden('conversion', {
      skyComposedToGenshin: parsed.serialize(),
    });
  });

  it.runIf(APP_NAME === 'Sky')('Genshin song is rejected by the Sky build', () => {
    const genshinPayload = JSON.parse(JSON.stringify(SKY_COMPOSED_PAYLOAD));
    genshinPayload.data.appName = 'Genshin';
    let threw = false;
    try {
      songService.parseSong(genshinPayload);
    } catch {
      threw = true;
    }
    if (!threw) throw new Error('Expected Sky build to reject a Genshin song');
  });
});

describe('MIDI export', () => {
  it('.mid binary output is stable', () => {
    const composed = buildComposedSong();
    const recorded = buildRecordedSong();
    expectGolden('midi-export', {
      composedMidiBase64: Buffer.from(composed.toMidi().toArray()).toString('base64'),
      recordedMidiBase64: Buffer.from(recorded.toMidi().toArray()).toString('base64'),
    });
  });
});
```

- [ ] **Step 2: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL (missing fixtures `conversion` and `midi-export`).
Run: `npm run test:update-fixtures` — Expected: PASS. Note `test/fixtures/Sky/` gets only `midi-export.json` from this task (the conversion fixture is Genshin-only by design — the Sky build rejects Genshin songs, asserted without a fixture).
Run: `npm test` — Expected: PASS both games. Sanity-check `conversion.json`: `skyComposedToGenshin.data.appName` is `"Genshin"` and note indexes changed per `IMPORT_NOTE_POSITIONS`.

- [ ] **Step 3: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for cross-game conversion and MIDI export"
```

---

### Task 8: Theme, settings-defaults, and Config-surface fixtures

**Files:**

- Create: `test/themeAndSettings.test.ts`
- Create: `test/configSurface.test.ts`
- Create (generated): `test/fixtures/{Genshin,Sky}/theme.json`, `settings-defaults.json`, `config-surface.json`

**Interfaces:**

- Consumes: `expectGolden`, barrel.
- Produces: `config-surface.json` — THE acceptance fixture for Phase 2's `GameDefinition`: the new game definitions must reproduce this data exactly.

- [ ] **Step 1: Write the theme + settings test**

`test/themeAndSettings.test.ts`:

```ts
import { describe, it } from 'vitest';
import {
  BaseTheme,
  ComposerSettings,
  MIDISettings,
  PlayerSettings,
  ThemeProvider,
  ThemeSettings,
  VsrgComposerSettings,
  VsrgPlayerSettings,
  ZenKeyboardSettings,
} from './imports';
import { expectGolden } from './golden';

describe('theme serialization', () => {
  it('BaseTheme serialize and sanitize are stable', () => {
    const theme = new BaseTheme('Golden theme');
    const serialized = theme.serialize();
    expectGolden('theme', {
      serialized,
      sanitized: ThemeProvider.sanitize(JSON.parse(JSON.stringify(serialized))),
    });
  });
});

describe('per-game settings defaults', () => {
  it('default settings objects are stable', () => {
    // JSON round-trip in expectGolden drops functions; what remains is the
    // persisted shape (settingVersion is game-prefixed, e.g. "Genshin71")
    expectGolden('settings-defaults', {
      composer: ComposerSettings,
      player: PlayerSettings,
      midi: MIDISettings,
      theme: ThemeSettings,
      vsrgComposer: VsrgComposerSettings,
      vsrgPlayer: VsrgPlayerSettings,
      zenKeyboard: ZenKeyboardSettings,
    });
  });
});
```

- [ ] **Step 2: Write the Config-surface test**

`test/configSurface.test.ts`:

```ts
import { describe, it } from 'vitest';
import {
  APP_NAME,
  BASE_LAYER_LIMIT,
  BASE_THEME_CONFIG,
  COMPOSER_NOTE_POSITIONS,
  IMPORT_NOTE_POSITIONS,
  INSTRUMENTS,
  INSTRUMENTS_DATA,
  MIDI_BOUNDS,
  MIDI_MAP_TO_NOTE,
  MIDI_PRESETS,
  NOTE_MAP_TO_MIDI,
  NOTES_CSS_CLASSES,
  NOTE_NAME_TYPES,
  PITCHES,
  TEMPO_CHANGERS,
} from './imports';
import { expectGolden } from './golden';

describe('game config surface', () => {
  it('all game-defining constants are stable', () => {
    // This fixture is the acceptance contract for the future GameDefinition:
    // games/<id>/ must reproduce every value here exactly.
    expectGolden('config-surface', {
      appName: APP_NAME,
      instruments: INSTRUMENTS,
      instrumentsData: INSTRUMENTS_DATA, // functions/components drop in JSON
      pitches: PITCHES,
      tempoChangers: TEMPO_CHANGERS,
      baseLayerLimit: BASE_LAYER_LIMIT,
      composerNotePositions: COMPOSER_NOTE_POSITIONS,
      importNotePositions: IMPORT_NOTE_POSITIONS,
      notesCssClasses: NOTES_CSS_CLASSES,
      baseThemeConfig: BASE_THEME_CONFIG,
      noteNameTypes: NOTE_NAME_TYPES,
      midiMapToNote: Object.fromEntries(MIDI_MAP_TO_NOTE),
      noteMapToMidi: Object.fromEntries(NOTE_MAP_TO_MIDI),
      midiBounds: MIDI_BOUNDS,
      midiPresets: MIDI_PRESETS,
    });
  });
});
```

If any of these constants has a different exact name in `Config.ts` (verify with `rg -n "export const" src/Config.ts`), fix the barrel and this test to the source's spelling. If `LAYOUT_KINDS` / `LAYOUT_ICONS_KINDS` exist as exports, add them to the barrel and to this fixture object the same way (they are part of the game surface).

- [ ] **Step 3: Verify failure, generate, verify pass**

Run: `npm run test:genshin` — Expected: FAIL (missing fixtures).
Run: `npm run test:update-fixtures` — Expected: PASS, 6 files created.
Run: `npm test` — Expected: PASS both games. Sanity-check `config-surface.json` (Genshin): `instruments` has 10 entries; `settings-defaults.json`: `composer.other.settingVersion` is `"Genshin71"`-style.

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for theme, settings defaults, and config surface"
```

---

### Task 9: Real example-file import fixtures (end-to-end parse pipeline)

**Files:**

- Create: `test/inputs/example-composed.skysheet.json` (copy of `docs/assets/Example_Composed-Wintergatan-TOWRPN.skysheet.json`)
- Create: `test/inputs/example-recorded.skysheet.json` (copy of `docs/assets/Example_Recorded-Tetris.skysheet.json`)
- Create: `test/exampleImport.test.ts`
- Create (generated): `test/fixtures/{Genshin,Sky}/example-import.json`, `backup-detection.json`

**Interfaces:**

- Consumes: `expectGolden`, `readInput` (Task 2), `songService.parseSong` via barrel.
- Produces: fixtures proving REAL user files (exported by the live app) parse identically — on Sky directly, on Genshin through auto-conversion.

- [ ] **Step 1: Copy the input files**

```bash
cp "docs/assets/Example_Composed-Wintergatan-TOWRPN.skysheet.json" test/inputs/example-composed.skysheet.json
cp "docs/assets/Example_Recorded-Tetris.skysheet.json" test/inputs/example-recorded.skysheet.json
```

- [ ] **Step 2: Write the test**

`test/exampleImport.test.ts`:

```ts
import { describe, it } from 'vitest';
import { ComposedSong, Folder, RecordedSong, songService, Theme, VsrgSong } from './imports';
import { expectGolden, readInput } from './golden';

// Both example files are arrays (the backup/multi-song download format:
// FileService.downloadFiles writes JSON.stringify(files)).
function parseAll(fileName: string) {
  const content = readInput(fileName);
  const files = Array.isArray(content) ? content : [content];
  return files.map((file) => songService.parseSong(JSON.parse(JSON.stringify(file))).serialize());
}

describe('real example files parse through the import pipeline', () => {
  it('example .skysheet files import identically', () => {
    expectGolden('example-import', {
      composed: parseAll('example-composed.skysheet.json'),
      recorded: parseAll('example-recorded.skysheet.json'),
    });
  });
});

describe('backup file format detection', () => {
  it('every element of a mixed backup array is detected as the right kind', () => {
    // Mirrors FileService.getSerializedObjectType: backups are arrays mixing
    // songs, folders, and themes; detection uses these static type checks.
    const composedFile = readInput('example-composed.skysheet.json');
    const song = Array.isArray(composedFile) ? composedFile[0] : composedFile;
    const folder = { type: 'folder', id: 'f1', name: 'Backup folder', filterType: 'date-created' };
    const theme = {
      type: 'theme',
      id: null,
      editable: true,
      data: {},
      other: { name: 'Backup theme' },
    };
    const oldFormatSong = { name: 'old', songNotes: [{ time: 100, key: '1Key0' }], pitchLevel: 0 };
    const backup = [song, folder, theme, oldFormatSong];
    expectGolden(
      'backup-detection',
      backup.map((item) => ({
        composed: ComposedSong.isSerializedType(item),
        recorded: RecordedSong.isSerializedType(item),
        vsrg: VsrgSong.isSerializedType(item),
        folder: Folder.isSerializedType(item),
        theme: Theme.isSerializedType(item),
        oldComposed: ComposedSong.isOldFormatSerializedType(item),
        oldRecorded: RecordedSong.isOldFormatSerializedType(item),
      }))
    );
  });
});
```

- [ ] **Step 3: Verify failure, generate, verify pass**

Run: `npm run test:sky` — Expected: FAIL (missing fixture). If instead parseSong throws, inspect the error: these are Sky files, so the Sky run must accept them — an exception here means the input copy is corrupted (re-copy) or the file contains a folder/theme object too (then filter to song objects with `file.type !== 'folder' && file.type !== 'theme'` before parsing and note it in the test).
Run: `npm run test:update-fixtures` — Expected: PASS. The Genshin fixture must show `data.appName: "Genshin"` (auto-converted); the Sky fixture keeps `"Sky"`.
Run: `npm test` — Expected: PASS both games.

- [ ] **Step 4: Commit**

```bash
git add test/
git commit -m "test: golden fixtures for real example-file imports"
```

---

### Task 10: Storage & URL inventory document

**Files:**

- Create: `docs/superpowers/audits/2026-07-19-storage-inventory.md`

**Interfaces:**

- Consumes: nothing from earlier tasks (pure analysis).
- Produces: the compatibility checklist Phase 2 (storage port) and Phase 5 (final parity audit) verify against. Spec §9.3 depends on this document existing.

- [ ] **Step 1: Gather every storage access**

Run each and collect output:

```bash
rg -n "localStorage" src -g '*.ts' -g '*.tsx'
rg -n "sessionStorage" src -g '*.ts' -g '*.tsx'
rg -n "new ZangoDb.Db|collection\(" src/lib/Services/Database
rg -n "APP_NAME \+|\`\$\{APP_NAME\}" src -g '*.ts' -g '*.tsx'
```

- [ ] **Step 2: Write the document**

Structure (fill every section from the grep output — every key literal, its file, and when it is written; the seed rows below are known and must appear):

```markdown
# Storage & URL Inventory (pre-SvelteKit baseline)

Captured on branch migration/next16-react19. The SvelteKit port MUST produce
byte-identical keys/names. Verified against spec §5.3 compatibility locks.

## IndexedDB

| Property       | Value                                            |
| -------------- | ------------------------------------------------ |
| Database name  | `Genshin` / `Sky` (= APP_NAME)                   |
| Schema version | 4                                                |
| Collections    | `songs`, `themes`, `folders`, `translation`      |
| Id generation  | `DbInstance.generateId()` — 4-4-4-4 hex segments |

## localStorage keys (all prefixed with `{APP_NAME}`)

| Key                                                                                                       | Written by      | Content             |
| --------------------------------------------------------------------------------------------------------- | --------------- | ------------------- |
| `{APP_NAME}_Composer_Settings`                                                                            | SettingsService | serialized settings |
| `{APP_NAME}_Player_Settings`                                                                              | SettingsService | serialized settings |
| `{APP_NAME}_MIDI_Settings`                                                                                | SettingsService | serialized settings |
| `{APP_NAME}_VsrgComposer_Settings`                                                                        | SettingsService | serialized settings |
| `{APP_NAME}_VsrgPlayer_Settings`                                                                          | SettingsService | serialized settings |
| `{APP_NAME}_ZenKeyboard_Settings`                                                                         | SettingsService | serialized settings |
| `{APP_NAME}_LastBackupWarningTime`                                                                        | SettingsService | epoch ms            |
| `{APP_NAME}_LastStateEdit`                                                                                | SettingsService | epoch ms            |
| ... every additional key found by the greps (theme id, language, keybinds, page visits, home flags, etc.) |

## sessionStorage keys

| Key | Written by | Content |
| `isTwa` | Utilities.setIfInTWA | boolean |
| ... any others found |

## Service worker

| Cache name pattern | `{APP_NAME}` + SW version (from src/service-worker.ts) — copy the exact template literal |

## URLs (must stay identical)

List all 19 routes + 8 blog post slugs from src/app/ (enumerate them explicitly).

## File extensions (import/export)

| `{app}sheet` / `{app}folder` / `{app}theme` (lowercase APP_NAME), `.mid`, `.wav`, legacy `.json` |
```

- [ ] **Step 3: Verify completeness**

Run: `rg -c "localStorage|sessionStorage" src -g '*.ts' -g '*.tsx'`
Cross-check: every file with a nonzero count appears at least once in the document's "Written by" column. If one is missing, add its keys.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/audits/2026-07-19-storage-inventory.md
git commit -m "docs: storage & URL compatibility inventory (phase 0)"
```

---

### Task 11: APP_NAME audit + final GameDefinition draft

**Files:**

- Create: `docs/superpowers/audits/2026-07-19-app-name-audit.md`

**Interfaces:**

- Consumes: spec §5 (`GameDefinition` sketch + two-tier branching rule).
- Produces: the categorized reference table + the FINAL `GameDefinition` TypeScript interface draft that Phase 2 implements as `src/lib/games/types.ts`. This closes the spec's "exact fields finalized by the Phase-0 audit" clause.

- [ ] **Step 1: Collect every reference**

```bash
# capture both outputs for analysis (no file needed — read the command output directly)
rg -n "APP_NAME" src -g '*.ts' -g '*.tsx'
rg -n "(['\"])(Sky|Genshin)\1" src -g '*.ts' -g '*.tsx'
```

Expected: ~232 APP_NAME refs across ~59 files, plus string-literal hits. Also inventory the per-game asset trees:

```bash
ls src/appData/genshin src/appData/sky
ls src/components/shared/SvgNotes
```

- [ ] **Step 2: Write the audit document**

For EVERY reference (grouped by file), one table row:

```markdown
# APP_NAME Audit → GameDefinition (final)

## Categories

- **data**: different values, same behavior → GameDefinition field
- **flag**: different behavior → `features.<capability>` (named for what it does)
- **storage**: legacy compatibility surface → `storageId` (NEVER change)
- **meta**: titles/manifest/SEO → `meta`/`display`
- **i18n**: game-conditional strings → `i18n` overrides
- **escape**: true one-off → `game.id === '<id>'` + `// game-escape-hatch:` comment

## Reference table

| File                                | Line | What it selects     | Category | GameDefinition field |
| ----------------------------------- | ---- | ------------------- | -------- | -------------------- |
| src/Config.ts                       | 26   | note CSS classes    | data     | notes.cssClasses     |
| src/Config.ts                       | 41   | instrument roster   | data     | instruments.list     |
| src/lib/Services/SettingsService.ts | 161  | localStorage prefix | storage  | storageId            |
| ... every remaining row ...         |

## Tally

| Category | Count |
(data / flag / storage / meta / i18n / escape — escape MUST be single digits;
if a candidate list grows past 9, promote patterns to feature flags.)

## Final GameDefinition interface

(complete TypeScript, no `{...}` elisions — every field typed, informed by the
table AND by test/fixtures/*/config-surface.json which it must be able to reproduce)

## Per-game asset inventory

(appData contents, SvgNotes components, audio sample folder names per game)
```

- [ ] **Step 3: Self-check the interface against the fixtures**

For every top-level key in `test/fixtures/Genshin/config-surface.json`, name the `GameDefinition` field that will carry it. If one has no home, add the field. Do the same for every "data" row of the reference table.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/audits/2026-07-19-app-name-audit.md
git commit -m "docs: APP_NAME audit and final GameDefinition interface (phase 0)"
```

---

### Task 12: ZangoDB-under-Vite spike

**Files:**

- Create (throwaway, in scratchpad — NOT committed): a Vite vanilla-ts app
- Create: `docs/superpowers/audits/2026-07-19-zangodb-vite-spike.md`

**Interfaces:**

- Consumes: repo's ZangoDB version pin (`@insertish/zangodb@^1.0.12-nomemo` from package.json).
- Produces: go/no-go + required Vite config for Phase 1's scaffold. Spec §11 risk item closes here.

- [ ] **Step 1: Scaffold the spike in the scratchpad directory**

```bash
cd <scratchpad>
npm create vite@latest zango-spike -- --template vanilla-ts
cd zango-spike
npm install
npm install @insertish/zangodb@1.0.12-nomemo
```

- [ ] **Step 2: Write the probe**

Replace `src/main.ts`:

```ts
import ZangoDb from '@insertish/zangodb';

const out = document.querySelector<HTMLDivElement>('#app')!;

async function probe() {
  try {
    const db = new ZangoDb.Db('SpikeTest', 1, { songs: [] });
    const songs = db.collection('songs');
    await songs.insert({ id: 'spike-1', name: 'hello zango' });
    const found = await songs.find({ id: 'spike-1' }).toArray();
    out.textContent = 'ZANGO_OK ' + JSON.stringify(found.map((f) => f.name));
  } catch (e) {
    out.textContent = 'ZANGO_FAIL ' + String(e);
  }
}

probe();
```

- [ ] **Step 3: Verify dev mode (esbuild prebundle path)**

Run: `npm run dev` (in background), open the served URL in the browser pane.
Expected: page shows `ZANGO_OK ["hello zango"]`. Record any Vite `optimizeDeps` warnings from the terminal.

- [ ] **Step 4: Verify production build (rollup path)**

Run: `npm run build`
Expected: build succeeds with no errors (CJS interop warnings are acceptable if the runtime works).
Run: `npm run preview` (in background), open the served URL in the browser pane.
Expected: `ZANGO_OK ["hello zango"]` again — reload the page once to also confirm the data persisted in IndexedDB across loads (find still returns the row).

- [ ] **Step 5: Write the result document**

`docs/superpowers/audits/2026-07-19-zangodb-vite-spike.md`: verdict (OK / needs config / blocked), exact Vite version used, any required config (`optimizeDeps.include`, commonjs options), console warnings observed, and — if blocked — the chosen fallback from spec §11 (patch/fork/vendor behind the `Collection` interface). Delete the spike folder afterward.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/audits/2026-07-19-zangodb-vite-spike.md
git commit -m "docs: zangodb-under-vite spike result (phase 0)"
```

---

## Phase-0 exit criteria (verify before calling the phase done)

1. `npm test` green: both games, all suites (smoke, noteLayer, primitives, recordedSong, composedSong, vsrgSong, conversion, themeAndSettings, configSurface, exampleImport).
2. `test/fixtures/Genshin/` and `test/fixtures/Sky/` committed and populated (Genshin: 14 files incl. `conversion.json`; Sky: 13 files — note-layer, instrument-data, column, folder, recorded-song, composed-song, vsrg-song, midi-export, theme, settings-defaults, config-surface, example-import, backup-detection).
3. Three docs committed under `docs/superpowers/audits/`: storage inventory, APP_NAME audit (with complete final `GameDefinition` interface), zangodb spike verdict.
4. `git status` shows no `src/` modifications on the branch from this phase.
5. `npm run build:genshin` still succeeds (proves Phase 0 didn't disturb the app build; run once at the end).
