# Song notes are identified by nominal MIDI id, not true sounding pitch

Songs must stop storing keyboard-layout indices (0–20 Genshin, 0–14 Sky — with _opposite_ octave orderings) so that new games with different layouts don't inherit the layout coupling. We decided the universal identifier is the **nominal MIDI id** each instrument already declares per button (`midiNotes`): white-key nominal numbers for Genshin's accidental-tuned instruments (Vintage-Lyre's Db button keeps id 74), real pitches for Sky's handpan/bell, assigned numbers for unpitched SFX. Ids are stored pre-transposition; the song/instrument pitch setting remains a playback-rate transform. Buttons are derived per instrument as the position of an id in the instrument's ordered id list.

## Considered Options

- **True sounding pitch** — rejected: actual pitch-with-octave data exists nowhere in the codebase (`baseNotes` has pitch class only, `midiNotes` is the same white-key array for every 21-note Genshin instrument), it would change Lyre↔Vintage-Lyre substitution behavior users rely on, and Ukulele's two G buttons would collapse into one note (no round-trip).
- **Canonical scale-degree index** — rejected: still means "button N", so a future game with a different scale reintroduces exactly the problem being solved.

## Consequences

- Conversion of every existing song is a lossless per-note table lookup (`id = midiNotes[index]`); MIDI export semantics don't change (it was already exporting the nominal id via `NOTE_MAP_TO_MIDI`).
- The id is a _name in a shared namespace_, not a promise about sound: pitch-true MIDI export would require adding separate sounding-pitch data to instruments (deliberately out of scope).
- A note whose id the current instrument doesn't offer is a **stranded note**: skipped at playback and marked in the composer, never rewritten. Two exceptions, both explicit imports (discovered during implementation: the historic `IMPORT_NOTE_POSITIONS` remap was a _rank-preserving_ map — a uniform -12 id shift for the default instruments, e.g. Sky 60 → Genshin 48 — not a fold of only out-of-range notes):
  - **Legacy files** (composed ≤v3, recorded ≤v2, vsrg v1) convert cross-game through the frozen index-level remap inside deserialization, byte-reproducing the historic converter's output (fixture-locked).
  - **New-format files** convert via `toOtherGame(target)` (many-to-many by signature): each track swaps to the target game's most **similar instrument** (curated map in `instrumentSimilarity.ts`, target default when unmapped, track settings kept), ids carry over with only out-of-range ids octave-folding (Sky's 84 → 72), fold collisions merge keeping the longest span/duration, and ids landing on scale gaps stay stranded.
