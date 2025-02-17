import {APP_NAME, Pitch, PITCHES} from "$config"
import {InstrumentData, SerializedInstrumentData, SongData} from "./SongClasses"

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
    instruments: SerializedInstrumentData[]
}

export abstract class Song<T = any, T2 extends SerializedSong = any, T3 = number> {
    id: string | null = null
    type: SongType
    folderId: string | null = null
    name: string
    data: SongData
    bpm: number = 220
    pitch: Pitch = "C"
    version: T3

    //TODO Might not be ideal to have instrument data here
    instruments: InstrumentData[] = []

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