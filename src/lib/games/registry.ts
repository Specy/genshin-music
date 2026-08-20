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
// first-occurrence-wins — duplicates would silently break song round-trips), every
// instrument note id being a member of the game's Song Grid (ADR-0004), a derivable
// Sounding Pitch per Pitched Button and a collision-free Note Number per BUTTON of
// either kind (ADR-0007), sane sustain/loop regions, required game.json sections, and
// a duplicate-free roster. Filesystem-level checks (sample files exist on disk) live in
// test/gameConfig.test.ts, where fs access exists; icon/shape/label checks need the
// code side and live in defineGame().
import type { GameId, LoopRegion } from './types';
import {
  BASE_NOTE_PITCH_CLASSES,
  type InstrumentDefinition,
  type InstrumentNote,
  SUSTAIN_LOOP_MODES,
} from './types';
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

/**
 * The Sounding Pitch of a Pitched Button (ADR-0007): the Note Number nearest `nominal`
 * whose semitone class is `pitchClass`. null when the two are a tritone apart — the one
 * distance a semitone class leaves two equally near answers at, since a class repeats
 * every 12 semitones and so always has a match within 6 of any nominal. Ties are an
 * authoring error, not something to break arbitrarily: an instrument really tuned that
 * far from its nominal grid needs its own decision, not a coin flip.
 */
export function nearestChromaticMatch(nominal: number, pitchClass: number): number | null {
  const upward = (((pitchClass - nominal) % 12) + 12) % 12;
  const offset = upward <= 6 ? upward : upward - 12;
  return Math.abs(offset) >= 6 ? null : nominal + offset;
}

/**
 * Resolve one instrument's authored `notes` (a preset name or an inline array) into the
 * runtime note structs, deriving each button's identity and rejecting what the JSON cast
 * cannot promise. Takes the notes rather than the whole meta so the config tests can drive
 * the same validator the registry runs, on authored note lists of their own.
 */
export function normalizeNotes(
  context: string,
  authoredNotes: InstrumentMetaJson['notes'],
  presets: NotePresetsJson
): InstrumentNote[] {
  let authored: NoteMetaJson[];
  if (typeof authoredNotes === 'string') {
    const preset = presets[authoredNotes];
    if (!preset) fail(context, `unknown notes preset "${authoredNotes}"`);
    authored = preset;
  } else {
    authored = authoredNotes;
  }
  if (!Array.isArray(authored) || authored.length === 0) {
    fail(context, 'notes must be a preset name or a non-empty array');
  }
  const notes = authored.map((note, index) => {
    if (!Number.isInteger(note.midi)) {
      fail(context, `note ${index}: Note Id (midi) must be an integer, got ${note.midi}`);
    }
    // Absent = Pitched Button (ADR-0007). `pitched: false` is the ONLY spelling of an
    // Assigned Button, so a chord label can never quietly reclassify a tuned button.
    const pitched = note.pitched !== false;
    // An Assigned Button sounds no single pitch, so its Note Number is its Nominal Id
    // carried by the Basepoint — its label is free text and nothing reads it.
    let sounding = note.midi;
    if (pitched) {
      const pitchClass = BASE_NOTE_PITCH_CLASSES.get(note.baseNote);
      if (pitchClass === undefined) {
        fail(
          context,
          `note ${index}: a Pitched Button's baseNote must be a bare pitch class (C, Db, F#, …), got "${note.baseNote}" — a percussion, SFX or chord-strum button declares "pitched": false and may then label itself anything`
        );
      }
      const match = nearestChromaticMatch(note.midi, pitchClass);
      if (match === null) {
        fail(
          context,
          `note ${index}: baseNote "${note.baseNote}" is a tritone from Nominal Id ${note.midi}, so its Sounding Pitch could be either neighbour — author the intended spelling, or "pitched": false if the button sounds no single pitch`
        );
      }
      sounding = match;
    }
    assertNonEmptyString(context, `note ${index} icon`, note.icon);
    if (note.loop) assertLoop(context, `note ${index} loop`, note.loop);
    if (note.minLength !== undefined && (!Number.isFinite(note.minLength) || note.minLength < 0)) {
      fail(context, `note ${index}: minLength must be a non-negative number`);
    }
    const file = note.file ?? `${index}.mp3`;
    assertSafeSegment(context, `note ${index} file`, file);
    return {
      file,
      midi: note.midi,
      baseNote: note.baseNote,
      pitched,
      sounding,
      icon: note.icon,
      ...(note.loop ? { loop: note.loop } : {}),
      ...(note.minLength !== undefined ? { minLength: note.minLength } : {}),
    };
  });
  // Nominal Ids are per-instrument identity (ADR-0001): the id->button reverse map is
  // first-occurrence-wins, so a duplicate would silently strand the later button.
  const ids = new Set(notes.map((n) => n.midi));
  if (ids.size !== notes.length) fail(context, 'duplicate Note Ids (midi) within the instrument');
  // Two buttons entering the same Note Number are indistinguishable in every song (ADR-0007),
  // and the Note Number -> button map (noteIds.getSoundingReverseMap) is first-occurrence-wins,
  // so the later one would be voiced by the earlier one's sample. Checked across BOTH kinds:
  // an Assigned Button's Note Number is its Nominal Id, so it can land on a Pitched neighbour's
  // Sounding Pitch just as easily as two Pitched Buttons can land on each other. Two ASSIGNED
  // buttons cannot collide here at all — their soundings are their (already unique) Nominal Ids.
  const soundingPitches = notes.map((n) => n.sounding);
  const collision = soundingPitches.find((sounding, i) => soundingPitches.indexOf(sounding) !== i);
  if (collision !== undefined) {
    fail(
      context,
      `duplicate Sounding Pitches: two buttons both enter Note Number ${collision}, so a song could only ever address the first of them`
    );
  }
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
  // ADR-0004: the Song Grid places a note by its Note Id, so canonicalNoteIds[N] is
  // the id whose row is composerPositions[N] — the pairing is positional and there is
  // one entry per grid row. The row count is `perColumn`, NOT composerPositions.length:
  // sky's composerPositions carries six trailing entries (rows 15-20 of a 15-row grid)
  // left over from the legacy config that no instrument can index and that the frozen
  // config-surface fixture pins, so only its first `perColumn` entries are ever read.
  const canonicalNoteIds = gameJson.notes.canonicalNoteIds;
  if (
    !Array.isArray(canonicalNoteIds) ||
    !canonicalNoteIds.every((noteId) => Number.isInteger(noteId))
  ) {
    fail(id, 'notes.canonicalNoteIds must be an array of integer Note Ids');
  }
  // A duplicate would give one id two rows and leave another row unreachable.
  if (new Set(canonicalNoteIds).size !== canonicalNoteIds.length) {
    fail(id, 'notes.canonicalNoteIds has duplicate Note Ids');
  }
  if (canonicalNoteIds.length !== gameJson.notes.perColumn) {
    fail(
      id,
      `notes.canonicalNoteIds must list one Note Id per Song Grid row: got ${canonicalNoteIds.length}, notes.perColumn is ${gameJson.notes.perColumn}`
    );
  }
  const composerPositions = gameJson.notes.composerPositions;
  if (!Array.isArray(composerPositions) || composerPositions.length < canonicalNoteIds.length) {
    fail(id, 'notes.composerPositions must have a row for every notes.canonicalNoteIds entry');
  }
  // Those first `perColumn` entries must be a PERMUTATION of the grid's rows. The canvas
  // draws slot N at row composerPositions[N], and ComposedSong.moveNotesBy inverts that
  // map (row -> slot) to shift a selection vertically; both rely on the pairing being a
  // bijection. A duplicate would stack two slots invisibly on one row and hide one of
  // them from the inverse, and an out-of-range row would put a slot off the grid — in
  // either case the move tool silently DROPS notes on a row the user can see.
  const gridPositions = composerPositions.slice(0, gameJson.notes.perColumn);
  const rowsAreBijective =
    gridPositions.every((row) => Number.isInteger(row) && row >= 0 && row < gridPositions.length) &&
    new Set(gridPositions).size === gridPositions.length;
  if (!rowsAreBijective) {
    fail(
      id,
      `the first ${gridPositions.length} notes.composerPositions entries must be a permutation of rows 0..${gridPositions.length - 1} (one canvas row per Song Grid slot): got ${JSON.stringify(gridPositions)}`
    );
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

  // ADR-0004: the Song Grid places every note by its Note Id alone, so an id no grid row
  // owns is playable but UNDRAWABLE — songGridSlotForId returns -1 and the composer
  // canvas silently skips the note on every track. Both shipped games satisfy this today
  // (drum, horn and SFX id sets are all subsets of their game's grid); what this catches
  // is a preset or an inline note list drifting out of the authored canonicalNoteIds.
  const gridIds = new Set(gameJson.notes.canonicalNoteIds);
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
      if (
        meta.sustain.loopCrossfade !== undefined &&
        (!Number.isFinite(meta.sustain.loopCrossfade) || meta.sustain.loopCrossfade < 0)
      ) {
        fail(context, 'sustain.loopCrossfade must be a non-negative number');
      }
      if (
        meta.sustain.loopMode !== undefined &&
        !SUSTAIN_LOOP_MODES.includes(meta.sustain.loopMode)
      ) {
        fail(context, `sustain.loopMode must be one of ${SUSTAIN_LOOP_MODES.join(', ')}`);
      }
      if (
        meta.sustain.minLength !== undefined &&
        (!Number.isFinite(meta.sustain.minLength) || meta.sustain.minLength < 0)
      ) {
        fail(context, 'sustain.minLength must be a non-negative number');
      }
      // Optional since the loopless-sustain authoring (schema.ts): no loop anywhere
      // = held notes play their file once and note-off fades.
      if (meta.sustain.loop !== undefined) assertLoop(context, 'sustain.loop', meta.sustain.loop);
    }
    const notes = normalizeNotes(context, meta.notes, presets);
    for (const note of notes) {
      if (!gridIds.has(note.midi)) {
        fail(
          context,
          `Note Id ${note.midi} is not in ${id}'s notes.canonicalNoteIds, so the Song Grid has no row to draw it on`
        );
      }
    }
    instruments[name] = {
      name,
      displayName: meta.displayName,
      family: meta.family,
      midiName: meta.midiName,
      ...(meta.fill !== undefined ? { fill: meta.fill } : {}),
      ...(meta.clickColor !== undefined ? { clickColor: meta.clickColor } : {}),
      shape: meta.shape,
      ...(meta.sustain !== undefined
        ? { sustain: { ...meta.sustain, loopMode: meta.sustain.loopMode ?? 'loop-continuous' } }
        : {}),
      notes,
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
