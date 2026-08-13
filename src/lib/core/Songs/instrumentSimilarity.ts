// Cross-game instrument similarity map, used by the NEW-format cross-game conversion
// (`toOtherGame`, spec 2026-08-03 §6). When a song moves between games, each track's
// instrument swaps to the target game's most similar-sounding instrument instead of
// always collapsing to the default. Keys are (source game, instrument name) — bare
// names are ambiguous across games ('DunDun' exists in both). Instruments with no
// mapping (or unknown names) fall back to the target game's default instrument.
//
// Game-independent, DOM-free data: safe for core-tier imports. Adding game #3 =
// add its column to the entries below plus a new top-level section for its roster.
// These pairings are curated by ear, not derived — tune freely; nothing else keys
// off them (conversion ids are nominal and instrument-independent).

export type ConversionGame = 'Genshin' | 'Sky'

type SimilarByTarget = Partial<Record<ConversionGame, string>>

export const SIMILAR_INSTRUMENTS = {
    Genshin: {
        'Lyre': {Sky: 'Harp'},
        'Vintage-Lyre': {Sky: 'Harp'},
        'Zither': {Sky: 'Pipa'},
        'Old-Zither': {Sky: 'Pipa'},
        'Ukulele': {Sky: 'ToyUkulele'},
        'LingeringEuphonia': {Sky: 'Kalimba'},
        'LeapingSpiritPiano': {Sky: 'Piano'},
        'HarmonicKey': {Sky: 'Piano'},
        'DunDun': {Sky: 'DunDun'},
        'DjemDjemDrum': {Sky: 'Drum'},
        'NightwindHorn': {Sky: 'Horn'},
    },
    Sky: {
        'Piano': {Genshin: 'LeapingSpiritPiano'},
        'GrandPiano': {Genshin: 'LeapingSpiritPiano'},
        'WinterPiano': {Genshin: 'LeapingSpiritPiano'},
        'Harp': {Genshin: 'Lyre'},
        'Aurora': {Genshin: 'Lyre'},
        'Aurora_Short': {Genshin: 'Lyre'},
        'Guitar': {Genshin: 'Ukulele'},
        'LightGuitar': {Genshin: 'Ukulele'},
        'ToyUkulele': {Genshin: 'Ukulele'},
        'Pipa': {Genshin: 'Zither'},
        'Kalimba': {Genshin: 'LingeringEuphonia'},
        'Xylophone': {Genshin: 'HarmonicKey'},
        'Bells': {Genshin: 'HarmonicKey'},
        'HandPan': {Genshin: 'DunDun'},
        'Drum': {Genshin: 'DjemDjemDrum'},
        'DunDun': {Genshin: 'DunDun'},
        'Horn': {Genshin: 'NightwindHorn'},
        'Trumpet': {Genshin: 'NightwindHorn'},
        //other winds/voice/SFX have no Genshin counterpart yet — omitted entries fall
        //back to the target default (Flute, Panflute, Ocarina, MantaOcarina,
        //Contrabass, SFX_*)
    },
} satisfies Record<ConversionGame, Record<string, SimilarByTarget>>

/** The target game's most similar instrument for a source instrument, or null (caller falls back to the target's default). */
export function findSimilarInstrument(
    sourceGame: string,
    instrumentName: string,
    targetGame: ConversionGame
): string | null {
    if (sourceGame !== 'Genshin' && sourceGame !== 'Sky') return null
    const bySource: Record<string, SimilarByTarget> = SIMILAR_INSTRUMENTS[sourceGame]
    return bySource?.[instrumentName]?.[targetGame] ?? null
}
