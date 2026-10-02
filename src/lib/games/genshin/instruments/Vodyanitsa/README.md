# Vodyanitsa — in-game capture, loopless sustain

Genshin 7.1's Vodyanitsa (Prima Donna of the Korolevskiy Troupe) has the passive
talent _Heartless Siren Song_: she sings in person in place of playing an
instrument, so her a cappella voice replaces the instrument's sound. In-game that
voice is a 14-button, two-octave keyboard (`genshin-2x7-high`): C5–B5 on the top
row, C4–B4 below.

## Grid placement

The voice sounds C4–B5, the Lyre's upper two octaves, so its Note Ids are the top
and middle grid rows (72–83 over 60–71) and every button sounds at its own number
(no `register`). That makes it the mirror of NightwindHorn (C3–B4, middle + bottom
rows, `genshin-2x7`): the top two rows of a Lyre sheet play at the same pitch on
the voice. Its Shape labels are the Q-row/A-row slice of the 3×7
(`STANDARD_14_HIGH_LABELS`), so key letters and the number notation's octave dots
name the same grid rows on every Genshin instrument.

## Source and processing

Captured in-game as one 44.1 kHz stereo MP3 (128 kbps): all 14 notes in button
order, top-left to bottom-right, each played out to its natural end with silence
between. Eight extra test notes followed the 14; they were cut off before
splitting (first 113 s kept, decoded by the splitter's own decoder to float WAV).
Split with `docs/skills/instrument-from-sequential-capture` at its defaults:

- segmented at silence (−45 dBFS onset / −55 dBFS release hysteresis), then
  trimmed: onset walked back to the noise floor with a 10 ms pre-roll and 3 ms
  fade-in, tail kept to −66 dBFS with an 80 ms pad and 100 ms fade-out
- stereo downmixed to mono (L/R correlation 0.89–0.99 over the sustain), DC
  removed
- peak-normalised to ~−3.5 dBFS (0.891 × 0.75, the house recipe)
- encoded to 128 kbps CBR mono MP3 at the source rate with the Xing gapless tag
  (lamejs + `mp3-gapless.mjs`), named `m<midi>.mp3` by Note Id

Tuning was verified rather than corrected: the median pitch over each hold sits
within ±3 cents of A440 equal temperament (IQR 2–7 cents), so no repitching was
applied. The in-game levels are uneven (C4/D4 sustain ~5 dB under the rest);
per-note peak normalisation leaves them ~2.5 dB under, a 3.6 LU spread overall
(NightwindHorn's is 4.2).

## Behavior notes

- Loopless sustain (`sustain` with no `loop`), the NightwindHorn authoring: each
  file is one whole in-game note — an instant attack, ~4.8 s of steady voice,
  then the singer stops and ~0.7 s of reverb tail remains (5.75–6.3 s per file).
  Holds longer than that end on the recorded tail, as they do in-game.
- `release: 0.8` — measured on the capture's early-release test notes: letting
  go in-game fades the voice out linearly over 0.74–1.06 s (mean ≈ 0.88 s)
  before it cuts, and the engine's release is the same linear ramp.
- `minLength: 0.1` — attacks reach full level within 10–30 ms, so the skill's
  default applies (nothing like NightwindHorn's swell).
- `family: "ensemble"` / `midiName: "voice oohs"` — the pairing Sky's Aurora (also
  a singer's voice) uses. MIDI import therefore suggests it for ensemble-family
  tracks (choirs, string ensembles) and, by General MIDI adjacency, for pipe,
  synth pad and synth effects tracks; cross-game conversion pairs it with Aurora
  in both directions.
