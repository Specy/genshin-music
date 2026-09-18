# Aurora — in-game samples (Voice of AURORA), full sustained holds

Replaces the short Voice of AURORA samples this folder shipped from 2026-08-03 to
2026-08-21. The wiki marks the Voice of AURORA with the fermata 𝄐 — its notes can
be held — but the set here was the game's SHORT variant, 2.7–3.3 s per note with
no `sustain` block at all, so holding a note did nothing.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump, which carries the
full holds: 8.1–11.6 s per note, 44.1 kHz stereo 192 kbps. The dump has up to
three vocal variants per button (`0_0`, `0_1`, `0_2` — the game round-robins them
so a repeated note does not sound identical); this format is one file per button,
so variant `_0` was taken for every note that has one.

**Repitched −2 semitones.** Like the Violin, the rip is in **D major** (D4–D6):
Sky retunes the keyboard to the current key and this capture was made in D. The
Aurora the app shipped before was C major (C4–C6), as is every other instrument
here and everything the composer, importer and stored songs assume. Catmull-Rom
resample; afterwards the set reads C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6
within ±11 cents.

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, repitch, trim to onset/tail, DC removal, peak-normalize to
~−3.5 dBFS, 128 kbps CBR mono MP3.

Sustain: **loopless** (`sustain` with no `loop`) — a held note plays its 9–12.5 s
front to back and note-off starts the release fade. Loop analysis was run and its
best candidates were the weakest of the six fermata Instruments: multi-second
regions were available and level-matched, but three notes still scored waveError
~0.21, because a vibrato-carrying choir voice is only quasi-periodic —
`docs/skills/audio-loop-analysis` says as much ("a decaying/reverberant vocal
cannot form a mathematically perfect hard loop"). Twelve seconds of real unlooped
singing is longer than any note a Sky song holds and has no seam to get wrong.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
