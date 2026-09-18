// App metadata carried inside an exported .mid, as a single standard Text meta event on the
// conductor track.
//
// SCOPE RULE, and it is deliberate: this carries ONLY what MIDI genuinely cannot express —
// which app instrument each layer plays, and the audio settings hanging off it. Notes, timing,
// note lengths, tempo and tempo changers are NOT in here and must never be: they are musical
// data, MIDI represents them natively, and re-importing our own file has to exercise exactly
// the same derivation path a foreign MIDI does. That is what keeps the foreign-file importer
// honest — the app's own exports are its test bed. A metadata shortcut would let that path rot
// unnoticed.
//
// The .mid is NOT a save format. The JSON format remains the real one; this exists so a song
// exported for an app that cannot read our format comes back usefully rather than as bare notes.
//
// PORTABILITY: a Text meta event is standard and DAWs ignore ones they do not understand, but
// some editors drop or rewrite them on re-save. So this is best-effort by construction — every
// reader must work without it, and `decodeMidiMetadata` returning null is an ordinary outcome,
// not an error.
import {APP_NAME} from '$core/legacyConfig'
import {InstrumentData, type SerializedInstrumentData} from './SongClasses'
import type {Pitch} from '$core/legacyConfig'

/** Marks the text event as ours and lets a future shape change be detected rather than guessed. */
const METADATA_PREFIX = 'genshin-music-meta:'
const METADATA_VERSION = 1

type MidiMetadataPayload = {
    app: string
    v: number
    /** Serialized InstrumentData per layer, in layer order. */
    instruments: SerializedInstrumentData[]
    pitch: string
    reverb: boolean
}

export type MidiMetadata = {
    instruments: InstrumentData[]
    pitch: Pitch
    reverb: boolean
}

/** The text to store in a Text meta event. */
export function encodeMidiMetadata(song: {
    instruments: InstrumentData[]
    pitch: Pitch
    reverb: boolean
}): string {
    const payload: MidiMetadataPayload = {
        app: APP_NAME,
        v: METADATA_VERSION,
        instruments: song.instruments.map(instrument => instrument.serialize()),
        pitch: song.pitch,
        reverb: song.reverb,
    }
    return METADATA_PREFIX + JSON.stringify(payload)
}

/**
 * Recover metadata from a file's meta events, or null when this is not one of our exports —
 * a foreign MIDI, a different game's export, a newer format, or a file an editor stripped.
 * Never throws: a malformed blob is treated exactly like an absent one.
 */
export function decodeMidiMetadata(
    metaEvents: readonly {type: string; text: string}[]
): MidiMetadata | null {
    for (const event of metaEvents) {
        if (typeof event?.text !== 'string' || !event.text.startsWith(METADATA_PREFIX)) continue
        try {
            const payload = JSON.parse(event.text.slice(METADATA_PREFIX.length)) as MidiMetadataPayload
            //a Sky blob carries Sky instrument names, which do not exist in a Genshin build —
            //adopting them would produce layers whose instrument silently falls back
            if (payload.app !== APP_NAME) return null
            if (payload.v !== METADATA_VERSION) return null
            if (!Array.isArray(payload.instruments) || payload.instruments.length === 0) return null
            return {
                instruments: payload.instruments.map(data => InstrumentData.deserialize(data)),
                pitch: (payload.pitch ?? 'C') as Pitch,
                reverb: payload.reverb === true,
            }
        } catch {
            //truncated or hand-edited text: fall through and treat the file as foreign
            return null
        }
    }
    return null
}
