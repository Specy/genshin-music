# Light Guitar — in-game samples (Electric Guitar), full sustained holds

Replaces the short Electric Guitar samples this folder shipped from 2026-08-03 to
2026-08-21. The wiki marks the Electric Guitar with the fermata 𝄐 — its notes can
be held — but the set here was the game's SHORT variant, 1.9 s per note with no
`sustain` block, so holding a note did nothing.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump, which carries the
full holds: 7.5–10.9 s per note, 44.1 kHz stereo 192 kbps. Already **C3–C5** and
in tune (±14 cents) — no repitch. C3–C5 is one octave below the Piano Keyboard,
which is where the wiki puts it and where the short set already sat; the buttons
keep the game's nominal C4–C6 ids (ADR-0001).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3.

Sustain: **loopless** (`sustain` with no `loop`) — a held note plays its 7.5–10.9 s
front to back and note-off starts the release fade. Loop analysis was run and
rejected: an electric guitar note decays continuously as it rings, so no
multi-second region can level-match its own start (the best candidates sat at
levelRatio 0.85–0.92, i.e. an 8–15 % amplitude jump every wrap, which pumps), and
waveError ran 0.03–0.65. A decaying instrument wants the decay, not a loop.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
