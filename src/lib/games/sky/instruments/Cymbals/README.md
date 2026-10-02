# Cymbals — in-game capture (Season of Radiance)

Four unpitched sounds on a 2×2 pad, exactly the Fortune Drum's surface — the
wiki still documents nothing about it (its Instruments row reads pitch "TBA"),
but the Sky Wiki's Item Showcase video visibly shows the 2×2 four-pad playing
interface. Reuses the `sky-2x2` Shape and the `drums-4` preset (Assigned
Buttons, `pitched: false`).

**In-game each pad is NOT one fixed sample.** Measured on the capture
(waveform cross-correlation with playback-rate compensation,
`docs/skills/audio-loop-analysis` territory):

- each pad ALTERNATES two base samples, A B A B …, restarting on A after an
  idle pause (likely the left/right cymbal strikes of the animation);
- every hit additionally gets a small random playback-rate offset (~±10
  cents — paired hits correlate at 0.91–0.95 only after rate compensation).

That is why no two hits sound identical in-game. The app deliberately ships a
SINGLE stable sample per pad — the user's call — so a Music Sheet plays the
same every time: variant A of each pad (the fresh-hit sound), cleanest take
of each duplicate.

Source: the user's in-game recording (`cymbals.wav`, 44.1 kHz 16-bit stereo,
2026-08-23), pads in reading order, pad 0 hit five times and the rest four
(A B A B [A]). Shipped takes: hits #1, #6, #10, #14 of the 17. Durations
1.27 / 2.53 / 0.54 / 2.07 s.

Processing (house pipeline, `docs/skills/instrument-from-sequential-capture`,
`--min-note-s 0.15`): trim to onset/tail, DC removal, downmix to mono,
peak-normalize to ~−3.5 dBFS, 128 kbps CBR mono MP3 with the Xing gapless tag.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
