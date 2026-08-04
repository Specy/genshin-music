# Adding instruments and games

Since ADR-0003, each game is a self-contained folder under `src/lib/games/<id>/`:

```
src/lib/games/genshin/
├── game.json              # identity, display/meta, Song Grid, midi, settings,
│                          # features, ORDERED instrument roster
├── presets.json           # named Note Presets (shared note tables)
├── shapes.ts              # CODE: the game's Shape registry
├── glyphs/*.svelte        # CODE: note icon components
├── identity.ts            # CODE: DOM-free id/storageId for the service worker
├── static/                # per-game favicon/manifest overlay
└── instruments/
    └── Lyre/
        ├── meta.json      # the instrument definition
        └── 0.mp3 … 20.mp3 # its samples (any file names; see `file` below)
```

Everything is aggregated and validated at build time (`games/registry.ts` +
`defineGame()`); a broken config **fails the dev server instantly and fails the
production build at prerender** with a message naming the game/instrument.

## Adding an instrument (no code)

1. Create `src/lib/games/<game>/instruments/<Name>/`. The folder name **is** the
   instrument name: the runtime key, the audio URL segment
   (`/assets/audio/<game>/<Name>/…`), and what songs reference. Don't rename
   existing folders — saved songs point at them.
2. Drop the samples in, one per button. Default naming is `0.mp3 … N-1.mp3`
   (button order); arbitrary names work via the per-note `file` field.
3. Write `meta.json`:

```json
{
  "displayName": "My Instrument",
  "family": "strings",
  "midiName": "pizzicato strings",
  "fill": "#cdb68e",
  "clickColor": "#ddcba8",
  "shape": "genshin-3x7",
  "notes": "standard-21"
}
```

4. Add the name to `instruments.list` in the game's `game.json` (the array is
   the menu order). A folder deliberately **not** listed is an *Unlisted
   Instrument*: loadable by the engine, hidden from menus.
5. Done. `npm run dev:<game>` picks it up; `npm test` verifies every note's
   sample file exists. Locale entries are optional — menus fall back to
   `displayName` until translators add `instruments.<Name>` keys.

### meta.json reference

| field         | required | notes                                                             |
| ------------- | -------- | ----------------------------------------------------------------- |
| `displayName` | yes      | English fallback shown until a locale has the key                 |
| `family`      | yes      | MIDI-ish family label (export metadata)                           |
| `midiName`    | yes      | MIDI program name used on export                                  |
| `fill`        | no       | note button fill color                                            |
| `clickColor`  | no       | note press color                                                  |
| `shape`       | yes      | a Shape id from the game's `shapes.ts`                            |
| `sustain`     | no       | `{ release, crossfade?, loop: {start, end} }` — see below         |
| `notes`       | yes      | a preset name from `presets.json` **or** an inline array of notes |

Each note (inline or in a preset) is:

```json
{ "file": "0.mp3", "midi": 72, "baseNote": "C", "icon": "do", "loop": { "start": 0.9, "end": 1.1 } }
```

- `midi` — the **Note Id** (nominal MIDI id, ADR-0001). Required; it is the
  note's identity in songs. Position in the array is the button position.
- `baseNote` — the displayed note-name root. NOT derivable from `midi`
  (Vintage-Lyre's nominal 74 displays as Db; unpitched SFX use `""`).
- `icon` — a glyph name the game's `glyphs/` provides.
- `file` — optional; defaults to `<index>.mp3`.
- `loop` — optional per-note sustain loop, overriding `sustain.loop`. Only
  meaningful when the instrument has `sustain` (see
  `sky/instruments/test_sustain/` for a fully worked example).

**Sustain**: presence of the `sustain` object makes the instrument hold notes
while pressed (Voice engine loops the region, releases into the natural tail).
Omit it for one-shot instruments.

**Note Presets** (`presets.json`): named note arrays for the tables most
instruments share (`standard-21`, `drums-8`, …). If your instrument deviates in
any per-note field, inline the whole array instead — verbose but explicit.

## Shapes

A **Shape** is the named on-screen arrangement (`genshin-3x7`, `sky-2x4`, …) an
instrument declares. It owns the geometry, the default button Label Sets
(keyboard/ABC/numbers/PlayStation/Switch), and the arrangement component the
keyboard surfaces render through. Shapes are **code by design** — a new
arrangement is a new renderer:

- Reusing existing geometry: add an entry to the game's `shapes.ts` pointing at
  the shared `GridShape` with `columns`/`capacity`/labels.
- A genuinely new arrangement (side buttons + a circle, a piano row, …):
  implement a component with the `ShapeComponentProps` contract
  (`shapes/GridShape.svelte` is the reference) and register it under a new id.
  No surface changes — they all render via `ShapeKeyboard`.

Shape ids are game-prefixed so the same geometry can fork behavior per game
without data migrations.

## Adding a game

Data (the folder): `game.json` (see `schema.ts` for every field — `id` must
equal the folder name; `storageId` is the storage prefix, `=== id` for new
games), `presets.json`, `instruments/…`, `static/` (favicon, manifest, logos).

Code (what data can't express):

1. `src/lib/games/types.ts` — add the id to the `GameId` union (one line).
2. `<game>/identity.ts` — the two-field DOM-free identity module.
3. `<game>/shapes.ts` — the Shape registry (reuse `GridShape` + shared labels
   where they fit).
4. `<game>/glyphs/*.svelte` — icon components; keys go into the `NoteImage`
   union in `types.ts` if new.
5. `<game>/index.ts` — ~15 lines: `defineGame(id, { shapes, svgGlyphs })`.
6. `scripts/buildApp.js` + `scripts/startApp.js` — add the game to their
   `GAMES` tables (build/dev entry points).

`svelte.config.js` discovers game folders automatically; `PUBLIC_GAME=<id>`
selects the default game per build. All games' JSON metadata is always bundled
(`games/registry.ts`), so a future runtime game switch needs no config changes.

## How samples reach the browser

Samples live next to their meta.json, but URLs are **locked** to
`/assets/audio/<game>/<Name>/<file>`: `scripts/gameStatic.js` copies exactly the
files the meta.jsons reference into `static/assets/audio/` (gitignored overlay)
on every dev/build run, and cleans other games' overlay dirs first. Only the
active game's audio ships in its build. Extra files in an instrument folder
(READMEs, sources) are never copied.

## Where mistakes surface

| mistake                             | caught by                                     |
| ----------------------------------- | --------------------------------------------- |
| unknown preset name / shape / glyph | dev server + prod build (module-eval throw)   |
| listed instrument without a folder  | dev server + prod build                       |
| missing sample file                 | `npm test` (`gameConfig.test.ts`) + 404 check |
| more notes than the Shape holds     | dev server + prod build                       |
| value drift during refactors        | `configSurface.test.ts` golden fixtures       |
