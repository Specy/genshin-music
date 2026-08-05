---
name: audio-loop-analysis
description: Analyze MP3/WAV instrument samples and author click-resistant sustain loop points. Use for sustained_recorder or any future sampled instrument when loops click, pump, buzz, sound phase-discontinuous, or need per-note start/end metadata derived with the browser's Web Audio decoder.
---

# Audio Loop Analysis

Use the bundled browser script to reproduce the same decoded PCM the app receives, rank phase- and level-matched loop boundaries, and audition the candidates before editing metadata.

Capturing NEW source material (recording sustained notes from another app/game) is covered by `docs/skills/recording-sustained-instruments` — record per that protocol first, then analyze here.

## Headless WAV analysis (no browser)

For WAV samples, `scripts/analyze-wav-loops.mjs` runs the identical algorithm in
Node — WAV is raw PCM, so Node reads the exact frames every browser decodes
(MP3 must go through the browser tool: encoder padding shifts positions per
decoder):

```bash
node docs/skills/audio-loop-analysis/scripts/analyze-wav-loops.mjs path/to/working-dir 15 60,62,64,65,67,69,71,72,74,76,77,79,81,83,84
```

Candidates print best-first per file (the dir holds `0.wav … N-1.wav`; run it on
the pre-encode PCM when the shipped files are MP3). Audition winners with the
browser tool before authoring. See `sky/instruments/sustained_recorder/` (VCSL
samples, CC0) for a fully worked instrument produced this way.

## Run the analysis (browser)

1. Inspect the instrument metadata and sample filenames. Record each sample's intended MIDI pitch.
2. Serve the repository root over HTTP; direct `file:` loading cannot fetch the samples reliably:

   ```bash
   python3 -m http.server 4173 --bind 127.0.0.1
   ```

3. Open the following URL in a browser and wait until the document title becomes `DONE`:

   ```text
   http://127.0.0.1:4173/docs/skills/audio-loop-analysis/scripts/analyze-audio-loops.html?root=/src/lib/games/sky/instruments/sustained_recorder&count=15&midi=60,62,64,65,67,69,71,72,74,76,77,79,81,83,84
   ```

4. Read machine-readable results from `#output` or `window.analysisResults`. Use the generated buttons to audition candidates.
5. Stop the temporary HTTP server after collecting results.

Use available browser automation for headless runs. Wait for `document.title === 'DONE'`; do not rely only on a fixed virtual-time budget.

## Tune the search

Pass query parameters when the defaults do not cover the stable part of a sample:

- `files=foo.mp3,bar.wav` instead of numbered files.
- `startMin`, `startMax`, `endMin`, `endMax` for the candidate windows in seconds.
- `loopMin`, `loopMax` for allowed loop duration; defaults are 0.12–0.68 seconds.
- `sampleRate` for decoding; use the source rate when known.
- `top` for the number of distinct candidates per file.

Keep `midi` aligned with `files`; phase landmark filtering depends on the expected fundamental.

## Select and author points

Do not choose solely by the aggregate rank. Balance:

- Low `nearError` and `boundaryError` to avoid clicks.
- `levelRatio` close to `1` to avoid amplitude pumping.
- Low `waveError` to preserve vibrato/timbre across the join.
- A loop long enough to avoid a buzzy micro-loop, normally one or more vibrato cycles.
- A start after the attack and an end before a thin/noisy decay region.

Store six decimal places. At 48 kHz this retains the chosen decoded frame to substantially better than half a sample. Add per-note overrides when the samples are not normalized.

For this repository, update the instrument's `meta.json` and regenerate the
game's `config-surface-v2` fixture (`npm run test:update-fixtures`), then run the
config-surface, sustain voice, and consistency tests plus `npm run check:sky`.

## Interpret limitations

Zero crossings alone are insufficient: slope, phase context, and level must also match. A decaying/reverberant vocal cannot form a mathematically perfect hard loop. What happens on release is the instrument's `sustain.loopMode` (`loop-continuous` fades the still-wrapping loop; `loop-sustain` plays out from the current phase into the natural tail); keep that release behavior separate from loop-point analysis. Since the `loopCrossfade` pre-render (blending toward the loop start at load), candidates only need to be good, not sample-exact — but the blend cannot rescue level mismatch or timbre drift, so the scoring above still applies.
