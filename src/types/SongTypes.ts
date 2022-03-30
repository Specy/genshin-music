import type { SerializedSong } from "lib/Song";
import type { SerializedComposedSong } from "lib/ComposedSong";
import { InstrumentName } from "./GeneralTypes";

export type SerializedSongType = SerializedSong | SerializedComposedSong

export type SongInstruments = [InstrumentName,InstrumentName,InstrumentName,InstrumentName]