import type { INSTRUMENTS } from "appConfig";

export type InstrumentKeys = typeof INSTRUMENTS[number]


export type ApproachingScore = {
    correct: number
    wrong: number
    score: number
    combo: number
}
export type LayerType = 1 | 2 | 3
export type LayerIndexes = 0 | 1 | 2
export type Pages = 'Composer' | 'Player' | 'Donate' | 'ErrorPage' | 'Help' | 'Main' | 'MidiSetup' | 'SheetVisualizer'
    | 'Theme' | '404' | 'Changelog'
export type NoteNameType = 'Note name' | 'Keyboard layout' | 'Do Re Mi' | 'ABC' | 'No Text'

export type NoteStatus = 'clicked' | 'toClick' | 'toClickNext' | 'toClickAndNext' | 'approach-wrong' | 'approach-correct' | ''



export type SearchedSongType = {
    name: string
    file: string
    error: string
}