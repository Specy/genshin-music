// FROZEN LEGACY NOTE TABLES — DO NOT EDIT, EVER. Values a released build ever applied to a
// stored file are frozen; a direction that was UNREACHABLE (see importPositions below) had
// nothing to freeze, so filling it in is an addition, not an edit.
//
// Snapshot (2026-08-03, pre-format-v4/v3/vsrg-v2) of every instrument's button→noteId
// mapping (`midiNotes` as they were when songs still stored layout indices), for BOTH
// games. Legacy song deserialization (composed ≤v3, recorded ≤v2, vsrg v1, old format)
// uses these to translate stored indices into Note Ids; they must therefore stay
// byte-identical forever, even if a game definition later retunes an instrument.
//
// This file is the ONE deliberate carve-out from the "$game-only" import rule
// (spec 2026-08-03 §6): a legacy Sky file imported while the Genshin build is running
// must be decoded with SKY's tables. It is DOM-free, side-effect-free, numeric data
// only, and safe for any bundle including the service worker.
//
// `importPositions` is how a game RECEIVES another game's legacy note indices (an
// index-level remap applied BEFORE id-ification, so legacy cross-game imports reproduce
// the old converter's output exactly — for the default instruments this equals a uniform
// -12 id shift, e.g. Sky 72 → Genshin 60). It is keyed by the SOURCE game because one
// array per receiver cannot carry two meanings: Sky's entry was the frozen copy of its
// IMPORT_NOTE_POSITIONS, the identity, which is what the old-format (Sky-index-space)
// decode needs from the Sky build — and identity is NOT the Genshin→Sky remap. That
// direction never ran before ADR-0011 (the Sky build rejected foreign songs at the door),
// so nothing was frozen for it: `Sky.importPositions.Genshin` is NEW data, the exact
// inverse of the historic -12, added rather than substituted so every array a released
// build ever applied stays byte-identical.

/** The games whose legacy formats exist. Legacy `data.appName` values are storageIds. */
export type LegacyAppName = 'Genshin' | 'Sky'

type LegacyGameTables = {
    defaultInstrument: string
    /** Legacy index-space size (NOTES_PER_COLUMN as of the snapshot). */
    perColumn: number
    /** How this game receives another game's legacy note indices, keyed by the SOURCE game. */
    importPositions: Readonly<Record<LegacyAppName, readonly number[]>>
    tables: Readonly<Record<string, readonly number[]>>
}

const GENSHIN_DEFAULT = Object.freeze([
    72, 74, 76, 77, 79, 81, 83, 60, 62, 64, 65, 67, 69, 71, 48, 50, 52, 53, 55, 57, 59,
])
const GENSHIN_DRUMS = Object.freeze([60, 62, 64, 65, 67, 69, 71, 72])

const SKY_DEFAULT = Object.freeze([60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84])
const SKY_8 = Object.freeze([60, 62, 64, 65, 67, 69, 71, 72])
const SKY_BELLS = Object.freeze([60, 62, 67, 69, 72, 74, 79, 81])
const SKY_HANDPAN = Object.freeze([62, 69, 72, 74, 77, 79, 81, 84])
const SKY_SFX6 = Object.freeze([60, 62, 64, 65, 67, 69])

// A game receiving its OWN index space remaps nothing. Only Sky's identity is ever read
// (old-format files are Sky-index-space by definition); Genshin's exists so the record is
// total and a same-game lookup can never silently miss.
const GENSHIN_IDENTITY = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
const SKY_IDENTITY = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])

// FROZEN: the historic Sky→Genshin remap (a uniform -12 in id space).
const SKY_INTO_GENSHIN = Object.freeze([14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0])
// Its exact inverse, +12 in id space, so a Sky legacy file that round-trips through Genshin
// and back lands on the notes it started from. -1 is "this index has no slot here": Genshin's
// top octave (ids 74-83 at indices 1-6) sounds above Sky's highest button, and dropping is what
// the decoders already do with an unmapped index. The other candidate mapping — no octave shift,
// dropping Genshin's BOTTOM octave instead — keeps more absolute pitches but is not the inverse
// of anything, so a Sky→Genshin→Sky round trip would transpose.
const GENSHIN_INTO_SKY = Object.freeze([14, -1, -1, -1, -1, -1, -1, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6])

export const LEGACY_NOTE_TABLES: Readonly<Record<LegacyAppName, LegacyGameTables>> = Object.freeze({
    Genshin: Object.freeze({
        defaultInstrument: 'Lyre',
        perColumn: 21,
        importPositions: Object.freeze({Sky: SKY_INTO_GENSHIN, Genshin: GENSHIN_IDENTITY}),
        tables: Object.freeze({
            'Lyre': GENSHIN_DEFAULT,
            'Vintage-Lyre': GENSHIN_DEFAULT,
            'Zither': GENSHIN_DEFAULT,
            'Old-Zither': GENSHIN_DEFAULT,
            'Ukulele': GENSHIN_DEFAULT,
            'LingeringEuphonia': GENSHIN_DEFAULT,
            'LeapingSpiritPiano': GENSHIN_DEFAULT,
            'HarmonicKey': GENSHIN_DEFAULT,
            'DunDun': GENSHIN_DRUMS,
            'DjemDjemDrum': GENSHIN_DRUMS,
        }),
    }),
    Sky: Object.freeze({
        defaultInstrument: 'Piano',
        perColumn: 15,
        importPositions: Object.freeze({Genshin: GENSHIN_INTO_SKY, Sky: SKY_IDENTITY}),
        tables: Object.freeze({
            'Piano': SKY_DEFAULT,
            'GrandPiano': SKY_DEFAULT,
            'WinterPiano': SKY_DEFAULT,
            'Harp': SKY_DEFAULT,
            'Guitar': SKY_DEFAULT,
            'LightGuitar': SKY_DEFAULT,
            'ToyUkulele': SKY_DEFAULT,
            'Pipa': SKY_DEFAULT,
            'Kalimba': SKY_DEFAULT,
            'Xylophone': SKY_DEFAULT,
            'Flute': SKY_DEFAULT,
            'Panflute': SKY_DEFAULT,
            'Ocarina': SKY_DEFAULT,
            'MantaOcarina': SKY_DEFAULT,
            'Trumpet': SKY_DEFAULT,
            'Horn': SKY_DEFAULT,
            'Contrabass': SKY_DEFAULT,
            'Aurora': SKY_DEFAULT,
            'Aurora_Short': SKY_DEFAULT,
            'Bells': SKY_BELLS,
            'HandPan': SKY_HANDPAN,
            'Drum': SKY_8,
            'DunDun': SKY_8,
            'SFX_SineSynth': SKY_8,
            'SFX_BassSynth': SKY_8,
            'SFX_ChimeSynth': SKY_8,
            'SFX_TR-909': SKY_8,
            'SFX_Dance': SKY_SFX6,
            'SFX_BirdCall': SKY_DEFAULT,
            'SFX_CrabCall': SKY_DEFAULT,
            'SFX_FishCall': SKY_DEFAULT,
            'SFX_SpiritMantaCall': SKY_DEFAULT,
            'SFX_JellyCall': SKY_DEFAULT,
            'SFX_MantaCall': SKY_DEFAULT,
            'SFX_MothCall': SKY_DEFAULT,
        }),
    }),
})

export function isLegacyAppName(appName: unknown): appName is LegacyAppName {
    return appName === 'Genshin' || appName === 'Sky'
}

/**
 * The button→id table used to decode a legacy song's note indices for one
 * instrument. Unknown instrument names decode with the game's default table —
 * matching the legacy runtime, where an unknown name fell back to the default
 * instrument (`new Instrument()` constructor guard).
 */
export function getLegacyTable(appName: LegacyAppName, instrumentName: string | undefined): readonly number[] {
    const game = LEGACY_NOTE_TABLES[appName]
    return game.tables[instrumentName ?? ''] ?? game.tables[game.defaultInstrument]
}

/**
 * Decode one legacy note index to a Note Id, `null` when the index has no button
 * on this instrument (legacy runtime: a silent note — dropped at conversion).
 *
 * Dropping is deliberate: substituting the default-instrument id for an
 * out-of-table index looks tempting (it preserves the ghost note's row), but a
 * short instrument's table can contain that id at a DIFFERENT button (e.g.
 * Genshin default id 65 at index 10 is DunDun's button 3), which would turn a
 * silent legacy note audible. Sound parity wins over ghost-note visibility.
 */
export function legacyIndexToId(appName: LegacyAppName, instrumentName: string | undefined, index: number): number | null {
    return getLegacyTable(appName, instrumentName)[index] ?? null
}
