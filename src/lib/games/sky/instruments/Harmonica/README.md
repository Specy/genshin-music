# Harmonica — in-game samples (Season of Moomin)

Sky's Harmonica, a fermata 𝄐 Instrument (held notes ring on). Ranges **C4–C6**,
the standard register.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 15 notes,
44.1 kHz stereo 192 kbps, 2.6–4.3 s, already C major and in tune (±12 cents).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3. No repitch.

Sustain: **loopless** (`sustain` with no `loop`) — a held note plays its ~3.3 s
front to back and note-off starts the release fade. Loop analysis was run and
found nothing usable: eleven of the fifteen notes produced NO candidate at all,
and the four that did scored waveError 0.66–0.82 with sub-second lengths. There
simply is not enough steady material in a 2.6–3.7 s sample once the attack and
the tail are excluded — a free reed also beats slightly against its own chord
tone, so the "steady" middle never repeats exactly. The natural hold is the
honest option here.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
