# Krill Horn — in-game capture (2026-08-23)

A one-button prop: blowing it plays a single unpitched krill roar, so it lives
with the SFX roster (`SFX_KrillHorn`, listed after the creature calls). Hence
the `sky-1x1` Shape (the only 1-button Instrument in either game) and the
`sfx-1` preset — one Assigned Button (`pitched: false`) at Nominal Id 60,
following the drums/SFX-call convention. Like the rest of the SFX_* it has no
cross-game similarity mapping — conversions fall back to the target default.

Source: the user's in-game recording (`Krill horn.wav`, 44.1 kHz 16-bit stereo),
the same sound played twice. Take 2 shipped: take 1 swells in from near-silence
for ~100 ms (a breath ramp on that blow), take 2 speaks immediately — the right
behavior for a tapped note. ~3.3 s with the natural decay; pitch detection finds
no stable fundamental (take-to-take IQR was ~38 semitones), which is what
authored it unpitched. Tap Instrument, no `sustain`.

Processing (house pipeline, `docs/skills/instrument-from-sequential-capture`):
trim to onset/tail, DC removal, downmix to mono, peak-normalize to ~−3.5 dBFS,
128 kbps CBR mono MP3 with the Xing gapless tag.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
