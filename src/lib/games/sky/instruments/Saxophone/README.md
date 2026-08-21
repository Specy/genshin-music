# Saxophone — in-game samples (Triumph Saxophone, Days of Music)

Sky's Triumph Saxophone, a fermata 𝄐 Instrument (held notes ring on). Ranges
**C3–C5**, one octave below the Piano Keyboard — the buttons keep the game's
nominal C4–C6 ids (ADR-0001) and the samples sound low, as for the Guitar and Harp.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 15 notes,
44.1 kHz stereo 192 kbps, 3.1–3.5 s, already C major and in tune (±13 cents).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3. No repitch.

Sustain: **loopless** (`sustain` with no `loop`) — a held note plays its ~3.3 s
front to back and note-off starts the release fade. Loop analysis did find usable
regions (waveError 0.014–0.10), but only 0.9–2.0 s of them, because the source
hold is barely 3.3 s to begin with. Over a long hold that is the same second and a
half repeating four or five times, and a saxophone's vibrato makes the repetition
obvious — exactly the failure `docs/skills/audio-loop-analysis` warns about. Three
seconds of real playing beats a mechanical loop for an instrument whose notes are
held a beat or two in practice.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
