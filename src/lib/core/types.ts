// Ported subset of old src/types/GeneralTypes.ts + src/types/SongTypes.ts.
// Only the types the old core files ported so far (ComposedSong.ts, RecordedSong.ts, VsrgSong.ts,
// BaseSettings.ts) actually import are included here (YAGNI) - see task-4-report.md/task-7-report.md
// for the grep evidence. Everything ported is verbatim from the old file except InstrumentName (see
// its own comment below for the one permitted widening).
//
// The three imports below (SerializedSongKind's members) make this file and ComposedSong.ts/
// RecordedSong.ts/VsrgSong.ts mutually import each other (those three already import
// InstrumentName/OldFormat/etc. from here). This is a type-only cycle - `import type` is fully
// erased at compile time (no runtime module-init cycle exists), and TypeScript/svelte-check
// resolve mutually-recursive type aliases like this routinely (verified: `npm run check`/
// `check:sky` clean). No eslint import/no-cycle rule is configured in this repo's eslint.config.js
// either.
import type {UnknownSerializedComposedSong} from "./Songs/ComposedSong"
import type {SerializedRecordedSong} from "./Songs/RecordedSong"
import type {SerializedVsrgSong} from "./Songs/VsrgSong"

// ---- GeneralTypes.ts ----

// old GeneralTypes.ts: `export type InstrumentName = typeof INSTRUMENTS[number]`
// widened from the per-game literal union: cross-game code (toGenshin) needs names from both rosters; runtime behavior is untyped anyway
export type InstrumentName = string

// old GeneralTypes.ts: `export type NoteStatus = 'clicked' | 'toClick' | 'toClickNext' |
// 'toClickAndNext' | 'approach-wrong' | 'approach-correct' | ''` - verbatim value union, unlike
// InstrumentName above. Deferred through Phase 2/3 (no consumer); Phase-4a Task 2's
// ObservableNote.data (src/lib/audio/Instrument.svelte.ts) is the first real consumer.
export type NoteStatus =
    'clicked'
    | 'toClick'
    | 'toClickNext'
    | 'toClickAndNext'
    | 'approach-wrong'
    | 'approach-correct'
    | ''

// old GeneralTypes.ts: `export type ApproachingScore = {correct: number, wrong: number, score:
// number, combo: number}` - verbatim. Deferred through Phase 2/3 (no consumer); Phase-4b Task 1's
// PlayerControlsStore.svelte.ts (src/lib/stores/PlayerControlsStore.svelte.ts) is the first real
// consumer, same hoisting pattern as VsrgSongKeys/VsrgKeyboardLayout/SnapPoint above.
export type ApproachingScore = {
    correct: number
    wrong: number
    score: number
    combo: number
}

// ---- SongTypes.ts ----

export type _LegacySongInstruments = [InstrumentName, InstrumentName, InstrumentName, InstrumentName]

export type OldFormat = {
    isComposed: boolean,
    pitchLevel: number,
    songNotes: {
        key: string
        time: number
        l?: number
    }[],
    bitsPerPage: number,
    isEncrypted: boolean
}

export type OldNote = {
    key: string
    time: number
    l?: number
}

// old SongTypes.ts: `export type SerializedSongKind = UnknownSerializedComposedSong |
// SerializedRecordedSong | SerializedVsrgSong`. Deferred through Phase 2 (P2 Task 7: "no
// Phase-2 consumer") - now constructible since ComposedSong.ts/RecordedSong.ts/VsrgSong.ts all
// exist, and needed by FileService.ts (P3 Task 7), its first real consumer.
export type SerializedSongKind = UnknownSerializedComposedSong | SerializedRecordedSong | SerializedVsrgSong

// ---- hoisted for BaseSettings.ts (Task 6) ----

// old $lib/Songs/VsrgSong.ts: `export type VsrgSongKeys = 4 | 6`. VsrgSong.ts itself isn't ported
// until Task 7, but BaseSettings.ts (Task 6) needs the type now - hoisted here as the single
// source; Task 7's VsrgSong.ts re-imports it from here instead of redefining it.
export type VsrgSongKeys = 4 | 6

// old src/components/pages/VsrgPlayer/VsrgPlayerKeyboard.tsx: `export type VsrgKeyboardLayout =
// 'line' | 'circles'`. That component isn't ported until the UI phase; BaseSettings.ts (Task 6)
// needs the type now for VsrgPlayerSettingsDataType - hoisted here, verbatim value union.
export type VsrgKeyboardLayout = 'line' | 'circles'

// ---- hoisted for VsrgSong.ts (Task 7) ----

// old src/components/pages/VsrgComposer/VsrgBottom.tsx: `export type SnapPoint = 1 | 2 | 4 | 8 |
// 16`. That component isn't ported until the UI phase; VsrgSong.ts (Task 7) needs the type now
// for SerializedVsrgSong.snapPoint/VsrgSong.snapPoint - hoisted here, verbatim value union (same
// pattern as VsrgKeyboardLayout above).
export type SnapPoint = 1 | 2 | 4 | 8 | 16
