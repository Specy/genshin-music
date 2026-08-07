import {APP_NAME, type Pitch, PITCHES} from "$core/legacyConfig"
import {InstrumentData, type SerializedInstrumentData, type SongData} from "./SongClasses"

//bad thing i need to do to fix type infer
export interface SongStorable {
    id: string | null,
    folderId: string | null
    name: string
    type: SongType
    _thisIsNotASerializedSong: null
}

export type SongType = 'recorded' | 'composed' | 'midi' | 'vsrg'

export interface SerializedSong {
    id: string | null,
    type: SongType
    folderId: string | null,
    name: string,
    data: SongData,
    bpm: number,
    pitch: Pitch,
    version: number,
    // Absent in composed v4 / recorded v3, where each serialized track embeds its own
    // instrument; still present in vsrg and every legacy version.
    instruments?: SerializedInstrumentData[]
}

/**
 * `.svelte.ts` because the scalars below are `$state` (2026-08-06 reactive-model plan, phase 1):
 * the composer used to publish every edit by CLONING the song, which gave every column and note a
 * new identity. Signals replace that. Every importer's specifier therefore carries the `.svelte`
 * segment ('$core/Songs/Song.svelte'), the same convention Instrument.svelte.ts and
 * ThemeProvider.svelte.ts already use - see VisualSong.ts's header.
 *
 * Which fields are signals is decided by CHANGE CADENCE, not by "is it observed": the five below
 * are watched independently by different parts of the UI (the title bar, the page metadata, the
 * song rows, the settings panel), so they each get their own. `data`, `type` and `version` are
 * write-once metadata nothing re-renders on and stay plain.
 *
 * Consequences of `$state` on a class field, which are load-bearing here:
 * - it compiles to a private source plus a PROTOTYPE get/set accessor pair, so external writes
 *   (`song.name = x`, `Song.deserializeTo`'s `to.bpm = ...`) keep working exactly as before;
 * - but the field is no longer an own enumerable property, so nothing may ENUMERATE a song
 *   instance. Persistence goes through serialize(); stripMetadata below takes an already
 *   -serialized object. Keep it that way.
 * - a SUBCLASS must never re-declare one of these fields: with `useDefineForClassFields` (target
 *   esnext) a bare `name: string` in a subclass defines an own property that shadows the accessor
 *   and silently kills the signal. RecordedSong used to re-declare `instruments`; it no longer does.
 */
export abstract class Song<T = any, T2 extends SerializedSong = any, T3 = number> {
    id: string | null = $state(null)
    type: SongType
    folderId: string | null = $state(null)
    name: string = $state("")
    data: SongData
    bpm: number = $state(220)
    pitch: Pitch = $state("C")
    version: T3

    //TODO Might not be ideal to have instrument data here
    //One signal for the whole roster (the inventory's `instruments`): the layer panel, the
    //keyboard and the canvas all re-read the entire array whenever any of it changes, so
    //per-instrument granularity would buy nothing. It lives on the base class because the field
    //always has - RecordedSong/VsrgSong inherit a signal they never observe, which costs one
    //source per song.
    //
    //`$state.raw`, not `$state`: the array handed out here must stay PLAIN. The composer's
    //renderer indexes it per note on every draw (ComposerRendererState.instruments), and a deep
    //`$state` array makes each of those element reads a Proxy trap plus a dependency
    //registration - measured ~20x the cost of a plain read, hundreds of reads per draw. Raw keeps
    //the whole-array signal (the accessor pair is identical, so `song.instruments = [...]`,
    //deserializeTo and the settings dispatch path are untouched) and drops the per-index sources,
    //which nothing reads.
    //THE RULE THAT COMES WITH IT: changing the roster means assigning a new array. An in-place
    //`instruments[i] = x` or `.push()` compiles, mutates, and publishes NOTHING.
    instruments: InstrumentData[] = $state.raw([])

    constructor(name: string, version: T3, type: SongType, data?: SongData) {
        this.name = name
        this.version = version
        this.type = type
        this.data = {
            isComposed: false,
            isComposedVersion: false,
            appName: APP_NAME,
            ...data
        }
    }

    static stripMetadata(song: SerializedSong): SerializedSong {
        const obj = {...song}
        //@ts-ignore
        delete obj._id
        return obj
    }

    static getSongType(song: SerializedSong | SongStorable): SongType | null {
        if (song.type) return song.type
        //@ts-ignore legacy format support
        if (song.data?.isComposedVersion === true) return "composed"
        //@ts-ignore
        if (song.data?.isComposedVersion === false) return 'recorded'
        return null
    }

    static deserializeTo<T extends Song>(to: T, fromSong: Partial<SerializedSong>): T {
        const sanitizedBpm = Number(fromSong.bpm)
        const instruments = Array.isArray(fromSong.instruments) ? fromSong.instruments.map(InstrumentData.deserialize) : []
        to.id = fromSong.id ?? null
        to.folderId = fromSong.folderId ?? null
        to.name = fromSong.name ?? "Untitled"
        to.data = {...to.data, ...fromSong.data}
        to.bpm = Number.isFinite(sanitizedBpm) ? sanitizedBpm : 220
        to.pitch = PITCHES.includes(fromSong.pitch!) ? fromSong.pitch! : "C"
        to.instruments = instruments
        return to
    }


    static roundTime(time: number){
        return Math.round(time)
    }

    abstract serialize(): T2

    abstract clone(): T
}


export function extractStorable<T extends SerializedSong>(song: T): SongStorable {
    return {
        id: song.id,
        folderId: song.folderId,
        name: song.name,
        type: song.type,
        _thisIsNotASerializedSong: null,
    }
}