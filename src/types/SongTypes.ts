import { UnknownSerializedComposedSong } from "lib/Songs/ComposedSong";
import { SerializedRecordedSong } from "lib/Songs/RecordedSong";
import { InstrumentName } from "./GeneralTypes";

export type _LegacySongInstruments = [InstrumentName,InstrumentName,InstrumentName,InstrumentName]

export type SerializedSongKind = UnknownSerializedComposedSong | SerializedRecordedSong
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