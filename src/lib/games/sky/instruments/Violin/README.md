# Violin — in-game samples (Triumph Violin, Days of Music)

Sky's Triumph Violin, a fermata 𝄐 Instrument (held notes ring on). Ranges
**C4–C6**, the standard register.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump. 15 notes,
44.1 kHz stereo 192 kbps, ~7.9 s holds.

**Repitched −2 semitones.** The rip is in **D major** (D4–D6): Sky retunes the
whole keyboard to the current Realm's or Music Sheet's key, and this instrument
was captured in D, not C. Every other instrument in the app — including the app's
own older Violin-less roster and the Aurora it shipped — is C major, and the
composer grid, the sheet importer and every stored song assume it, so shipping D
would have put this one instrument a whole tone off from all the others. The
resample is Catmull-Rom (the repo's usual method for scale repitching); after it
the set reads C4 D4 E4 F4 G4 A4 B4 C5 D5 E5 F5 G5 A5 B5 C6, within ±13 cents.
The residual few cents of flatness at the top of the range is present in the
source recording too, so it is the instrument's own character, not the resample.

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):
downmix to mono, repitch, trim to onset/tail, DC removal, peak-normalize to
~−3.5 dBFS, 128 kbps CBR mono MP3.

Sustain: **loopless** (`sustain` with no `loop`) — a held note plays its ~8.9 s
front to back and note-off starts the release fade. Loop analysis was run and
rejected: heavy vibrato makes the waveform only quasi-periodic, so the best
candidates scored waveError 0.22–0.97 with levelRatio down to 0.85 (audible seam
and pumping), and three notes produced no candidate at all. An 8.9 s natural hold
is longer than any note a Sky song actually holds, and it cannot wrap badly.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
