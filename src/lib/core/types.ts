// Ported subset of old src/types/GeneralTypes.ts + src/types/SongTypes.ts.
// Only the types the old core files ported by this phase (ComposedSong.ts, RecordedSong.ts,
// BaseSettings.ts) actually import are included here (YAGNI) - see task-4-report.md for the
// grep evidence. Everything ported is verbatim from the old file except InstrumentName (see
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
// SerializedVsrgSong`) intentionally NOT ported yet. All three members are defined INSIDE the
// not-yet-ported ComposedSong.ts / RecordedSong.ts / VsrgSong.ts (Task 7), so it cannot be
// reproduced verbatim without fabricating stand-ins for files that don't exist in this tree yet.
// None of the three old core files this task actually checked (ComposedSong.ts, RecordedSong.ts,
// BaseSettings.ts) import SerializedSongKind itself - port it in Task 7 once those song-model
// files (and their Serialized* types) exist.

// ---- hoisted for BaseSettings.ts (Task 6) ----

// old $lib/Songs/VsrgSong.ts: `export type VsrgSongKeys = 4 | 6`. VsrgSong.ts itself isn't ported
// until Task 7, but BaseSettings.ts (Task 6) needs the type now - hoisted here as the single
// source; Task 7's VsrgSong.ts re-imports it from here instead of redefining it.
export type VsrgSongKeys = 4 | 6

// old src/components/pages/VsrgPlayer/VsrgPlayerKeyboard.tsx: `export type VsrgKeyboardLayout =
// 'line' | 'circles'`. That component isn't ported until the UI phase; BaseSettings.ts (Task 6)
// needs the type now for VsrgPlayerSettingsDataType - hoisted here, verbatim value union.
export type VsrgKeyboardLayout = 'line' | 'circles'
