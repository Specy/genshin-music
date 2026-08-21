# Small Bell — in-game samples (Season of Gratitude)

Sky has two bells, the Small Bell and the Large Bell, and both play the same
eight notes — C D G A across two octaves, which is what the `bells-8` preset
holds and what the app's existing `Bells` folder already used. This adds the
second timbre; `Bells` keeps the one that shipped before.

They are genuinely different recordings, not one re-encode of the other: the two
sets share note lengths (~0.85 s) and envelope shape, as two bells would, but
their spectral centroids diverge per note by up to 2.3× — far outside what a
bitrate change accounts for.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 8 notes,
44.1 kHz stereo 192 kbps, 0.81–0.93 s.

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3. No repitch: struck bells are inharmonic enough that
autocorrelation cannot pin a fundamental reliably, so nothing was assumed about
their tuning and nothing was changed.

Tap, not sustained — bells ring and decay on their own; the wiki's fermata 𝄐 list
does not include either bell.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
