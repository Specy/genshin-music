// Tier-1 game registry (ADR-0003): the eager, JSON-only metadata map of ALL games.
//
// Everything here comes from `import.meta.glob` over the game folders' JSON — no
// Svelte, no components — so this module is importable ANYWHERE, including the
// DOM-free service worker. The full per-game definition (glyph components, Shape
// implementations) is tier 2: games/<id>/index.ts assembles it via defineGame(),
// still selected at build time through the `$game` alias. PUBLIC_GAME is the
// DEFAULT game; a future runtime game switch replaces the alias consumer with a
// lazy `import.meta.glob('./*/index.ts')` over this same map and nothing here
// changes.
//
// Validation strategy: invariants are thrown here at module evaluation — that
// surfaces instantly in dev and FAILS THE BUILD in prod (every route prerenders,
// which evaluates this module). The raw JSON is CAST at the glob boundary, so what
// TS can't promise is checked here (Codex review M3/M4): path/URL-safe names and
// files, integer + per-instrument-unique Note Ids (the reverse button map is
// first-occurrence-wins — duplicates would silently break song round-trips), legal
// baseNote values, sane sustain/loop regions, required game.json sections, and a
// duplicate-free roster. Filesystem-level checks (sample files exist on disk) live
// in test/gameConfig.test.ts, where fs access exists; icon/shape/label checks need
// the code side and live in defineGame().
import type { GameId, LoopRegion } from './types';
import { BASE_NOTES, type InstrumentDefinition, type InstrumentNote } from './types';
import type { GameJson, InstrumentMetaJson, NoteMetaJson, NotePresetsJson } from './schema';

export type GameMeta = {
  gameJson: GameJson;
  /** Normalized instruments by name — every folder, including Unlisted Instruments. */
  instruments: Readonly<Record<string, InstrumentDefinition>>;
};

// Raw JSON imports type loosely (see schema.ts header): one cast at this boundary,
// then invariants below enforce what TS can't.
const gameJsons = import.meta.glob('./*/game.json', { eager: true, import: 'default' }) as Record<
  string,
  GameJson
>;
const presetJsons = import.meta.glob('./*/presets.json', {
  eager: true,
  import: 'default',
}) as Record<string, NotePresetsJson>;
const instrumentMetas = import.meta.glob('./*/instruments/*/meta.json', {
  eager: true,
  import: 'default',
}) as Record<string, InstrumentMetaJson>;

function fail(context: string, message: string): never {
  throw new Error(`[games/registry] ${context}: ${message}`);
}

// Instrument folder names and sample file names end up verbatim in filesystem paths
// (gameStatic.js overlay copy) and in fetch URLs (/assets/audio/<game>/<name>/<file>).
// This charset makes URL-encoding a no-op and path escapes unrepresentable: no '/',
// no '\', no '#'/'?'/'%', no spaces or control characters ('..' is rejected below).
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;
function assertSafeSegment(context: string, kind: string, value: string): void {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value) || value === '.' || value === '..') {
    fail(context, `${kind} "${value}" must match ${SAFE_SEGMENT} (path/URL-safe, not '.'/'..')`);
  }
}

function assertNonEmptyString(context: string, field: string, value: unknown): void {
  if (typeof value !== 'string' || value.length === 0) {
    fail(context, `${field} must be a non-empty string`);
  }
}

function assertLoop(context: string, label: string, loop: LoopRegion): void {
  if (
    typeof loop !== 'object' ||
    loop === null ||
    !Number.isFinite(loop.start) ||
    !Number.isFinite(loop.end) ||
    loop.start < 0 ||
    loop.start >= loop.end
  ) {
    fail(context, `${label} must be {start, end} seconds with 0 <= start < end`);
  }
}

function normalizeNotes(
  context: string,
  meta: InstrumentMetaJson,
  presets: NotePresetsJson
): InstrumentNote[] {
  let authored: NoteMetaJson[];
  if (typeof meta.notes === 'string') {
    const preset = presets[meta.notes];
    if (!preset) fail(context, `unknown notes preset "${meta.notes}"`);
    authored = preset;
  } else {
    authored = meta.notes;
  }
  if (!Array.isArray(authored) || authored.length === 0) {
    fail(context, 'notes must be a preset name or a non-empty array');
  }
  const notes = authored.map((note, index) => {
    if (!Number.isInteger(note.midi)) {
      fail(context, `note ${index}: Note Id (midi) must be an integer, got ${note.midi}`);
    }
    if (!BASE_NOTES.includes(note.baseNote)) {
      fail(context, `note ${index}: unknown baseNote "${note.baseNote}"`);
    }
    assertNonEmptyString(context, `note ${index} icon`, note.icon);
    if (note.loop) assertLoop(context, `note ${index} loop`, note.loop);
    const file = note.file ?? `${index}.mp3`;
    assertSafeSegment(context, `note ${index} file`, file);
    return {
      file,
      midi: note.midi,
      baseNote: note.baseNote,
      icon: note.icon,
      ...(note.loop ? { loop: note.loop } : {}),
    };
  });
  // Note Ids are per-instrument identity (ADR-0001): the id->button reverse map is
  // first-occurrence-wins, so a duplicate would silently strand the later button.
  const ids = new Set(notes.map((n) => n.midi));
  if (ids.size !== notes.length) fail(context, 'duplicate Note Ids (midi) within the instrument');
  return notes;
}

function validateGameJson(id: string, gameJson: GameJson): void {
  if (gameJson.id !== id) fail(id, `game.json id "${gameJson.id}" != folder name "${id}"`);
  assertNonEmptyString(id, 'storageId', gameJson.storageId);
  for (const section of [
    'display',
    'meta',
    'notes',
    'instruments',
    'midi',
    'composer',
    'themes',
    'settings',
    'features',
    'i18n',
  ] as const) {
    if (typeof gameJson[section] !== 'object' || gameJson[section] === null) {
      fail(id, `game.json is missing the "${section}" section`);
    }
  }
  for (const field of ['perColumn', 'perRow'] as const) {
    if (!Number.isInteger(gameJson.notes[field]) || gameJson.notes[field] <= 0) {
      fail(id, `notes.${field} must be a positive integer`);
    }
  }
  const list = gameJson.instruments.list;
  if (!Array.isArray(list) || list.length === 0) {
    fail(id, 'instruments.list must be a non-empty array');
  }
  if (new Set(list).size !== list.length) fail(id, 'instruments.list has duplicate entries');
}

function buildGameMeta(id: string): GameMeta {
  const gameJson = gameJsons[`./${id}/game.json`];
  const presets = presetJsons[`./${id}/presets.json`] ?? {};
  validateGameJson(id, gameJson);

  const instruments: Record<string, InstrumentDefinition> = {};
  const prefix = `./${id}/instruments/`;
  for (const [path, meta] of Object.entries(instrumentMetas)) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split('/')[0];
    const context = `${id}/${name}`;
    // The folder name is the audio URL segment and what songs reference.
    assertSafeSegment(context, 'instrument folder name', name);
    assertNonEmptyString(context, 'displayName', meta.displayName);
    assertNonEmptyString(context, 'family', meta.family);
    assertNonEmptyString(context, 'midiName', meta.midiName);
    assertNonEmptyString(context, 'shape', meta.shape);
    if (meta.sustain !== undefined) {
      if (!Number.isFinite(meta.sustain.release) || meta.sustain.release < 0) {
        fail(context, 'sustain.release must be a non-negative number');
      }
      if (
        meta.sustain.crossfade !== undefined &&
        (!Number.isFinite(meta.sustain.crossfade) || meta.sustain.crossfade < 0)
      ) {
        fail(context, 'sustain.crossfade must be a non-negative number');
      }
      assertLoop(context, 'sustain.loop', meta.sustain.loop);
    }
    instruments[name] = {
      name,
      displayName: meta.displayName,
      family: meta.family,
      midiName: meta.midiName,
      ...(meta.fill !== undefined ? { fill: meta.fill } : {}),
      ...(meta.clickColor !== undefined ? { clickColor: meta.clickColor } : {}),
      shape: meta.shape,
      ...(meta.sustain !== undefined ? { sustain: meta.sustain } : {}),
      notes: normalizeNotes(context, meta, presets),
    };
  }

  for (const listed of gameJson.instruments.list) {
    if (!instruments[listed]) {
      fail(id, `instruments.list entry "${listed}" has no instruments/${listed}/meta.json`);
    }
  }
  return { gameJson, instruments };
}

/** Every game folder discovered at build time, keyed by id. */
export const gamesMeta: Readonly<Record<GameId, GameMeta>> = Object.fromEntries(
  Object.keys(gameJsons).map((path) => {
    const id = path.split('/')[1];
    return [id, buildGameMeta(id)];
  })
) as Record<GameId, GameMeta>;
