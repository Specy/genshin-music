// Ported subset of old src/types/GeneralTypes.ts + src/types/SongTypes.ts.
// Only the types the old core files ported so far (ComposedSong.ts, RecordedSong.ts, VsrgSong.ts,
// BaseSettings.ts) actually import are included here (YAGNI) - see task-4-report.md/task-7-report.md
// for the grep evidence. Everything ported is verbatim from the old file except InstrumentName (see
// its own comment below for the one permitted widening).

// ---- GeneralTypes.ts ----

// old GeneralTypes.ts: `export type InstrumentName = typeof INSTRUMENTS[number]`
// widened from the per-game literal union: cross-game code (toGenshin) needs names from both rosters; runtime behavior is untyped anyway
export type InstrumentName = string

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

// SerializedSongKind (old SongTypes.ts: `UnknownSerializedComposedSong | SerializedRecordedSong |
// SerializedVsrgSong`) still intentionally NOT ported. ComposedSong.ts/RecordedSong.ts/VsrgSong.ts
// now all exist (Task 7) and were checked directly - none of the three reference
// SerializedSongKind. Its only appearance anywhere in Phase-2 scope is a `//TODO instead of using
// SerializedSong, switch to SerializedSongKind` comment in the old SongService.ts (Task 8) - not
// a real import, so still no genuine consumer. (Its actual consumers, FileService.ts and
// components/shared/pagesLayout/Folder.tsx, are outside Phase-2 scope entirely.) Defer again
// until a real consumer needs it.

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
