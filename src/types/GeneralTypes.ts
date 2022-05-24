import type { INSTRUMENTS } from "appConfig";
import type Instrument from "lib/Instrument";

export type InstrumentName = typeof INSTRUMENTS[number]
export type ApproachingScore = {
    correct: number
    wrong: number
    score: number
    combo: number
}
export type LayerType = 1 | 2 | 3 | 4
export type LayerIndex = 0 | 1 | 2 | 3
export type InstrumentNotesLayout = 8 | 15 | 21
export type Pages = 'Composer' | 'Player' | 'Donate' | 'ErrorPage' | 'Help' | 'Main' | 'MidiSetup' | 'SheetVisualizer'
    | 'Theme' | '404' | 'Changelog'
export type NoteNameType = 'Note name' | 'Keyboard layout' | 'Do Re Mi' | 'ABC' | 'No Text'

export type NoteStatus = 'clicked' | 'toClick' | 'toClickNext' | 'toClickAndNext' | 'approach-wrong' | 'approach-correct' | ''

export type CombinedLayer = "0000" | "0001" | "0010" | "0011" | "0100" | "0101" | "0110" | "0111" |
                            "1000" | "1001" | "1010" | "1011" | "1100" | "1101" | "1110" | "1111"

export type ComposerInstruments = [Instrument, Instrument, Instrument, Instrument]
export type SearchedSongType = {
    name: string
    file: string
    error: string
}
export type Timer = ReturnType<typeof setTimeout> | 0