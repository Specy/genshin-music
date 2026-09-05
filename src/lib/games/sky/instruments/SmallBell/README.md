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
128 kbps CBR mono MP3.

**Repitched −2 semitones on 2026-08-26.** The original set shipped without a pitch
check — the note above used to read "no repitch: struck bells are inharmonic enough
that autocorrelation cannot pin a fundamental reliably" — and the 2026-08-26 audit
found it played a whole tone above the Large Bell: its strike notes were **D E A B**
where `Bells` plays **C D G A**, i.e. the capture was made with the Instrument in
another key. Inharmonicity is a reason to measure the strongest partial rather than
chase a fundamental, not a reason to skip measuring; a fine Goertzel sweep refined to
sub-Hz puts the strike notes beyond doubt.

The shift is an exact −2.00 semitones (Rubber Band v4, R3 engine, no formant
preservation, original 44.1 kHz mono / peak level preserved). Deliberately NOT a
per-note correction onto the Large Bell's own pitches: both bells are individually
4–39 cents off equal temperament, as struck bells are, and an integer shift keeps
this bell's internal intervals and character exactly as recorded. Measured after,
the two agree to a mean of 8 cents, with per-note residuals of −23 to +44 cents —
which is the difference between two real bells, not an error.

What this does NOT address: the wiki's Small Bell article says both rows play the
same four pitches (differing only in timbre), while the app authors the second row
an octave up. Both bells share that, it is a Note Id/row-structure question rather
than a tuning one, and duplicate pitched rows are inexpressible under ADR-0007's
collision rule — left as-is by the user's decision (see
`docs/research/instrument-register-audit.md`).

Tap, not sustained — bells ring and decay on their own; the wiki's fermata 𝄐 list
does not include either bell.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
