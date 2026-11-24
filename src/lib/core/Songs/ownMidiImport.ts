// ONE OF OUR OWN MIDI EXPORTS, IMPORTED WITHOUT THE IMPORTER SCREEN.
//
// A .mid this game wrote carries its metadata (midiMetadata.ts): every layer's instrument, the
// Basepoint, reverb and which song model it came from. Every question the importer screen asks -
// instrument per track, offset, Basepoint - is already answered for such a file, and answered by
// the song that wrote it, so a user who exports a MIDI and imports it back gets the song straight
// into the library. The importer screen stays for every other file, and for anyone who opens one
// of ours through "Create from MIDI or audio" on purpose.
//
// EVERY NOTE STILL COMES OFF THE MIDI EVENTS, never off the metadata, so the scope rule in
// midiMetadata.ts holds:
//  - a COMPOSED export runs `importMidiTracks`, the foreign-file importer itself, with the answers
//    the screen would have been given: no offset, no octave folding, accidentals and out-of-range
//    notes kept (the song had them; nothing here is the user's chance to trim it), the layers and
//    Basepoint the metadata names. A loss on this path is therefore a loss the importer has too,
//    and is fixed there.
//  - a RECORDED export is read event for event: a performance has no columns to quantize into, and
//    quantizing it at its bpm would quietly re-time it. The one thing the file cannot say is
//    whether a note was a tap - export writes a tap one beat long (RecordedSong.toMidi) - so a note
//    of exactly that length on a layer that can hold comes back as a tap. A held note of exactly
//    one beat comes back as a tap too; that is the price of a format with no "no length".
//
// NOT OURS AFTER ALL: a file whose note-bearing tracks do not line up with the layers its metadata
// names has been edited since we wrote it (a DAW added a track, or dropped one). Such a file gets
// null and goes through the importer screen, where the user can say what the extra tracks are.
import type {Midi} from '@tonejs/midi'
import {BASE_LAYER_LIMIT} from '$core/sharedConfig'
import {ComposedSong} from './ComposedSong.svelte'
import {RecordedSong} from './RecordedSong'
import {RecordedNote} from './SongClasses'
import {decodeMidiMetadata, type MidiSongKind} from './midiMetadata'
import {importMidiTracks, instrumentSupportsSustain} from './midiImport'

export type OwnMidiImport = {
    song: ComposedSong | RecordedSong
    kind: MidiSongKind
    /** Notes in the file that did not make it into the song. Zero for an untouched export. */
    lostNotes: number
}

/** The bpm a file says, read the way MidiParser reads it: the inverse of toMidi's setTempo(bpm / 4). */
function fileBpm(midi: Midi): number {
    const bpm = Math.round((midi.header.tempos[0]?.bpm ?? 0) * 4)
    return Number.isFinite(bpm) && bpm > 0 ? bpm : 220
}

/** The song's name: the one the export wrote, else the file's name without its extension. */
function songName(midi: Midi, fileName: string): string {
    const written = typeof midi.name === 'string' ? midi.name.trim() : ''
    if (written) return written
    const base = fileName.replace(/\.(mid|midi)$/i, '').trim()
    return base || 'Untitled'
}

/**
 * The song one of our own exports holds, or null when the file is not one - foreign, the other
 * game's, damaged metadata, or edited since export (see the header). Never throws for a file that
 * is merely not ours; a parse failure upstream is the caller's.
 */
export function songFromOwnMidi(midi: Midi, fileName: string): OwnMidiImport | null {
    const metadata = decodeMidiMetadata(midi.header.meta ?? [])
    if (!metadata) return null
    const layerCount = metadata.instruments.length
    if (layerCount > BASE_LAYER_LIMIT) return null
    //export writes one track per layer, silent ones included, so track i IS layer i; a note-bearing
    //track past the roster is one the metadata knows nothing about
    if (midi.tracks.some((track, index) => index >= layerCount && track.notes.length > 0)) return null
    if (!midi.tracks.some(track => track.notes.length > 0)) return null

    const name = songName(midi, fileName)
    const bpm = fileBpm(midi)
    const instruments = metadata.instruments.map(instrument => instrument.clone())

    if (metadata.kind === 'recorded') {
        const song = new RecordedSong(name)
        song.bpm = bpm
        song.pitch = metadata.pitch
        song.reverb = metadata.reverb
        song.instruments = instruments
        //the tap length export wrote, and how far the tick grid can move it: a time and a duration
        //each round to a tick, so the two ends of a note can each be off by one
        const tapMs = 60000 / bpm
        const ppq = midi.header.ppq > 0 ? midi.header.ppq : 480
        const tickMs = 60000 / (bpm / 4) / ppq
        const tapToleranceMs = Math.max(2, tickMs * 2)
        const notes: RecordedNote[] = []
        midi.tracks.forEach((track, trackIndex) => {
            if (trackIndex >= layerCount) return
            const canHold = instrumentSupportsSustain(instruments[trackIndex].name)
            for (const note of track.notes) {
                const durationMs = Math.round(note.duration * 1000)
                const isTap = !canHold || Math.abs(durationMs - tapMs) <= tapToleranceMs
                notes.push(new RecordedNote(note.midi, Math.round(note.time * 1000), isTap ? 0 : durationMs, trackIndex))
            }
        })
        song.notes = notes.sort((a, b) => a.time - b.time)
        return {song, kind: 'recorded', lostNotes: 0}
    }

    const result = importMidiTracks(
        midi.tracks
            .map((track, layer) => ({notes: track.notes, layer, localOffset: null, maxScaling: 0}))
            .filter(track => track.layer < layerCount && track.notes.length > 0),
        {
            bpm,
            offset: 0,
            includeAccidentals: true,
            includeOutOfRange: true,
            pitch: metadata.pitch,
            layers: instruments,
        }
    )
    if (result.columns.length === 0) return null
    const song = new ComposedSong(name)
    //built here and handed to the library as a serialized song, so nothing observes it yet: the
    //construction-time setter, exactly as MidiParser builds its preview
    song.initColumnsForConstruction(result.columns)
    song.normalizeSpans()
    song.bpm = bpm
    song.pitch = metadata.pitch
    song.reverb = metadata.reverb
    song.instruments = instruments
    const placed = result.columns.reduce((total, column) => total + column.notes.length, 0)
    return {song, kind: 'composed', lostNotes: Math.max(0, result.totalNotes - placed)}
}
