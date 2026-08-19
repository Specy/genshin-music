# Absolute Note Numbers + Basepoints — Design

2026-08-19. Implements [ADR-0007](../../adr/0007-absolute-note-numbers-basepoint.md); supersedes the note-identity half of the 2026-08-03 universal-song-format design (its per-track/span/sustain model is untouched). Vocabulary per CONTEXT.md: Note Number, Nominal Id, Basepoint, Pitched/Assigned Button. Config audit COMPLETE (in-game screenshots 2026-08-19): Vintage-Lyre data correct as shipped; Ukulele + LingeringEuphonia top rows are chord rows (C, Dm, Em, F, G, Am, G7).

## 1. Goal

Every note in every format stores one absolute MIDI Note Number on a shared axis (Basepoint included). Pitch settings become Basepoints — view offsets that rewrite notes when changed. Rendering architecture becomes one axis + a view function per surface; the id→button→id round-trips and MIDI snap tables retire. Current UX is preserved exactly: compressed composer view, Lyre→Vintage-Lyre re-flavoring, cross-game conversion, import snapping.

## 2. Decisions (locked during grilling, ADR-0007)

- Identity: `number = sounding(button) + offset(effectivePitch)` for Pitched Buttons; `number = nominal(button) + offset` for Assigned Buttons (`pitched: false`: percussion, SFX, chord strums).
- Basepoint change (song or per-track override) rewrites ALL notes of affected tracks by the delta — stranded included; a real, undoable edit.
- Instrument swap = button-preserving rewrite via nominal correspondence; stranded notes pass through unchanged and may un-strand.
- Cross-game conversion stays sound-preserving (carry number, octave-fold into target range, strand on gaps).
- Playback never rewrites; stranded = skipped (exactly today).
- Off-scale notes (virtual nominal between grid rows) render nearest-row + accidental hint, selectable/deletable.
- Scope: composed v4→5, recorded v3→4, vsrg v2→3; lazy upgrade on load; serialized SHAPES unchanged — only the meaning of the number and the version change.
- Sounding pitch derived from `baseNote` at registry build (nearest chromatic match to nominal, ±6 window, validated); no new authored pitch data.
- MIDI import keeps white-key snapping (importer policy, upgradeable later); export writes stored numbers (transposition-honest for the first time).
- `toOldFormat` export deleted (kept commented); old-format import stays.

## 3. Current state being replaced

Songs store Nominal Ids pre-transposition; pitch is a runtime playback-rate label resolved per press (`instrumentData.pitch || song.pitch`, `getPitchChanger` = 2^(k/12), k = PITCHES index 0..11). `baseNote` is display-only. Changing pitch or instrument rewrites nothing. `noteIds.ts` resolves id↔button in nominal space only.

## 4. Note model — the formulas

- `offset(pitch) = PITCH_TO_INDEX.get(pitch)` (0..11, always upward — unchanged).
- `effectivePitch(track) = track.instrument.pitch || song.pitch` (both survive; unchanged).
- Per instrument, per button `b`:
  `sounding(b) = pitched(b) ? nearestChromaticMatch(nominal(b), pitchClass(baseNote(b))) : nominal(b)`.
  Registry errors: pitched button whose `baseNote` isn't a bare pitch class; the exact ±6 tritone tie (a pitch class repeats every 12 semitones, so a nearest match always exists within 6 — the tie is the only reachable failure; Phase A finding); duplicate sounding values among one instrument's pitched buttons.
- Entry (keyboard press / composer toggle / recording): `number = sounding(b) + offset(effectivePitch)`.
- Playback resolution: `b = soundingTable.indexOf(number − offset)`; miss → stranded, skip; `rate = getPitchChanger(effectivePitch)` — audio output byte-identical to today for every migrated song.
- Grid row (compressed view): resolve `b`; row = `canonicalSlot(nominal(b))`. Stranded: `virtual = number − offset`; if `virtual` is a canonical id → that row + stranded mark (today's ADR-0004 fallback preserved); else nearest canonical id by absolute distance (tie: lower) + stranded mark + ♯/♭ hint by sign.
- Basepoint rewrite: `delta = offset(new) − offset(old)`; every note of affected tracks `number += delta`.
- Swap rewrite (old instrument → new): `b = soundingIndexOld(number − offset)`; `b === -1` → unchanged; else `nom = nominalOld(b)`; `b2 = nominalIndexNew(nom)`; `b2 === -1` → unchanged (now stranded); else `number = soundingNew(b2) + offset`.
- Migration (per track, old format → memory): `b = nominalIndex(instr, id)`; `number = (b === -1 ? id : sounding(b)) + offset(effectivePitch)`. Stranded best-effort keeps relative position.

## 5. Serialized formats

Tuple shapes are IDENTICAL to v4/v3/v2 — `[column, number, span?]`, `[number, timeMs, durationMs?]`, vsrg `notes: number[]` — with `version` bumped to 5/4/3 and numbers now absolute. `SongService.parseSong` dispatch: composed `4|5`, recorded `3|4`, vsrg `2|3` route to the new-format deserializer (v4/v3/v2 inputs migrate inside it); cross-game `toOtherGame` branches update the same way. Round-trip of a new-version file is byte-stable.

## 6. Config & registry

- `schema.ts`: optional `pitched?: false` on note structs (absent = true); when `pitched: false`, `baseNote` becomes free display text ("Dm", "G7", "").
- `registry.ts`: derive + validate `sounding` per note (rules in §4); expose it on resolved notes; keep nominal untouched.
- Data fixes (land WITH the flag, not before — `baseNote` feeds `NOTE_SCALE` lookups today): `ukulele-21` top row (nominals 72–83) → `pitched: false`, labels `C, Dm, Em, F, G, Am, G7` (current Db/Eb/Ab were copy-paste artifacts from the VL row; harmless because assigned identity ignores labels). Applies to Ukulele AND LingeringEuphonia. Vintage-Lyre untouched. Percussion/SFX flags optional (numerically irrelevant; set for hygiene).
- Label rendering: `getNoteText`/glyph paths fall back to the verbatim label when `baseNote` isn't in `NOTE_SCALE` (chord labels do not transpose with Basepoint — accepted simplification).

## 7. Resolution & rewrite machinery

`noteIds.ts` grows the Basepoint-aware API (nominal helpers survive for swaps/grid/legacy): sounding tables + reverse maps (cached like today's), `numberToButton(instr, pitch, n)`, `buttonToNumber`, `gridRowForNumber(instr, pitch, n) → {row, stranded, accidental}`, `resolvePlayerNoteButtons(notes, instruments, songPitch, displayInstrument)`. Pure transform functions beside it: `basepointDelta`, `rewriteForBasepoint`, `rewriteForSwap`, `migrateTrackNotes` — table-test-driven before anything is wired (VL asymmetric octaves, chord rows, strand pass-through, un-strand, validation failures).

## 8. Per-surface changes

- **Instrument engine** (`Instrument.svelte.ts`, ADR-0005 API): `play`/`pressNote(number, pitch)` resolve via sounding+offset internally; `getNoteOfId` → number-based. `AudioPlayer` unchanged (already passes effective pitch).
- **ComposedSong**: deserialize/serialize v5 + migration; `toRecordedSong` copies numbers (span→ms logic untouched); `toOtherGame` in number space; new mutators `applyBasepointChange(scope, oldPitch, newPitch)` and swap-rewrite inside `setInstrument`-adjacent flow — both `#touchAllColumns` + `#bumpStructure` + reactivePublish rows.
- **RecordedSong**: v4 + migration; `toComposedSong` copies numbers; `toMidi` exports stored numbers; legacy v1/v2 chain appends the nominal→sounding step after the frozen-table decode. `Recording.addNote` captures numbers (press already knows button + pitch).
- **VsrgSong**: v3 + migration; keyboard press call sites (`buttonToNoteId` in vsrg-composer) switch to numbers; playback already routes through the engine.
- **Composer.svelte**: `handleSettingChange('pitch')` → basepoint rewrite (+ existing ADR-0006 `resyncPlayback`); per-layer pitch override path (line ~418) likewise; `setInstrument` path invokes swap rewrite; `playSound` paths pass numbers; MidiParser pitch funnel (line ~628) joins the rewrite path. **Undo**: entries become `{columns, pitch, instruments}` compound snapshots so rewrites undo atomically (today `NoteColumn[][]` only).
- **ComposerRenderer / ComposerKeyboard / minimap / SongRow**: rows via `gridRowForNumber`; `computeButtonLayerStatuses` compares in number space. Per-track row LUT cached by `(instrumentName, effectivePitch)`, invalidated by the existing roster/pitch signals — keeps per-draw cost at today's level.
- **Player** (`PlayerKeyboard`, practice/approach, `PlayerPagesRenderer`/`SheetFrame`, `VisualSong`): `resolvePlayerNoteButtons` gains pitch args; `displayButton`/`keyboardButton` semantics unchanged.
- **MIDI import**: same snapped output, now emitting numbers (`white-key nominal + offset(import pitch)`); fixture-locked byte-parity.

## 9. Migration & legacy chains

Lazy, in-deserializer, like every prior bump: v4/v3/v2 in → memory in numbers → save writes v5/v4/v3. Adjudicated (Phase B finding): a stranded id whose best-effort number lands on a tuned instrument's Sounding Pitch UN-STRANDS at migration and starts sounding — accepted as ADR-0007's promised fidelity gain (the number is the pitch the file always claimed), pinned in noteNumberTransforms.test.ts; the parity fixtures deliberately keep stranded notes off tuned tracks so the safety net stays exact. Legacy (composed ≤3, recorded ≤2, vsrg 1, oldFormat): existing frozen-table decode to nominal, then §4 migration formula. `validateBreakpoints`/`normalizeSpans` unchanged (same-number keys replace same-id keys — semantics identical per track).

## 10. Verification

- Unit tables for every §4 formula, both games (VL octave asymmetry, chord rows, ±6 validation, strand pass-through/un-strand, tie cases).
- Migration goldens: every existing v4/v3/v2 fixture → new-version golden, both games; new-version round-trip byte-stable; `noAliasing`/`noProxies` cover new serializers.
- **Audio parity suite (the safety net)**: pre-flip, record `(button, timeMs, rate)` event streams for the golden fixtures (incl. a VL song and a per-track-override song) via the audioPlayerDiffing harness; post-flip streams must be identical.
- reactivePublish rows for the new mutators; oldFormatImport unchanged; midiRoundTrip goldens updated deliberately (export honesty is a wanted diff — note it in the fixture commit).
- Browser smoke per the browser-driving recipe: composer edit/play/save, player practice, vsrg, ukulele chord labels.

## 11. Phases (each ends green)

- **A — Config & labels**: §6 complete; chord names display; zero format/runtime change.
- **B — Machinery**: §7 pure module + full test tables; unwired. Pre-flip audio-parity recordings captured here.
- **C — The Flip (atomic)**: C1 formats+converters (three classes + parseSong + legacy chains + goldens); C2 engine + audio call paths; C3 composer surfaces; C4 player/sheet/vsrg surfaces; C5 rewrites (basepoint, swap, compound undo, transport resync); C6 MIDI I/O; C7 parity suite green.
- **D — Off-scale UX**: nearest-row + accidental mark in renderer/minimap; un-strand flows verified end-to-end.
- **E — Deletions & docs**: `toOldFormat`+`legacyColumnsView`+`countOldFormatDroppedNotes` commented out; `MIDI_MAP_TO_NOTE`/`NOTE_MAP_TO_MIDI` → arithmetic; dead nominal-only helpers pruned; changelog (+ third-party `version` warning), i18n, memory/docs sync.

## 12. Risks & mitigations

- **Silent audio drift on tuned instruments** (a consumer missed by the flip): parity suite (§10) pinned before C starts.
- **Undo atomicity**: compound snapshots in C5; test = pitch change → undo restores notes AND pitch together.
- **Renderer cost** of per-note resolution: cached row LUTs (§8); ComposerRenderer repaint keys unchanged.
- **Mid-playback rewrites**: basepoint/swap rewrite is a structural mutation → existing ADR-0006 resync-on-mutation retracts and recommits; verify committed-horizon behavior in C5.
- **Third-party readers** ignoring `version` misread numbers as nominals: changelog callout; nothing else possible.
- **Chord-label fallback** missing a path (`NOTE_SCALE[label]`): Phase A grep-audit of every `baseNote` consumer.

## 13. Out of scope

Pure-view (piano-roll) composer — enabled by this design, built later. Accidental-true MIDI import + auto-Basepoint detection (deferred in ADR-0007). Sound-preserving swap as a user-facing option. Authored chord content (`sounds: [...]`). Player adoption of ComposerTransport.
