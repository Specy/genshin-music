# Transverse Flute — in-game samples (Season of Lightmending)

Sky's Transverse Flute — side-blown, as against the end-blown `Flute` already in
the roster. Ranges **C4–C6**, the standard register.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 15 notes,
44.1 kHz stereo 192 kbps, 3.3–4.1 s, already C major and in tune (±10 cents).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3. No repitch.

**Sustained, without a loop.** A held note plays its 3.3–4.1 s sample front to
back once; releasing it sooner starts a short fade from the current playhead.
The omitted loop metadata is intentional: holding a note never wraps the sample.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
