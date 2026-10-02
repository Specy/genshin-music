# Cello — in-game samples (Season of Duets)

Sky's Cello, one of the six Instruments the wiki marks with the fermata 𝄐 ("notes
can be held down to play an extended note"). Ranges **C2–C4**, two octaves below
the Piano Keyboard — like the Contrabass, the buttons keep the game's nominal
C4–C6 ids (ADR-0001) and the register is authored as meta.json
`register: "C2"` (ADR-0007 addendum), so the model records the C2–C4 the
ear hears.

Source: the `Assets-audio-For-SkyAutoMusicIOS` instrument dump (the same rip the
app's existing Sky samples come from — every shared folder in it is byte-identical
to what already shipped here). 15 notes, 44.1 kHz stereo 192 kbps, 7.3–10.6 s
holds, already in C major and in tune (±8 cents, verified by autocorrelation pitch
detection over ~25 windows per note).

Processing (one-off script, see `docs/skills/instrument-from-sequential-capture`):

- downmix to mono, trim to onset/tail, DC removal, peak-normalize to ~−3.5 dBFS
  (0.891 × 0.75 — the house target), 128 kbps CBR mono MP3 (`@breezystack/lamejs`)
- no repitch: the source is already equal-tempered C major

Sustain: **looping**, the only one of the 2026-08-21 additions that loops. A bowed
cello holds a genuinely steady tone, and the analysis found long, well-matched
regions on every note — 2.5–6.9 s loops with waveError ≤ 0.05 and levelRatio
0.95–0.999. Loop regions were found with
`docs/skills/audio-loop-analysis/scripts/analyze-wav-loops.mjs` on the pre-encode
PCM (windows: start 0.5–3 s, end 3 s..−1 s from the end, length 2–8 s), choosing
per note the LOWEST-waveError candidate that is still ≥ 2.5 s long and within 5 %
on level — length keeps the wrap from reading as repetition, level match keeps it
from pumping. `loopCrossfade` 0.08 blends the residual seam at load.

That is a refinement of the rule `docs/skills/recording-sustained-instruments`
gives (take the LONGEST candidate scoring within ~1.5× of the best). Run as
written it picked well for twelve notes but left A5 at levelRatio 0.896 — a ~10 %
amplitude step every wrap, which pumps audibly. Adding the length floor and the
level bound keeps the long loops the original rule is after while refusing the
mismatched ones; on this material it cost ~0.5 s of average loop length.

The other five fermata Instruments here are authored **loopless** (`sustain` with
no `loop`): the Violin and Light Guitar decay as they ring, so no multi-second
region can level-match, and the Harmonica and Saxophone samples (2.6–3.5 s) are
too short to loop without audible repetition. See their READMEs.

This README is documentation only — the build copies exactly the files
`meta.json` references, so it never ships.
