import { Midi } from "@tonejs/midi"
import { APP_NAME, Pitch } from "appConfig"
import { ComposedSong } from "./ComposedSong"
import { RecordedSong } from "./RecordedSong"
import { SongData } from "./SongClasses"


export interface SerializedSong {
    id: string | null,
    folderId: string | null,
    name: string,
    data: SongData,
    bpm: number,
    pitch: Pitch,
    version: number
}
export abstract class Song<T = any, T2 extends SerializedSong = any>{
    id: string | null
    folderId: string | null
    name: string
    data: SongData
    bpm: number
    pitch: Pitch
    version: number
    constructor(name: string, version: number, data?: SongData){
        this.name = name
        this.version = version
        this.bpm = 220
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

    static stripMetadata(song: SerializedSong){
        const obj = {...song}
        obj.id = null
        obj.folderId = null
    }
    abstract toMidi(): Midi
    abstract serialize(): T2
    abstract toRecordedSong(): RecordedSong
    abstract toComposedSong(): ComposedSong
    abstract toGenshin(): T
    abstract clone(): T
}

