# LeapingSpiritPiano — re-captured samples, loopless sustain

Genshin's Leaping Spirit Piano: the full 21-button, three-octave grid
(`genshin-3x7`, the `standard-21` preset — C5–B5 on top, C4–B4 in the middle,
C3–B3 below). The sample set shipped here was **re-recorded in game on
2026-08-14**, replacing the 2026-08-03 set, whose files were all cut to a flat
1.11 s — a tap set that threw the ring-out away. The new captures are real
sustained holds, so the instrument is now **sustained and loopless** — the same
authoring as `NightwindHorn`: `sustain` with a `release` and no `loop` at all. A
held note plays its file front to back once (3.7–4.2 s, median 4.1 s) and
note-off starts the 0.3 s `release` fade from wherever the playhead is; there is
no loop region to wrap, which is faithful to the source — the in-game piano
rings out and stops rather than sustaining forever.

## Source and processing

Captured in-game as one 48 kHz stereo recording, all 21 notes in button order
(top-left to bottom-right), with silence between them. Processed with
`docs/skills/instrument-from-sequential-capture`:

- segmented at silence, then trimmed: onset walked back to the noise floor with
  a short pre-roll and fade-in, tail kept down to the floor with a pad and
  fade-out
- stereo downmixed to mono (the capture's L−R decorrelation is room/reverb, not
  content), DC removed
- encoded to 128 kbps CBR mono MP3 at the source rate (lamejs), named
  `<button>.mp3` — the historical default naming the `standard-21` preset uses

### Loudness: matched to the OLD set, not to the house target

Peak-normalised to the **previous sample set's median peak, −17.2 dBFS** —
deliberately NOT the −3.5 dBFS house target used for new instruments. This
instrument is quiet on purpose: every existing song that mixes it against
another instrument was balanced against those levels, and re-normalising would
have made it ~13.7 dB louder in each of them. Measured back off the shipped
MP3s the median peak is −17.7 dBFS; the ~0.4 dB is what the 128 kbps encode
gives back and is below audibility here.

### Tuning

Verified rather than corrected: median pitch per note sits within ±1 cent of
A440 equal temperament (autocorrelation with parabolic interpolation) — the
tightest of any capture in the repo — so no repitching was applied.

## Behavior notes

- `minLength: 0.1` — the attacks are effectively instantaneous (0.003–0.012 s
  to within 3 dB of peak), so a tap needs no swell allowance; this is only the
  floor that keeps a very fast tap from being cut off mid-attack. (Contrast
  `NightwindHorn`'s 0.2, which exists because its notes swell for ~0.6 s.)
- No `loopMode` is authored: with no loop region the default `'loop-continuous'`
  and `'loop-sustain'` behave identically (play out, fade on release), so the
  meta stays on the default.
- **Consequence of gaining `sustain`**, and intended: a composer span-1 note or
  preview now sounds for `minLength + release` (~0.4 s) instead of ringing the
  whole sample out, and spanned/held notes follow their authored duration.
  That is the in-game behavior — a key you let go of stops.
