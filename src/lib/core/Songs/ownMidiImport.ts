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
// ACCEPTED ONLY IF EXACT. Nothing shows the user this song before it is saved, so the import is
// checked the only way that cannot miss a case: the song it built is exported again, and must
// write the same notes the file holds - same track, Note Number and start tick, and the same length
// wherever the layer can hold - on tracks named the same, in the same order. The importer is lossy in ways a composed song can hit (a strand
// between the rows is snapped onto a key, the rest before the first note is not kept, a hold across
// a sub-beat rest can shrink to a tap), and any of them sends the file to the importer screen,
// where the user sees the result before keeping it.
//
// NOT OURS AFTER ALL: export writes exactly one track per layer, silent ones included, each named
// after its layer. A file with another number of tracks, or with its names out of step, has been
// edited since we wrote it - a DAW dropped an empty track, or put a conductor track in front (and
// perhaps dropped an empty one at the end, keeping the count) - and every layer after the change
// would land on its neighbour's instrument. Such a file goes to the importer screen too, where the
// user can say what each track is.
import type {Midi} from '@tonejs/midi'
import {BASE_LAYER_LIMIT} from '$core/sharedConfig'
import {ComposedSong} from './ComposedSong.svelte'
import {RecordedSong} from './RecordedSong'
import {RecordedNote} from './SongClasses'
import {decodeMidiMetadata, type MidiSongKind} from './midiMetadata'
import {importMidiTracks, instrumentSupportsSustain} from './midiImport'
import {Midi as MidiConstructor} from './midiConstructor'

export type OwnMidiImport = {
    song: ComposedSong | RecordedSong
    kind: MidiSongKind
}

/**
 * A file's notes as the exact check compares them. The length only counts on a layer that can
 * hold: on one that cannot, a tap's written length is just the song's shortest note-bearing column,
 * which says nothing about what plays.
 */
function noteEvents(midi: Midi, holds: readonly boolean[]): string[] {
    const events: string[] = []
    midi.tracks.forEach((track, index) => {
        for (const note of track.notes) {
            events.push(holds[index]
                ? `${index}:${note.midi}:${note.ticks}:${note.durationTicks}`
                : `${index}:${note.midi}:${note.ticks}`)
        }
    })
    return events.sort()
}

const sameList = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, index) => value === b[index])

/**
 * Whether `song`, exported again and read back, writes exactly the file `source` is: the same
 * tracks by name, in order, holding the same notes. Both sides are read from bytes, so whatever the
 * writer does to a name or a time it does to both.
 */
function writesTheSameFile(source: Midi, song: ComposedSong | RecordedSong, holds: readonly boolean[]): boolean {
    const written = new MidiConstructor(new Uint8Array(song.toMidi().toArray()).buffer as ArrayBuffer)
    return sameList(source.tracks.map(track => track.name), written.tracks.map(track => track.name))
        && sameList(noteEvents(source, holds), noteEvents(written, holds))
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
 * The song one of our own exports holds, or null when the file should go through the importer
 * screen instead - foreign, the other game's, damaged metadata, edited since export, or a song the
 * import could not rebuild exactly (see the header). Never throws for a file that is merely not
 * ours; a parse failure upstream is the caller's.
 */
export function songFromOwnMidi(midi: Midi, fileName: string): OwnMidiImport | null {
    const metadata = decodeMidiMetadata(midi.header.meta ?? [])
    if (!metadata) return null
    const layerCount = metadata.instruments.length
    if (layerCount > BASE_LAYER_LIMIT) return null
    //track i IS layer i only while there is exactly one track per layer
    if (midi.tracks.length !== layerCount) return null
    if (!midi.tracks.some(track => track.notes.length > 0)) return null

    const name = songName(midi, fileName)
    const bpm = fileBpm(midi)
    const instruments = metadata.instruments.map(instrument => instrument.clone())
    const holds = instruments.map(instrument => instrumentSupportsSustain(instrument.name))

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
            const canHold = holds[trackIndex]
            for (const note of track.notes) {
                const durationMs = Math.round(note.duration * 1000)
                const isTap = !canHold || Math.abs(durationMs - tapMs) <= tapToleranceMs
                notes.push(new RecordedNote(note.midi, Math.round(note.time * 1000), isTap ? 0 : durationMs, trackIndex))
            }
        })
        song.notes = notes.sort((a, b) => a.time - b.time)
        return writesTheSameFile(midi, song, holds) ? {song, kind: 'recorded'} : null
    }

    const result = importMidiTracks(
        midi.tracks
            .map((track, layer) => ({notes: track.notes, layer, localOffset: null, maxScaling: 0}))
            .filter(track => track.notes.length > 0),
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
    return writesTheSameFile(midi, song, holds) ? {song, kind: 'composed'} : null
}
