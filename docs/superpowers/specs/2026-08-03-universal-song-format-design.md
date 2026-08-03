# Universal Song Format + Sustained Notes — Design

**Date**: 2026-08-03
**Status**: Approved by user (grilling session)
**Builds on**: `2026-07-19-sveltekit-migration-design.md` (the migration this lands on top of)
**ADRs**: `docs/adr/0001-nominal-midi-id-note-identity.md`, `docs/adr/0002-per-track-notes-column-span-durations.md`
**Glossary**: `CONTEXT.md` (Note Id, Button, Sounding Pitch, Transposition, Track, Duration, Sustain, Stranded Note) — terms are used here with those exact meanings.

## 1. Goal

Decouple song data from keyboard layout and add sustained notes, on `migration/sveltekit`, **before** the SvelteKit app is published — users experience one transition. Three changes, one format bump:

1. **Note identity**: songs store **Note Ids** (nominal MIDI numbers) instead of layout indices. Buttons are derived per instrument; new games with any layout/scale plug in by declaring ordered id lists.
2. **Per-track structure**: composed (and recorded) songs give each instrument track its own notes; the layer bitmask dies.
3. **Sustain**: notes carry Durations everywhere; sustain-capable instruments (new ones — no existing instrument changes sound) loop-and-release; live keyboards, composer, recorder, MIDI, and VSRG all speak duration.

## 2. Decisions (locked during grilling)

| Question | Decision |
| --- | --- |
| Sequencing | On `migration/sveltekit`, pre-publish. Golden fixtures change role: legacy fixtures now guard **deserialization + conversion**, not byte-identical round-trip (serialize writes new versions). |
| Note identity | **Nominal MIDI id** (existing `midiNotes` values), stored pre-Transposition. Pitch dropdown stays a playback-rate transform. See ADR-0001. |
| Track model | **Per-track notes** on the shared column timeline. See ADR-0002. |
| Duration unit | Composed: **integer column span ≥ 1** (omitted when 1). Recorded: **ms press→release** (omitted when absent/legacy). |
| Non-sustaining playback | Duration stored but **ignored**: one-shot natural ring-out, byte-for-byte today's audio path. |
| Sustain audio | **Loop region + release gain ramp** per instrument (per-note loop overrides), on **raw Web Audio** via a new `Voice` abstraction. tone.js: experiment branch *after* this ships, never in v1. |
| Composer duration UX | Long-press a composer keyboard button → popover: drag-right slider + `<`/`>` ±1-column steppers; dismissed by outside click / `X` / column change. Buttons show held-state in covered columns; timeline canvas renders tails. |
| Occupancy rule | Same-id spans on one track never overlap; pressing a covered button cannot create a note there. |
| Packaging | Version bumps: **composed v4, recorded v3, VSRG v2**. All older versions deserialize forever (converted to the new model on load, quirks preserved). Sky old-format export **kept** (id→index reverse map; off-layout ids dropped with a visible warning count). |
| Stranded ids | **Convert on import, skip at playback.** Two import paths (implementation finding: the historic remap was a rank-preserving uniform -12 shift, not a fold): legacy files cross-convert through the frozen index remap inside deserialization (byte-reproduces the old converter, fixture-locked); new-format files carry ids with roster swap + octave-fold of out-of-range ids only (84 → 72), collisions deduped, gap ids stranded. Everywhere else data is untouched — unplayable notes skip at playback and are marked in the composer. |
| V1 scope | Everything: MIDI durations in+out, VSRG holds drive real audio sustain, practice-mode visual tails, sheet-visualizer durations, zen sustain. |

## 3. Current state being replaced

- `RecordedNote`/`ColumnNote` store a **layout index** — the position in the current instrument's arrays. Genshin's index space is high→low octave per row (index 0 = id 72), Sky's is ascending (index 0 = id 60); `IMPORT_NOTE_POSITIONS` patches between them and **dies in this refactor**.
- `ColumnNote` carries a `NoteLayer` bitmask over song instruments; `NoteLayer` survives only inside legacy deserializers.
- Audio is fire-and-forget: `Instrument.play()` starts a one-shot `AudioBufferSourceNode`; there is no note-off path anywhere (the sole `0x80` in the codebase is outbound MIDI).
- Key data fact: `midiNotes` is the **same white-key array for all 21-note Genshin instruments** (accidental-tuned ones included) — it is already a nominal id, which is what makes conversion lossless. Samples stay addressed by button (`{game}/{instrument}/{button}.mp3`).

## 4. Note model

- An instrument declares `noteIds: number[]` (rename of `midiNotes` — the authoritative ordered list; `baseNotes`, `icons`, `layout` stay display concerns). Button *b* plays `noteIds[b]`; reverse map `id → button` is built per instrument. No current instrument has duplicate ids.
- Stored ids are pre-Transposition (what the button plays at pitch C). Changing the pitch dropdown rewrites nothing.
- **Stranded notes** (id not in the track instrument's list): playback skips them; the composer renders them with a distinct marker; counts surface in the UI. Import-time folding is the only mutation (§6).

## 5. Serialized formats

`SerializedInstrumentData` is unchanged and moves inside each track. Base song fields (`id`, `name`, `folderId`, `type`, `data{appName…}`, `bpm`, `pitch`, `version`, `reverb`, `breakpoints`) are unchanged.

```ts
// Composed v4 — replaces `columns: [tempo, [index, layerHex][]][]` + top-level instruments
type SerializedComposedSongV4 = BaseSerializedSong & {
  version: 4
  columnTempos: number[]                       // tempo-changer id per column; length = timeline length
  tracks: {
    instrument: SerializedInstrumentData
    notes: SerializedTrackNote[]               // sorted by column
  }[]
}
type SerializedTrackNote = [column: number, id: number, span?: number]  // span omitted when 1

// Recorded v3 — replaces flat `notes: [index, time, layerHex][]` + top-level instruments
type SerializedRecordedSongV3 = BaseSerializedSong & {
  version: 3
  tracks: {
    instrument: SerializedInstrumentData
    notes: [id: number, timeMs: number, durationMs?: number][]  // sorted by time
  }[]
}

// VSRG v2 — hit objects unchanged except `notes` holds Note Ids instead of indices
// [laneIndex, timestamp, holdDuration, noteIds[]]
```

In-memory: `ComposedSong { columnTempos, tracks: Track[] }`, `Track { instrument: InstrumentData, notes: TrackNote[] }`, `TrackNote { id, column, span }` / recorded `{ id, timeMs, durationMs }`. A `song.instruments` getter (derived from tracks) keeps menu/service consumers working. Layer ops (`switchLayer`, `swapLayer`, `pasteLayer`, `eraseColumns`, `copyColumns`, `moveNotesBy`) become track ops; `moveNotesBy` shifts by button position in the selected track's instrument (visual order via `COMPOSER_NOTE_POSITIONS`, which stays — it's rendering-only).

## 6. Legacy conversion

- **Frozen tables module** `$core/Songs/legacyNoteTables.ts`: for *both* games (deliberate carve-out from the `$game`-only import rule — tiny, numeric, DOM-free, frozen forever), per legacy instrument name, the v3-era `index → id` array. Unknown instrument names fall back to the game's default instrument table.
- **Composed v1–v3 → v4**: existing deserializers run unchanged (v1 layer-string reversal quirk and all others preserved) up to the old in-memory shape, then: for each column, for each note, for each set layer bit *i* → track *i* gets `[column, table(instruments[i].name)[note.index]]`. Tempo changers copy into `columnTempos`.
- **Recorded v1–v2 → v3**: same per-note mapping (v1 decimal-read-as-hex quirk preserved); `durationMs` absent.
- **Old (pre-versioned) format**: existing path → recorded/composed → convert as above.
- **Cross-game import** (appName mismatch, explicit user action) has two paths:
  - **Legacy files** (≤v3 composed, ≤v2 recorded, v1 vsrg): the frozen `importPositions` index remap applies *inside* deserialization, before id-ification, with the historic roster behavior (composed: reset to target default with icon cycle; recorded: instruments untouched — they fall back to the default at runtime; vsrg: DunDun, appName-preservation quirk kept). Byte-reproduces the old converter (fixture-locked); for default instruments the remap equals a uniform -12 id shift.
  - **New-format files** (v4/v3/vsrg-v2): ids carry over; roster swaps to the target default; only out-of-range ids octave-fold (Sky 84 → 72); fold collisions dedupe; ids landing on gaps stay stranded — visible, not mangled.
- **Sky old-format export**: `toOldFormat()` reverse-maps id → default-15-key index; unmappable ids are dropped and the export UI shows the dropped count.

## 7. Instrument & game definition changes

- `InstrumentDataType`: `midiNotes` → `noteIds` (semantic promotion); new optional
  `sustain?: { releaseS: number; loop: { start: number; end: number }; noteLoops?: ({ start: number; end: number } | null)[] }`
  — per-instrument default loop region with per-note overrides (samples can be authored with normalized loop points so the default usually suffices). Absence of `sustain` = today's one-shot instrument. No existing instrument gains the field in this refactor.
- **MIDI file import table** (`midi.mapToNote`): values change meaning from `[index, accidental]` to `[id, accidental]` (for Genshin this makes the table near-identity). The `MidiNote.fromMidi` octave-clamp bug (±8) is **fixed to ±12** — import is lossy authoring, not a serialization compat surface, and this is the moment to fix it (deliberate behavior change, release-noted).
- **MIDI hardware presets** stay button-addressed (`preset.notes[button] = physical midi note`) — hardware mapping is physically per-button; resolution is physical note → button → id.

## 8. Audio engine: `Voice`

Raw Web Audio; the current graph (per-instrument `GainNode` → optional shared convolver reverb → destination, `AudioRecorder` tap) is untouched.

```ts
class Voice {
  private source: AudioBufferSourceNode   // loop/loopStart/loopEnd set for sustaining instruments
  private gain: GainNode                  // per-voice, feeds the instrument's volumeNode
  release(): void                         // linearRamp gain→0 over releaseS, then stop+disconnect
}
```

- `Instrument` API becomes id-addressed: `play(id, {pitch, delay})` (one-shot, current path) and `startVoice(id, {pitch}) → Voice` (sustaining). UI resolves buttons; the engine never sees them.
- Active voices are held in a registry keyed `(trackIndex, id)` — keyboard `keyup`, touch lift, MIDI note-off, or a playback tick reaching a note's end column calls `release()`. Composed playback schedules releases by tick (not precomputed ms), so tempo edits during playback stay correct.
- Voice cap per instrument (~32) with oldest-first stealing guards mobile.
- Live input: `keydown` starts / `keyup` releases with OS auto-repeat filtered; touch press/lift including drag-off; `MIDIProvider` gains note-off handling (`0x80` and running-status zero-velocity `0x90`).
- Recording captures press→release durations on **every** instrument.

## 9. Per-page changes

- **Player**: hold-to-sustain wiring; recordings store durations; practice/approaching-notes render tails for spanned notes.
- **Composer**: per-track model; long-press duration popover (§2); held-state on keyboard buttons; `ComposerRenderer` draws tails through covered columns (reuse the VSRG trail-sprite approach) and stranded-note markers.
- **Zen keyboard**: sustain comes free from the live-input layer.
- **VSRG**: `hitObject.notes` hold ids; player holds start a `Voice` and release at `timestamp + holdDuration` when the track instrument sustains (scoring unchanged).
- **Sheet visualizer**: held notes get a duration indication; `VisualSong` adapts to tracks (merged view preserved).
- **MIDI**: import maps real durations → column spans (round, min 1); export writes real durations (composed span → seconds via summed column times; recorded ms), replacing the hardcoded `duration: 1`.
- **Conversions**: composed→recorded turns spans into ms via the tempo map; recorded→composed rounds ms into spans (min 1).

## 10. Verification

1. **Golden fixtures, extended**: existing legacy fixtures (every importable version, both games) must still deserialize; new committed fixtures assert legacy → v4/v3 conversion output (including mixed-id-space layered songs, the v1 quirks, cross-game folding Sky 84→72) and v4/v3 serialize→deserialize round-trip byte-identical. Sky old-format export snapshots incl. a dropped-notes case.
2. **Engine tests**: `Voice` under `OfflineAudioContext` — loop region honored, release ramp length, no stuck voices after release-during-delay.
3. **Manual checklist per page**, both games, mobile + desktop; explicit audio A/B: existing instruments must sound identical.
4. **Final audit**: `IMPORT_NOTE_POSITIONS` deleted; no layout-index semantics outside button derivation and legacy deserializers; `NoteLayer` referenced only by legacy paths.

## 11. Phases

Each lands green before the next.

- **A — Model + conversion (no UI)**: `legacyNoteTables`, new classes, v4/v3/VSRG-v2 serializers, converters, full fixture suite.
- **B — Engine + live input**: `Voice`, instrument `sustain` metadata plumbing, keyup/touch/MIDI-note-off, player + zen sustain, recording durations.
- **C — Composer**: per-track port, duration popover, canvas tails, stranded markers, occupancy rule.
- **D — Playback surfaces**: recorded/composed playback releases, practice-mode tails, sheet visualizer.
- **E — VSRG**: ids + hold-driven sustain.
- **F — MIDI + compat**: import/export durations, Sky old-format export rework, final audit.

## 12. Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Conversion drift corrupts songs | Fixture-first (Phase A); mixed-id-space and quirk cases explicitly covered. |
| Composer canvas perf with tails | Reuse VSRG trail sprites + existing texture caches; tails are per visible column, not per ms. |
| Loop points sound bad | Per-note overrides; author samples with normalized loop regions; audition during Phase B. |
| File-size growth for doubled melodies | Sparse per-track tuples; measure on real library songs in Phase A; acceptable regression is small single-digit %. |
| Cross-game behavior regression | Fold rule fixture-locked to reproduce old remap outcomes. |
| Stuck voices (missed keyup: tab blur, touch cancel) | Global blur/visibilitychange releases all voices; voice registry is the single source of truth. |

## 13. Out of scope

- True sounding-pitch data or pitch-true MIDI export (ids stay nominal).
- tone.js (post-ship experiment branch), synthesis-based instruments.
- Sustain for any existing instrument; velocity/dynamics; runtime game switching; a third game's content.
