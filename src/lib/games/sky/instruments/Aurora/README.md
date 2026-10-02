# Aurora — the in-game Voice of AURORA, as three Variants

Recorded in game on 2026-09-26, in C major (C4–C6). Each of the 15 buttons was
pressed 22–30 times and left to ring out: 381 presses in all. The raw captures
and the full take catalog are not in the tree any more. They were deleted once
the Variants shipped, and commit 49360100 (`new-aurora/`) still holds them.

## What the game does

- **Every press plays one of several recorded Takes, chosen at random.** There
  are 1–5 Takes per button, 46 in all: C4 5, D4 3, E4 4, F4 3, G4 3, A4 4, B4 4,
  C5 3, D5 4, E5 5, F5 2, G5 2, A5 2, B5 1, C6 1.
- **It never replays the previous Take.** There were 0 back-to-back repeats in
  318 transitions, where about 103 were expected by chance. Buttons with two
  Takes simply alternate.
- **Repeats of a Take are identical through their fade.** Hold length matches
  to ±10 ms, and there is no random detune or start offset. The fade is part of
  the recording: every Take is one sung vowel held 4–8 s that fades to −50 dB by
  9–11 s. Nothing inside a Take repeats, so there is no loop.
- **Only D4 overlaps the old rip.** The three D4 Takes are the same recordings as
  the SkyAutoMusicIOS rip's D-major `0_1`, `0_2` and `0_0`, which the Aurora
  before this one was built from, shifted down two semitones. None of the other
  Takes is confirmed to be in the rip.

## The Variants

The app does not reproduce the random choice (ADR-0017). It offers three fixed
sets of Takes, picked by ear for how they sound together across the range and
named after the vowel each set sings. Each button's Takes are lettered in the
order the capture first heard them: A is the first recording that button
played, B the next new one, and so on.

|                | C4  | D4  | E4  | F4  | G4  | A4  | B4  | C5  | D5  | E5  | F5  | G5  | A5  | B5  | C6  |
| -------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ah` (default) | C   | B   | C   | A   | A   | A   | C   | A   | C   | B   | A   | A   | B   | A   | A   |
| `eh`           | B   | A   | B   | B   | B   | D   | A   | C   | D   | E   | B   | B   | A   | A   | A   |
| `oo`           | C   | C   | A   | B   | A   | B   | B   | A   | A   | B   | B   | B   | A   | A   | A   |

The three sets use 33 distinct Takes. Where two sets share a Take, it is either
because a button has fewer Takes than there are sets (B5 and C6 have one, F5–A5
two), or because the shared Take blended better. Files are named
`<Note>-<Take>.mp3`.

## Processing

This was a one-off script run on raw 48 kHz, 24-bit mono cuts of each Take,
one clean press per Take:

1. **Onset:** at most 10 ms of pre-roll, with a 3 ms fade-in so each file
   starts at exactly zero. The decoded lead is 1.5–4.2 ms.
2. **DC:** a 5 Hz high-pass. The captures' offset drifts with the note and fades
   in the tail, so subtracting a constant would push an offset into the silent
   tail instead.
3. **Tuning:** Takes about 10 cents or more off equal temperament were retuned
   with Rubber Band's R3 engine: A5 B (+12.3), B5 A (+15.0), C6 A (+12.2), and
   B4 B, which measures +9.9, right on the line depending on the analysis
   window. All four now sit within ±0.4 cents. Every other Take ships at its
   captured pitch, within ±8.7 cents.
4. **Level:** every Take is at the same held level of −16.0 dBFS, _as decoded_.
   Held level is the median of the 200 ms-smoothed level while it stays within
   10 dB of the peak. The old Aurora decoded at a median of −15.3, so the instrument
   keeps its place in existing mixes. The encoder below scales its input by
   −0.445 dB, which the gain compensates for. Decoded peaks range from −6.7 to
   −2.0 dBFS.
5. **Tail:** cut once the level stays below −70 dBFS, with a 100 ms fade-out.
6. **Encoding:** `ffmpeg -c:a libmp3lame -b:a 128k -ac 1 -ar 48000`, CBR with the
   LAME gapless tag. The result was verified by decoding with two decoders.

## Sustain

Loopless sustain is unchanged (`{release: 0.4, minLength: 0.15}`). A held note
plays its file front to back, and note-off fades it over 0.4 s. Whether the
game itself stops a note on key-up or always lets it ring out was not measured,
so the fade stays.

This README is documentation only. The build copies exactly the files that
`meta.json` references (every Variant's), so this file never ships.
