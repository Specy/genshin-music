# Tuned Krill Horn — the one-shot prop, pitch-shifted into an octave (2026-08-24)

`SFX_KrillHorn` was the shipped in-game capture: one button, one krill roar. This
folder turns that roar into a playable eight-button `sky-2x4` Instrument. **Button 0
is that original file, byte for byte** — what used to be `SFX_KrillHorn/0.mp3` — and
the other seven are pitch-shifted up from it.

**2026-08-26: `SFX_KrillHorn` was retired** (user's call — the one-button prop was
redundant once this tuned octave existed), so this folder is now the only home of the
roar. Its history below still refers to the SFX folder because that is where the
sample and its authoring decisions came from; the folder itself is in git history.

## The source is pitched — the original README's "no stable fundamental" was wrong

The SFX capture was authored `pitched: false` because pitch detection came back with
a take-to-take IQR of ~38 semitones. That is not noise, it is the ACF octave-lock
trap the `TriumphHandPan` README warns about: the roar is a harmonic stack whose
**4th harmonic dominates**, and the detector was jumping between h1 and h8 — which
are exactly 36 semitones apart.

Read off a 32768-point FFT of the shipped take and refined by a fine-step DFT scan
over the stable 0.3–2.6 s region:

| Partial | Measured      | n·f0 at 43.86 Hz | Level      |
| ------: | ------------- | ---------------- | ---------- |
|      h1 | 43.69 Hz      | 43.86 Hz         | −2.9 dB    |
|      h2 | 87.28 Hz      | 87.72 Hz         | −18.4 dB   |
|      h3 | 131.70 Hz     | 131.58 Hz        | −24.5 dB   |
|  **h4** | **175.45 Hz** | **175.44 Hz**    | **0.0 dB** |
|      h7 | 306.69 Hz     | 307.02 Hz        | −25.6 dB   |
|      h8 | 350.87 Hz     | 350.88 Hz        | −16.3 dB   |

h4 and h8 independently agree to within 0.1 cent, so **f0 = 43.86 Hz = F1 + 8.2
cents**, stable across the first 1.8 s (later windows scatter only once the tail has
decayed into the noise floor). The horn is an F, not an unpitched roar.

`SFX_KrillHorn` kept `pitched: false` regardless while it shipped: it was a
one-button prop whose button is an Assigned Button by design, and flipping it would
have moved where its notes land in every existing sheet. (It was retired 2026-08-26.)

## Why the octave starts on F

Because button 0 is the untouched capture, the layout is not free: the sample sounds
an F, so button 0 has to be authored as an F, and the seven above it climb Sky's
Song Grid from there. Note Ids 65 67 69 71 72 74 76 77 — **F G A B C D E F**, one
grid octave. The B is natural rather than the B♭ of F major because Sky's grid is C
major throughout and 70 does not exist on it; the mode that falls out is F Lydian,
which is a pleasant scale rather than a compromise.

The notes are authored inline in `meta.json` rather than as a Note Preset — this set
is specific to this Instrument, and inline note arrays are already house practice
(`genshin/NightwindHorn`, `sky/Cello`, `sky/SFX_Dance`).

**Button i sounds three octaves below its Note Id**, so the dominant h4 you actually
hear sits one octave below the Note Id. That is the same kind of offset as `Horn`
(two octaves) and `Contrabass` (three): Note Ids are identity, not measured pitch —
see the `HandPan` README for the argument at one octave. Here it is not a choice at
all, it is forced by pinning button 0 to the unshifted sample.

**2026-08-26: that octave is now authored, as `"register": "F3"`** (ADR-0007
addendum), so the model records the F3–F4 this table verifies instead of claiming
the Note Ids' own F4–F5. Which octave to author was a real decision, because this
roar's spectrum is lopsided: its true fundamental is F1 (44 Hz is a sharp tonal
peak at −0.9 dB, not rumble — the h1 row below), but **h4 is the loudest partial**
and h2/h3/h5/h7 sit 24–27 dB down. F1 is what an analyser calls it; F3 is what a
listener hears, since 44 Hz is below what phone and laptop speakers reproduce and
the ear needs ~25–30 dB more level there than at 175 Hz. The register follows the
ear — and therefore this table, which is what the Instrument was tuned against.

| Button | Note Id | Shift  | Ratio  | Audible h4  | Measured | vs A440 |
| -----: | ------- | ------ | ------ | ----------- | -------- | ------- |
|      0 | 65 (F4) | **0**  | 1.0000 | 174.6 Hz F3 | 175.5 Hz | +8.8 c  |
|      1 | 67 (G4) | +2 st  | 1.1225 | 196.0 Hz G3 | 197.0 Hz | +8.8 c  |
|      2 | 69 (A4) | +4 st  | 1.2599 | 220.0 Hz A3 | 221.1 Hz | +8.6 c  |
|      3 | 71 (B4) | +6 st  | 1.4142 | 246.9 Hz B3 | 248.2 Hz | +8.8 c  |
|      4 | 72 (C5) | +7 st  | 1.4983 | 261.6 Hz C4 | 263.0 Hz | +9.1 c  |
|      5 | 74 (D5) | +9 st  | 1.6818 | 293.7 Hz D4 | 295.2 Hz | +9.0 c  |
|      6 | 76 (E5) | +11 st | 1.8877 | 329.6 Hz E4 | 331.4 Hz | +9.3 c  |
|      7 | 77 (F5) | +12 st | 2.0000 | 349.2 Hz F4 | 351.1 Hz | +9.3 c  |

### The +9 cents is deliberate, and it is the whole tuning story

The shifts are **exact integer semitones from the source**, not corrections onto
A440. That is the only way to keep button 0 untouched and still have the Instrument
in tune with itself: the capture is 8.2 cents sharp, so every button inherits the
same 8.2 cents and the _intervals between them_ stay exact.

Measured back off the encoded MP3s, the steps are 2.000, 2.000, 2.000, 1.003, 2.000,
2.000, 1.000 semitones — **worst interval error 0.3 cents**. Against A440 the whole
Instrument sits +8.6 to +9.3 cents sharp, a 0.6-cent spread, i.e. a rigid offset
rather than scatter. That is inside the ±10 cents the house pipeline ships without
repitching.

The alternative — correcting all eight onto A440 — would have cost the requirement
that button 0 be the original file, and would have bought 9 cents against other
Instruments at the price of putting button 0 out of tune with its own neighbours.
Internal consistency wins; this is the same reasoning the `TriumphHandPan` README
uses for leaving hand-tuning scatter alone.

## Sustained, no loop

`sustain: { release: 0.3, minLength: 0.1 }` and **no `loop` region** — the
"loopless sustained" authoring from
`docs/skills/instrument-from-sequential-capture`, matching `genshin/NightwindHorn`,
which is also a horn. A held button plays the file once through its own ~3.3 s decay
and stops; note-off starts the 0.3 s release fade.

Measured on the source to set these: the roar reaches within 3 dB of its peak in
**75 ms** and holds roughly flat out to 2.2 s before decaying, so `minLength` 0.1 —
the default — is enough to let the fastest tap speak with its full attack.
`NightwindHorn` needs 0.2 only because it swells for ~0.6 s; this one does not.
`release` 0.3 matches that horn.

## Processing — and why not ffmpeg

Buttons 1–7 are rendered from `m61.wav`, the pre-encode PCM of the take that shipped
as `SFX_KrillHorn/0.mp3` (retired 2026-08-26), so there is only one lossy generation.
Button 0 skips the pipeline entirely and is a byte copy of that shipped MP3.

The pitch shift is the **Rubber Band v4 CLI on its R3 ("finer") engine**:

```
rubberband -3 -p <semitones> in.wav out.wav
```

**Not ffmpeg's `rubberband` filter.** That filter links the same library but gets the
older **R2** engine: `ffmpeg -h filter=rubberband` lists tempo, pitch, transients,
detector, phase, window, smoothing, formant, pitchq and channels — and no engine
option at all — so it takes librubberband's default, which is R2 for backward
compatibility. R3 is a different algorithm, and on this material the difference is
measurable, not theoretical:

| Engine | Tuning error | Energy inside the harmonic series | Above 3 kHz |
| ------ | ------------ | --------------------------------- | ----------- |
| **R3** | ≤ 1.4 c      | 92 % (worst button 90 %)          | 0.07 %      |
| R2     | ≤ 1.4 c      | 87 % (worst button **81 %**)      | 0.11 %      |

The missing ~10 % in R2 is energy smeared off the partials — audible as the metallic
phase-vocoder edge that made the first attempt at this Instrument unusable.

Shift size mattered even more than the engine. An earlier attempt spread this one
sample over all fifteen `standard-15` buttons, which needs **+31 semitones (5.96×)**
at the top and falls apart audibly. One octave from the original caps it at **+12
semitones (2.00×)**, and four of the eight buttons are within a whole tone of
untouched.

Time is left at 1:1 (no `-t`/`-T`), which is the point: Rubber Band moves the pitch
and leaves the length alone, so every button still plays the full ~3.3 s roar with
its own attack and decay. Resampling instead (`asetrate`, varispeed) would have cut
the top button to 1.65 s — fatal for a sustained Instrument.

Formant preservation (`-F`) was tried and rejected. It pins the spectral envelope at
the source's 175 Hz peak and stamps that one resonance onto every button — a common
muddy chorus rather than a transposition — and it costs 4–7 dB of level that the
normalizer then has to make back.

Buttons 1–7 then go through the house pipeline: DC removal, trim to onset (10 ms
pre-roll) and to a −66 dBFS tail, 3 ms fade-in, 100 ms raised-cosine fade-out,
peak-normalize to −3.5 dBFS, 128 kbps CBR mono MP3 with the Xing gapless tag
(written by libmp3lame). Shipped durations 3.25–3.31 s against the source's 3.31 s —
that spread is tail trimming, not time-stretching. Verified leads 2–8 ms (button 0
carries the original's own 12 ms), under the threshold that flags a missing gapless
tag. Normalization gain landed between +0.6 and +1.0 dB on every rendered button: no
note needed rescuing.

This README is documentation only — the build copies exactly the files `meta.json`
references, so it never ships.
