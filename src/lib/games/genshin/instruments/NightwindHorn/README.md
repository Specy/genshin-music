# NightwindHorn — in-game capture, loopless sustain

Genshin's Nightwind Horn: a 14-button, two-octave instrument (`genshin-2x7`,
the lower two rows of the standard grid — C4–B4 on top, C3–B3 below). The
samples are real sustained holds, so this is the first **loopless** sustaining
instrument: `sustain` is authored with no `loop` at all. A held note plays its
file front to back once (~11–12 s of hold per note) and note-off starts the
0.3 s `release` fade from wherever the playhead is; there is no loop region to
wrap, which is faithful to the source — the in-game horn ends a long hold
rather than sustaining forever.

## Source and processing

Captured in-game as one 48 kHz stereo recording (all 14 notes in button order,
top-left to bottom-right, ~12 s hold each with silence between). Per note:

- segmented at silence (−45 dBFS onset / −55 dBFS release hysteresis), then
  trimmed: onset walked back to the noise floor with a 10 ms pre-roll and 3 ms
  fade-in, tail kept to −66 dBFS with an 80 ms pad and 100 ms fade-out
- stereo downmixed to mono (the capture's L−R decorrelation is room/reverb,
  not content; the downmix costs ~2 dB, restored by normalization), DC removed
- peak-normalised to ~−3.5 dBFS (0.891 × 0.75, the `sustained_recorder` recipe)
- encoded to 128 kbps CBR mono MP3 at the source rate (lamejs), named
  `m<midi>.mp3` by Note Id

Tuning was verified rather than corrected: the median pitch over each hold sits
within +0–5 cents of A440 equal temperament (autocorrelation with parabolic
interpolation; vibrato spread ~3 cents IQR), so no repitching was applied.

## Behavior notes

- `minLength: 0.2` — the horn's attacks swell (D4 takes ~0.6 s to full level),
  so taps get 200 ms of blow before the release; shorter read as clicks.
- No `loopMode` is authored: with no loop region the default
  `'loop-continuous'` and `'loop-sustain'` behave identically (play out, fade
  on release), so the meta stays on the default.
- Holds longer than a file simply end with the recorded natural decay — that is
  the instrument's character, not a defect.
