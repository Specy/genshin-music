import type { SerializedSong } from "lib/Utils/Song";
import type { SerializedComposedSong } from "lib/Utils/ComposedSong";
import { InstrumentName } from "./GeneralTypes";

export type SerializedSongType = SerializedSong | SerializedComposedSong

export type SongInstruments = [InstrumentName,InstrumentName,InstrumentName,InstrumentName]