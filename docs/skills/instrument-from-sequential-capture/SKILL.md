---
name: instrument-from-sequential-capture
description: Split ONE audio capture that plays every note in button order (silence between notes) into per-note samples and register them as a new folder-based instrument — segmentation, trimming, pitch verification, MP3 encode, meta.json, and the full wiring checklist. Use when handed a recording of an instrument to add, as an alternative to per-note takes.
---

# Instrument from a sequential capture

The scripted version of the workflow that produced
`genshin/instruments/NightwindHorn` (2026-08-13): one in-game recording of all
14 notes became a shipped, tested instrument. Capture protocol for individual
takes lives in `docs/skills/recording-sustained-instruments`; loop-point work
lives in `docs/skills/audio-loop-analysis`; this skill is the splitter and the
registration checklist between them.

## What the capture must look like

- Every button in **meta.json notes order** (top-left → bottom-right of the
  keyboard) — segment order becomes button order, nothing reorders it.
- Sustained instruments: hold each note 6–12 s (the hold IS the max sustain a
  player gets on a loopless instrument). Tap instruments: clean single hits.
- Let every note decay into real silence, with **≥ 1–2 s of gap** — the
  segmenter ends a note after 0.35 s below −55 dBFS, so bleed/reverb between
  notes merges them.
- Lossless WAV at the source rate is best; a high-bitrate MP3 capture works
  (NightwindHorn came from one). Stereo is fine — output is downmixed to the
  house mono format.

## Run the pipeline

Deps are one-off tooling, deliberately not in package.json (ESM resolves them
from the repo root's node_modules; package.json/lockfile stay untouched):

```bash
npm i --no-save mpg123-decoder @breezystack/lamejs
```

**Always dry-run first** and read the table before writing any file:

```bash
node docs/skills/instrument-from-sequential-capture/scripts/extract-notes.mjs \
  capture.mp3 --dry-run --expect 14 --midi 60,62,64,65,67,69,71,48,50,52,53,55,57,59
```

- `--expect` fails loudly on a miscount — tune `--on-db/--off-db/--gap-s` for
  noisy or bleed-heavy captures rather than accepting a wrong split.
- `--midi` is the authored Note Ids in capture order. Omit it to use rounded
  detected pitch, then CHECK the printed ids — they are identity (ADR-0001) and
  must be unique and inside the game's Song Grid for composer/import to work.
- Pitch is the median over many windows with parabolic interpolation. Trust it
  over ad-hoc measurement: a naive single-window estimate read 30–50 cents
  sharp on the NightwindHorn material. Deviations within ~±10 cents: ship as-is
  (no repitch). A consistent larger offset: repitch to equal temperament
  (Catmull-Rom, see the recorder READMEs) — an out-of-tune instrument clashes
  with every other instrument in multi-track songs. `PITCH-DEV` flags > 12 c.
- The **attack** column is time to within 3 dB of the note's peak — it sets
  `sustain.minLength` (0.1 default; NightwindHorn uses 0.2 because D4 swells
  for ~0.6 s). **early RMS** shows what a fast tap would actually sound like.

Then extract (add `--wav` when you'll need loop points — analysis must run on
the pre-encode PCM, MP3 decode offsets shift per browser):

```bash
node docs/skills/instrument-from-sequential-capture/scripts/extract-notes.mjs \
  capture.mp3 --out /tmp/notes --midi 60,62,... [--wav]
```

Per note this trims to onset/tail (10 ms pre-roll, 3 ms fade-in, 100 ms
fade-out), removes DC, downmixes, peak-normalizes to ~−3.5 dBFS and encodes
128 kbps CBR mono (`m<midi>.mp3`, the house recipe) — then decodes everything
back and re-verifies pitch and level. `notes.json` is a meta.json starter:
review `baseNote` spellings (display choice, e.g. Vintage-Lyre's Db) and add
`icon`s yourself.

## Choose the sustain authoring

- **Tap** (plucks, hits): no `sustain` at all.
- **Loopless sustained** (long natural holds that should end, e.g. wind/brass):
  `sustain` with NO `loop` — a held note plays its file once, note-off starts
  the `release` fade. See `genshin/instruments/NightwindHorn/` for the worked
  example and its README for the reasoning.
- **Looping sustained** (holds forever): extract with `--wav`, find regions
  with `docs/skills/audio-loop-analysis`, author `loop`/`loopMode` per
  `docs/skills/recording-sustained-instruments`.

## Register the instrument

Everything an instrument touches (learned the hard way; the samples alone are
maybe a third of the work):

1. `src/lib/games/<game>/instruments/<Name>/` — samples, `meta.json`
   (displayName, family, `midiName` must be a General MIDI name — it becomes
   the exported MIDI program), `fill`/`clickColor`, `shape`, optional
   `sustain`, notes. Add a README.md documenting source and processing.
2. Shape: reuse one from `<game>/shapes.ts` or add it there plus a Label Set in
   `games/shapes/labels.ts` (every label array length must equal capacity —
   `defineGame` throws otherwise). Prefer slicing an existing set when the
   layout is a sub-grid, so keys/octave marks stay canonical (see
   `STANDARD_14_LOW_LABELS`).
3. `game.json` → `instruments.list` (menu order).
4. i18n: key in `src/lib/i18n/locales/en/index.ts` `instruments`, and insert
   the same key into **every** `static/locales/*.json` (anchor the insertion on
   a neighboring instrument key; translators localize later).
5. `src/lib/core/BaseSettings.ts`: bump BOTH counters marked
   `//change when instrument is added` (player + zenKeyboard). They are shared
   across games — the other game's settings fixtures will change too; expected.
6. `src/lib/core/Songs/instrumentSimilarity.ts`: map it cross-game in both
   directions (unmapped falls back to the target's default instrument).
7. Tests: instrument count in `test/smoke.test.ts`; add the name to the
   POST_FREEZE sets in `test/gameDefinitionConsistency.test.ts` AND
   `test/configSurface.test.ts` (post-freeze instruments never join the v1
   freeze).
8. `npm run test:update-fixtures`, then `npm test`, `npm run check`,
   `npm run build:<game>` (the build exercises registry validation at
   prerender and copies the samples).

To see it live without clicking through menus: load `/player` with the
instrument pre-selected by seeding localStorage before app code runs —
key `<StorageId>_Player_Settings`, value the `player` object from
`test/fixtures/<Game>/settings-defaults.json` with `data.instrument.value`
changed (its `settingVersion` must match the just-bumped one).
