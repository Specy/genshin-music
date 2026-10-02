# Fortune Drum — in-game capture (Days of Fortune)

The one Instrument in either game with **four** sounds. Every other percussion
Instrument has eight; the wiki is explicit that the Fortune Drum "offers only 4
sounds instead of the usual 8, all of which are unpitched sounds that do not
correspond to different musical notes". Hence the `sky-2x2` Shape, matching
the in-game 2×2 pad (labels sliced from `DRUMS_8_LABELS`' left two columns, so
its keys and number marks stay byte-identical with the other drums) and the
`drums-4` preset, whose notes
are Assigned Buttons (`pitched: false`) like the rest of the drums.

Source: the user's in-game recording (`fortune drum.wav`, 44.1 kHz 16-bit
stereo, 2026-08-23), buttons left→right with every sound played twice
(0 0 1 1 2 2 3 3); the cleaner take of each pair shipped.

The raw capture was ~5 dB right-heavy (in-game spatial audio placed the drum
right of the listener). No pan correction is baked in or needed: the house
format is mono, and the equal-power downmix inherently centers it.

Processing (house pipeline, `docs/skills/instrument-from-sequential-capture`,
`--min-note-s 0.15` — sound 3 is shorter than the default floor): trim to
onset/tail, DC removal, downmix to mono, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3 with the Xing gapless tag. 0.52–2.06 s.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
