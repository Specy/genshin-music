import type { SerializedRecordedSong } from "lib/RecordedSong";
import type { SerializedComposedSong } from "lib/ComposedSong";
import { InstrumentName } from "./GeneralTypes";

export type SerializedSongType = SerializedRecordedSong | SerializedComposedSong

export type SongInstruments = [InstrumentName,InstrumentName,InstrumentName,InstrumentName]

export type OldFormat = {
    isComposed: boolean,
    pitchLevel: number,
    songNotes: {
        key: string
        time: number
        l?: number
    }[],
    bitsPerPage: number,
    isEncrypted: boolean
}
export type OldNote = {
    key: string
    time: number
    l?: number
}