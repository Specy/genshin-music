// AUTHORING formats for the folder-based game config (ADR-0003).
//
// These types describe what contributors WRITE:
//   src/lib/games/<id>/game.json          — GameJson (one per game)
//   src/lib/games/<id>/presets.json       — NotePresetsJson (named Note Presets)
//   src/lib/games/<id>/instruments/<Name>/meta.json — InstrumentMetaJson
//
// They are NOT the runtime shapes: the normalizer (games/registry.ts) resolves
// preset references, applies file-name defaults and validates invariants, producing
// the fully-denormalized runtime types in ./types (InstrumentDefinition etc.).
// JSON imports type loosely (TS infers `(number | boolean)[]`, not tuples, and
// string literal unions widen to `string`), so the normalizer treats raw imports
// as these types via one cast at its boundary and then VALIDATES what TS can't
// promise. Keep every field JSON-serializable — no components, no functions.
import type {
  BaseNote,
  BaseThemeConfig,
  GameId,
  LoopRegion,
  MIDIPreset,
  NoteImage,
  NoteNameType,
  NoteNameTypeDefault,
  NotesCssClasses,
  StorageId,
  SustainLoopMode,
  TempoChanger,
} from './types';

/**
 * One button's note, as authored. Position in the array IS the Button index.
 * `midi` is the Note Id (nominal MIDI id, ADR-0001) — required, it is note identity.
 * `baseNote` is the displayed note-name root; it can NOT be derived from `midi`
 * (Vintage-Lyre's nominal id 74 displays as Db; unpitched SFX use '').
 * `file` defaults to `<index>.mp3` — the historical sample naming (URL-locked for
 * existing instruments). New instruments may name samples anything matching
 * `[A-Za-z0-9._-]+` — the registry rejects everything else, since file names land
 * verbatim in copy paths and fetch URLs (no '/', '#', '?', '%', spaces, '..').
 * `loop` is the per-note sustain loop region, overriding the instrument-level
 * `sustain.loop` (replaces the old parallel `sustain.noteLoops` array).
 */
export type NoteMetaJson = {
  file?: string;
  midi: number;
  baseNote: BaseNote;
  icon: NoteImage;
  loop?: LoopRegion;
  /** Per-note override of sustain.minLength (minimum seconds the note sounds). */
  minLength?: number;
};

/** Named Note Presets, per game: full note arrays instruments reference by name. */
export type NotePresetsJson = Record<string, NoteMetaJson[]>;

/**
 * Instrument-level sustain capability (spec 2026-08-03 §7), authored form.
 * Unlike the legacy InstrumentSustainConfig there is NO `noteLoops` parallel
 * array — per-note loop overrides live on each note (NoteMetaJson.loop).
 */
export type SustainMetaJson = {
  /** Safety fade at the end of the sample tail; also used when no tail is available. */
  release: number;
  /** Sustain-loop to natural-tail crossfade in seconds (default 0.02). */
  crossfade?: number;
  /**
   * Pre-rendered crossfade at the loop boundary in seconds (default 0.05, 0
   * disables): the audio approaching loop.end is blended toward the audio
   * approaching loop.start at load, so imperfect loop points wrap without a
   * click. Applied per note against its resolved loop region.
   */
  loopCrossfade?: number;
  /**
   * What note-off does (default 'loop-continuous'); see SustainLoopMode in
   * types.ts for the three kinds. 'one-shot' is an explicit way to say "tap" —
   * same behavior as omitting `sustain` entirely.
   */
  loopMode?: SustainLoopMode;
  /**
   * Minimum seconds a triggered note sounds before its release begins, measured
   * from the note's start — a very fast tap still plays this much, then the
   * normal release, on every surface (player taps, zen, composer previews/span-1,
   * recorded taps). Absent = releases act immediately (sampler default).
   * Per-note overrides live on NoteMetaJson.minLength.
   */
  minLength?: number;
  /** Default loop region, used for every note without its own `loop`. */
  loop: LoopRegion;
};

/**
 * instruments/<Name>/meta.json. The folder name IS the instrument name (the
 * runtime key, the audio URL segment, and what songs reference) — meta.json
 * never restates it.
 */
export type InstrumentMetaJson = {
  /** English display-name fallback; i18n overrides it when a locale has the key. */
  displayName: string;
  family: string;
  midiName: string;
  fill?: string;
  clickColor?: string;
  /** Shape id (game-prefixed, e.g. 'genshin-3x7') — must exist in the game's shapes.ts. */
  shape: string;
  sustain?: SustainMetaJson;
  /** A preset name from the game's presets.json, or the full inline note array. */
  notes: string | NoteMetaJson[];
};

/**
 * games/<id>/game.json — everything game-level that data can express.
 * What stays CODE in the game folder: shapes.ts (Shape implementations, ADR-0003),
 * glyphs/*.svelte (icon components). What is DERIVED by the normalizer, never
 * authored: i18n interpolation APP_NAME (= display.name), the audio folder (= id).
 */
export type GameJson = {
  /** = the folder name (validated). */
  id: GameId;
  /** LEGACY-LOCKED cased id (see games/types.ts header). New games: === id. */
  storageId: StorageId;

  display: {
    name: string;
    company: { name: string; shortName: string };
    transferOrigins: string[];
  };

  meta: {
    title: string;
    description: string;
    themeColor: string;
    analytics: { tagId: string; configId: string };
    updateChannelKey: StorageId;
  };

  /**
   * Game-canonical note data and the Song Grid — what song-wide surfaces
   * (composer canvas, sheet visualizer, VSRG) render regardless of any one
   * instrument's Shape. Instrument keyboards do NOT read this — they follow
   * the instrument's Shape.
   */
  notes: {
    perColumn: number;
    perRow: number;
    cssClasses: NotesCssClasses;
    nameTypes: NoteNameType[];
    composerPositions: number[];
    importPositions: number[];
    animationDelayMs: number;
    composerRowHeightScale: number;
    defaultIcon: NoteImage;
    visualNameCasing: 'lowercase' | 'uppercase';
  };

  instruments: {
    /**
     * Ordered menu roster. Every entry must have an instruments/<Name>/ folder;
     * a folder ABSENT from this list is an Unlisted Instrument (loadable, hidden
     * from menus — the Aurora_Short case).
     */
    list: string[];
    defaultVolume: number;
  };

  midi: {
    /** JSON object keys are strings; the normalizer builds the numeric Map. */
    mapToNote: Record<string, [number, boolean]>;
    bounds: { upper: number; lower: number };
    presets: MIDIPreset[];
  };

  composer: {
    tempoChangers: TempoChanger[];
  };

  themes: {
    baseConfig: BaseThemeConfig;
    defaultNoteBackground: string;
  };

  settings: {
    defaultNoteNameType: {
      composer: NoteNameTypeDefault;
      player: NoteNameTypeDefault;
      zen: NoteNameTypeDefault;
      sheetVisualizer: NoteNameType;
    };
  };

  features: {
    hasNoteFrame: boolean;
    downloadsSongsInOldFormat: boolean;
  };

  i18n: {
    updateMessage: string;
    overrides?: Record<string, string>;
  };
};
