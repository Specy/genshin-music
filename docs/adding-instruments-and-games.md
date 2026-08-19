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
        └── 0.mp3 … 20.mp3 # its samples (`[A-Za-z0-9._-]+` names; see `file` below)
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
   (button order); other names work via the per-note `file` field as long as they
   match `[A-Za-z0-9._-]+` (file names go verbatim into URLs and copy paths — the
   registry rejects `/`, `#`, `?`, `%`, spaces, `..`).
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
   the menu order). A folder deliberately **not** listed is an _Unlisted
   Instrument_: loadable by the engine, hidden from menus.
5. Done. `npm run dev:<game>` picks it up; `npm test` verifies every note's
   sample file exists. Locale entries are optional — menus fall back to
   `displayName` until translators add `instruments.<Name>` keys.

### meta.json reference

| field         | required | notes                                                                  |
| ------------- | -------- | ---------------------------------------------------------------------- |
| `displayName` | yes      | English fallback shown until a locale has the key                      |
| `family`      | yes      | MIDI-ish family label (export metadata)                                |
| `midiName`    | yes      | MIDI program name used on export                                       |
| `fill`        | no       | note button fill color                                                 |
| `clickColor`  | no       | note press color                                                       |
| `shape`       | yes      | a Shape id from the game's `shapes.ts`                                 |
| `sustain`     | no       | `{ release, crossfade?, loopCrossfade?, loopMode?, minLength?, loop }` |
| `notes`       | yes      | a preset name from `presets.json` **or** an inline array of notes      |

Each note (inline or in a preset) is:

```json
{ "file": "0.mp3", "midi": 72, "baseNote": "C", "icon": "do", "loop": { "start": 0.9, "end": 1.1 } }
```

- `midi` — the **Nominal Id** (ADR-0001). Required; it is the button's name in the
  game's grid namespace. Position in the array is the button position.
- `baseNote` — on a **Pitched Button** (the default), the bare pitch class the button
  actually SOUNDS: the registry derives the button's Sounding Pitch from it (nearest
  chromatic match to `midi`) and rejects any other string, so it is NOT derivable from
  `midi` (Vintage-Lyre's nominal 74 really does sound Db). On an **Assigned Button** it
  is free display text. There is no `sounding` field to author: since ADR-0007 songs
  store that derived pitch, and a second authored copy of it could only drift.
- `pitched` — optional, only ever `false`: declares an **Assigned Button** (ADR-0007) —
  percussion, SFX, a chord strum. It has no single sounding pitch, so it enters notes at
  its Nominal Id and its `baseNote` becomes a free label (`"G7"`, `""`). Never inferred
  from the label: only this flag decides. Chord labels do not transpose with the pitch
  setting; pitch-class labels do.
- `icon` — a glyph name the game's `glyphs/` provides.
- `file` — optional; defaults to `<index>.mp3`.
- `loop` — optional per-note sustain loop, overriding `sustain.loop`. Only
  meaningful when the instrument has `sustain` (see
  `sky/instruments/sustained_recorder/` for a fully worked example).
- `minLength` — optional per-note override of `sustain.minLength` (below).

**Sustain**: presence of the `sustain` object makes the instrument hold notes
while pressed, using the standard sampler model: ONE file per note with three
regions — attack `[0, loop.start)`, a sustain loop `[loop.start, loop.end)`
wrapped while held, and the rest of the file as the natural release. Note-off
acts **immediately, from wherever the playhead is** (never deferred to a loop
boundary — the same as every sampler; `minLength` below can defer it by a fixed
tap minimum); what it does is `loopMode`:

- `loop-continuous` (default): keep looping and fade out over `release`
  seconds. Organ/pad style; a tap becomes a short faded dab.
- `loop-sustain` (SFZ `loop_mode=loop_sustain`): stop wrapping and play out the
  rest of the file from the exact playhead phase — the remainder of the pass,
  then the natural tail past `loop.end`, with a final `release`-seconds safety
  fade at the very end (`crossfade`, default 20 ms, splices the play-out in). A
  tap plays the file front to back.
- `one-shot`: ignore note-off entirely; the whole sample always plays.
  Behaviorally identical to omitting `sustain` — an explicit "tap" spelling.
  Hold-length UX (Composer durations, recorded durations) stays off.

Additionally:

- `minLength` (seconds, optional; per-note override on each note) is the
  minimum time a triggered note sounds before its release begins, measured from
  the note's start — a very fast tap still plays `minLength`, then the normal
  release, on every surface (player key taps, zen keyboard, composer previews
  and span-1 columns, recorded taps, VSRG hits). Holds and scheduled durations
  longer than `minLength` are unaffected. When absent, releases act immediately
  (the sampler default — a tap on `loop-continuous` is then just the first
  `release` seconds fading out). Enforced by the Instrument when it releases a
  voice, so it is independent of where the loop points sit.
- On a sustaining instrument there is NO whole-file one-shot path: any plain
  trigger without a hold (previews, span-1 columns, recorded taps) is played as
  a tap — press plus immediate release under the rules above.
- Loop points don't need to be sample-perfect: at load the engine blends the
  audio approaching `loop.end` toward the audio approaching `loop.start`
  (`loopCrossfade` seconds, default 0.05; `0` disables), so the wrap doesn't
  click. Find candidate points with `docs/skills/audio-loop-analysis`.
- Prefer WAV (or FLAC) over MP3 for sustained samples: MP3 encoder padding
  shifts decoded sample positions per browser, which moves tuned loop points.

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

One coupling worth knowing before you write `game.json`: `notes.canonicalNoteIds`
is both the game's Song Grid (row order) and its SCALE. Since ADR-0007 the MIDI
importer snaps every imported note onto that list — nearest id at or below, and a
number whose pitch class is absent from it counts as an accidental — so there is no
snap table to author, and `midi.bounds` must be the range that list spans.

Code (what data can't express):

1. `src/lib/games/types.ts` — add the id to the `GameId` union (one line).
2. `<game>/identity.ts` — the two-field DOM-free identity module.
3. `<game>/shapes.ts` — the Shape registry (reuse `GridShape` + shared labels
   where they fit).
4. `<game>/glyphs/*.svelte` — icon components; keys go into the `NoteImage`
   union in `types.ts` if new.
5. `<game>/index.ts` — ~15 lines: `defineGame(GAME_IDENTITY, { shapes, svgGlyphs })`
   (the full identity, so game.json ↔ identity.ts drift fails the build).
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
