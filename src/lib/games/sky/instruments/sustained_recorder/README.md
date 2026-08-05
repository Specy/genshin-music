# sustained_recorder — real sustained samples (VCSL, CC0)

A full 15-note (`sky-3x5`, standard-15 table, C4–C6) recorder built from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL)
(Versilian Studios LLC, **CC0 1.0** — public domain), chosen as a real-world
imperfect-loop stress test for the sustain engine: breath noise, slight pitch
drift, and loop points that are "good", not sample-exact (the engine's
`loopCrossfade` pre-render is what makes them wrap cleanly).

Sources (16-bit/48 kHz stereo, downmixed to mono):

- lower octave (buttons 0–7, C4–C5): `Baroque Alto Recorder/Sustain`
- upper octave (buttons 8–14, D5–C6): `Baroque Soprano Recorder/Sustain` — the
  alto is only sampled up to E5; pairing registers is how recorder consorts
  cover range, at the cost of a small timbre shift at the octave break

Processing (one-off script, see `docs/skills/audio-loop-analysis`):

- leading/trailing silence trimmed; the full 8–17 s holds are KEPT — an earlier
  revision shortened them to 3.4 s, which forced sub-second loop regions that
  read as audible repetition. Long sustains allow the 2–10.6 s loops below.
- the wholetone-sampled sources lack some diatonic notes — F4/G4/A4/B4 come
  from F#4/G#4/A#4/C5 and F5/A5/B5 from F#5/A#5/C6, repitched down one semitone
  (Catmull-Rom resample); G5 is sampled natively; C5/C6 reuse their shifted
  neighbors' recordings unshifted
- peak-normalized to ~−3.5 dBFS (0.891 × 0.75 — the −25 % volume request)
- encoded to 128 kbps CBR mono MP3 (lamejs). MP3 decode offsets can shift per
  browser (no gapless header), which is why sample-exact loops want WAV — but
  these loops are multi-second spans of mid-sustain texture found on the
  pre-encode PCM, and the `loopCrossfade` blend absorbs a ±25 ms shift, so the
  size win (3 MB vs 9.5 MB) is safe here.
- loop regions found with `analyze-wav-loops.mjs` (windows: start 0.5–3 s,
  end 3 s..−1.5 s from the end, length 2–12 s), picking the LONGEST candidate
  whose waveform score stays within 1.5× of the best — loop length is what
  makes the wrap imperceptible, splice quality being roughly equal

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
