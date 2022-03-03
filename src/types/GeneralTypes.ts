import { INSTRUMENTS } from "appConfig";

export type InstrumentKeys = typeof INSTRUMENTS[number]


export type LayerType = 1 | 2 | 3
export type LayerIndexes = 0 | 1 | 2
export type Pages = 'Composer' | 'Player' | 'Donate' | 'ErrorPage' | 'Help' | 'Main' | 'MidiSetup' | 'SheetVisualizer'
    | 'Theme' | '404' | 'Changelog'