import { Midi } from "@tonejs/midi"
import { APP_NAME, Pitch } from "appConfig"
import { ComposedSong } from "./ComposedSong"
import { RecordedSong } from "./RecordedSong"
import { SongData } from "./SongClasses"

export type SongType = 'recorded' | 'composed'

export interface SerializedSong {
    id: string | null,
    type: SongType
    folderId: string | null,
    name: string,
    data: SongData,
    bpm: number,
    pitch: Pitch,
    version: number
}

export abstract class Song<T = any, T2 extends SerializedSong = any, T3 = number>{
    id: string | null
    type: SongType
    folderId: string | null
    name: string
    data: SongData
    bpm: number
    pitch: Pitch
    version: T3
    constructor(name: string, version: T3, type: SongType,  data?: SongData){
        this.name = name
        this.version = version
        this.bpm = 220
        this.type = type
        this.id = null
        this.folderId = null
        this.pitch = "C"
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
    abstract toMidi(): Midi
    abstract serialize(): T2
    abstract toRecordedSong(): RecordedSong
    abstract toComposedSong(): ComposedSong
    abstract toGenshin(): T
    abstract clone(): T
}

