import { APP_NAME, Pitch, PITCHES } from "appConfig"
import { InstrumentData, SerializedInstrumentData, SongData } from "./SongClasses"

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

export abstract class Song<T = any, T2 extends SerializedSong = any, T3 = number>{
    id: string | null = null
    type: SongType
    folderId: string | null = null
    name: string
    data: SongData
    bpm: number = 220
    pitch: Pitch = "C"
    version: T3
    instruments: InstrumentData[] = []
    constructor(name: string, version: T3, type: SongType,  data?: SongData){
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

    static stripMetadata(song: SerializedSong): SerializedSong{
        const obj = {...song}
        obj.id = null
        obj.folderId = null
        return obj
    }
    static getSongType(song: SerializedSong): SongType | null{
        if(song.type) return song.type
        if(song.data.isComposedVersion === true) return "composed"
        if(song.data.isComposedVersion === false) return 'recorded'
        return null
    }
    static deserializeTo<T extends Song>(to: T, song: Partial<SerializedSong>): T{
        const sanitizedBpm = Number(song.bpm)
        const instruments = Array.isArray(song.instruments) ? song.instruments.map(InstrumentData.deserialize) : []
        to.id = song.id ?? null
        to.folderId = song.folderId ?? null
        to.name = song.name ?? "Untitled"
        to.data = { ...to.data, ...song.data }
        to.bpm = Number.isFinite(sanitizedBpm) ? sanitizedBpm : 220
        to.pitch = PITCHES.includes(song.pitch!) ? song.pitch! : "C"
        to.version = song.version ?? -1
        to.instruments = instruments
        return to
    }
    abstract serialize(): T2
    abstract clone(): T
}

