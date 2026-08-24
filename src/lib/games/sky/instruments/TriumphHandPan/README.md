# Triumph HandPan — in-game capture (Season of Performance)

The Season of Performance reimagining of the Sanctuary Handpan that ships here as
`HandPan`: same eight tone fields, different shell. The Sky Wiki describes it as the
hollower-sounding of the two, and the capture bears that out — see "What actually
differs" below.

## Notes

Both handpans sound **D3 A3 C4 D4 F4 G4 A4 C5** (D minor), which is why this folder
and `HandPan/` share the `handpan-8` Note Preset rather than restating the layout.
Measured fundamentals of this capture, from the 1:2:3 partial series:

| Button | Sounded | Measured   | Dev  | Authored Note Id |
| -----: | ------- | ---------- | ---- | ---------------- |
|      0 | D3      | 148.00 Hz  | +14c | 62 (D4)          |
|      1 | A3      | 219.54 Hz  | −4c  | 69 (A4)          |
|      2 | C4      | 262.41 Hz  | +5c  | 72 (C5)          |
|      3 | D4      | 297.37 Hz  | +22c | 74 (D5)          |
|      4 | F4      | 350.25 Hz  | +5c  | 77 (F5)          |
|      5 | G4      | 394.07 Hz  | +9c  | 79 (G5)          |
|      6 | A4      | 442.62 Hz  | +10c | 81 (A5)          |
|      7 | C5      | 521.94 Hz  | ±0c  | 84 (C6)          |

**The authored Note Ids sit one octave above the sounded pitch.** That is not an
error and not new: `HandPan` has always been authored this way, because Sky's Song
Grid is 60–84 and the handpan's real range is 48–72, so D3 has no row to live on.
The ids are identity (ADR-0001), the same eight the legacy `SKY_HANDPAN` table
decodes to, and they must not be "corrected" — every existing handpan Music Sheet
is written against them.

Deviations are −4c to +22c with no consistent offset, i.e. hand-tuning scatter, not
a mistuned capture (`HandPan`'s own samples scatter +1c to +24c). **Not repitched**:
the house rule is to leave anything inside a few cents of scatter alone, and forcing
a hand-tuned pan onto equal temperament would cost exactly the character being
captured.

Do not trust the extractor's `PITCH-DEV` flags on this material — an ACF locks onto
f/3 and f/4 on handpan partials (it read button 1 as A1 and button 3 as G2). Every
pitch above was read off an FFT partial series instead, and cross-checked against
the corresponding `HandPan` sample.

## What actually differs

`HandPan` came from the SkyAutoMusicIOS sample rip: isolated tone fields, nothing
but the struck note's own 1:2:3 partials. This is a live in-game capture of the
whole instrument, so each strike also rings the shell — a ~165 Hz (E3) mode plus
weaker E4/B4 that no `HandPan` sample contains. It is 15–30 dB down at the strike
and only surfaces in the tail once the struck note has decayed, which is precisely
the "hollower" quality the wiki names. It is the instrument, not bleed: the gaps
between notes in the capture are digital silence (−240 dBFS), so there is nothing
to bleed from.

Consequence for the ear: the two handpans are no longer interchangeable takes of
one instrument, which is the point of shipping both.

## Levels

Normalized to the house −3.5 dBFS peak, like every instrument produced by
`docs/skills/instrument-from-sequential-capture` (Cymbals, FortuneDrum,
SFX_KrillHorn). **This makes it ~12 dB louder than `HandPan`**, whose rip-era
samples peak at −14 to −17 dBFS along with most of the legacy Sky library. That is
the existing house-level migration showing at a seam, not a fault in this capture;
re-normalizing `HandPan` is a separate change.

## Source and processing

The user's in-game recording (`Triumph handpan.wav`, 44.1 kHz 16-bit stereo,
2026-08-24, 48.1 s), one strike per button in reading order with ~3.5 s of silence
between. House pipeline at its defaults: split on the RMS envelope, trim to
onset/tail (tail runs out to −66 dBFS), DC removal, downmix to mono, peak-normalize
to ~−3.5 dBFS, 3 ms fade-in / 100 ms raised-cosine fade-out, 128 kbps CBR mono MP3
with the Xing gapless tag. Shipped durations 1.04–2.23 s; verified leads ≤ 10.9 ms.

No `sustain` block — a handpan is a tap, and a held button plays the file's own
decay, same as `HandPan`.

This README is documentation only — the build copies exactly the files `meta.json`
references, so it never ships.
