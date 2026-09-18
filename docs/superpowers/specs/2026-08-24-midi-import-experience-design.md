# MIDI Import Experience — Design

Status: SPEC (2026-08-24). Decided in ADR-0012; the vocabulary it introduces —
Addressable Span, Suggested Instrument, and the MIDI clause on Stranded Note — is in
CONTEXT.md. This document is the build plan.

## 1. The problems, precisely

Three defects, each with its own cause.

**Edits made while the importer is open are destroyed.** `convertMidi` builds a whole new
`ComposedSong` and installs it through `loadSong` on every settings change — a bpm keystroke,
an offset step, a checkbox — so anything authored in between is gone
([MidiParser.svelte:292](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)
through [Composer.svelte:1845](../../../src/lib/components/pages/Composer/Composer.svelte)).
The panel's own base-pitch selector is worse than lossy: it calls the composer's pitch funnel,
which rewrites every note of the currently loaded song, counts a change and can autosave it,
all before any conversion has run
([MidiParser.svelte:362](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)
→ [Composer.svelte:755](../../../src/lib/components/pages/Composer/Composer.svelte)).

**The import does not choose what the song is played on.** Track _i_ lands on layer _i_ of the
open song, clamped to its length
([midiImport.ts:203](../../../src/lib/core/Songs/midiImport.ts)), so timbre is an accident of
the previous edit. Worse, two rosters are in play at once: the conversion reads the file's
metadata roster when the file is ours and the open song's otherwise, while the per-track
dropdown always lists the open song's
([MidiParser.svelte:99](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)
vs [MidiParser.svelte:453](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)).
A metadata file with more layers than the open song therefore renders a `<select>` with no
matching option, and any touch of it silently reassigns the track into the wrong roster.

**What survives an import depends on the wrong range.** A note outside the Song Grid's
`MIDI_BOUNDS` is dropped; a note inside the grid that the landing instrument has no button for
is kept, silent and dimmed. The two ranges are unrelated, so the rule reads as arbitrary — and
on Sky's gapped instruments (Bells' 8 notes, the SFX sets' 6) the second case is most of the
track.

## 2. Vocabulary

Three CONTEXT.md entries carry this work and are already written:

- **Addressable Span** — the band the game can address at all, from the lowest Sounding Pitch
  any instrument has at Basepoint C up to the highest lifted by the highest Basepoint. Genshin
  48–94, Sky 60–95. Nothing outside it is playable by any instrument at any Basepoint.
- **Suggested Instrument** — the four-tier General-MIDI-derived proposal the importer
  pre-selects per track (§5).
- **Stranded Note** — unchanged in meaning; amended to record that MIDI import is the one path
  that _removes_ stranded notes rather than passing them through, and that the panel calls them
  out-of-range notes.

The panel says "out of range" and the glossary says Stranded Note deliberately: "stranded" is
the app's word for the condition, "out of range" is what a user importing a file expects the
toggle to be called. §7.2 keeps the two from drifting in the counters.

## 3. The Import Session and the lock

### 3.1 What is locked

While the importer is open, everything that writes to the song or its roster is refused:

- **Note entry/removal** — on-screen keyboard, physical note keys, MIDI note-on/off, Pro View
  cell tap, canvas long-press and its drag, the keyless long-press popover, sustain recording.
- **Column structure** — the three `CanvasTool` buttons, every `ComposerTools` action
  (delete/paste/erase/move notes), breakpoints, tempo changers (buttons _and_ the `Digit1..N`
  bindings registered on `KeyboardProvider`).
- **Roster** — add, remove, edit (a swap or a per-layer Basepoint change rewrites notes),
  merge, reorder.
- **Undo.**
- **Song-level settings the importer owns** — bpm, Basepoint, reverb, the three `songSetting`
  keys written through `handleSettingChange`.

Explicitly still live: playback, column and layer selection, canvas scroll/zoom, View Lock,
opening the tools panel, save/download/export.

### 3.2 Enforcement

One `$derived` flag, `songLocked`, in `Composer.svelte`. It is checked **inside the mutating
functions**, not only passed to components — roughly half the note-entry surface never touches
a control a `disabled` prop could block: the physical-key listener
([Composer.svelte:404](../../../src/lib/components/pages/Composer/Composer.svelte)), the MIDI
handler ([Composer.svelte:651](../../../src/lib/components/pages/Composer/Composer.svelte)),
the composer shortcuts for add/remove column
([Composer.svelte:597](../../../src/lib/components/pages/Composer/Composer.svelte)), and the
four Pro View canvas callbacks, one of which (`onProCellLongPressDrag`) is already passed
through unguarded where its siblings are latched
([ComposerCanvas.svelte:280](../../../src/lib/components/pages/Composer/ComposerCanvas.svelte)).

The same flag is threaded to `ComposerKeyboard`, `ComposerCanvas`, `CanvasTool`,
`ComposerTempoChangers`, `ComposerTools`, `InstrumentControls`, `InstrumentSettingsPopup` and
`ComposerDurationPopover` for the disabled rendering. Two existing patterns to copy rather than
invent: `ComposerTools`' per-button `disabled`, and `ComposerCanvas`' `overlayDismissesClicks`
latch for the canvas side.

A locked keyboard or MIDI press still **sounds** — it takes the audition path and returns before
the write. One case needs stating: `startSustainRecording` _adds_ the note as part of beginning
to sound it on a sustaining track while playing
([Composer.svelte:1194](../../../src/lib/components/pages/Composer/Composer.svelte)); under the
lock that press degrades to a plain audition with no recording started.

### 3.3 Gestures already in flight

Opening the importer must settle the composer, not merely refuse the next input. A live
Duration Hold turns an ordinary selection move — which stays unlocked — into a span write
([Composer.svelte:2070](../../../src/lib/components/pages/Composer/Composer.svelte) →
[Composer.svelte:1651](../../../src/lib/components/pages/Composer/Composer.svelte)), and
`endSustainRecording` writes a final `setNoteSpan` from paths as indirect as `pagehide`
([Composer.svelte:1272](../../../src/lib/components/pages/Composer/Composer.svelte)). So
`changeMidiVisibility(true)` closes the duration popover, cancels any hold, and ends every
sustain recording _before_ the flag flips. Recordings settle rather than abandon: the note was
authored before the lock existed.

### 3.4 Lifecycle

**Opening.** If the open song has unsaved changes, ask once — save / discard / cancel, with
cancel aborting the open so nothing is lost. Nothing is owed for an untouched empty `Untitled`
song. This is a _relocation_ of the prompt that today lives inside `loadSong`
([Composer.svelte:1825](../../../src/lib/components/pages/Composer/Composer.svelte)), and the
half that matters is the branch above it: `confirm = settings.autosave.value && song.name !==
'Untitled'` saves silently with no prompt at all.

**Converting.** `loadSong` gains a preview flag that bypasses the whole save/prompt block. The
question was asked at open; a preview must never re-enter it, and must never autosave.

**Closing.** The preview stays as the working song — the model is live preview, not staged
commit. Because `loadSong` sets `changes = 0`, a finished import is currently discarded
silently on navigation ([Composer.svelte:2023](../../../src/lib/components/pages/Composer/Composer.svelte)
returns true immediately); closing the importer therefore marks the song dirty so
`prepareToLeave` prompts like any other unsaved work.

**What closes it.** Loading another song from the menu and `createNewSong` close it explicitly,
at those call sites. Not inside `loadSong`: its existing conditional close (`if
(songToLoad.id && song.id === null)`,
[Composer.svelte:1849](../../../src/lib/components/pages/Composer/Composer.svelte)) both misses
the saved-song case and, if made unconditional, would close the importer that the
`?songId=X&showMidi=true` route just opened — that mount-time load runs while `song.id` is
still null.

## 4. The roster

### 4.1 Construction

The generated song's `instruments` is built from the panel alone: one `InstrumentData` per
**selected** track, in file order, carrying that track's chosen instrument and Basepoint
override. `data.instruments` is removed from `MidiParser`'s props;
`MidiImportOptions.layers` is derived from the selections rather than from the open song.
`defaultLayerForTrack` is deleted with its tests.

`MidiImportTrack.layer` becomes the index of the track within the _selected_ set, which is the
index of the layer being built for it — an identity mapping, retained because
`importMidiTracks`' internals (`pitchOf`, `nameOf`, `canHoldOn`) are keyed by it.

### 4.2 Metadata

For a file of ours, `decodeMidiMetadata` supplies the per-layer `InstrumentData`; each track's
instrument and Basepoint selectors are seeded from it, and `volume`, `alias`, `icon`, `muted`,
`solo` and `reverbOverride` ride onto the generated layer. Tracks it does not cover fall back
to §5.

**The index is the ORIGINAL midi track index, not the selected-set index.** Export writes one
track per layer including silent ones
([RecordedSong.ts:604](../../../src/lib/core/Songs/RecordedSong.ts)), while the panel filters
noteless tracks out of its list
([MidiParser.svelte:220](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)),
so the lookup is `metadata.instruments[originalIndex]`. This reasoning currently exists only in
`defaultLayerForTrack`'s docstring, which §4.1 deletes — it is re-homed here and at the lookup.

### 4.3 Alias

The generated layer takes the MIDI track's name as its `alias`, with two corrections, because
blind adoption corrupts our own round trip:

- `ComposedSong.toMidi` writes `"<Pitch> | <label>"` when the layer has a Basepoint override
  ([ComposedSong.svelte.ts:1671](../../../src/lib/core/Songs/ComposedSong.svelte.ts)). Parse
  that shape: the label becomes the alias, and — when metadata is absent, i.e. a stripped
  export — the pitch seeds that track's Basepoint selector.
- The panel synthesises `Track n.N` for unnamed tracks
  ([MidiParser.svelte:230](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)).
  That is display text, not a name the file carried; it is never adopted as an alias, and the
  layer falls back to its instrument label as today.

`RecordedSong.toMidi` writes the GM patch name as the track name for single-track exports
([RecordedSong.ts:630](../../../src/lib/core/Songs/RecordedSong.ts)) — an alias of
`"pizzicato strings"` is accepted; it is genuinely what the file says.

### 4.4 Cap, and the empty roster

`BASE_LAYER_LIMIT` is 64 with BigInt, 30 without
([sharedConfig.ts:14](../../../src/lib/core/sharedConfig.ts)) — a runtime-capability value, so
the message names the number rather than hard-coding it. On parse, the first _N_ note-bearing
tracks are selected and the rest arrive deselected with one warning naming the limit;
selecting past the cap is refused with the same warning. `defaultLayerForTrack`'s clamp is what
absorbs this today.

Deselecting every track now yields an empty roster, which was previously unreachable.
`convertMidi` returns early on empty columns before `loadSong`
([MidiParser.svelte:304](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)),
but only by accident — `playSound` dereferences `song.instruments[layer].pitch` unguarded
([Composer.svelte:892](../../../src/lib/components/pages/Composer/Composer.svelte)). Guard
explicitly: an empty selection converts to nothing and warns, and no song is installed.

### 4.5 The re-index reload

`ComposerInstrumentSynchronizer.syncSlot` reuses an engine only when the slot's **name** matches
([ComposerInstrumentSynchronizer.ts:54](../../../src/lib/components/pages/Composer/ComposerInstrumentSynchronizer.ts));
otherwise it disconnects, disposes and refetches samples. With an index-keyed roster,
deselecting track 0 of 5 shifts four slots down and reloads four instruments — and
`syncInstruments` runs at the end of every `loadSong`, i.e. on every importer keystroke.

Fix at the synchronizer: reuse by **name across slots** (a small pool keyed by instrument name,
drained as slots claim engines) instead of by slot index. This is correct independently of this
work — `switchLayerPosition` and `removeInstrument` shift indices for the same reason and pay
the same cost today.

## 5. The Suggested Instrument

### 5.1 The tiers

Per track, in order, first hit wins:

1. **Patch name.** `track.instrument.name` matched case-insensitively against each instrument's
   `midiName`.
2. **Family.** `track.instrument.family` matched against each instrument's `family`.
3. **Adjacency.** The first family in that family's preference order (§5.2) for which this game
   has any instrument.
4. **Default.** `game.instruments.list[0]`.

Ties within a tier resolve to the earliest instrument in `game.instruments.list`, which is
authored melody-first and SFX-last in both games. Nothing here reads the track's notes — the
pre-selection must not move when the offset or a Basepoint does.

### 5.2 The adjacency order

Game-independent — it is a statement about General MIDI, not about our rosters. Each entry
begins with itself so tiers 2 and 3 are one lookup:

| GM family            | preference order                                |
| -------------------- | ----------------------------------------------- |
| piano                | piano, chromatic percussion, guitar, strings    |
| chromatic percussion | chromatic percussion, piano, percussive         |
| organ                | organ, piano, reed, ensemble                    |
| guitar               | guitar, strings, piano                          |
| bass                 | bass, guitar, strings, piano                    |
| strings              | strings, ensemble, guitar, piano                |
| ensemble             | ensemble, strings, pipe, piano                  |
| brass                | brass, reed, pipe, ensemble                     |
| reed                 | reed, pipe, brass, ensemble                     |
| pipe                 | pipe, reed, ensemble, brass                     |
| synth lead           | synth lead, pipe, reed, piano                   |
| synth pad            | synth pad, ensemble, strings, piano             |
| synth effects        | synth effects, synth pad, ensemble, piano       |
| world                | world, guitar, strings, pipe, percussive        |
| percussive           | percussive, chromatic percussion, piano         |
| sound effects        | sound effects, synth effects, percussive        |
| drums                | percussive, sound effects, chromatic percussion |

Genshin declares only four of the sixteen families, so twelve of them reach it through this
table — it is load-bearing, not a garnish. Resolved answers, verified against both rosters with
the §5.4 corrections applied:

| family               | Sky           | Genshin            |
| -------------------- | ------------- | ------------------ |
| piano                | Piano         | LeapingSpiritPiano |
| chromatic percussion | Xylophone     | LeapingSpiritPiano |
| organ                | Piano         | LeapingSpiritPiano |
| guitar               | Contrabass    | Lyre               |
| bass                 | SFX_BassSynth | Lyre               |
| strings              | Cello         | Lyre               |
| ensemble             | Aurora        | Lyre               |
| brass                | Horn          | NightwindHorn      |
| reed                 | Saxophone     | NightwindHorn      |
| pipe                 | Flute         | NightwindHorn      |
| synth lead           | SFX_SineSynth | LeapingSpiritPiano |
| synth pad            | Aurora        | Lyre               |
| synth effects        | Aurora        | LeapingSpiritPiano |
| world                | Contrabass    | Lyre               |
| percussive           | Drum          | DunDun             |
| sound effects        | Drum          | DunDun             |
| drums                | Drum          | DunDun             |

Two of these deserve their reasoning recorded. `bass` → SFX_BassSynth looks like an SFX leaking
into a melodic answer and is not: its notes are the `synth-8` preset, fully **pitched**, and it
is literally a bass synth. And `guitar` → Contrabass is reached only by the guitar patches with
no exact `midiName` match (overdriven, distortion, jazz, muted, harmonics) — see §5.4 for why
retagging Contrabass is not the fix.

### 5.3 Percussion tracks

`@tonejs/midi` reports `family` as the literal `"drums"` for any channel-9 track — not one of
the sixteen GM families — and reads `name` from a nine-entry sparse kit map that is `undefined`
for most patch numbers
(`@tonejs/midi`'s `Instrument.js`, the `family` and `name` getters). Tiers 1 and 2 miss
it entirely, and drum tracks are the commonest non-melodic track in real files. `drums` is
therefore a first-class row of the §5.2 table, and every tier tolerates an absent patch name.

### 5.4 Config corrections

Two independent repairs; the fields do different jobs and are **not** required to agree.

**`midiName` is the export program number.** Six instruments declare a string General MIDI does
not have, so `@tonejs/midi`'s name setter takes `indexOf`, gets `-1`, assigns nothing, and the
track exports as patch 0 — an acoustic grand piano. A live export bug, fixed:

| instrument         | game    | declared         | corrected              |
| ------------------ | ------- | ---------------- | ---------------------- |
| SFX_BassSynth      | Sky     | `Electric Bass`  | `synth bass 1`         |
| SFX_ChimeSynth     | Sky     | `Bellchime`      | `tubular bells`        |
| SFX_SineSynth      | Sky     | `sine`           | `lead 1 (square)`      |
| SFX_TR-909         | Sky     | `Roland TR-808`  | `synth drum`           |
| HarmonicKey        | Genshin | `acoustic grand` | `acoustic grand piano` |
| LeapingSpiritPiano | Genshin | `acoustic grand` | `acoustic grand piano` |

**`family` is the suggestion key.** Five instruments declare a word that is not a GM family:
Aurora `vocal` → `ensemble`, SFX_BassSynth `Bass` → `bass`, SFX_ChimeSynth and SFX_TR-909
`percussion` → `percussive`, SFX_SineSynth `synth` → `synth lead`.

Four further instruments declare a _valid_ family that disagrees with the family their patch
number implies — Contrabass (`guitar` vs strings), Harmonica (`reed` vs organ), SmallBell
(`chromatic percussion` vs percussive), Aurora (post-correction, consistent). **These are left
as authored.** GM files harmonica under _organ_ through an accident of its block layout, and a
curated `reed` is the better key for choosing an instrument by ear. Contrabass was considered
for correction to `strings` and rejected on measurement: it fixes `guitar` → Guitar but breaks
`strings` → Contrabass, because roster order puts Contrabass ahead of Cello. One wrong answer
traded for another.

Add a registry assertion that `midiName` is a GM patch name and `family` a GM family name
([registry.ts:284](../../../src/lib/games/registry.ts) asserts non-empty string only today), so
the drift cannot return. Note this is the first time `family` is read at runtime by anything.

## 6. Note policy

### 6.1 Order of operations

Per note, in this order:

1. **Transpose** — subtract the track's `localOffset ?? offset`, then the layer's effective
   Basepoint, putting the number into grid space.
2. **Octave fold** — up to `maxScaling` octaves, toward the chosen instrument's span (§6.4).
3. **Snap** — to the nearest scale degree at or below, extended periodically past
   `MIDI_BOUNDS` (§6.3).
4. **Accidental gate** — `includeAccidentals` drops the note if the pre-snap number was off the
   scale. Unchanged in meaning.
5. **Lift** — `nominalToNumber` through the layer's own instrument, back onto the absolute axis.
6. **Voiceability gate** — `includeOutOfRange` drops the note if the layer's instrument has no
   button for the resulting Note Number at its Basepoint (§6.2).
7. **Impossible floor** — drop unconditionally if the number is outside the Addressable Span.

The two gates are independent and in this order; an out-of-range accidental survives only if
both toggles are on.

### 6.2 The voiceability gate

`includeOutOfRange`, default `false`, rendered to the right of `includeAccidentals`. Off, a
note the track's instrument cannot voice at its Basepoint is excluded, so every note in an
imported song sounds. On, it is kept — a Stranded Note, drawn dimmed on the Compressed View's
nearest row and at its true height in the Pro View.

This is a **behaviour change** in both directions relative to today: notes outside `MIDI_BOUNDS`
were always dropped and can now be kept, and notes stranded on a gapped instrument were always
kept and are now dropped by default. `MIDI_BOUNDS` stops being a discard rule and goes back to
being only what it is — the Song Grid's own extent.

### 6.3 The extended snap

`snapMidiToGrid` returns `id: -1` outside `MIDI_BOUNDS`
([noteIds.ts:154](../../../src/lib/core/Songs/noteIds.ts)), which is exactly why out-of-bounds
notes cannot be kept today. Add a periodic variant: the grid's **pitch classes** repeat every
octave, so the nearest scale degree at or below any number is well defined arbitrarily far out.
`isAccidentalMidi` already answers correctly outside the bounds — it is pitch-class based and
its docstring says so — so step 4 needs no change.

Both shipped games have gapless white-key grids spanning exactly their `MIDI_BOUNDS` (Genshin
48–83, 21 ids; Sky 60–84, 15 ids), so the extension is a straight continuation for them and
well-defined for a game whose scale is not the white keys.

While here: `snapMidiToGrid` conflates "outside `MIDI_BOUNDS`" with "in bounds but below the
lowest canonical id" behind the same `-1`. Unreachable in both shipped games, and worth
separating as the periodic variant is written.

### 6.4 Octave folding

The `maxScaling` control aims at the chosen instrument's span rather than at `MIDI_BOUNDS`.
`foldNumberIntoRange` ([noteIds.ts:504](../../../src/lib/core/Songs/noteIds.ts)) already has the
right arithmetic — fold in sounding space, keep pitch class, let a note landing on a gap strand
— and is currently dead production code kept alive only by its test. It gains a step cap and
becomes the fold.

**The existing loop must be replaced, not retargeted.** `MidiNote.fromMidi` is two un-`else`d
`if`s run a fixed number of times with no convergence check
([SongClasses.ts:473](../../../src/lib/core/Songs/SongClasses.ts)). Against a narrow target it
oscillates: for a 60–65 instrument (Cymbals, FortuneDrum) a 78 becomes 66 at `maxScaling` 1 and
54 at `maxScaling` 4 — raising the user's own knob moves the note from above the range to below
it. Modulo arithmetic instead.

**The fold is best-effort, and the doc must say so.** Four Sky instruments span 0, 5, 5 and 9
semitones and six more span exactly 12, so no fold can always land inside them. The voiceability
gate is the decider; folding only improves the odds.

### 6.5 Suggest offset

One global offset still, but scored per track: for each selected track, each candidate shift is
judged against _that_ track's instrument at _that_ track's effective Basepoint, and the results
summed. This is the quantity §6.2 now removes, so the button minimises real note loss.

`suggestOffset`'s two-argument signature cannot express it — the caller currently pre-reduces
every note by one Basepoint and passes a flat union of playable nominals
([MidiParser.svelte:334](../../../src/lib/components/pages/Composer/MidiParser/MidiParser.svelte)).
It takes per-track groups instead. Stage 1 (the semitone, judged on accidentals) still sums to
one number, because accidental-ness is computed per track against that track's Basepoint before
summing. The six tests in `describe('suggestOffset')` move with the signature.

## 7. The panel

### 7.1 Layout

The per-track row keeps its shape — checkbox, name and note count, one control, the gear — with
the layer `<select>` replaced in place by `InstrumentSelect`, which already groups Sky's
`SFX_*` into an `<optgroup>`. The Basepoint selector joins local offset, max scaling and the
per-track stats behind the gear, as `PitchSelect` with its "use song pitch" option snippet —
the same pair `InstrumentSettingsPopup` already renders, so an imported layer is configured the
same way before and after import.

The lock notice is one line in the importer card, above the settings fieldset.

### 7.2 Counters

The three stats columns keep today's meanings; "out of range" now counts notes the chosen
instrument cannot voice, whether kept or dropped, and its ↑↓ split becomes instrument-relative
(above / below the instrument's reach). Notes unvoiceable _inside_ the reach — gaps, off-scale
— count in the total only, so the split need not sum to it.

Two accounting holes are fixed at the same time, because the new gate makes them worse:

- With `includeAccidentals` off there is no counter for the notes it drops, so
  `placed = total − outOfRange − merged − droppedAccidentals` has an unrecoverable term
  ([midiImport.ts:331](../../../src/lib/core/Songs/midiImport.ts)). Count them.
- A `NaN` midi lands in `outOfRange` but in neither direction of the split
  ([midiImport.ts:334](../../../src/lib/core/Songs/midiImport.ts)).

### 7.3 i18n

English only; the other eleven locales fall back per-key to English
(`fallbackLng: 'en'`), and `check:translations` reports rather than fails and is not in CI.
`midi_parser` is a nested block inside the `composer` namespace
([en/index.ts:724](../../../src/lib/i18n/locales/en/index.ts)), 27 keys, addressed as
`t('composer:midi_parser.<key>')`.

Reuse `common:instrument`, `common:pitch` and `instrument_settings:use_song_pitch` — all
translated in all eleven locales. New keys: the out-of-range toggle and its help text, and the
lock notice (there is no existing read-only/locked string anywhere in the English locale).

**Changed meanings need new keys, not edited strings.** `check:translations` compares key sets
only, so editing the English text of an existing key leaves all eleven locales silently
rendering the old meaning. `of_which_dont_fit` currently reads "Of which don't fit the
instrument" while counting _accidentals_ — which is now the sentence "out of range" means. It
gets a new key and the retired one is deleted so the checker reports the stale entries.

## 8. Code moves

`addressableSpan()` and `MAX_BASEPOINT_OFFSET` move from `proViewGeometry.ts` to
`$core/Songs/noteIds.ts`, beside the sounding tables they read; `proViewGeometry` imports them
back. Mechanically safe — no cycle, one import token — with documentation fallout that must
move too: `legacyConfig.ts`'s "PRO VIEW GEOMETRY CARVE-OUT" paragraph and `proViewGeometry.ts`'s
own header both justify a carve-out by that file value-importing `INSTRUMENTS_DATA` and
`PITCHES`, and after the move it imports neither. `test/proViewGeometry.test.ts` and
`test/proViewNotes.test.ts` import `addressableSpan` from the `$cmp` path and re-point.

While the file is open: `instrumentSupportsSustain` diverges from `Instrument.supportsSustain`
on an unknown name — it answers `false` where `Instrument` falls back to the default
instrument's capability, in the same code path that lifts notes _through_ the default
instrument's tables. Align it.

## 9. Tests

Four files break and are updated with the change:

- **`midiRoundTrip.test.ts`** — imports `defaultLayerForTrack`, so the module fails to link and
  all 25 tests die; its layer-mapping oracle is the deleted behaviour. Re-written against the
  roster-from-tracks rule, and it owns the `suggestOffset` block that moves with §6.5.
- **`midiParser.test.ts`** — its `importOnto` helper builds `MidiImportLayer`/`options.layers`,
  and its `MidiNote.fromMidi` rows are written against `MIDI_BOUNDS`.
- **`configSurface.test.ts`** — both assertions see §5.4. The living v2 golden is regenerated;
  the **frozen** v1 fixture is not, and takes an explicit expected-deviation entry in the form
  the existing `frozen.midiBounds.upper = 83` precedent establishes.
- **`conversion.test.ts`** — `test/fixtures/{Genshin,Sky}/midi-export.json` is a golden base64
  byte comparison containing the program-change bytes, so it flips for any corrected
  `midiName` on an exported instrument.

New coverage: the four suggestion tiers including the channel-9 branch and an `undefined` patch
name; the §5.2 table resolving over both rosters; the voiceability gate in both toggle states;
the Addressable Span floor; the periodic snap above and below the bounds; the modulo fold
against a sub-octave instrument (the 60–65 oscillation case is a regression test); per-track
`suggestOffset`. Everything runs under both `PUBLIC_GAME` values, as the suite already does.

`gameDefinitionConsistency.test.ts` and `gameConfig.test.ts` do not assert on `family` or
`midiName` and are unaffected; the other 74 files are untouched.

## 10. Out of scope

- Accidental-preserving import. ADR-0007 deferred it and it stays deferred — import policy
  remains white-key, and this work changes only which of those white keys survive.
- Per-track offset suggestion. `localOffset` exists for the user who wants it; automating it
  transposes tracks relative to each other.
- A composer folding tool. ADR-0011 anticipates one as the right home for a lossy fold applied
  deliberately; §6.4 gives `foldNumberIntoRange` a first production caller but does not build it.
- A read-only mode for anything but the importer. §3 builds one; whether playback or other
  overlays should adopt it is left open.
- Auto-detecting a file's Basepoint from its notes, still deferred by ADR-0007.

## 11. Phases (each ends green)

**A — The lock.** `songLocked`, handler guards, disabled props, in-flight gesture settling
(§3.1–3.3), the lifecycle rules and the `loadSong` preview flag (§3.4), and deleting the
importer's `changePitch` call. Independently valuable: it fixes the destroyed-edits defect on
its own, before any import semantics move.

**B — Core moves and repairs.** `addressableSpan`/`MAX_BASEPOINT_OFFSET` into `noteIds` with
the doc fallout (§8), the periodic snap (§6.3), the modulo fold (§6.4), the counter holes
(§7.2). Pure core-tier work with its own tests; no UI depends on it yet.

**C — Config.** The six `midiName` and five `family` corrections, the registry assertions, and
the fixture regeneration/deviation entries (§5.4, §9). Isolated so the golden-fixture churn
lands in one reviewable commit.

**D — The suggestion.** The four tiers, the adjacency table and the channel-9 branch (§5),
against the corrected config from C.

**E — The roster.** Roster-from-tracks, metadata seeding, alias parsing, the cap and empty
guards, the synchronizer's name-keyed reuse (§4), `defaultLayerForTrack` deleted.

**F — The panel.** Instrument and Basepoint selectors, the out-of-range toggle, the counters,
per-track `suggestOffset`, the new i18n keys (§6.5, §7).

## 12. Risks and mitigations

**The fold cannot always succeed.** Stated as best-effort in §6.4 and in the ADR; the
voiceability gate is the decider, and the per-track counters show the cost before import.

**The default now removes notes that used to arrive.** The toggle is next to the count of what
it costs, the source file is untouched on disk, and nothing has been saved at the moment the
choice is made — the reasoning ADR-0012 gives for differing from ADR-0011.

**The suggestion will sometimes be wrong.** It is one dropdown click from being overruled, and
§5.2 publishes every answer it can give so the wrong ones are known rather than discovered.

**Golden byte fixtures flip.** Confined to phase C, with the frozen fixture taking a deviation
entry rather than a regeneration.

**The lock has many entrances.** §3.2 enumerates them from an audit of every mutation path
rather than from the ones with visible buttons; the guard lives in the functions so a path added
later must opt out deliberately.
