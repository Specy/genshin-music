// Genshin GameDefinition.
//
// Source of truth (authority order):
//   1. test/fixtures/Genshin/config-surface.json — the committed serialization of the
//      old Config.ts output; every fixture-backed field below is a direct transform of it.
//   2. git show migration/next16-react19:src/Config.ts — structure + fields not carried
//      by the fixture (see per-field comments for the exact old symbol).
//   3. docs/superpowers/audits/2026-07-19-app-name-audit.md — reference table for the
//      non-fixture fields (perRow, animationDelayMs, composerRowHeightScale, defaultIcon,
//      visualNameCasing, defaultKeyboardKeys, company, analytics, transferOrigins,
//      defaultNoteBackground, settings defaults, updateMessage); each was re-verified
//      against its cited old file/line while writing this module.
import type {GameDefinition} from '../types'
import {GAME_IDENTITY} from './identity'
import DoGlyph from './glyphs/do.svelte'
import ReGlyph from './glyphs/re.svelte'
import RebGlyph from './glyphs/reb.svelte'
import MiGlyph from './glyphs/mi.svelte'
import MibGlyph from './glyphs/mib.svelte'
import FaGlyph from './glyphs/fa.svelte'
import SoGlyph from './glyphs/so.svelte'
import LaGlyph from './glyphs/la.svelte'
import LabGlyph from './glyphs/lab.svelte'
import TiGlyph from './glyphs/ti.svelte'
import TibGlyph from './glyphs/tib.svelte'

export const game: GameDefinition = {
    // Phase 5 Task 1: sourced from ./identity so this game's id/storageId literals
    // exist exactly once in the tree (see GameIdentity in ../types).
    id: GAME_IDENTITY.id,
    storageId: GAME_IDENTITY.storageId,

    display: {
        name: 'Genshin',
        // Home.tsx:157 (no_affiliation) + :316 (rights) — both 'HoYoverse' for Genshin.
        company: {name: 'HoYoverse', shortName: 'HoYoverse'},
        // transfer/index.tsx domains array, APP_NAME.toLowerCase()-derived (id-derived,
        // per types.ts). Dev-only `http://localhost:3000` entry excluded: GameDefinition
        // is static data with no env reads; that concern belongs to the consuming code.
        transferOrigins: [
            'https://genshin-music.specy.app',
            'https://beta.genshin-music.specy.app',
            'https://specy.github.io/genshinMusic',
        ],
    },

    meta: {
        title: 'Genshin Music Nightly',
        description: 'Genshin music, a website to play, practice and compose songs',
        themeColor: '#63aea7',
        // GoogleAnalyticsScript.tsx else-branch (Genshin): script-src id vs gtag config id differ upstream.
        analytics: {tagId: 'G-T3TJDT2NFS', configId: 'G-BSC3PC58G4'},
        updateChannelKey: 'Genshin',
    },

    notes: {
        perColumn: 21,
        // PlayerNote.tsx getApproachCircleColor: numOfNotes = APP_NAME === "Sky" ? 5 : 7
        perRow: 7,
        pitches: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
        scale: {
            Cb: ['Cb', 'Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'Gbb', 'Gb', 'Abb', 'Ab', 'Bbb', 'Bb'],
            C: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
            'C#': ['C#', 'D', 'D#', 'E', 'E#', 'F#', 'G', 'G#', 'A', 'A#', 'B', 'B#'],
            Db: ['Db', 'Ebb', 'Eb', 'Fb', 'F', 'Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb', 'C'],
            D: ['D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'C', 'C#'],
            'D#': ['D#', 'E', 'E#', 'F#', 'F##', 'G#', 'A', 'A#', 'B', 'B#', 'C#', 'C##'],
            Eb: ['Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'Bbb', 'Bb', 'Cb', 'C', 'Db', 'D'],
            E: ['E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B', 'C', 'C#', 'D', 'D#'],
            'E#': ['E#', 'F#', 'F##', 'G#', 'G##', 'A#', 'B', 'B#', 'C#', 'C##', 'D#', 'D##'],
            Fb: ['Fb', 'Gbb', 'Gb', 'Abb', 'Ab', 'Bbb', 'Cbb', 'Cb', 'Dbb', 'Db', 'Ebb', 'Eb'],
            F: ['F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'Cb', 'C', 'Db', 'D', 'Eb', 'E'],
            'F#': ['F#', 'G', 'G#', 'A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'E#'],
            Gb: ['Gb', 'Abb', 'Ab', 'Bbb', 'Bb', 'Cb', 'Dbb', 'Db', 'Ebb', 'Eb', 'Fb', 'F'],
            G: ['G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#'],
            'G#': ['G#', 'A', 'A#', 'B', 'B#', 'C#', 'D', 'D#', 'E', 'E#', 'F#', 'F##'],
            Ab: ['Ab', 'Bbb', 'Bb', 'Cb', 'C', 'Db', 'Ebb', 'Eb', 'Fb', 'F', 'Gb', 'G'],
            A: ['A', 'Bb', 'B', 'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#'],
            'A#': ['A#', 'B', 'B#', 'C#', 'C##', 'D#', 'E', 'E#', 'F#', 'F##', 'G#', 'G##'],
            Bb: ['Bb', 'Cb', 'C', 'Db', 'D', 'Eb', 'Fb', 'F', 'Gb', 'G', 'Ab', 'A'],
            B: ['B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#'],
            'B#': ['B#', 'C#', 'C##', 'D#', 'D##', 'E#', 'F#', 'F##', 'G#', 'G##', 'A#', 'A##'],
            '': ['', '', '', '', '', '', '', '', '', '', '', ''],
        },
        doReMiScale: {
            Cb: ['dob', 'rebb', 'reb', 'mibb', 'mib', 'fab', 'solbb', 'solb', 'labb', 'lab', 'tibb', 'tib'],
            C: ['do', 'reb', 're', 'mib', 'mi', 'fa', 'solb', 'sol', 'lab', 'la', 'tib', 'ti'],
            'C#': ['do#', 're', 're#', 'mi', 'mi#', 'fa#', 'sol', 'sol#', 'la', 'la#', 'ti', 'ti#'],
            Db: ['reb', 'mibb', 'mib', 'fab', 'fa', 'solb', 'labb', 'lab', 'tibb', 'tib', 'dob', 'do'],
            D: ['re', 'mib', 'mi', 'fa', 'fa#', 'sol', 'lab', 'la', 'tib', 'ti', 'do', 'do#'],
            'D#': ['re#', 'mi', 'mi#', 'fa#', 'fa##', 'sol#', 'la', 'la#', 'ti', 'ti#', 'do#', 'do##'],
            Eb: ['mib', 'fab', 'fa', 'solb', 'sol', 'lab', 'tibb', 'tib', 'dob', 'do', 'reb', 're'],
            E: ['mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'tib', 'ti', 'do', 'do#', 're', 're#'],
            'E#': ['mi#', 'fa#', 'fa##', 'sol#', 'sol##', 'la#', 'ti', 'ti#', 'do#', 'do##', 're#', 're##'],
            Fb: ['fab', 'solbb', 'solb', 'labb', 'lab', 'tibb', 'dobb', 'dob', 'rebb', 'reb', 'mibb', 'mib'],
            F: ['fa', 'solb', 'sol', 'lab', 'la', 'tib', 'dob', 'do', 'reb', 're', 'mib', 'mi'],
            'F#': ['fa#', 'sol', 'sol#', 'la', 'la#', 'ti', 'do', 'do#', 're', 're#', 'mi', 'mi#'],
            Gb: ['solb', 'labb', 'lab', 'tibb', 'tib', 'dob', 'rebb', 'reb', 'mibb', 'mib', 'fab', 'fa'],
            G: ['sol', 'lab', 'la', 'tib', 'ti', 'do', 'reb', 're', 'mib', 'mi', 'fa', 'fa#'],
            'G#': ['sol#', 'la', 'la#', 'ti', 'ti#', 'do#', 're', 're#', 'mi', 'mi#', 'fa#', 'fa##'],
            Ab: ['lab', 'tibb', 'tib', 'dob', 'do', 'reb', 'mibb', 'mib', 'fab', 'fa', 'solb', 'sol'],
            A: ['la', 'tib', 'ti', 'do', 'do#', 're', 'mib', 'mi', 'fa', 'fa#', 'sol', 'sol#'],
            'A#': ['la#', 'ti', 'ti#', 'do#', 'do##', 're#', 'mi', 'mi#', 'fa#', 'fa##', 'sol#', 'sol##'],
            Bb: ['tib', 'dob', 'do', 'reb', 're', 'mib', 'fab', 'fa', 'solb', 'sol', 'lab', 'la'],
            B: ['ti', 'do', 'do#', 're', 're#', 'mi', 'fa', 'fa#', 'sol', 'sol#', 'la', 'la#'],
            'B#': ['ti#', 'do#', 'do##', 're#', 're##', 'mi#', 'fa#', 'fa##', 'sol#', 'sol##', 'la#', 'la##'],
            '': ['', '', '', '', '', '', '', '', '', '', '', ''],
        },
        cssClasses: {
            noteComposer: 'note-composer',
            note: 'note',
            noteAnimation: 'note-animation',
            approachCircle: 'approach-circle',
            noteName: 'note-name',
        },
        nameTypes: ['Note name', 'Keyboard layout', 'Your Keyboard layout', 'Do Re Mi', 'ABC', 'No Text', '1 2 3'],
        composerPositions: [6, 5, 4, 3, 2, 1, 0, 13, 12, 11, 10, 9, 8, 7, 20, 19, 18, 17, 16, 15, 14],
        importPositions: [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0],
        // ZenKeyboardStore.ts:23 / PlayerStore.ts:56 — delay: APP_NAME === 'Genshin' ? 100 : 200
        animationDelayMs: 100,
        // ComposerCanvas.tsx: `if (APP_NAME === "Sky") height = nearestEven(height * 0.95)` — no scaling for Genshin.
        composerRowHeightScale: 1,
        // Instrument.ts:217 — noteImage: NoteImage = APP_NAME === "Genshin" ? "do" : "cr"
        defaultIcon: 'do',
        // VisualSong.ts:18 — APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
        visualNameCasing: 'lowercase',
        // Genshin's own 11 solfège glyphs only (Task 9) — Partial, so a per-game module
        // importing just its own glyphs still type-checks against the shared union.
        svgGlyphs: {
            do: DoGlyph,
            re: ReGlyph,
            reb: RebGlyph,
            mi: MiGlyph,
            mib: MibGlyph,
            fa: FaGlyph,
            so: SoGlyph,
            la: LaGlyph,
            lab: LabGlyph,
            ti: TiGlyph,
            tib: TibGlyph,
        },
    },

    layouts: {
        // Unconditional in old Config.ts (LAYOUT_KINDS): shared by both games, not APP_NAME-branched.
        layoutKinds: {
            defaultGenshin: {
                keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
            },
            defaultDrums: {
                keyboardLayout: ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'],
                numberLayout: ['1', '2', '3', '4', '1̣', '2̣', '3̣', '4̣'],
                abcLayout: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'],
                playstationLayout: ['⟰', '▲', '⭅', '◼', '⟱', 'X', 'L2', 'R2'],
                switchLayout: ['⟰', 'X', '⭅', 'Y', '⟱', 'B', 'Zl', 'Zr'],
            },
            defaultSky: {
                keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'A', 'S', 'D', 'F', 'G', 'Z', 'X', 'C', 'V', 'B'],
                numberLayout: ['1', '2', '3', '4', '5', '6', '7', '1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1̇̇'],
                abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2', 'B3', 'B4', 'B5', 'C1', 'C2', 'C3', 'C4', 'C5'],
                playstationLayout: ['L2', 'R2', '⟱', 'X', '⭅', '◼', '⟰', '▲', '⭆', '⬤', 'L1', 'R1', '❰L', '❰R', 'L❱'],
                switchLayout: ['Zl', 'Zr', '⟱', 'B', '⭅', 'Y', '⟰', 'X', '⭆', 'A', 'L', 'R', '❰L', '❰R', 'L❱'],
            },
            skySFX6: {
                keyboardLayout: ['Q', 'W', 'E', 'A', 'S', 'D'],
                abcLayout: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
                playstationLayout: ['⟰', '▲', '⭅', '⟱', 'X', 'L2'],
                switchLayout: ['Zl', 'Zr', '⟱', 'Y', '⟰', 'X'],
                numberLayout: ['1', '2', '3', '1̇', '2̇', '3̇'],
            },
        },
        // Unconditional in old Config.ts (LAYOUT_ICONS_KINDS): shared by both games.
        iconKinds: {
            defaultSky: ['dmcr', 'dm', 'cr', 'dm', 'cr', 'cr', 'dm', 'dmcr', 'dm', 'cr', 'cr', 'dm', 'cr', 'dm', 'dmcr'],
            defaultSkyDrums: ['cr', 'dm', 'cr', 'dm', 'cr', 'dm', 'cr', 'dm'],
            defaultSkySynth: ['dmcr', 'dm', 'cr', 'dm', 'cr', 'dm', 'cr', 'dmcr'],
            defaultGenshinDrums: ['do', 're', 'mi', 'fa', 'do', 're', 'mi', 'fa'],
            skySFX6: ['cr', 'dm', 'cr', 'cr', 'dm', 'cr'],
            defaultGenshin: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
            genshinVintageLyre: ['do', 'reb', 'mib', 'fa', 'so', 'lab', 'tib', 'do', 're', 'mib', 'fa', 'so', 'la', 'tib', 'do', 're', 'mib', 'fa', 'so', 'la', 'tib'],
        },
        // Unconditional in old Config.ts (INSTRUMENT_NOTE_LAYOUT_KINDS): shared by both games.
        noteLayoutKinds: {
            defaultSky: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
            defaultGenshin: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
            skyBell: ['C', 'D', 'G', 'A', 'C', 'D', 'G', 'A'],
            skyHandpan: ['D', 'A', 'C', 'D', 'F', 'G', 'A', 'C'],
            defaultDrums: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
            skySFX6: ['', '', '', '', '', ''],
            skySFX14: ['C#', 'E', 'G', 'A#', 'C#', 'E', 'G', 'A#', 'C#', 'E', 'G', 'A#', 'C#', 'E'],
            genshinVintageLyre: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
            genshinUkulele: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'G', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
        },
        // Unconditional in old Config.ts (INSTRUMENT_MIDI_LAYOUT_KINDS): shared by both games.
        midiLayoutKinds: {
            defaultSky: [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84],
            defaultGenshin: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            skyBell: [60, 62, 67, 69, 72, 74, 79, 81],
            skyHandpan: [62, 69, 72, 74, 77, 79, 81, 84],
            defaultDrums: [60, 62, 64, 65, 67, 69, 71, 72],
            skySFX6: [60, 62, 64, 65, 67, 69],
            skySFX14: [61, 64, 67, 70, 73, 76, 79, 82, 85, 88, 91, 94, 97, 100],
        },
        // KeybindsStore.ts:56 default `keyboard` shortcuts row, Genshin branch (21 keys).
        defaultKeyboardKeys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
    },

    instruments: {
        list: ['Lyre', 'Vintage-Lyre', 'Zither', 'Old-Zither', 'Ukulele', 'LingeringEuphonia', 'LeapingSpiritPiano', 'HarmonicKey', 'DunDun', 'DjemDjemDrum'],
        data: {
            Lyre: {
                notes: 21,
                family: 'strings',
                midiName: 'pizzicato strings',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            Zither: {
                notes: 21,
                fill: '#cdb68e',
                family: 'strings',
                midiName: 'pizzicato strings',
                clickColor: '#ddcba8',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            'Vintage-Lyre': {
                notes: 21,
                family: 'strings',
                midiName: 'pizzicato strings',
                fill: '#7FB363',
                clickColor: '#7FB363',
                baseNotes: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb', 'C', 'D', 'Eb', 'F', 'G', 'A', 'Bb'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 'reb', 'mib', 'fa', 'so', 'lab', 'tib', 'do', 're', 'mib', 'fa', 'so', 'la', 'tib', 'do', 're', 'mib', 'fa', 'so', 'la', 'tib'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            'Old-Zither': {
                notes: 21,
                fill: '#cdb68e',
                family: 'strings',
                midiName: 'pizzicato strings',
                clickColor: '#ddcba8',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            Ukulele: {
                notes: 21,
                fill: '#4d719a',
                family: 'strings',
                midiName: 'pizzicato strings',
                clickColor: '#6586d9',
                baseNotes: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'G', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            LingeringEuphonia: {
                notes: 21,
                fill: '#9288d3',
                family: 'strings',
                midiName: 'pizzicato strings',
                clickColor: '#9591df',
                baseNotes: ['C', 'Db', 'Eb', 'F', 'G', 'Ab', 'G', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            HarmonicKey: {
                notes: 21,
                fill: '#ddb055',
                family: 'piano',
                midiName: 'acoustic grand',
                clickColor: '#e1cba3',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            LeapingSpiritPiano: {
                notes: 21,
                fill: '#5cadbd',
                family: 'piano',
                midiName: 'acoustic grand',
                clickColor: '#5cadbd',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'A', 'B'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'Z', 'X', 'C', 'V', 'B', 'N', 'M'],
                    numberLayout: ['1̇', '2̇', '3̇', '4̇', '5̇', '6̇', '7̇', '1', '2', '3', '4', '5', '6', '7', '1̣', '2̣', '3̣', '4̣', '5̣', '6̣', '7̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'],
                    playstationLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                    switchLayout: [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '],
                },
                icons: ['do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti', 'do', 're', 'mi', 'fa', 'so', 'la', 'ti'],
                midiNotes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
            DunDun: {
                notes: 8,
                family: 'percussive',
                midiName: 'synth drum',
                fill: '#F99C55',
                clickColor: '#f5a262',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'],
                    numberLayout: ['1', '2', '3', '4', '1̣', '2̣', '3̣', '4̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'],
                    playstationLayout: ['⟰', '▲', '⭅', '◼', '⟱', 'X', 'L2', 'R2'],
                    switchLayout: ['⟰', 'X', '⭅', 'Y', '⟱', 'B', 'Zl', 'Zr'],
                },
                icons: ['do', 're', 'mi', 'fa', 'do', 're', 'mi', 'fa'],
                midiNotes: [60, 62, 64, 65, 67, 69, 71, 72],
            },
            DjemDjemDrum: {
                notes: 8,
                family: 'percussive',
                midiName: 'synth drum',
                baseNotes: ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C'],
                layout: {
                    keyboardLayout: ['Q', 'W', 'E', 'R', 'A', 'S', 'D', 'F'],
                    numberLayout: ['1', '2', '3', '4', '1̣', '2̣', '3̣', '4̣'],
                    abcLayout: ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3', 'B4'],
                    playstationLayout: ['⟰', '▲', '⭅', '◼', '⟱', 'X', 'L2', 'R2'],
                    switchLayout: ['⟰', 'X', '⭅', 'Y', '⟱', 'B', 'Zl', 'Zr'],
                },
                icons: ['do', 're', 'mi', 'fa', 'do', 're', 'mi', 'fa'],
                midiNotes: [60, 62, 64, 65, 67, 69, 71, 72],
            },
        },
        defaultVolume: 90,
        audioFolder: 'genshin',
    },

    midi: {
        mapToNote: {
            48: [14, false],
            49: [14, true],
            50: [15, false],
            51: [15, true],
            52: [16, false],
            53: [17, false],
            54: [17, true],
            55: [18, false],
            56: [18, true],
            57: [19, false],
            58: [19, true],
            59: [20, false],
            60: [7, false],
            61: [7, true],
            62: [8, false],
            63: [8, true],
            64: [9, false],
            65: [10, false],
            66: [10, true],
            67: [11, false],
            68: [11, true],
            69: [12, false],
            70: [12, true],
            71: [13, false],
            72: [0, false],
            73: [0, true],
            74: [1, false],
            75: [1, true],
            76: [2, false],
            77: [3, false],
            78: [3, true],
            79: [4, false],
            80: [4, true],
            81: [5, false],
            82: [5, true],
            83: [6, false],
        },
        bounds: {
            upper: 84,
            lower: 48,
        },
        presets: [
            {
                name: 'default',
                notes: [72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59],
            },
        ],
    },

    composer: {
        tempoChangers: [
            {id: 0, text: '1', changer: 1, color: 5332079},
            {id: 1, text: '1/2', changer: 0.5, color: 5338451},
            {id: 2, text: '1/4', changer: 0.25, color: 4410493},
            {id: 3, text: '1/8', changer: 0.125, color: 7818605},
        ],
    },

    themes: {
        baseConfig: {
            text: {
                light: '#eae8e6',
                dark: '#151414',
                note: '#aaaa82',
            },
        },
        // BaseSettings.ts:434 — value: APP_NAME === 'Genshin' ? '#fff9ef' : '#495466'
        defaultNoteBackground: '#fff9ef',
    },

    settings: {
        defaultNoteNameType: {
            // BaseSettings.ts:86 — APP_NAME === "Genshin" ? (isMobile() ? "Do Re Mi" : "Keyboard layout") : "Note name"
            composer: {desktop: 'Keyboard layout', mobile: 'Do Re Mi'},
            // BaseSettings.ts:251 — identical Genshin branch to composer's
            player: {desktop: 'Keyboard layout', mobile: 'Do Re Mi'},
            // BaseSettings.ts:715 — identical Genshin branch (Sky uses "No Text" instead)
            zen: {desktop: 'Keyboard layout', mobile: 'Do Re Mi'},
            // sheet-visualizer/index.tsx — APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC'
            // (also consumed directly by PlayerPagesRenderer.tsx's own identical layoutType ternary —
            // the two call sites share this one field, there is no separate playerApproach field)
            sheetVisualizer: 'Keyboard layout',
        },
    },

    features: {
        hasNoteFrame: true,
        downloadsSongsInOldFormat: false,
    },

    i18n: {
        interpolation: {APP_NAME: 'Genshin'},
        // Config.ts:7-15 UPDATE_MESSAGE — both branches are currently identical text.
        updateMessage: 'Added new instruments: Harmonic Key (genshin)\nAdded new Layout: number layout',
        overrides: undefined,
    },
}
