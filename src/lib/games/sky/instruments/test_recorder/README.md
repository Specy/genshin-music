# test_recorder — real sustained samples (VCSL, CC0)

Baroque Alto Recorder sustains from the
[Versilian Community Sample Library](https://github.com/sgossner/VCSL)
(Versilian Studios LLC, **CC0 1.0** — public domain), chosen as a real-world
imperfect-loop stress test for the sustain engine: breath noise, slight pitch
drift, and loop points that are "good", not sample-exact (the engine's
`loopCrossfade` pre-render is what makes them wrap cleanly).

Processing (one-off script, see `docs/skills/audio-loop-analysis`):

- source `Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain/*_rr1_Main.wav`
  (16-bit/48 kHz stereo), downmixed to mono
- leading/trailing silence trimmed; 8–17 s holds shortened to 3.4 s by keeping
  the first 2.4 s + the file's last 1.0 s (the natural blown release) with a
  50 ms equal-power splice
- F4/G4/A4/B4 don't exist in the wholetone-sampled source — repitched down one
  semitone from F#4/G#4/A#4/C5 (Catmull-Rom resample); button 7 (C5) reuses the
  C5 recording unshifted
- peak-normalized to −1 dBFS, written as 16-bit mono WAV (WAV, not MP3, so loop
  points stay sample-exact across browsers)
- loop regions found with `analyze-wav-loops.mjs` (best candidate per file)

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
