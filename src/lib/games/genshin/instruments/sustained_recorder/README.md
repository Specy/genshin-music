# sustained_recorder — real sustained samples (VCSL, CC0)

The Genshin counterpart of `sky/instruments/sustained_recorder`, widened from that
instrument's 15 notes (`sky-3x5`, C4–C6) to the 21 of `genshin-3x7` (`standard-21`,
C3–B5). Same source library, same processing, same purpose: a real-world
imperfect-loop stress test for the sustain engine.

Every sample comes from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL)
(Versilian Studios LLC, **CC0 1.0** — public domain).

## Where each note comes from

The two ranges the games share are the SAME RECORDINGS. Genshin's `standard-21`
and Sky's 15-note table overlap on all fourteen notes of C4–B5, so those files are
byte-copies of the Sky instrument's, renamed from its `<index>.mp3` to `m<midi>.mp3`
(index order differs between the two note tables; naming by Note Id removes the
question). Sky's C6 has no Genshin button and was not copied.

- **C4–B4, C5–B5** (14 notes, `m60`–`m83`) — copied from `sky/.../sustained_recorder`:
  `Baroque Alto Recorder/Sustain` up to E5, `Baroque Soprano Recorder/Sustain` above.
- **C3–B3** (7 notes, `m48`–`m59`) — NEW, from `Baroque Tenor Recorder/Sustain`.
  Pairing registers is how recorder consorts cover range, and is what the Sky set
  already does across alto and soprano; the tenor is simply the next one down.

## Processing of the new low octave

Identical recipe to the Sky set's, and for the same reason — VCSL's recorders are
sampled in whole tones, so some diatonic notes are not recorded at all:

- natively sampled: C3, D3, E3
- repitched down one semitone (Catmull-Rom resample) from the note above:
  F3←F#3, G3←G#3, A3←A#3, B3←C4
- stereo sources downmixed to mono; leading/trailing silence trimmed; the full
  7.3–9.2 s holds are KEPT, which is what allows the multi-second loop regions in
  `meta.json` rather than sub-second ones that read as audible repetition
- peak-normalised to ~−3.5 dBFS (0.891 × 0.75 — the same −25 % volume as Sky's)
- encoded to 128 kbps CBR mono MP3 (lamejs), matching the shipped Sky format

Loop points were found on the **pre-encode WAV** with this repo's own
`docs/skills/audio-loop-analysis/scripts/analyze-wav-loops.mjs`, which is why they
are authored against PCM the browser never sees: MP3 has no gapless header, so
decode offsets shift per browser. The regions are multi-second spans of mid-sustain
texture and `loopCrossfade` absorbs a ±25 ms shift, so that drift is not audible —
the same trade the Sky instrument documents.

## Caveats

- The octave break between tenor and alto (B3→C4) is a timbre shift, as is the
  existing alto→soprano break at E5→F5. Recorder consorts sound like this; it is
  not a defect in the samples.
- The four repitched notes are one semitone off their recorded pitch, so their
  formants sit slightly high. At one semitone this is inaudible in practice, which
  is why the Sky set uses the same trick for seven of its own notes.
