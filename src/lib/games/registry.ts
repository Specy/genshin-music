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
// which evaluates this module). Filesystem-level checks (sample files exist on
// disk) live in test/gameConfig.test.ts, where fs access exists.
import type { GameId } from './types';
import type { InstrumentDefinition, InstrumentNote } from './types';
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
  return authored.map((note, index) => {
    if (typeof note.midi !== 'number') fail(context, `note ${index} is missing its Note Id (midi)`);
    return {
      file: note.file ?? `${index}.mp3`,
      midi: note.midi,
      baseNote: note.baseNote,
      icon: note.icon,
      ...(note.loop ? { loop: note.loop } : {}),
    };
  });
}

function buildGameMeta(id: string): GameMeta {
  const gameJson = gameJsons[`./${id}/game.json`];
  const presets = presetJsons[`./${id}/presets.json`] ?? {};
  if (gameJson.id !== id) fail(id, `game.json id "${gameJson.id}" != folder name "${id}"`);

  const instruments: Record<string, InstrumentDefinition> = {};
  const prefix = `./${id}/instruments/`;
  for (const [path, meta] of Object.entries(instrumentMetas)) {
    if (!path.startsWith(prefix)) continue;
    const name = path.slice(prefix.length).split('/')[0];
    const context = `${id}/${name}`;
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
