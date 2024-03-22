import {ComposedSong, UnknownSerializedComposedSong} from "$lib/Songs/ComposedSong";
import {RecordedSong, SerializedRecordedSong} from "$lib/Songs/RecordedSong";
import {SerializedVsrgSong} from "$lib/Songs/VsrgSong";
import {InstrumentName} from "./GeneralTypes";

export type _LegacySongInstruments = [InstrumentName,InstrumentName,InstrumentName,InstrumentName]
export type RecordedOrComposed = ComposedSong | RecordedSong
export type SerializedSongKind = UnknownSerializedComposedSong | SerializedRecordedSong | SerializedVsrgSong
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