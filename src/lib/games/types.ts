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

// The semitone class (0 = C) each spelling names, the derivation input for a Pitched
// Button's Sounding Pitch (registry.ts). Kept beside BASE_NOTES so a spelling cannot be
// added to one table without the other; '' is deliberately absent — it names no pitch, so
// a button labelled with it can only be an Assigned Button.
const PITCH_CLASSES = {
  Cb: 11,
  C: 0,
  'C#': 1,
  Db: 1,
  D: 2,
  'D#': 3,
  Eb: 3,
  E: 4,
  'E#': 5,
  Fb: 4,
  F: 5,
  'F#': 6,
  Gb: 6,
  G: 7,
  'G#': 8,
  Ab: 8,
  A: 9,
  'A#': 10,
  Bb: 10,
  B: 11,
  'B#': 0,
} satisfies Partial<Record<BaseNote, number>>;

/**
 * Semitone class of a base-note spelling, or undefined when the label names no single
 * pitch. Keyed by plain string on purpose: an Assigned Button's `baseNote` is free
 * display text ('Dm', 'G7', ''), so callers look up untrusted labels here without a cast.
 */
export const BASE_NOTE_PITCH_CLASSES: ReadonlyMap<string, number> = new Map(
  Object.entries(PITCH_CLASSES)
);

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
/**
 * What note-off does, mirroring the standard sampler modes (SFZ loop_mode):
 * - 'loop-continuous': keep looping, fade out over `release` seconds. Never
 *   leaves the loop (organ/pad style; taps become short faded dabs).
 * - 'loop-sustain': stop wrapping — play out the remainder of the current pass
 *   from the exact playhead phase into the sample's natural tail (a tap plays
 *   the file front to back).
 * - 'one-shot': ignore note-off entirely; the whole sample always plays.
 *   Behaviorally identical to omitting `sustain` (an explicit "tap" spelling) —
 *   the instrument does not respond to hold length, so sustain UX stays off.
 * Runtime const (not just a type) so the registry can validate authored data.
 */
export const SUSTAIN_LOOP_MODES = ['loop-continuous', 'loop-sustain', 'one-shot'] as const;
export type SustainLoopMode = (typeof SUSTAIN_LOOP_MODES)[number];

export type InstrumentSustain = {
  release: number;
  crossfade?: number;
  /** Pre-rendered loop-boundary crossfade seconds (default 0.05, 0 disables) — see loopCrossfade.ts. */
  loopCrossfade?: number;
  /** Always present after registry normalization (authored default: 'loop-continuous'). */
  loopMode: SustainLoopMode;
  /**
   * Minimum seconds a triggered note sounds before its release begins, measured
   * from the note's start (enforced by the Instrument, not the Voice) — a very
   * fast tap still plays this much, then the normal release. Applies on every
   * surface (player key taps, zen, composer previews and span-1 columns, recorded
   * taps). Absent = releases act immediately (sampler default).
   */
  minLength?: number;
  /** Absent (with no per-note loops) = loopless sustain: held notes play the file once, note-off fades (schema.ts). */
  loop?: LoopRegion;
};

/**
 * One button's note, normalized. Array position IS the Button index.
 * `nominal` is the Nominal Id (ADR-0001); `file` is always resolved (default `<index>.mp3`);
 * `loop` and `minLength` override the instrument's sustain values for this note.
 */
export type InstrumentNote = {
  file: string;
  /** Nominal Id (ADR-0001): the button's sheet position in the game's grid namespace — never a pitch. */
  nominal: number;
  /**
   * Display label. A Pitched Button's is a bare pitch-class spelling that `sounding` is
   * derived from; an Assigned Button's is free text ('Dm', 'G7', ''), hence `string` —
   * see baseNoteText in $core/sharedConfig for how a label with no scale row renders.
   */
  baseNote: string;
  /** false = Assigned Button (percussion, SFX, chord strum): no single Sounding Pitch. */
  pitched: boolean;
  /**
   * The Note Number this button enters at Basepoint C (ADR-0007): its Sounding Pitch when
   * Pitched, its Nominal Id when Assigned. Derived and validated at registry build, never
   * authored — see registry.ts. For a Pitched Button the derivation is `baseNote`'s nearest
   * chromatic match to the nominal, placed in the instrument's authored `register`
   * (schema.ts) — Sky's Contrabass keyboard is the nominal 60..84 grid but registers at
   * "C1", so its C button enters 24.
   */
  sounding: number;
  icon: NoteImage;
  loop?: LoopRegion;
  minLength?: number;
};

/**
 * What a Shape is told about ONE note (ADR-0005 §1) — the minimum any placement rule can
 * need: the note's identity plus the two content facts an arrangement could sort or group
 * by. Surfaces pass their own richer note objects (ObservableNote), which satisfy this
 * structurally and come back out of the `button` snippet unchanged, so a surface keeps
 * addressing per-note state through its own object instead of through a slot index.
 */
export type ShapeNote = {
  /** Nominal Id (ADR-0001): the note's identity in the instrument/grid namespace. */
  id: number;
  /** Display label — free text on an Assigned Button (see InstrumentNote.baseNote). */
  baseNote: string;
  icon: NoteImage;
};

/**
 * Props every Shape arrangement component receives (default impl: shapes/GridShape.svelte).
 *
 * The Shape is handed the instrument's notes IN AUTHORED ORDER — meta.json's order is the
 * single authored statement of in-game key placement — and is explicitly free to ignore it
 * and place by note content instead (ADR-0005 §1). Generic in the note type so the surface's
 * own note object survives the round trip into the snippet.
 */
export type ShapeComponentProps<N extends ShapeNote = ShapeNote> = {
  shape: ShapeDefinition;
  /** The instrument's notes in authored Button order (length ≤ shape.capacity). */
  notes: readonly N[];
  /**
   * Renders one note; the surface closes over its own data. Payload: the note itself, and
   * its BUTTON (its position in `notes`) — never the on-screen slot, which is the Shape's
   * own business. Surfaces need the Button for per-button side data (MIDI preset slots,
   * held/status tables) and never need the slot: Label Sets are read through
   * `Instrument.getNoteText`, which applies the Shape's own assignment, so a surface cannot
   * label a button differently from where the Shape drew it.
   */
  button: import('svelte').Snippet<[N, number]>;
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
  /** Button silhouette, echoed by overlays drawn around a button (the practice hold ring). */
  noteShape: NoteShape;
  /**
   * Declared at the base ShapeNote so one registry can hold every Shape; ShapeKeyboard
   * re-instantiates it at the surface's own note type (one documented cast), which is sound
   * because an arrangement reads only ShapeNote fields and hands the snippet back the very
   * element it was given.
   */
  component: import('svelte').Component<ShapeComponentProps>;
  /**
   * This Shape's note→position assignment, exposed as data (ADR-0005 §2): given the
   * instrument's notes in authored order, returns the SLOT each one takes —
   * `assign(notes)[button]` is where `notes[button]` is drawn AND which entry of this
   * Shape's Label Sets is that button's label (`labels.keyboard[slot]`), so keybind
   * resolution, highlighting and hints always agree with what was drawn.
   *
   * Omit for the identity assignment (slot k = note k), which every grid Shape uses:
   * authored order IS on-screen order. Slots must be distinct integers in [0, capacity) —
   * validated per instrument at defineGame time (shapes/assignment.ts).
   *
   * A content-driven Shape owns this as STABLE API: user keybinds are attached to label
   * strings, so changing the rule moves users' keys. The ADR's example payoff is a
   * content-aware grid that places a 14-note instrument on the standard 3×7's lower rows
   * automatically, making a separate `*-2x7` Shape (with hand-sliced labels) unnecessary.
   */
  assign?: (notes: readonly ShapeNote[]) => readonly number[];
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

/**
 * The silhouette of a Shape's note buttons, so overlays drawn around one (today the practice
 * hold ring) echo its outline instead of always being a circle. It lives on the Shape rather
 * than the game because it is a property of the keyboard layout — today every Genshin layout
 * is circular and every Sky one is a rounded square, but a new layout may be neither.
 *
 * Adding a silhouette is a new variant here plus a case in ringGeometry() — nothing else reads
 * it, and the sweep is driven by the returned perimeter, so any outline animates correctly.
 */
export type NoteShape =
  | { kind: 'circle' }
  /** cornerRatio is the corner radius as a fraction of the side: 0 = square, 0.5 = circle. */
  | { kind: 'rounded-rect'; cornerRatio: number };

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
    // CANONICAL_NOTE_IDS — the Song Grid's ordered Note Ids (ADR-0004): entry N is
    // the id whose row is composerPositions[N]. The canvas places every note by its
    // id through this list, so no instrument's Button layout can move a row.
    canonicalNoteIds: number[];
    composerPositions: number[]; // COMPOSER_NOTE_POSITIONS
    // IMPORT_NOTE_POSITIONS — HISTORIC, NOT LIVE: the legacy cross-game remap is keyed by
    // SOURCE game and frozen in $core/Songs/legacyNoteTables (see schema.ts for the full note).
    importPositions: number[];
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
    // No `mapToNote`: the MIDI→grid snap is derived from notes.canonicalNoteIds instead of
    // authored beside it (ADR-0007 phase E, see Songs/noteIds.snapMidiToGrid).
    bounds: { upper: number; lower: number }; // MIDI_BOUNDS — the range the snap accepts
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
