// Tier-2 assembler (ADR-0003): gamesMeta (JSON, all games) + the game's CODE parts
// (Shape registry, glyph components) -> the full runtime GameDefinition.
// games/<id>/index.ts is a thin call site; everything data-derived happens here.
//
// Throws on cross-domain invariants the registry can't check (they need the code
// side): unknown Shape ids, notes exceeding a Shape's capacity, icons without a
// glyph component. Module-eval throws fail dev instantly and prod at prerender.
import type {
  GameDefinition,
  GameId,
  GlyphComponent,
  NoteImage,
  ShapeDefinition,
  ShapeId,
} from './types';
import { gamesMeta } from './registry';

export function defineGame(
  id: GameId,
  code: {
    shapes: Readonly<Record<ShapeId, ShapeDefinition>>;
    svgGlyphs: Readonly<Partial<Record<NoteImage, GlyphComponent>>>;
  }
): GameDefinition {
  const meta = gamesMeta[id];
  if (!meta) throw new Error(`[defineGame] no game folder for id "${id}"`);
  const { gameJson, instruments } = meta;

  for (const instrument of Object.values(instruments)) {
    const context = `[defineGame] ${id}/${instrument.name}`;
    const shape = code.shapes[instrument.shape];
    if (!shape) throw new Error(`${context}: unknown shape "${instrument.shape}"`);
    if (instrument.notes.length > shape.capacity) {
      throw new Error(
        `${context}: ${instrument.notes.length} notes exceed shape "${shape.id}" capacity ${shape.capacity}`
      );
    }
    for (const [index, note] of instrument.notes.entries()) {
      if (!code.svgGlyphs[note.icon]) {
        throw new Error(`${context}: note ${index} icon "${note.icon}" has no glyph component`);
      }
    }
  }
  if (!code.svgGlyphs[gameJson.notes.defaultIcon]) {
    throw new Error(`[defineGame] ${id}: defaultIcon "${gameJson.notes.defaultIcon}" has no glyph`);
  }

  return {
    id: gameJson.id,
    storageId: gameJson.storageId,
    display: gameJson.display,
    meta: gameJson.meta,
    notes: {
      ...gameJson.notes,
      svgGlyphs: code.svgGlyphs,
    },
    shapes: code.shapes,
    instruments: {
      list: gameJson.instruments.list,
      data: instruments,
      defaultVolume: gameJson.instruments.defaultVolume,
    },
    midi: {
      // JSON object keys are strings; the runtime contract is numeric keys.
      mapToNote: Object.fromEntries(
        Object.entries(gameJson.midi.mapToNote).map(([k, v]) => [Number(k), v])
      ),
      bounds: gameJson.midi.bounds,
      presets: gameJson.midi.presets,
    },
    composer: gameJson.composer,
    themes: gameJson.themes,
    settings: gameJson.settings,
    features: gameJson.features,
    i18n: {
      // APP_NAME is always the display name — derived, never authored (schema.ts).
      interpolation: { APP_NAME: gameJson.display.name },
      updateMessage: gameJson.i18n.updateMessage,
      overrides: gameJson.i18n.overrides,
    },
  };
}
