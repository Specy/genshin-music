// SIDE-EFFECT-FREE DATA MODULE CONTRACT (spec §5.5):
//   Each game's definition is a plain data object (component references for glyphs
//   are fine). No top-level browser access, no computed singletons. Shared components
//   read game-derived values live via `$game`; they never freeze them into module
//   constants, so a future runtime switch stays possible.
//
// TWO IDENTITY FIELDS:
//   id        — lowercase 'genshin' | 'sky'. Resolves the `$game` alias, names the
//               static asset payload + audio-sample folder, builds file extensions
//               and self-origin URLs.
//   storageId — LEGACY-LOCKED cased 'Genshin' | 'Sky'. IndexedDB database name
//               (schema v4), every localStorage/sessionStorage key prefix, the
//               serialized `appName` inside songs/backups, settings `settingVersion`
//               strings, service-worker cache names, download filenames, and the
//               WindowProtocol/BroadcastChannel identifiers. NEVER derived from `id`
//               (always explicit); new games set `storageId === id`.

// ---- primitive aliases ----
export type GameId = 'genshin' | 'sky'; // extend per new game
export type StorageId = 'Genshin' | 'Sky'; // legacy-locked; new games: === id

// The DOM-free subset of GameDefinition that non-UI bundles (today: the
// service worker, src/service-worker.ts) may import. A full GameDefinition transitively
// pulls in this game's .svelte glyph components (notes.svgGlyphs) via games/<id>/index.ts,
// which drags the Svelte runtime into a context (self: ServiceWorkerGlobalScope, no DOM)
// that never renders anything and can't use it. Each games/<id>/identity.ts exports
// GAME_IDENTITY: GameIdentity with zero imports besides this type, and games/<id>/index.ts
// imports THAT to fill in its own id/storageId fields rather than restating them. `id` is
// typed GameId (not the wider `string`) so this stays a real
// structural subset of GameDefinition - assigning GAME_IDENTITY.id into a GameDefinition's
// own `id: GameId` field needs no cast.
export type GameIdentity = { id: GameId; storageId: StorageId };

export type Pitch = 'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B';

// = keyof typeof NOTE_SCALE. A runtime const (not a bare union) so the registry can
// validate authored meta.json baseNote values at module evaluation (Codex review M4).
export const BASE_NOTES = [
  'Cb',
  'C',
  'C#',
  'Db',
  'D',
  'D#',
  'Eb',
  'E',
  'E#',
  'Fb',
  'F',
  'F#',
  'Gb',
  'G',
  'G#',
  'Ab',
  'A',
  'A#',
  'Bb',
  'B',
  'B#',
  '',
] as const;
export type BaseNote = (typeof BASE_NOTES)[number];

export type NoteNameType =
  | 'Note name'
  | 'Keyboard layout'
  | 'Your Keyboard layout'
  | 'Do Re Mi'
  | 'ABC'
  | 'No Text'
  | 'Playstation'
  | 'Switch'
  | '1 2 3';

// SvgNote glyph key: 'do'|'re'|'reb'|'mi'|'mib'|'fa'|'so'|'la'|'lab'|'ti'|'tib' (Genshin)
// and 'cr'|'dm'|'dmcr' (Sky). Kept as the current NoteImage union.
export type NoteImage =
  | 'cr'
  | 'dm'
  | 'dmcr'
  | 'do'
  | 're'
  | 'reb'
  | 'mi'
  | 'mib'
  | 'fa'
  | 'so'
  | 'la'
  | 'lab'
  | 'ti'
  | 'tib';

// A Svelte 5 component for one glyph. See SvgNote.svelte and the glyph components' own header
// comments for the full per-instrument-tint recipe.
export type GlyphComponent = import('svelte').Component<{ background?: string; color?: string }>;

/** A loop region inside a note sample, in seconds. */
export type LoopRegion = { start: number; end: number };

// ---- folder-based config runtime types (ADR-0003) ----------------------------
// The normalized shapes the registry produces from the authored JSON (see
// ./schema.ts for the authoring side). These replace InstrumentDataType &
// LayoutKeys at the Step-4 cutover; both coexist until then.

/** Shape id, game-prefixed by convention ('genshin-3x7'). Keys the game's shapes.ts. */
export type ShapeId = string;

/** The per-button display texts a Shape provides for each naming mode. */
export type ShapeLabels = {
  keyboard: readonly string[];
  abc: readonly string[];
  number: readonly string[];
  playstation: readonly string[];
  switch: readonly string[];
};

/**
 * Instrument-level sustain capability, normalized. No `noteLoops` parallel
 * array — per-note loops live on InstrumentNote.loop.
 */
export type InstrumentSustain = {
  release: number;
  crossfade?: number;
  /** Pre-rendered loop-boundary crossfade seconds (default 0.05, 0 disables) — see loopCrossfade.ts. */
  loopCrossfade?: number;
  loop: LoopRegion;
};

/**
 * One button's note, normalized. Array position IS the Button index.
 * `midi` is the Note Id (ADR-0001); `file` is always resolved (default `<index>.mp3`);
 * `loop` overrides the instrument's sustain.loop for this note.
 */
export type InstrumentNote = {
  file: string;
  midi: number;
  baseNote: BaseNote;
  icon: NoteImage;
  loop?: LoopRegion;
};

/** Props every Shape arrangement component receives (default impl: shapes/GridShape.svelte). */
export type ShapeComponentProps = {
  shape: ShapeDefinition;
  /** Buttons actually rendered (≤ shape.capacity). */
  count: number;
  /** Renders the button at a Button index; the surface closes over its own data. */
  button: import('svelte').Snippet<[number]>;
  /** Extra classes/styles for the arrangement container (surfaces keep their page styling). */
  class?: string;
  style?: string;
};

/**
 * One registered Shape (ADR-0003): the named arrangement implementation
 * instruments reference via meta.json `shape`. `component` is the per-shape code
 * branch — common grids share GridShape; a future exotic arrangement (side
 * buttons + center circle, …) registers its own component under a new id.
 * Per-game/per-shape BUTTON components will also hang here when button behavior
 * forks by game (today the note components still branch on features.hasNoteFrame).
 */
export type ShapeDefinition = {
  id: ShapeId;
  /** Max buttons the arrangement holds; every labels array has exactly this length. */
  capacity: number;
  /** Primary row length; grid shapes render this many columns. */
  columns: number;
  labels: ShapeLabels;
  component: import('svelte').Component<ShapeComponentProps>;
};

/** A fully-normalized instrument: what the app consumes at runtime. */
export type InstrumentDefinition = {
  /** Folder name = runtime key = audio URL segment = what songs reference. */
  name: string;
  /** English fallback; i18n overrides when the locale has the key. */
  displayName: string;
  family: string;
  midiName: string;
  fill?: string;
  clickColor?: string;
  shape: ShapeId;
  sustain?: InstrumentSustain;
  notes: readonly InstrumentNote[];
};

export type TempoChanger = {
  // typeof TEMPO_CHANGERS[number]
  id: number;
  text: string;
  changer: number;
  color: number;
};

export type MIDIPreset = { name: string; notes: number[] };

export type NotesCssClasses = {
  // NOTES_CSS_CLASSES
  noteComposer: string;
  note: string;
  noteAnimation: string;
  approachCircle: string;
  noteName: string;
};

export type BaseThemeConfig = {
  // BASE_THEME_CONFIG
  text: { light: string; dark: string; note: string };
};

export type NoteNameTypeDefault = { desktop: NoteNameType; mobile: NoteNameType };

export interface GameDefinition {
  // ── identity ──────────────────────────────────────────────────────────────
  id: GameId;
  storageId: StorageId; // LEGACY-LOCKED — see header. Always explicit.

  // ── display / branding ────────────────────────────────────────────────────
  display: {
    name: string; // 'Genshin' | 'Sky' — "{name} Music Nightly", i18n {{APP_NAME}}
    company: {
      name: string; // 'HoYoverse' | 'thatgamecompany'  (no_affiliation)
      shortName: string; // 'HoYoverse' | 'TGC'              (rights)
    };
    transferOrigins: string[]; // /transfer WindowProtocol self-origins (id-derived)
  };

  // ── head / manifest / SEO / analytics ─────────────────────────────────────
  meta: {
    title: string; // '{name} Music Nightly'
    description: string; // per-game <meta> + manifest description
    themeColor: string; // viewport theme-color (#63aea7 today, both games)
    analytics: { tagId: string; configId: string }; // per-game Google Analytics ids
    updateChannelKey: StorageId; // key into updates.json (= storageId)
  };

  // ── note rendering data + the game-canonical Song Grid ────────────────────
  // Song-wide surfaces (composer canvas, sheet visualizer, VSRG) render THIS
  // grid regardless of any instrument's Shape. Music theory (pitches/scales)
  // lives in $core/sharedConfig since ADR-0003, not here.
  notes: {
    perColumn: number; // NOTES_PER_COLUMN (21 | 15)
    perRow: number; // Song Grid cols/row (7 | 5)
    cssClasses: NotesCssClasses; // NOTES_CSS_CLASSES
    nameTypes: NoteNameType[]; // NOTE_NAME_TYPES
    composerPositions: number[]; // COMPOSER_NOTE_POSITIONS
    importPositions: number[]; // IMPORT_NOTE_POSITIONS
    animationDelayMs: number; // note press/animation delay (100 | 200)
    composerRowHeightScale: number; // ComposerCanvas (1 | 0.95)
    defaultIcon: NoteImage; // ObservableNote default ('do' | 'cr')
    visualNameCasing: 'lowercase' | 'uppercase'; // VisualSong note-name transform
    // Partial: each game supplies only its own glyphs (Genshin solfège vs Sky cr/dm/dmcr).
    svgGlyphs: Readonly<Partial<Record<NoteImage, GlyphComponent>>>; // per-game SvgNote glyph map
  };

  // ── Shapes (ADR-0003): the game's registered keyboard arrangements ─────────
  shapes: Readonly<Record<ShapeId, ShapeDefinition>>;

  // ── instruments (normalized from the game folder's JSON by defineGame) ─────
  instruments: {
    list: readonly string[]; // INSTRUMENTS (ordered menu roster)
    // Every instruments/<Name>/ folder, INCLUDING Unlisted Instruments (in data,
    // absent from list — loadable by the engine, hidden from menus).
    data: Readonly<Record<string, InstrumentDefinition>>; // INSTRUMENTS_DATA
    defaultVolume: number; // Track/SongClasses default (90 | 100)
  };

  // ── MIDI ──────────────────────────────────────────────────────────────────
  midi: {
    mapToNote: Readonly<Record<number, [number, boolean]>>; // MIDI_MAP_TO_NOTE (built into a Map)
    bounds: { upper: number; lower: number }; // MIDI_BOUNDS
    presets: MIDIPreset[]; // MIDI_PRESETS
  };

  // ── composer ──────────────────────────────────────────────────────────────
  composer: {
    tempoChangers: readonly TempoChanger[]; // TEMPO_CHANGERS
  };

  // ── themes ────────────────────────────────────────────────────────────────
  themes: {
    baseConfig: BaseThemeConfig; // BASE_THEME_CONFIG
    defaultNoteBackground: string; // BaseSettings note_background (#fff9ef | #495466)
  };

  // ── per-game settings defaults (BaseSettings overrides) ────────────────────
  settings: {
    defaultNoteNameType: {
      composer: NoteNameTypeDefault; // Genshin {KeyboardLayout, DoReMi} | Sky {Note name, Note name}
      player: NoteNameTypeDefault; // idem
      zen: NoteNameTypeDefault; // Genshin {KeyboardLayout, DoReMi} | Sky {No Text, No Text}
      sheetVisualizer: NoteNameType; // 'Keyboard layout' | 'ABC'
    };
  };

  // ── behavior flags (named for the behavior, never the game) ────────────────
  features: {
    // Renders the decorative note-border SVG (GenshinNoteBorder) around every
    // note, uses the luminosity-aware light-note text rule, and a pulse click
    // animation. When false (Sky), notes have no frame and Zen uses a flip
    // animation. Refs: PlayerNote, BaseNote, ComposerNote, ZenNote.
    hasNoteFrame: boolean;
    // Exports/backs-up songs via `toOldFormat()` (pre-versioned Sky format) on
    // download instead of `serialize()`. Refs: PlayerMenu, composer, error page.
    downloadsSongsInOldFormat: boolean;
  };

  // ── i18n ──────────────────────────────────────────────────────────────────
  i18n: {
    interpolation: {
      APP_NAME: string; // {{APP_NAME}} var (= display.name)
    };
    updateMessage: string; // UPDATE_MESSAGE (changelog toast body)
    overrides?: Partial<Record<string, string>>; // game-conditional strings (e.g. PagesVersions line)
  };
}
