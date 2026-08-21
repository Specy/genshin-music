# Transverse Flute — in-game samples (Season of Lightmending)

Sky's Transverse Flute — side-blown, as against the end-blown `Flute` already in
the roster. Ranges **C4–C6**, the standard register.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 15 notes,
44.1 kHz stereo 192 kbps, 3.3–4.1 s, already C major and in tune (±10 cents).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3. No repitch.

**Tap, not sustained** — no `sustain` block. Its 3.3–4.1 s samples are long enough
to look sustained, but the wiki's fermata 𝄐 list (Electric Guitar, Voice of
AURORA, Triumph Violin, Triumph Saxophone, Cello, Harmonica) does not include it,
so in game a held note does not ring on. The sample simply has a long natural
decay, the way the Manta Ocarina's 2.7 s one does.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
