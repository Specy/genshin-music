---
name: recording-sustained-instruments
description: Protocol for capturing sustained notes from another app/game and turning the recordings into a folder-based sustaining instrument (loop points, trimming, loopMode). Use when authoring a sustained instrument from recorded audio rather than an existing sample library.
---

# Recording sustained instruments

How to record source material so the sustain pipeline (loop detection, optional
trimming, `loopCrossfade`) can reconstruct a loopable note from it. The analysis
side is `docs/skills/audio-loop-analysis`; this skill is about capturing
recordings that analysis can actually work with.

## Why the protocol looks like this

- **You cannot hear a good loop restart.** If the source loops cleanly, the
  wrap is inaudible — only bad loops announce themselves. Never try to "hold
  until the loop restarts"; hold for a fixed generous time instead. Detection
  does not need the source's loop boundaries: it finds the period by
  self-similarity, and that needs **repeated material** — with exactly one loop
  pass there is nothing to match against. Two to three passes give the
  candidate search real redundancy.
- **The first pass is often not representative.** Reverb/chorus baked into the
  source output smears the attack's tail across the early sustain, and
  LFO-vibrato sources are only quasi-periodic. The settled middle of the hold
  loops best — another reason to record several passes.
- **The release is unreconstructable data.** The note-off sound (source's
  release fade or natural tail) only exists in the recording if you keep
  recording after letting go. `loop-continuous` can synthesize a fade without
  it, but `loop-sustain` and any natural ending need the real tail.

## Recording checklist

1. Capture **lossless WAV** at the source rate (44.1/48 kHz). Encode to MP3
   only at the very end, if at all.
2. Turn OFF reverb/echo/room effects in the source app if it allows it.
3. One note per take, or ONE sequential take of every note in button order with
   generous silence between — `docs/skills/instrument-from-sequential-capture`
   splits, trims, pitch-verifies and encodes it. Either way, never let tails
   overlap the next note.
4. Press, hold **6–10 seconds** (≥ 3 passes of any plausible loop length),
   release, then keep recording **through full silence**.
5. Note each take's pitch (MIDI id) — the analyzer needs the fundamental, and
   `meta.json` needs the Note Id.

## From recordings to an instrument

1. Prep each note with a small one-off script (see
   `sky/instruments/sustained_recorder/README.md` for a worked set of
   parameters): parse WAV → downmix mono → trim leading/trailing silence →
   repitch ±1 semitone for missing scale notes (Catmull-Rom resample) → peak
   normalize (match existing instruments; `sustained_recorder` sits at
   ~−3.5 dBFS). Keep the full hold — do NOT shorten before analysis.
2. Find loop regions on the processed PCM:
   `node docs/skills/audio-loop-analysis/scripts/analyze-wav-loops.mjs <dir> <count> <midiCsv>`
   with multi-second windows (negative end values count from the file's end).
   Prefer the **longest** candidate whose waveform score stays within ~1.5× of
   the best — loop length is what makes the wrap imperceptible; the engine's
   `loopCrossfade` pre-render absorbs the residual seam.
3. Optionally trim redundant middle passes (attack + one/two passes + natural
   release) with a 50 ms equal-power crossfade splice at the matching loop
   phase — the recorded release follows whatever phase the key-up happened at,
   so splice at that phase, not at `loop.end`. Skip trimming if size is fine:
   shorter files forced sub-second loops once before, and those read as
   audible repetition.
4. Ship WAV when loops must stay sample-exact. MP3 (128 kbps CBR mono via
   `@breezystack/lamejs` — no ffmpeg in the dev environment) is acceptable when
   loops are multi-second mid-sustain spans, since decode offsets shift only
   ±~25 ms; derive loop points from the pre-encode PCM either way.
5. Author `instruments/<Name>/meta.json`: `sustain: { release, loopMode, loop }`
   plus per-note `loop` overrides; pick `loopMode` by source character —
   `loop-continuous` (fade out on release; safe default, ignores the tail) or
   `loop-sustain` (plays out into the recorded tail; wants `loop.end` near the
   release so the play-out isn't seconds of leftover sustain). Third option for
   long natural holds that should simply END (wind/brass): omit `loop`
   entirely — loopless sustain plays the file once and fades on note-off
   (worked example: `genshin/instruments/NightwindHorn`).
6. Wire and verify: follow the registration checklist in
   `docs/skills/instrument-from-sequential-capture/SKILL.md` — it is the full
   list (game.json roster, Shape/labels, i18n incl. static/locales, BOTH
   BaseSettings version bumps, similarity map, smoke count, POST_FREEZE sets,
   fixture regen, suites + build).
