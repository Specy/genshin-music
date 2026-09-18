#!/usr/bin/env node
// Add the Xing/Info gapless frame to instrument samples encoded before
// extract-notes.mjs started writing one. Without it a decoder replays lamejs's
// 1105-sample lookahead as ~25 ms of leading silence — latency on every attack.
// See mp3-gapless.mjs for why, and ../SKILL.md for the workflow this belongs to.
//
// This rewrites metadata only: the audio frames are copied byte-for-byte, so it
// is lossless and re-running it is a no-op on files that are already tagged.
//
// usage:
//   node add-gapless-tag.mjs [--dry-run] [--verify] [<file-or-dir> ...]
//     with no path, scans src/lib/games/*/instruments/
//     [--dry-run]  report what would change, write nothing
//     [--verify]   decode each result back and report where the attack now lands
//
// Deps (NOT in package.json — one-off tooling, and only for --verify): run
//   npm i --no-save mpg123-decoder
// from the repo root first.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasGaplessTag, withGaplessTag } from './mp3-gapless.mjs';

// ---------------------------------------------------------------- arg parsing
const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const VERIFY = args.includes('--verify');
const paths = args.filter((a) => !a.startsWith('--'));
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const mp3sUnder = (p) => {
  if (!fs.existsSync(p)) return [];
  if (fs.statSync(p).isFile()) return p.endsWith('.mp3') ? [p] : [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .flatMap((e) => mp3sUnder(path.join(p, e.name)))
    .sort();
};

const roots = paths.length
  ? paths
  : ['genshin', 'sky'].map((g) => path.join(REPO, 'src/lib/games', g, 'instruments'));
const files = roots.flatMap(mp3sUnder);
if (!files.length) {
  console.error('no .mp3 files found');
  process.exit(2);
}

// -------------------------------------------------------------------- rewrite
const tagged = [];
const unhandled = [];
let skipped = 0;
for (const file of files) {
  const before = fs.readFileSync(file);
  if (hasGaplessTag(before)) {
    skipped++;
    continue;
  }
  let after;
  try {
    after = withGaplessTag(before);
  } catch (e) {
    unhandled.push([file, e.message]); // e.g. the MPEG2 sky SFX captures
    continue;
  }
  if (!after.subarray(after.length - before.length).equals(before)) {
    console.error(`REFUSING ${file}: audio bytes would change`);
    process.exit(1);
  }
  if (!DRY) fs.writeFileSync(file, after);
  tagged.push(file);
}

const rel = (f) => path.relative(REPO, f);
const byInstrument = new Map();
for (const f of tagged) {
  const k = path.dirname(rel(f));
  byInstrument.set(k, (byInstrument.get(k) ?? 0) + 1);
}
for (const [inst, n] of [...byInstrument].sort())
  console.log(`${DRY ? 'would tag' : 'tagged'} ${String(n).padStart(3)}  ${inst}`);
console.log(
  `\n${DRY ? 'would tag' : 'tagged'} ${tagged.length} file(s) across ${byInstrument.size} instrument(s); ${skipped} already tagged`
);
for (const [file, why] of unhandled) console.log(`left alone  ${rel(file)}: ${why}`);

// --------------------------------------------------------------------- verify
if (VERIFY && !DRY && tagged.length) {
  const { MPEGDecoder } = await import('mpg123-decoder');
  let worst = 0;
  for (const file of tagged) {
    const decoder = new MPEGDecoder();
    await decoder.ready;
    const out = decoder.decode(new Uint8Array(fs.readFileSync(file)));
    decoder.free();
    const ch = out.channelData[0];
    let peak = 0;
    for (const v of ch) peak = Math.max(peak, Math.abs(v));
    let onset = 0;
    while (onset < ch.length && Math.abs(ch[onset]) < peak * 0.1) onset++;
    const ms = (onset / out.sampleRate) * 1000;
    worst = Math.max(worst, ms);
    if (ms > 20) console.log(`  ${rel(file)}: attack still at ${ms.toFixed(1)} ms  <-- CHECK`);
  }
  console.log(`verified ${tagged.length} file(s); worst attack offset ${worst.toFixed(1)} ms`);
}
