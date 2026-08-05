// Headless companion to analyze-audio-loops.html: the same loop-candidate algorithm,
// but reading PCM WAV files directly with Node — no browser, no decode ambiguity
// (which is also why sustained instruments should ship WAV/FLAC: MP3 encoder padding
// shifts decoded positions per browser, moving tuned loop points).
//
//   node analyze-wav-loops.mjs <dir> [count] [midiCsv] [searchJson]
//
//   <dir>        folder with 0.wav .. N-1.wav
//   [count]      number of files (default 8)
//   [midiCsv]    per-file MIDI ids for fundamental estimation, e.g. "60,62,64"
//   [searchJson] JSON overrides: {startMin,startMax,endMin,endMax,loopMin,loopMax,top}
//
// Prints per-file candidates (best first) as JSON, same fields as the HTML tool.
// Audition the winners with the HTML tool before authoring metadata.
import fs from 'node:fs';
import path from 'node:path';

const [, , dir, countArg, midiArg, searchArg] = process.argv;
if (!dir) {
  console.error('usage: node analyze-wav-loops.mjs <dir> [count] [midiCsv] [searchJson]');
  process.exit(1);
}
const count = Number(countArg ?? 8);
const midi = midiArg
  ? midiArg.split(',').map(Number)
  : [60, 62, 64, 65, 67, 69, 71, 72];
const search = {
  startMin: 0.3,
  startMax: 1.5,
  endMin: 0.55,
  endMax: 2.3,
  loopMin: 0.12,
  loopMax: 0.8,
  top: 6,
  ...(searchArg ? JSON.parse(searchArg) : {}),
};

function readWavMono(file) {
  const buffer = fs.readFileSync(file);
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error(`${file}: not RIFF/WAVE`);
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ')
      fmt = {
        format: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        rate: buffer.readUInt32LE(body + 4),
        bits: buffer.readUInt16LE(body + 14),
      };
    else if (id === 'data') data = buffer.subarray(body, body + size);
    offset = body + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt/data`);
  if (fmt.format !== 1 && fmt.format !== 65534)
    throw new Error(`${file}: unsupported format ${fmt.format}`);
  const bytes = fmt.bits / 8;
  const frames = Math.floor(data.length / (bytes * fmt.channels));
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const at = (i * fmt.channels + c) * bytes;
      if (fmt.bits === 16) sum += data.readInt16LE(at) / 32768;
      else if (fmt.bits === 24)
        sum += ((data[at] | (data[at + 1] << 8) | (data[at + 2] << 16)) << 8 >> 8) / 8388608;
      else if (fmt.bits === 32) sum += data.readInt32LE(at) / 2147483648;
      else throw new Error(`${file}: unsupported bit depth ${fmt.bits}`);
    }
    mono[i] = sum / fmt.channels;
  }
  return { mono, rate: fmt.rate };
}

// ── identical algorithm to analyze-audio-loops.html (keep the two in sync) ──────
function analyse(data, rate, midiNote) {
  const fundamental = 440 * 2 ** ((midiNote - 69) / 12);
  const alpha = 1 - Math.exp((-2 * Math.PI * Math.min(fundamental * 1.35, 1600)) / rate);
  const phaseSignal = new Float32Array(data.length);
  let stage1 = 0;
  let stage2 = 0;
  for (let i = 0; i < data.length; i++) {
    stage1 += alpha * (data[i] - stage1);
    stage2 += alpha * (stage1 - stage2);
    phaseSignal[i] = stage2;
  }

  const rms = (centre, radius) => {
    let sum = 0;
    let samples = 0;
    for (let i = Math.max(0, centre - radius); i < Math.min(data.length, centre + radius); i += 8) {
      sum += data[i] ** 2;
      samples++;
    }
    return Math.sqrt(sum / Math.max(1, samples));
  };

  const comparisonRadius = Math.round(rate * 0.06);
  const refinementRadius = Math.round((rate / fundamental) * 0.3);
  const safeMargin = Math.max(comparisonRadius, refinementRadius + 2);
  const frameAt = (seconds) =>
    Math.max(safeMargin, Math.min(data.length - safeMargin - 1, Math.round(seconds * rate)));
  const startMin = frameAt(search.startMin);
  const startMax = frameAt(search.startMax);
  const endMin = frameAt(search.endMin);
  const endMax = frameAt(search.endMax);
  const starts = [];
  const ends = [];
  const minimumGap = (rate / fundamental) * 0.58;
  let lastCrossing = -Infinity;

  for (let i = startMin; i <= endMax; i++) {
    if (!(phaseSignal[i - 1] <= 0 && phaseSignal[i] > 0 && i - lastCrossing >= minimumGap)) continue;
    lastCrossing = i;
    let frame = i;
    let strongestSlope = -Infinity;
    for (let j = i - refinementRadius; j <= i + refinementRadius; j++) {
      if (data[j - 1] <= 0 && data[j] > 0) {
        const slope = data[j + 1] - data[j - 1];
        if (slope > strongestSlope) {
          strongestSlope = slope;
          frame = j;
        }
      }
    }
    const point = {
      frame,
      slope: data[frame + 1] - data[frame - 1],
      rms5: rms(frame, Math.round(rate * 0.005)),
      rms40: rms(frame, Math.round(rate * 0.04)),
    };
    if (frame <= startMax) starts.push(point);
    if (frame >= endMin) ends.push(point);
  }

  let shortlist = [];
  const trim = () => {
    shortlist.sort((a, b) => a.featureScore - b.featureScore);
    shortlist.length = Math.min(shortlist.length, 2500);
  };
  for (const start of starts) {
    for (const end of ends) {
      const loopLength = (end.frame - start.frame) / rate;
      if (loopLength < search.loopMin || loopLength > search.loopMax) continue;
      const levelRatio =
        (Math.min(start.rms40, end.rms40) + 1e-7) / (Math.max(start.rms40, end.rms40) + 1e-7);
      if (levelRatio < 0.84) continue;
      const slopeError =
        Math.abs(start.slope - end.slope) /
        Math.max(Math.abs(start.slope), Math.abs(end.slope), 1e-7);
      const levelError = Math.abs(start.rms5 - end.rms5) / Math.max(start.rms5, end.rms5, 1e-7);
      const boundaryError =
        Math.abs(data[end.frame - 1] - data[start.frame]) /
        Math.max((start.rms5 + end.rms5) * 0.5, 1e-7);
      if (slopeError > 0.55 || levelError > 0.24 || boundaryError > 0.08) continue;
      const featureScore = slopeError * 0.55 + levelError * 0.35 + boundaryError * 0.1;
      shortlist.push({ start, end, levelRatio, boundaryError, featureScore });
      if (shortlist.length >= 10000) trim();
    }
  }
  trim();

  const radius = comparisonRadius;
  for (const candidate of shortlist) {
    let nearError = 0;
    let wideError = 0;
    let reference = 0;
    for (let offset = -radius; offset <= radius; offset += 4) {
      const a = data[candidate.start.frame + offset];
      const b = data[candidate.end.frame + offset];
      const delta = a - b;
      const seconds = Math.abs(offset) / rate;
      const weight = seconds <= 0.012 ? 4 : seconds <= 0.03 ? 2 : 0.5;
      wideError += delta ** 2 * weight;
      reference += (a ** 2 + b ** 2) * 0.5 * weight;
      if (seconds <= 0.012) nearError += delta ** 2;
    }
    candidate.waveError = wideError / Math.max(reference, 1e-12);
    candidate.nearError = nearError / Math.max(reference, 1e-12);
    candidate.score = candidate.waveError + candidate.featureScore * 0.018;
  }
  shortlist.sort((a, b) => a.score - b.score);

  const distinct = [];
  for (const candidate of shortlist) {
    if (
      distinct.every(
        (other) =>
          Math.abs(other.start.frame - candidate.start.frame) > rate * 0.025 ||
          Math.abs(other.end.frame - candidate.end.frame) > rate * 0.025
      )
    )
      distinct.push(candidate);
    if (distinct.length >= search.top) break;
  }

  const secondsAt = (frame) => Math.round((frame * 1_000_000) / rate) / 1_000_000;
  return distinct.map((candidate) => ({
    startFrame: candidate.start.frame,
    endFrame: candidate.end.frame,
    start: secondsAt(candidate.start.frame),
    end: secondsAt(candidate.end.frame),
    length: secondsAt(candidate.end.frame - candidate.start.frame),
    waveError: candidate.waveError,
    nearError: candidate.nearError,
    levelRatio: candidate.levelRatio,
    boundaryError: candidate.boundaryError,
    spliceDelta: data[candidate.end.frame - 1] - data[candidate.start.frame],
  }));
}

const results = [];
for (let index = 0; index < count; index++) {
  const file = path.join(dir, `${index}.wav`);
  const { mono, rate } = readWavMono(file);
  results.push({
    file: `${index}.wav`,
    midi: midi[index] ?? midi.at(-1) ?? 60,
    sampleRate: rate,
    frames: mono.length,
    duration: mono.length / rate,
    candidates: analyse(mono, rate, midi[index] ?? 60),
  });
}
console.log(JSON.stringify(results, null, 2));
