import { APP_NAME, Pitch, PITCHES } from "@/appConfig"
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

    //TODO Might not be ideal to have instrument data here
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
        //@ts-ignore
        delete obj._id
        obj.folderId = null
        return obj
    }
    static getSongType(song: SerializedSong): SongType | null{
        if(song.type) return song.type
        if(song.data.isComposedVersion === true) return "composed"
        if(song.data.isComposedVersion === false) return 'recorded'
        return null
    }
    static deserializeTo<T extends Song>(to: T, fromSong: Partial<SerializedSong>): T{
        const sanitizedBpm = Number(fromSong.bpm)
        const instruments = Array.isArray(fromSong.instruments) ? fromSong.instruments.map(InstrumentData.deserialize) : []
        to.id = fromSong.id ?? null
        to.folderId = fromSong.folderId ?? null
        to.name = fromSong.name ?? "Untitled"
        to.data = { ...to.data, ...fromSong.data }
        to.bpm = Number.isFinite(sanitizedBpm) ? sanitizedBpm : 220
        to.pitch = PITCHES.includes(fromSong.pitch!) ? fromSong.pitch! : "C"
        to.instruments = instruments
        return to
    }
    abstract serialize(): T2
    abstract clone(): T
}

