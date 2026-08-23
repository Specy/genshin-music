#!/usr/bin/env node
// Split one sequential instrument capture (every note in button order, silence
// between) into trimmed, normalized, encoded per-note samples, verifying pitch
// along the way. See ../SKILL.md for the workflow this belongs to; the defaults
// here are the values that produced genshin/instruments/NightwindHorn.
//
// usage:
//   node extract-notes.mjs <capture.(mp3|wav)> [--dry-run] [--out <dir>]
//     [--expect N]        fail unless exactly N notes are found
//     [--midi 60,62,...]  authored Note Ids in capture order (else rounded pitch)
//     [--wav]             also write pre-encode PCM as m<midi>.wav (loop analysis)
//     [--peak 0.66825]    per-note peak target (~-3.5 dBFS, the house recipe)
//     [--kbps 128]        MP3 CBR bitrate (mono)
//     [--on-db -45] [--off-db -55] [--gap-s 0.35] [--min-note-s 0.3]  segmentation
//
// Deps (NOT in package.json — they are one-off tooling): run
//   npm i --no-save mpg123-decoder @breezystack/lamejs
// from the repo root first (ESM resolves them by walking up from this file).

import fs from 'node:fs';
import path from 'node:path';
import { TOTAL_DELAY, withGaplessTag } from './mp3-gapless.mjs';

// ---------------------------------------------------------------- arg parsing
const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
if (!input || !fs.existsSync(input)) {
  console.error('usage: node extract-notes.mjs <capture.(mp3|wav)> [--dry-run] [--out <dir>] ...');
  process.exit(2);
}
const DRY = flag('dry-run');
const OUT_DIR = opt('out', null);
if (!DRY && !OUT_DIR) {
  console.error('--out <dir> is required unless --dry-run');
  process.exit(2);
}
const EXPECT = opt('expect', null) && Number(opt('expect'));
const MIDI_ARG = opt('midi', null)?.split(',').map(Number);
const TARGET_PEAK = Number(opt('peak', 0.891 * 0.75));
const KBPS = Number(opt('kbps', 128));
const ON = Number(opt('on-db', -45));
const OFF = Number(opt('off-db', -55));
const GAP_S = Number(opt('gap-s', 0.35));
const MIN_NOTE_S = Number(opt('min-note-s', 0.3));

// ------------------------------------------------------------------- helpers
const db = (v) => 20 * Math.log10(v + 1e-12);
const midiOf = (f0) => 69 + 12 * Math.log2(f0 / 440);
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const nameOf = (m) => NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const rmsOf = (arr, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += arr[i] * arr[i];
  return Math.sqrt(s / Math.max(1, to - from));
};

// -------------------------------------------------------------------- decode
async function decodeCapture(file) {
  const bytes = new Uint8Array(fs.readFileSync(file));
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return decodeWav(bytes);
  }
  let MPEGDecoder;
  try {
    ({ MPEGDecoder } = await import('mpg123-decoder'));
  } catch {
    console.error('missing decoder — run: npm i --no-save mpg123-decoder @breezystack/lamejs');
    process.exit(2);
  }
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const { channelData, samplesDecoded, sampleRate } = decoder.decode(bytes);
  decoder.free();
  return { channelData, length: samplesDecoded, sampleRate };
}

// Minimal RIFF/WAVE reader: PCM 16/24-bit int and 32-bit float, any channel count.
function decodeWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fmt = null,
    dataOff = -1,
    dataLen = 0;
  for (let off = 12; off + 8 <= bytes.length;) {
    const id = String.fromCharCode(...bytes.subarray(off, off + 4));
    const size = view.getUint32(off + 4, true);
    if (id === 'fmt ') {
      fmt = {
        format: view.getUint16(off + 8, true),
        channels: view.getUint16(off + 10, true),
        sampleRate: view.getUint32(off + 12, true),
        bits: view.getUint16(off + 22, true),
      };
    } else if (id === 'data') {
      dataOff = off + 8;
      dataLen = size;
    }
    off += 8 + size + (size % 2); // RIFF chunks are word-aligned
  }
  if (!fmt || dataOff === -1) throw new Error('unsupported WAV: missing fmt/data chunk');
  const bytesPer = fmt.bits / 8;
  const frames = Math.floor(dataLen / (bytesPer * fmt.channels));
  const channelData = Array.from({ length: fmt.channels }, () => new Float32Array(frames));
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < fmt.channels; c++) {
      const p = dataOff + (i * fmt.channels + c) * bytesPer;
      let v;
      if (fmt.format === 3 && fmt.bits === 32) v = view.getFloat32(p, true);
      else if (fmt.bits === 16) v = view.getInt16(p, true) / 32768;
      else if (fmt.bits === 24)
        v =
          ((view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16)) << 8) /
          2147483648;
      else throw new Error(`unsupported WAV format ${fmt.format}/${fmt.bits}bit`);
      channelData[c][i] = v;
    }
  }
  return { channelData, length: frames, sampleRate: fmt.sampleRate };
}

// --------------------------------------------------------------------- pitch
// Median over many windows with parabolic interpolation on the normalized-ACF
// peak. A single window at integer-lag resolution reads tens of cents sharp on
// real material (measured on the NightwindHorn capture) — never trust one window.
function pitchWindow(mono, sampleRate, pos, winLen) {
  const win = mono.subarray(pos, pos + winLen);
  const minLag = Math.floor(sampleRate / 1600);
  const maxLag = Math.floor(sampleRate / 55);
  const N = win.length - maxLag;
  if (N < 512) return null;
  const scores = new Float32Array(maxLag + 2);
  let best = { lag: 0, s: -1 };
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0,
      e1 = 0,
      e2 = 0;
    for (let i = 0; i < N; i++) {
      num += win[i] * win[i + lag];
      e1 += win[i] ** 2;
      e2 += win[i + lag] ** 2;
    }
    scores[lag] = num / Math.sqrt(e1 * e2 + 1e-12);
    if (scores[lag] > best.s) best = { lag, s: scores[lag] };
  }
  // octave-error guard: a sub-multiple lag scoring nearly as well IS the period
  for (let div = 4; div >= 2; div--) {
    const lag = Math.round(best.lag / div);
    if (lag >= minLag && scores[lag] > best.s * 0.95) {
      best = { lag, s: scores[lag] };
      break;
    }
  }
  const l = best.lag;
  const y0 = scores[l - 1] ?? 0,
    y1 = scores[l],
    y2 = scores[l + 1] ?? 0;
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  return { f0: sampleRate / (l + Math.max(-0.5, Math.min(0.5, shift))), clarity: best.s };
}

function pitchTrack(mono, sampleRate, from, to) {
  const winLen = Math.floor(0.15 * sampleRate);
  const margin = Math.floor(0.5 * sampleRate); // skip attack scoop and decay
  const vals = [];
  for (let p = from + margin; p + winLen < to - margin; p += Math.floor(0.1 * sampleRate)) {
    const r = pitchWindow(mono, sampleRate, p, winLen);
    if (r && r.clarity > 0.8) vals.push(midiOf(r.f0));
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const q = (f) => vals[Math.min(vals.length - 1, Math.floor(vals.length * f))];
  return { median: q(0.5), iqrCents: (q(0.75) - q(0.25)) * 100, windows: vals.length };
}

// -------------------------------------------------------------------- encode
async function encodeMp3(int16, sampleRate) {
  let lame;
  try {
    const mod = await import('@breezystack/lamejs');
    lame = mod.default ?? mod;
  } catch {
    console.error('missing encoder — run: npm i --no-save mpg123-decoder @breezystack/lamejs');
    process.exit(2);
  }
  const enc = new lame.Mp3Encoder(1, sampleRate, KBPS);
  const parts = [];
  for (let j = 0; j < int16.length; j += 1152) {
    const chunk = enc.encodeBuffer(int16.subarray(j, Math.min(int16.length, j + 1152)));
    if (chunk.length) parts.push(Buffer.from(chunk));
  }
  const tail = enc.flush();
  if (tail.length) parts.push(Buffer.from(tail));
  // lamejs stops here, which leaves the stream with no Xing/Info frame and so no
  // way for a decoder to know about the 576-sample lookahead — it plays it back as
  // 25 ms of leading silence on every note. Tag it.
  return withGaplessTag(Buffer.concat(parts), int16.length, { kbps: KBPS, sampleRate });
}

function writeWav(file, float32, sampleRate) {
  const n = float32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(float32[i] * 32767);
    buf.writeInt16LE(v > 32767 ? 32767 : v < -32768 ? -32768 : v, 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
}

// ---------------------------------------------------------------------- main
const { channelData, length: n, sampleRate } = await decodeCapture(input);
const mono = new Float32Array(n);
for (const ch of channelData) for (let i = 0; i < n; i++) mono[i] += ch[i] / channelData.length;
console.log(
  `decoded ${path.basename(input)}: ${channelData.length}ch ${sampleRate}Hz ${(n / sampleRate).toFixed(1)}s`
);

// segmentation: RMS envelope with hysteresis — ON to start a note, a sustained
// drop below OFF to end it, so mid-note dips (tremolo, tail wobble) don't split.
const hop = 512;
const frames = Math.floor(n / hop);
const rmsDb = new Float32Array(frames);
for (let f = 0; f < frames; f++) rmsDb[f] = db(rmsOf(mono, f * hop, f * hop + hop));
const minGapFrames = Math.round((GAP_S * sampleRate) / hop);
const minLenFrames = Math.round((MIN_NOTE_S * sampleRate) / hop);
const coarse = [];
{
  let start = -1,
    lastLoud = -1;
  for (let f = 0; f < frames; f++) {
    if (start === -1) {
      if (rmsDb[f] > ON) {
        start = f;
        lastLoud = f;
      }
    } else if (rmsDb[f] > OFF) lastLoud = f;
    else if (f - lastLoud > minGapFrames) {
      if (lastLoud - start >= minLenFrames) coarse.push([start * hop, (lastLoud + 1) * hop]);
      start = -1;
    }
  }
  if (start !== -1 && lastLoud - start >= minLenFrames)
    coarse.push([start * hop, (lastLoud + 1) * hop]);
}
console.log(`segments: ${coarse.length}${EXPECT ? ` (expected ${EXPECT})` : ''}\n`);
let failed = false;
if (EXPECT && coarse.length !== EXPECT) {
  console.error(
    `FAIL: expected ${EXPECT} notes — tune --on-db/--off-db/--gap-s and re-run --dry-run`
  );
  process.exit(1);
}
if (MIDI_ARG && MIDI_ARG.length !== coarse.length) {
  console.error(`FAIL: --midi lists ${MIDI_ARG.length} ids for ${coarse.length} segments`);
  process.exit(1);
}

const win = (ms) => Math.round((ms / 1000) * sampleRate);
const report = [];
console.log(
  '#   | span            | dur    | pitch (midi, cents dev)   | IQR | attack | early RMS@100/200/300ms'
);
for (const [i, [c0, c1]] of coarse.entries()) {
  // onset: walk back from the coarse start until the 5 ms RMS reaches the floor,
  // then pre-roll 10 ms — keeps the true attack, drops the inter-note noise
  let s0 = c0;
  while (s0 > win(5) && db(rmsOf(mono, s0 - win(5), s0)) > -72) s0 -= win(2);
  s0 = Math.max(0, s0 - win(10));
  // tail: extend while audible (above -66 dBFS), cap +2 s, pad before the fade
  let s1 = c1;
  const cap = Math.min(n, c1 + win(2000));
  while (s1 + win(20) < cap && db(rmsOf(mono, s1, s1 + win(20))) > -66) s1 += win(20);
  s1 = Math.min(n, s1 + win(80));

  const p = pitchTrack(mono, sampleRate, s0, s1);
  const detected = p ? Math.round(p.median) : null;
  const authored = MIDI_ARG ? MIDI_ARG[i] : detected;
  const devCents = p && authored !== null ? (p.median - authored) * 100 : null;

  // attack time to within 3 dB of the note's own peak — slow swells need a
  // longer sustain.minLength or taps clip into the crescendo
  const f0i = Math.floor(s0 / hop),
    f1i = Math.min(frames, Math.floor(s1 / hop));
  let segPeakDb = -120;
  for (let f = f0i; f < f1i; f++) segPeakDb = Math.max(segPeakDb, rmsDb[f]);
  let attackS = 0;
  for (let f = f0i; f < f1i; f++)
    if (rmsDb[f] >= segPeakDb - 3) {
      attackS = ((f - f0i) * hop) / sampleRate;
      break;
    }
  const early = [100, 200, 300].map((ms) =>
    db(rmsOf(mono, s0, Math.min(s1, s0 + win(ms)))).toFixed(1)
  );

  report.push({
    i,
    s0,
    s1,
    authored,
    detected,
    median: p?.median ?? null,
    devCents,
    iqrCents: p?.iqrCents ?? null,
    attackS,
  });
  const flags = [];
  if (devCents !== null && Math.abs(devCents) > 12) {
    flags.push('PITCH-DEV');
    failed = true;
  }
  if (p && p.iqrCents > 25) flags.push('unstable-pitch');
  if (!p) flags.push('no-pitch(unpitched? verify)');
  console.log(
    `#${String(i + 1).padStart(2)} | ${(s0 / sampleRate).toFixed(2).padStart(6)}s→${(s1 / sampleRate).toFixed(2)}s | ${((s1 - s0) / sampleRate).toFixed(2)}s | ` +
      (p
        ? `${p.median.toFixed(2)} → ${authored} ${nameOf(authored).padEnd(3)} (${devCents.toFixed(0)}c)`
        : 'unpitched          ') +
      ` | ${p ? String(Math.round(p.iqrCents)).padStart(3) + 'c' : '  --'} | ${attackS.toFixed(2)}s | ${early.join(' / ')}` +
      (flags.length ? `  <-- ${flags.join(' ')}` : '')
  );
}
const ids = report.map((r) => r.authored);
if (new Set(ids).size !== ids.length) {
  console.error('FAIL: duplicate Note Ids — pass --midi explicitly');
  failed = true;
}
if (DRY) {
  console.log(
    `\ndry run only — re-run with --out <dir>${failed ? ' after fixing the flagged notes' : ''}`
  );
  process.exit(failed ? 1 : 0);
}

// extraction: trim → DC → edge fades → normalize → encode → decode-back verify
fs.mkdirSync(OUT_DIR, { recursive: true });
const notes = [];
for (const r of report) {
  const seg = mono.slice(r.s0, r.s1);
  let mean = 0;
  for (const v of seg) mean += v / seg.length;
  for (let j = 0; j < seg.length; j++) seg[j] -= mean;
  const fi = win(3); // fade-in: the pre-roll starts inside noise, not silence
  for (let j = 0; j < fi && j < seg.length; j++) seg[j] *= j / fi;
  const fo = Math.min(win(100), seg.length); // raised-cosine out: click-proof end
  for (let j = 0; j < fo; j++) seg[seg.length - fo + j] *= 0.5 * (1 + Math.cos((Math.PI * j) / fo));
  let peak = 0;
  for (const v of seg) peak = Math.max(peak, Math.abs(v));
  const gain = TARGET_PEAK / peak;
  for (let j = 0; j < seg.length; j++) seg[j] *= gain;

  const int16 = new Int16Array(seg.length);
  for (let j = 0; j < seg.length; j++) {
    const v = Math.round(seg[j] * 32767);
    int16[j] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  const file = `m${r.authored}.mp3`;
  fs.writeFileSync(path.join(OUT_DIR, file), await encodeMp3(int16, sampleRate));
  if (flag('wav')) writeWav(path.join(OUT_DIR, `m${r.authored}.wav`), seg, sampleRate);
  notes.push({ file, midi: r.authored, baseNote: NOTE_NAMES[((r.authored % 12) + 12) % 12] });
}

// verify what was actually written: decode back, re-check pitch, level and onset.
// Onset matters because it is silent when it goes wrong — an untagged stream still
// decodes at the right pitch and level, it just arrives TOTAL_DELAY samples late.
const MAX_LEAD_SILENCE = TOTAL_DELAY / 2; // half the delay: comfortably under a miss
const { MPEGDecoder } = await import('mpg123-decoder');
for (const r of report) {
  const decoder = new MPEGDecoder();
  await decoder.ready;
  const out = decoder.decode(
    new Uint8Array(fs.readFileSync(path.join(OUT_DIR, `m${r.authored}.mp3`)))
  );
  decoder.free();
  const ch = out.channelData[0];
  let peak = 0;
  for (const v of ch) peak = Math.max(peak, Math.abs(v));
  const p = pitchTrack(ch, out.sampleRate, 0, out.samplesDecoded);
  const dev = p ? (p.median - r.authored) * 100 : null;
  let lead = 0;
  while (lead < ch.length && Math.abs(ch[lead]) < 2.5e-4) lead++; // ~-72 dBFS
  const bad =
    peak > 1 ||
    peak < TARGET_PEAK * 0.7 ||
    (dev !== null && Math.abs(dev) > 12) ||
    lead > MAX_LEAD_SILENCE;
  if (bad) failed = true;
  console.log(
    `verify m${r.authored}.mp3: ${(out.samplesDecoded / out.sampleRate).toFixed(2)}s peak ${db(peak).toFixed(1)}dB` +
      (dev !== null ? ` pitch dev ${dev.toFixed(0)}c` : '') +
      ` lead ${((lead / out.sampleRate) * 1000).toFixed(1)}ms` +
      (bad ? '  <-- CHECK' : '')
  );
}
fs.writeFileSync(path.join(OUT_DIR, 'notes.json'), JSON.stringify(notes, null, 2));
console.log(
  `\nwrote ${notes.length} notes + notes.json to ${OUT_DIR} — baseNote spellings and icons need review`
);
process.exit(failed ? 1 : 0);
