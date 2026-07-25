// src/lib/games/types.ts  (Phase 2 target — this is the audited final shape)
//
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

// ---- primitive aliases (mirror src/Config.ts) ----
export type GameId = 'genshin' | 'sky'            // extend per new game
export type StorageId = 'Genshin' | 'Sky'         // legacy-locked; new games: === id

export type Pitch =
    'C' | 'Db' | 'D' | 'Eb' | 'E' | 'F' | 'Gb' | 'G' | 'Ab' | 'A' | 'Bb' | 'B'

export type BaseNote =                            // = keyof typeof NOTE_SCALE
    'Cb'|'C'|'C#'|'Db'|'D'|'D#'|'Eb'|'E'|'E#'|'Fb'|'F'|'F#'|'Gb'|'G'|'G#'|'Ab'|'A'|'A#'|'Bb'|'B'|'B#'|''

export type NoteNameType =
    'Note name' | 'Keyboard layout' | 'Your Keyboard layout' | 'Do Re Mi'
    | 'ABC' | 'No Text' | 'Playstation' | 'Switch' | '1 2 3'

// SvgNote glyph key: 'do'|'re'|'reb'|'mi'|'mib'|'fa'|'so'|'la'|'lab'|'ti'|'tib' (Genshin)
// and 'cr'|'dm'|'dmcr' (Sky). Kept as the current NoteImage union.
export type NoteImage =
    'cr' | 'dm' | 'dmcr' | 'do' | 're' | 'reb' | 'mi' | 'mib'
    | 'fa' | 'so' | 'la' | 'lab' | 'ti' | 'tib'

// A Svelte 5 component for one glyph (the SvelteKit port of SvgNotes/*). `color` restored P4c
// Task 2 (old: SvgNoteProps.color, src/components/shared/SvgNotes/index.tsx) - see SvgNote.svelte
// and the 14 glyph components' own header comments for the full per-instrument-tint recipe.
export type GlyphComponent = import('svelte').Component<{background?: string; color?: string}>

export type LayoutKeys = {                         // typeof LAYOUT_KINDS[keyof …]
    keyboardLayout: string[]
    numberLayout?: string[]
    abcLayout: string[]
    playstationLayout: string[]
    switchLayout: string[]
}

export type InstrumentDataType = {                 // src/Config.ts InstrumentDataType
    notes: number
    family: string
    midiName: string
    baseNotes: readonly BaseNote[]
    layout: LayoutKeys
    icons: readonly NoteImage[]
    midiNotes: readonly number[]
    clickColor?: string
    fill?: string
}

export type TempoChanger = {                        // typeof TEMPO_CHANGERS[number]
    id: number
    text: string
    changer: number
    color: number
}

export type MIDIPreset = { name: string; notes: number[] }

export type NotesCssClasses = {                     // NOTES_CSS_CLASSES
    noteComposer: string
    note: string
    noteAnimation: string
    approachCircle: string
    noteName: string
}

export type BaseThemeConfig = {                     // BASE_THEME_CONFIG
    text: { light: string; dark: string; note: string }
}

export type NoteNameTypeDefault = { desktop: NoteNameType; mobile: NoteNameType }

export interface GameDefinition {
    // ── identity ──────────────────────────────────────────────────────────────
    id: GameId
    storageId: StorageId       // LEGACY-LOCKED — see header. Always explicit.

    // ── display / branding ────────────────────────────────────────────────────
    display: {
        name: string             // 'Genshin' | 'Sky' — "{name} Music Nightly", i18n {{APP_NAME}}
        company: {
            name: string           // 'HoYoverse' | 'thatgamecompany'  (no_affiliation)
            shortName: string      // 'HoYoverse' | 'TGC'              (rights)
        }
        transferOrigins: string[] // /transfer WindowProtocol self-origins (id-derived)
    }

    // ── head / manifest / SEO / analytics ─────────────────────────────────────
    meta: {
        title: string            // '{name} Music Nightly'
        description: string      // per-game <meta> + manifest description
        themeColor: string       // viewport theme-color (#63aea7 today, both games)
        analytics: { tagId: string; configId: string } // per-game Google Analytics ids
        updateChannelKey: StorageId // key into updates.json (= storageId)
    }

    // ── note geometry / rendering data ────────────────────────────────────────
    notes: {
        perColumn: number                                   // NOTES_PER_COLUMN (21 | 15)
        perRow: number                                      // keyboard cols/row (7 | 5)
        pitches: readonly Pitch[]                           // PITCHES
        scale: Readonly<Record<BaseNote, readonly string[]>>       // NOTE_SCALE
        doReMiScale: Readonly<Record<BaseNote, readonly string[]>> // DO_RE_MI_NOTE_SCALE
        cssClasses: NotesCssClasses                         // NOTES_CSS_CLASSES
        nameTypes: NoteNameType[]                           // NOTE_NAME_TYPES
        composerPositions: number[]                         // COMPOSER_NOTE_POSITIONS
        importPositions: number[]                           // IMPORT_NOTE_POSITIONS
        animationDelayMs: number                            // note press/animation delay (100 | 200)
        composerRowHeightScale: number                      // ComposerCanvas (1 | 0.95)
        defaultIcon: NoteImage                              // ObservableNote default ('do' | 'cr')
        visualNameCasing: 'lowercase' | 'uppercase'         // VisualSong note-name transform
        // Partial: each game supplies ONLY its own glyphs (Genshin solfège vs Sky cr/dm/dmcr),
        // fixing the current index.tsx that imports both games' glyphs into one module map (§5.5).
        svgGlyphs: Readonly<Partial<Record<NoteImage, GlyphComponent>>> // per-game SvgNote glyph map
    }

    // ── instrument layout building blocks (referenced by instruments.data) ─────
    layouts: {
        layoutKinds: Readonly<Record<string, LayoutKeys>>          // LAYOUT_KINDS
        iconKinds: Readonly<Record<string, readonly NoteImage[]>>  // LAYOUT_ICONS_KINDS
        noteLayoutKinds: Readonly<Record<string, readonly BaseNote[]>> // INSTRUMENT_NOTE_LAYOUT_KINDS
        midiLayoutKinds: Readonly<Record<string, readonly number[]>>   // INSTRUMENT_MIDI_LAYOUT_KINDS
        defaultKeyboardKeys: string[]                              // KeybindsStore default row
    }

    // ── instruments ───────────────────────────────────────────────────────────
    instruments: {
        list: readonly string[]                            // INSTRUMENTS (song appName-independent order)
        data: Readonly<Record<string, InstrumentDataType>> // INSTRUMENTS_DATA (may hold extra keys, e.g. Sky Aurora_Short)
        defaultVolume: number                              // Track/SongClasses default (90 | 100)
        audioFolder: GameId                                // audio sample dir (= id); URL locked §5.3
    }

    // ── MIDI ──────────────────────────────────────────────────────────────────
    midi: {
        mapToNote: Readonly<Record<number, [number, boolean]>> // MIDI_MAP_TO_NOTE (built into a Map)
        // noteMapToMidi is DERIVED from mapToNote (non-accidentals), Config.ts:870-871
        bounds: { upper: number; lower: number }               // MIDI_BOUNDS
        presets: MIDIPreset[]                                  // MIDI_PRESETS
    }

    // ── composer ──────────────────────────────────────────────────────────────
    composer: {
        tempoChangers: readonly TempoChanger[]             // TEMPO_CHANGERS
    }

    // ── themes ────────────────────────────────────────────────────────────────
    themes: {
        baseConfig: BaseThemeConfig                        // BASE_THEME_CONFIG
        defaultNoteBackground: string                      // BaseSettings note_background (#fff9ef | #495466)
    }

    // ── per-game settings defaults (BaseSettings overrides) ────────────────────
    settings: {
        defaultNoteNameType: {
            composer: NoteNameTypeDefault    // Genshin {KeyboardLayout, DoReMi} | Sky {Note name, Note name}
            player: NoteNameTypeDefault      // idem
            zen: NoteNameTypeDefault         // Genshin {KeyboardLayout, DoReMi} | Sky {No Text, No Text}
            sheetVisualizer: NoteNameType    // 'Keyboard layout' | 'ABC'
        }
    }

    // ── behavior flags (named for the behavior, never the game) ────────────────
    features: {
        // Renders the decorative note-border SVG (GenshinNoteBorder) around every
        // note, uses the luminosity-aware light-note text rule, and a pulse click
        // animation. When false (Sky), notes have no frame and Zen uses a flip
        // animation. Refs: PlayerNote, BaseNote, ComposerNote, ZenNote.
        hasNoteFrame: boolean
        // Exports/backs-up songs via `toOldFormat()` (pre-versioned Sky format) on
        // download instead of `serialize()`. Refs: PlayerMenu, composer, error page.
        downloadsSongsInOldFormat: boolean
    }

    // ── i18n ──────────────────────────────────────────────────────────────────
    i18n: {
        interpolation: {
            APP_NAME: string       // {{APP_NAME}} var (= display.name)
        }
        updateMessage: string    // UPDATE_MESSAGE (changelog toast body)
        overrides?: Partial<Record<string, string>> // game-conditional strings (e.g. PagesVersions line)
    }
}
