# Instrument register audit (2026-08-26)

Every pitched sample in both games was measured against its authored Sounding
Pitch, then verified against the Sky wiki's official per-instrument Pitch table
where one exists. This file records the verdicts and what was done about them.

Method, in the order the evidence hardened:

1. **Spectral hypothesis-test** — score each sample's spectrum against harmonics
   of its authored pitch at octave displacements (−36…+36).
2. **Autocorrelation cross-check** — immune to the weak/missing fundamentals that
   fool a harmonic template (brass, plucked strings), so it cleared several false
   flags. Biased toward shorter lags, so it can read a partial as the fundamental.
3. **Wide-range harmonic estimator** — scores _every_ semitone in 24…100 rather
   than octave displacements only, which is what exposed a **non-octave** offset
   (a key-shifted capture) that steps 1–2 had forced onto the nearest octave.

Step 3 is the one to reach for first next time: an instrument captured in the
wrong key looks like a register error until you let the search leave the octave.

Evidence tiers: **user** (the user's in-game knowledge), **wiki** (the
[Sky wiki Instruments table](https://sky-children-of-the-light.fandom.com/wiki/Instruments)
Pitch column, or an instrument's own article), **measured** (sample analysis —
for calls, synths and props no online pitch documentation exists anywhere, so the
rip, which IS the game audio, is the ground truth).

## Correct as shipped — the original 11 (user + measured + wiki agree)

| app instrument                                   | register | wiki row                                           |
| ------------------------------------------------ | -------- | -------------------------------------------------- |
| Contrabass                                       | C1       | Contrabass C1–C3                                   |
| Horn, Cello                                      | C2       | C2–C4                                              |
| Guitar, Harp, LightGuitar, Saxophone, ToyUkulele | C3       | C3–C5                                              |
| Pipa                                             | C3       | **Lute** C3–C5 (the app's Pipa is the game's Lute) |
| WinterPiano, Xylophone                           | C5       | C5–C7                                              |

## Correct at C4 — no action (measured + wiki)

Sky: Piano, GrandPiano, Kalimba, Flute, TransverseFlute, Panflute, Ocarina
(Vessel Flute), MantaOcarina, Trumpet (Bugle), Aurora, Violin, Harmonica — all
C4–C6 in the wiki table, all measure C4-rooted.

## Correct — no action (measured only)

Genshin: Lyre, **Vintage-Lyre** (its flats measure exactly as authored: 73, 75,
80, 82), Zither (octave right; runs ~+25 cents sharp throughout — pre-existing
tuning, not a register fault), Old-Zither, HarmonicKey, LeapingSpiritPiano,
LingeringEuphonia, NightwindHorn. Sky: SFX_BirdCall, SFX_CrabCall (C4).

## FIXED 2026-08-26

| instrument          | was                         | now                                              | evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | --------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HandPan             | D4–C6                       | `register: "D3"`                                 | **wiki**: table D3–C5 + prose "the handpans play D3 A3 C4 D4 F4 G4 A4 C5"; measured −12 on all 8                                                                                                                                                                                                                                                                                                                                                                                              |
| TriumphHandPan      | D4–C6                       | `register: "D3"`                                 | same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| SFX_MothCall        | C4                          | `register: "C3"`                                 | −12 uniform across all 15 notes, textbook harmonic series                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| SFX_MantaCall       | C4                          | `register: "C3"`                                 | −12 on 14/15; the outlier's runner-up candidate is a 0.992 tie (measurement wobble)                                                                                                                                                                                                                                                                                                                                                                                                           |
| SFX_SineSynth       | C4                          | `register: "C5"`                                 | pure tone, unambiguous                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SFX_ChimeSynth      | C4                          | `register: "C6"`                                 | **+24, not the +36 first reported**: its peaks are h2/h3 pairs (3:2 ratios) of fundamentals at C6–C7, so the template was reading a harmonic                                                                                                                                                                                                                                                                                                                                                  |
| SFX_FishCall        | C4                          | repitched **+5 st**, then `register: "C3"`       | **not a plain register error**: the wide-range estimator read −17 uniform, and the sample scale spells G A B C D E F♯ G — a **G-major capture**. Registers move whole octaves only, so this needed audio work (the Aurora/Violin D-major precedent)                                                                                                                                                                                                                                           |
| SFX_SpiritMantaCall | C4                          | repitched **+1 st**, then `register: "C3"`       | −13.03 ± 0.15 across all 15 notes — a coherent B-rooted scale an octave + semitone low, not an out-of-tune sample                                                                                                                                                                                                                                                                                                                                                                             |
| SFX_JellyCall       | C4                          | `register: "C3"`                                 | median −12 (13 of 15 notes); the ±1 semitone scatter on the other two is the **source's own warble**, which no config can fix — the octave is what a register owns                                                                                                                                                                                                                                                                                                                            |
| KrillHorn (tuned)   | F4–F5                       | `register: "F3"`                                 | its roar's true fundamental is F1 (44 Hz is a sharp tonal peak at −0.9 dB, not rumble), but **h4 is the loudest partial** and h2/h3/h5/h7 are 24–27 dB down. F1 is what an analyser calls it; F3 is what a listener hears — 44 Hz is below phone/laptop reproduction and the ear needs ~25–30 dB more level there — and F3–F4 is exactly what the instrument was built and verified against (its README's construction table). **User's decision**; today's F4 was wrong under either reading |
| SmallBell           | D E A B (a whole tone high) | repitched **−2.00 st**                           | its strike notes were D5 E5 A5 B5 where `Bells` plays C5 D5 G5 A5 — a capture made in another key. Not a per-note match onto the Large Bell: both bells are individually 4–39 cents off equal temperament, so an integer shift keeps this one's intervals and character. After: the two agree to a mean of **8 cents**, residuals −23…+44, which is the difference between two real bells                                                                                                     |
| SFX_BassSynth | C4–C5 | `register: "C2"` | four independent methods agree: wide-range estimator −24 uniform, zero-crossing rate 62.7 Hz, autocorrelation 127.9 Hz on the top note, and **98.1% of the energy below 90 Hz** with h1 sitting 20–43 dB above every other partial. (The user first read it as C5 — which is what the app *labels* its top button today under the unregistered `synth-8` preset) |
| genshin Ukulele | C3–C5 | `register: "C4"` + a **model change** | +12 measured (ACF 1.00 on both pitched rows) and confirmed by ear ("the note on the left in the middle row seems to be a C5" — which is exactly what this produces). It could not be authored until the register was made to translate the WHOLE instrument: its 7 Assigned chord buttons held 72–83, and moving only the pitched half walked the middle row onto them. See the ADR-0007 addendum |
| SFX_TR-909          | pitched `synth-8`           | `pitched: false` (inline, same nominals + icons) | unpitched drum-machine hits; per-sample "pitch" is meaningless and the Basepoint was transposing drum hits. Soundings are unchanged (an Assigned Button's Note Number is its Nominal Id), so **no song breaks**                                                                                                                                                                                                                                                                               |
| SFX_KrillHorn       | shipped                     | **removed**                                      | user's call: the one-button roar prop was redundant once `KrillHorn` (the tuned octave built from it) existed. Its dead `sky-1x1` Shape, `SFX_1_LABELS` Label Set and `sfx-1` preset went with it                                                                                                                                                                                                                                                                                             |

Repitches used the Rubber Band v4 CLI on its R3 engine (`-3 -p <semis>`, no
`-F`), preserving each file's original sample rate, channel count and peak level
(one SpiritManta take is 8 kHz in the rip; that was kept). Verified after: Fish
lands within 14 cents, SpiritManta dead on.

## Held — awaiting a listen or a decision

| instrument                      | finding                                                                                                                                                                                                                                                                           | proposal                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Bells / SmallBell row structure | the wiki's Small Bell article says **both rows play the same pitches** (C4 D4 G4 A4, differing only in timbre) — the app spreads them C4/C5. The wiki contradicts itself (its own table says C5–A5), and duplicate pitched rows are inexpressible under ADR-0007's collision rule | recommend leaving as-is; recorded so the discrepancy is a decision, not an accident |

## The rule this audit changed

Registering the Ukulele forced a model decision, recorded in the ADR-0007 addendum: a
register now translates the **whole instrument**, Assigned Buttons included, rather than
its Pitched Buttons only. The argument is that a rigid translation *cannot* create a Note
Number collision — the button set was distinct before it, and translation preserves
distinctness — whereas moving half an instrument can, and did. An Assigned Button's number
was always an identity rather than a pitch; it now reads "its Nominal Id carried by the
instrument's register and the Basepoint".

Blast radius, measured across both games: **exactly one instrument moved**, because the
Ukulele is the only one anywhere with both a register and Assigned buttons (its chord row
72–83 → 84–95). Two consequences: genshin's Addressable Span grew C3–B5 → C3–B6, so its Pro
View axis gains twelve rows only chord buttons can occupy; and those chord identities
stopped sharing numbers with real C5–B5 pitches, which is the more honest arrangement on an
axis that means sounding pitch everywhere else.

## A fallout pattern registers keep causing in tests

Every register moves an instrument's soundings off its nominals, and a surprising
number of tests pick an instrument by NOMINAL coverage ("sub-grid", "short",
"misplaced") and then feed those nominals in as Note Numbers. That is only valid
on an untuned instrument, so each such selector needs
`notes.every(n => n.sounding === n.nominal)` alongside its shape predicate —
otherwise it silently selects a registered instrument and goes red for the wrong
reason. Nine selectors needed it, across composedSong, composerRenderer, noteIds,
noteNumbers, noteNumberTransforms, playerDisplayInstrument, visualSong and
vsrgSong. `composerRenderer`'s `subGridPair` showed the sharpest form: on a
registered instrument, a grid id the instrument lacks as a _nominal_ can still
match one of its _soundings_, so its "playable" probe named a row the canvas never
draws that note on.

## Wiki facts noted, out of scope

- Bells and handpans fold an octave **down** in keys G–B, and the Voice of
  AURORA's lowest key is E♭ — per-key octave behavior the Basepoint model does
  not express.
- Registering an instrument breaks that instrument's beta v5/v4 songs exactly as
  the original 11 did (recover with the Piano-swap round trip); v3 and older are
  unaffected, and that is guaranteed structurally rather than by fixture — see
  `noteNumberTransforms.test.ts` ("lifts every playable old id to what it already
  sounded, at every Basepoint") together with `gameDefinitionConsistency.test.ts`
  pinning the frozen legacy tables to the live nominals.

Sources: [Sky wiki — Instruments](https://sky-children-of-the-light.fandom.com/wiki/Instruments),
[Sky wiki — Small Bell](https://sky-children-of-the-light.fandom.com/wiki/Small_Bell),
[Genshin wiki — Ukulele](https://genshin-impact.fandom.com/wiki/Ukulele)
