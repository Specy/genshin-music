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
 * `nominal` is the Nominal Id (ADR-0001) — required, it is the button's name in the
 * game's grid namespace: the sheet position it occupies (its Song-Grid row, its swap
 * correspondence), NEVER a promise about sound. What the button sounds is `baseNote`
 * (the pitch class) at the instrument's `register` (the octave) — the written-vs-concert
 * distinction of a transposing instrument. Songs never store it.
 * `file` defaults to `<index>.mp3` — the historical sample naming (URL-locked for
 * existing instruments). New instruments may name samples anything matching
 * `[A-Za-z0-9._-]+` — the registry rejects everything else, since file names land
 * verbatim in copy paths and fetch URLs (no '/', '#', '?', '%', spaces, '..').
 * `loop` is the per-note sustain loop region, overriding the instrument-level
 * `sustain.loop` (replaces the old parallel `sustain.noteLoops` array).
 */
export type NoteMetaJson = {
  file?: string;
  nominal: number;
  /**
   * Pitched Button (the default): a bare pitch-class spelling naming what the button
   * SOUNDS — the registry derives its Sounding Pitch from this and rejects anything the
   * BaseNote table doesn't list, so it can NOT be derived from `midi` (Vintage-Lyre's
   * nominal id 74 really does sound Db).
   * Assigned Button (`pitched: false`): free display text, chord names ('Dm', 'G7') and
   * '' included — nothing derives from it.
   */
  baseNote: string;
  /**
   * Declares an Assigned Button (ADR-0007): a button with no single sounding pitch —
   * percussion, SFX, a chord strum. It enters notes at its Nominal Id (carried by the
   * instrument's `register`, like every other button) instead of a derived Sounding Pitch,
   * and its `baseNote` becomes a free label. Absent = Pitched.
   * Never inferred: a label alone must not be able to flip a button's identity class.
   */
  pitched?: false;
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
  /**
   * Default loop region, used for every note without its own `loop`. OMITTED
   * (and no per-note loops either): the samples are loopless — a held note
   * plays its file front to back once and note-off starts the `release` fade
   * from wherever the playhead is. That is the authoring for sustained-but-not-
   * looping instruments (long recorded holds with a natural decay, e.g.
   * genshin's NightwindHorn); loopMode is irrelevant without a loop to leave.
   */
  loop?: LoopRegion;
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
  /**
   * The absolute pitch of the instrument's LOWEST Pitched Button — the register its
   * samples actually sound in, as a note name ("C1", "D3", "C-1"; C4 = 60). Sky's
   * Contrabass keyboard is the nominal 60–84 grid but the game plays C1–C3, so it
   * authors "C1" and its C button's Sounding Pitch derives to 24. The registry takes
   * only the OCTAVE from it: the anchor's pitch class must equal the lowest button's
   * own derived class (else it fails — semitone flavor is `baseNote`'s to author,
   * per button), so the whole instrument moves by the same whole octaves and the two
   * authored facts cannot drift into each other (ADR-0007's derivation stays: class
   * from `baseNote`, ±5 semitones of the nominal; octave from here). It never moves
   * Nominal Ids (grid rows, swaps and legacy decode are untouched). Assigned Buttons
   * translate too (ADR-0007 addendum): they have no pitch to place, but their Note
   * Numbers are identities, and a rigid translation is what keeps those collision-free —
   * moving only the pitched half is what collides. Absent = the register the nominal
   * grid itself names.
   */
  register?: string;
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
    /**
     * The origin this game's pages want to be ranked as. Every build of a game — the
     * per-game Cloudflare deploys, the subpath `-no-root` builds, the beta — serves the
     * same content, so each one points crawlers back at this single origin instead of
     * competing with the others. PUBLIC_CANONICAL_ORIGIN overrides it, which is the one
     * change the eventual single-domain deploy needs.
     */
    canonicalOrigin: string;
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
    /**
     * The Song Grid's ordered Note Ids (ADR-0004): entry N is the id whose grid
     * row is `composerPositions[N]`. A note's row therefore follows from its Note
     * Id alone, never from the Button it happens to occupy on its track's
     * instrument — that is what keeps one id on one row across every track.
     * One entry per grid row (length === perColumn), ids unique.
     * Written out here rather than referenced by preset name (or read off
     * `instruments.list[0]`, the pre-ADR-0004 implicit source) so that reordering
     * the menu roster or editing a preset can never silently redefine the grid.
     */
    canonicalNoteIds: number[];
    composerPositions: number[];
    /**
     * HISTORIC, NOT LIVE — a new game copies whatever shape it likes here and changes
     * nothing. This was the pre-ADR-0011 "how this game receives THE OTHER game's legacy
     * button indices", back when there was exactly one other game. The remap is now keyed
     * by SOURCE game and frozen in `$core/Songs/legacyNoteTables`
     * (`LEGACY_NOTE_TABLES[target].importPositions[source]`), which is the sole authority
     * the app reads; this array survives only because it is part of the frozen
     * config-surface fixture (test/configSurface.test.ts) that proves ADR-0003 moved
     * structure without changing values.
     */
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
    /**
     * The MIDI range the importer accepts. Numbers outside it are octave-folded and then
     * dropped; inside it they snap onto the Song Grid (there is no authored snap table any
     * more — ADR-0007 phase E derives it from notes.canonicalNoteIds).
     */
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
  };

  i18n: {
    updateMessage: string;
    overrides?: Record<string, string>;
  };
};
