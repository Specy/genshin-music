# Instrument register audit (2026-08-26)

Every pitched sample in both games was measured against its authored Sounding
Pitch (spectral hypothesis-test over octave displacements, cross-checked with
time-domain autocorrelation where the template is unreliable — brass, plucked
strings), then verified against the Sky wiki's official per-instrument Pitch
table where one exists. Method notes and raw outputs lived in the session
scratchpad; the durable conclusions are here.

Evidence tiers:

- **user** — the register came from the user's own in-game knowledge (the
  original 11).
- **wiki** — documented in the
  [Sky wiki Instruments table](https://sky-children-of-the-light.fandom.com/wiki/Instruments)
  (Pitch column) or an instrument's own article.
- **measured** — sample analysis only; for calls/synths/props no online pitch
  documentation exists anywhere, so the rip (which IS the game audio) is the
  ground truth.

## Shipped correct — the original 11 (user + measured + wiki all agree)

| app instrument | register | wiki row |
| -------------- | -------- | -------- |
| Contrabass | C1 | Contrabass C1–C3 |
| Horn | C2 | Horn C2–C4 |
| Cello | C2 | Cello C2–C4 |
| Guitar | C3 | Guitar C3–C5 |
| Harp | C3 | Harp C3–C5 |
| LightGuitar | C3 | Electric Guitar C3–C5 |
| Pipa | C3 | **Lute** C3–C5 (the app's Pipa is the game's Lute) |
| Saxophone | C3 | Triumph Saxophone C3–C5 |
| ToyUkulele | C3 | Ukulele C3–C5 |
| WinterPiano | C5 | Winter Piano C5–C7 |
| Xylophone | C5 | Xylophone C5–C7 |

## Verified correct at C4 (measured + wiki)

Sky: Piano (Piano Keyboard), GrandPiano, Kalimba, Flute, TransverseFlute,
Panflute, Ocarina (Vessel Flute), MantaOcarina, Trumpet (Bugle), Aurora (Voice
of AURORA), Violin (Triumph Violin), Harmonica — all C4–C6 in the wiki table,
all measure C4-rooted. No action.

## Verified correct (measured only — no wiki pitch docs)

Genshin: Lyre, Vintage-Lyre (**its flats measure exactly as authored** — 73, 75,
80, 82), Zither (octave correct; runs ~+25 cents sharp throughout, pre-existing),
Old-Zither, HarmonicKey, LeapingSpiritPiano, LingeringEuphonia, NightwindHorn.
Sky: SFX_BirdCall (C4), SFX_CrabCall (C4, weakly pitched — conf 0.52, no
evidence of error). No action.

## Wrong — wiki-proven (fix: `register`)

| app instrument | app today | true | evidence |
| -------------- | --------- | ---- | -------- |
| HandPan | D4–C6 | **D3–C5** | wiki table + prose ("the handpans play D3 A3 C4 D4 F4 G4 A4 C5") + measured −12 on all 8 |
| TriumphHandPan | D4–C6 | **D3–C5** | same |

The old "never correct the HandPan" rule protected the Nominal Ids (sheet
identity); `register: "D3"` keeps those untouched and fixes only the sounding.

## Wrong — measured, no online source exists

| app instrument | app today | true | proposed | confidence |
| -------------- | --------- | ---- | -------- | ---------- |
| genshin Ukulele | C3-rooted | +12 | `register: "C4"` | ACF conf 1.00 on both pitched rows; real ukuleles sit an octave above guitars; chord row is Assigned and unaffected |
| SFX_BassSynth | C4 | −24 | `register: "C2"` | confident; the samples are also inherently ~35 c flat |
| SFX_SineSynth | C4 | +12 | `register: "C5"` | conf 1.00 (pure tone — unambiguous) |
| SFX_ChimeSynth | C4 | +24 | `register: "C6"` | spectral template said +36, ACF conf 1.00 says C6 — C6 it is |
| SFX_FishCall | C4 | −12 | `register: "C3"` | uniform −12 over all 15 notes |
| SFX_MantaCall | C4 | −12 | `register: "C3"` | conf 0.97 |
| SFX_MothCall | C4 | −12 | `register: "C3"` | conf 1.00 |
| SFX_JellyCall | C4 | −12 | `register: "C3"` | warbly source, conf 0.83 — least certain of the calls, still uniform −12 |
| KrillHorn | F4 | −36 (roars are F1–F2) | `register: "F1"` — **user's call**: this instrument is the app's own creation (pitch-shifted roar), so its octave is a design choice, not a fact to restore |

## Unsure — hold for a listen / a decision

| app instrument | finding | proposed |
| -------------- | ------- | -------- |
| SFX_SpiritMantaCall | −13.0 semitones **exactly** (an octave plus a semitone; conf 0.85–0.88) — smells like an un-repitched B-key capture, the Aurora/Violin trap in another key | listen; likely repitch +1 st (rubberband R3) then `register: "C3"` |
| SmallBell | +2 semitones — partials at D/E/A/B where Large Bell (correct) shows C/D/G/A; its own README admits it shipped unverified | listen; repitch −2 st. Justified regardless of the octave question below |
| Bells + SmallBell row structure | the wiki's Small Bell article: **both rows play the same pitches (C4 D4 G4 A4), differing only in timbre** — the app spreads them C4/C5. But the wiki self-contradicts (its own table says C5–A5), and same-pitch duplicate pitched rows are inexpressible under ADR-0007's collision rule | recommend leaving the octave spread as-is; documented here so the discrepancy is a decision, not an accident |
| SFX_TR-909 | unpitched drum-machine hits authored as a *pitched* synth (`synth-8`) — per-sample "pitches" are meaningless, and the Basepoint "transposes" drum hits | consider `pitched: false` reclassification; gameplay-visible (labels, transposition), so user's call |

## No pitch claim (Assigned — nothing to audit)

Sky: Drum, DunDun (wiki "Prophecy Drum", pitch **None**), FortuneDrum (None),
Cymbals (wiki lists no pitch), SFX_Dance, SFX_KrillHorn.
Genshin: DunDun, DjemDjemDrum, and the Ukulele/LingeringEuphonia chord rows.

## Wiki facts noted, out of scope

- Bells/handpans in-game fold an octave **down** in keys G–B, and the Voice of
  AURORA's lowest key is Eb — a per-key octave behavior the Basepoint model
  does not express.
- Registering any instrument breaks that instrument's beta v5/v4 songs the same
  way the original 11 did (recover via the Piano-swap round trip); v3 files are
  unaffected.

Sources: [Sky wiki — Instruments](https://sky-children-of-the-light.fandom.com/wiki/Instruments),
[Sky wiki — Small Bell](https://sky-children-of-the-light.fandom.com/wiki/Small_Bell),
[Genshin wiki — Ukulele](https://genshin-impact.fandom.com/wiki/Ukulele),
[Genshin wiki — Music Gadget](https://genshin-impact.fandom.com/wiki/Music_Gadget)
