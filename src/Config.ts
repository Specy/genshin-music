import isMobile from "is-mobile"
import type { Tauri } from "$types/TauriTypes"
import { NoteImage } from "./components/SvgNotes"

const APP_NAME: AppName = import.meta.env.VITE_APP_NAME as AppName || ["Sky", "Genshin"][1]
const APP_VERSION = '3.0' as const
console.log(`${APP_NAME}-V${APP_VERSION}`)
const UPDATE_MESSAGE = APP_NAME === 'Genshin'
    ? `
        Added VSRG mode, zen keyboard, visual sheet in the player and more!
        Check the changelog page for more info
    `.trim() :
    `
        Added VSRG mode, zen keyboard, player calls, visual sheet in the player and more!
        Check the changelog page for more info
    `.trim()
const UPDATE_URL = process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000/updates.json'
    : 'https://raw.githubusercontent.com/Specy/genshin-music/main/public/updates.json'


//@ts-ignore
const TAURI: Tauri = window?.__TAURI__
//@ts-ignore
const IS_TAURI = !!TAURI
const NOTES_CSS_CLASSES = {
    noteComposer: APP_NAME === "Genshin" ? "note-composer" : "note-composer-sky",
    note: APP_NAME === "Genshin" ? "note" : "note-sky",
    noteAnimation: APP_NAME === 'Genshin' ? "note-animation" : "note-animation-sky",
    approachCircle: APP_NAME === "Genshin" ? "approach-circle" : "approach-circle-sky",
    noteName: APP_NAME === "Genshin" ? "note-name" : "note-name-sky"
}
//@ts-ignore
const AUDIO_CONTEXT = new (window.AudioContext || window.webkitAudioContext)()

const BASE_THEME_CONFIG = {
    text: {
        light: '#edeae5',
        dark: '#151414',
        note: APP_NAME === 'Genshin' ? '#aaaa82' : '#212121'
    }
}
const MIDI_STATUS = {
    up: 128,
    down: 144
}
const IS_MIDI_AVAILABLE = !!navigator.requestMIDIAccess
const INSTRUMENTS = APP_NAME === "Genshin"
    ? [
        "Lyre",
        "Vintage-Lyre",
        "Zither",
        "Old-Zither",
        "DunDun"
    ] as const
    : [
        "Piano",
        "Contrabass",
        "Guitar",
        "LightGuitar",
        "Harp",
        "Horn",
        "Trumpet",
        "Pipa",
        "WinterPiano",
        "Xylophone",
        "Flute",
        "Panflute",
        "Ocarina",
        "Kalimba",
        "ToyUkulele",
        "Drum",
        "Bells",
        "DunDun",
        "HandPan",
        "SFX_Dance",
        "SFX_BirdCall",
        "SFX_CrabCall",
        "SFX_FishCall",
        "SFX_SpiritMantaCall",
        "SFX_JellyCall",
        "SFX_MantaCall",
        "SFX_MothCall"
    ] as const
const PLAY_BAR_OFFSET = 200
const NOTES_PER_COLUMN = APP_NAME === "Genshin" ? 21 : 15
const NOTE_SCALE = {
    "Cb": ["Cb", "Dbb", "Db", "Ebb", "Eb", "Fb", "Gbb", "Gb", "Abb", "Ab", "Bbb", "Bb"],
    "C": ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"],
    "C#": ["C#", "D", "D#", "E", "E#", "F#", "G", "G#", "A", "A#", "B", "B#"],
    "Db": ["Db", "Ebb", "Eb", "Fb", "F", "Gb", "Abb", "Ab", "Bbb", "Bb", "Cb", "C"],
    "D": ["D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "C", "C#"],
    "D#": ["D#", "E", "E#", "F#", "F##", "G#", "A", "A#", "B", "B#", "C#", "C##"],
    "Eb": ["Eb", "Fb", "F", "Gb", "G", "Ab", "Bbb", "Bb", "Cb", "C", "Db", "D"],
    "E": ["E", "F", "F#", "G", "G#", "A", "Bb", "B", "C", "C#", "D", "D#"],
    "E#": ["E#", "F#", "F##", "G#", "G##", "A#", "B", "B#", "C#", "C##", "D#", "D##"],
    "Fb": ["Fb", "Gbb", "Gb", "Abb", "Ab", "Bbb", "Cbb", "Cb", "Dbb", "Db", "Ebb", "Eb"],
    "F": ["F", "Gb", "G", "Ab", "A", "Bb", "Cb", "C", "Db", "D", "Eb", "E"],
    "F#": ["F#", "G", "G#", "A", "A#", "B", "C", "C#", "D", "D#", "E", "E#"],
    "Gb": ["Gb", "Abb", "Ab", "Bbb", "Bb", "Cb", "Dbb", "Db", "Ebb", "Eb", "Fb", "F"],
    "G": ["G", "Ab", "A", "Bb", "B", "C", "Db", "D", "Eb", "E", "F", "F#"],
    "G#": ["G#", "A", "A#", "B", "B#", "C#", "D", "D#", "E", "E#", "F#", "F##"],
    "Ab": ["Ab", "Bbb", "Bb", "Cb", "C", "Db", "Ebb", "Eb", "Fb", "F", "Gb", "G"],
    "A": ["A", "Bb", "B", "C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#"],
    "A#": ["A#", "B", "B#", "C#", "C##", "D#", "E", "E#", "F#", "F##", "G#", "G##"],
    "Bb": ["Bb", "Cb", "C", "Db", "D", "Eb", "Fb", "F", "Gb", "G", "Ab", "A"],
    "B": ["B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#"],
    "B#": ["B#", "C#", "C##", "D#", "D##", "E#", "F#", "F##", "G#", "G##", "A#", "A##"],
    "": ["", "", "", "", "", "", "", "", "", "", "", ""]
} as const
type BaseNote = keyof typeof NOTE_SCALE
const INSTRUMENT_NOTE_LAYOUT_KINDS = {
    defaultSky: ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B", "C"],
    defaultGenshin: ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B"],
    skyBell: ["C", "D", "G", "A", "C", "D", "G", "A"],
    skyHandpan: ["D", "A", "C", "D", "F", "G", "A", "C"],
    defaultDrums: ["C", "D", "E", "F", "G", "A", "B", "C"],
    skySFX6: ["", "", "", "", "", ""],
    skySFX14: ["C#", "E", "G", "A#", "C#", "E", "G", "A#", "C#", "E", "G", "A#", "C#", "E"],
    genshinVintageLyre: ["C", "Db", "Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb", "F", "G", "A", "Bb", "C", "D", "Eb", "F", "G", "A", "Bb"],

} as const
Object.freeze(NOTE_SCALE)
Object.freeze(INSTRUMENT_NOTE_LAYOUT_KINDS)
const LAYOUT_KINDS = {
    defaultGenshin: {
        keyboardLayout: (
            "Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M").split(" "),

        mobileLayout: (
            "do re mi fa so la ti " +
            "do re mi fa so la ti " +
            "do re mi fa so la ti").split(" "),

        abcLayout: (
            "A1 A2 A3 A4 A5 A6 A7 " +
            "B1 B2 B3 B4 B5 B6 B7 " +
            "C1 C2 C3 C4 C5 C6 C7").split(" ")
    },
    defaultDrums: {
        keyboardLayout: (
            "Q W E R " +
            "A S D F").split(" "),

        mobileLayout: (
            "do re mi fa " +
            "do re mi fa").split(" "),


        abcLayout: (
            "A1 A2 A3 A4" +
            "B1 B2 B3 B4").split(" ")
    },
    defaultSky: {
        keyboardLayout: (
            "Q W E R T " +
            "A S D F G " +
            "Z X C V B").split(" "),

        mobileLayout: (
            "do re mi fa so " +
            "do re mi fa so " +
            "do re mi fa so").split(" "),

        abcLayout: (
            "A1 A2 A3 A4 A5 " +
            "B1 B2 B3 B4 B5 " +
            "C1 C2 C3 C4 C5").split(" ")
    },
    skySFX6: {
        keyboardLayout: (
            "Q W E " +
            "A S D").split(" "),
        mobileLayout: (
            "do re mi " +
            "do re mi").split(" "),

        abcLayout: (
            "A1 A2 A3 " +
            "B1 B2 B3").split(" ")
    },

}
//TODO add the instrument data like layout kinds here instead of LAYOUT_KINDS
const LAYOUT_ICONS_KINDS = {
    defaultSky: "dmcr dm cr dm cr cr dm dmcr dm cr cr dm cr dm dmcr".split(" ") as NoteImage[],
    defaultSkyDrums: "cr dm cr dm cr dm cr dm".split(" ") as NoteImage[],
    defaultGenshinDrums: "do re mi fa do re mi fa".split(" ") as NoteImage[],
    skySFX6: "cr dm cr cr dm cr".split(" ") as NoteImage[],
    defaultGenshin: "do re mi fa so la ti do re mi fa so la ti do re mi fa so la ti".split(" ") as NoteImage[],
    genshinVintageLyre: "do reb mib fa so lab tib do re mib fa so la tib do re mib fa so la tib".split(" ") as NoteImage[],
}

type InstrumentDataType = {
    notes: number
    family: string
    midiName: string
    baseNotes: readonly BaseNote[]
    layout: typeof LAYOUT_KINDS[keyof typeof LAYOUT_KINDS]
    icons: readonly NoteImage[]
    clickColor?: string
    fill?: string
}


const skySfx14 = {
    notes: 15,
    family: "percussive",
    midiName: "synth drum",
    baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
    layout: LAYOUT_KINDS.defaultSky,
    icons: LAYOUT_ICONS_KINDS.defaultSky
}
const BaseinstrumentsData: {[key in string] : InstrumentDataType} = {
    Lyre: {
        notes: 21,
        family: "strings",
        midiName: "pizzicato strings",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultGenshin,
        layout: LAYOUT_KINDS.defaultGenshin,
        icons: LAYOUT_ICONS_KINDS.defaultGenshin,
    },
    Zither: {
        notes: 21,
        fill: '#cdb68e',
        family: "strings",
        midiName: "pizzicato strings", //maybe koto?
        clickColor: '#ddcba8',
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultGenshin,
        layout: LAYOUT_KINDS.defaultGenshin,
        icons: LAYOUT_ICONS_KINDS.defaultGenshin,

    },
    "Vintage-Lyre": {
        notes: 21,
        family: "strings",
        midiName: "pizzicato strings",
        fill: '#7FB363',
        clickColor: '#7FB363',
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.genshinVintageLyre,
        layout: LAYOUT_KINDS.defaultGenshin,
        icons: LAYOUT_ICONS_KINDS.genshinVintageLyre,
    },
    "Old-Zither": {
        notes: 21,
        fill: '#cdb68e',
        family: "strings",
        midiName: "pizzicato strings",
        clickColor: '#ddcba8',
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultGenshin,
        layout: LAYOUT_KINDS.defaultGenshin,
        icons: LAYOUT_ICONS_KINDS.defaultGenshin,
    },
    DunDun: {
        notes: 8,
        family: "percussive",
        midiName: "synth drum",
        ...(APP_NAME === "Genshin" ? {
            fill: '#F99C55',
            clickColor: '#f5a262'
        } : {}),
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultDrums,
        layout: LAYOUT_KINDS.defaultDrums,
        icons: APP_NAME === 'Genshin' 
            ?  LAYOUT_ICONS_KINDS.defaultGenshinDrums
            : LAYOUT_ICONS_KINDS.defaultSkyDrums
    },
    "SFX_Dance": {
        notes: 6,
        family: "percussive",
        midiName: "synth drum",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.skySFX6,
        layout: LAYOUT_KINDS.skySFX6,
        icons: LAYOUT_ICONS_KINDS.skySFX6
    },
    "SFX_BirdCall": skySfx14,
    "SFX_CrabCall": skySfx14,
    "SFX_FishCall": skySfx14,
    "SFX_SpiritMantaCall": skySfx14,
    "SFX_JellyCall": skySfx14,
    "SFX_MantaCall": skySfx14,
    "SFX_MothCall": skySfx14,
    Panflute: {
        notes: 15,
        family: "pipe",
        midiName: "pan flute",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    LightGuitar: {
        notes: 15,
        family: "guitar",
        midiName: "electric guitar (clean)",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Bells: {
        notes: 8,
        family: "chromatic percussion",
        midiName: "tubular bells",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.skyBell,
        layout: LAYOUT_KINDS.defaultDrums,
        icons: LAYOUT_ICONS_KINDS.defaultSkyDrums,
    },
    Trumpet: {
        notes: 15,
        family: "brass",
        midiName: "trumpet",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,

    },
    Contrabass: {
        notes: 15,
        family: "guitar",
        midiName: "contrabass",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Drum: {
        notes: 8,
        family: "percussive",
        midiName: "synth drum",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultDrums,
        layout: LAYOUT_KINDS.defaultDrums,
        icons: LAYOUT_ICONS_KINDS.defaultSkyDrums,
    },
    Flute: {
        notes: 15,
        family: "pipe",
        midiName: "flute",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,

    },
    Guitar: {
        notes: 15,
        family: "guitar",
        midiName: "acoustic guitar (steel)",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,

    },
    HandPan: {
        notes: 8,
        family: "percussive",
        midiName: "steel drums",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.skyHandpan,
        layout: LAYOUT_KINDS.defaultDrums,
        icons: LAYOUT_ICONS_KINDS.defaultSkyDrums,

    },
    ToyUkulele: {
        notes: 15,
        family: "guitar",
        midiName: "acoustic guitar (nylon)",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Harp: {
        notes: 15,
        family: "strings",
        midiName: "orchestral harp",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Horn: {
        notes: 15,
        family: "brass",
        midiName: "tuba",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Piano: {
        notes: 15,
        family: "piano",
        midiName: "acoustic grand piano",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Pipa: {
        notes: 15,
        family: "reed",
        midiName: "oboe",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Kalimba: {
        notes: 15,
        family: "piano",
        midiName: "bright acoustic piano",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    WinterPiano: {
        notes: 15,
        family: "piano",
        midiName: "bright acoustic piano",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Xylophone: {
        notes: 15,
        family: "chromatic percussion",
        midiName: "xylophone",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    },
    Ocarina: {
        notes: 15,
        family: "pipe",
        midiName: "pan flute",
        baseNotes: INSTRUMENT_NOTE_LAYOUT_KINDS.defaultSky,
        layout: LAYOUT_KINDS.defaultSky,
        icons: LAYOUT_ICONS_KINDS.defaultSky,
    }
}

type InstrumentsDataKeys = keyof typeof BaseinstrumentsData
type InstrumentsDataProps = {
    [key in InstrumentsDataKeys]:  InstrumentDataType
}

const INSTRUMENTS_DATA: InstrumentsDataProps = BaseinstrumentsData

const SPEED_CHANGERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(e => {
    return {
        name: `x${e}`,
        value: e
    }
})

const PITCHES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const
const PITCH_TO_INDEX = new Map<Pitch, number>(PITCHES.map((pitch, index) => [pitch, index]))
type Pitch = typeof PITCHES[number]
const COMPOSER_NOTE_POSITIONS = APP_NAME === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6].reverse() : [15, 16, 17, 18, 19, 20, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].reverse()
const IMPORT_NOTE_POSITIONS = APP_NAME === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

const CACHE_DATA = {
    noteData: {
        background: "#d3bd8e",
        border: "#de6b45",
        center: "#de6b45"
    },
    horizontalLineBreak: NOTES_PER_COLUMN / 3,
    standards: [
        {
            color: 0x515c6f //lighter
        }, {
            color: 0x485363 //darker
        }, {
            color: 0x1a968b //current
        }, {
            color: 0xd6722f //selected
        }
    ],
    layersCombination: new Array(16).fill(0).map((_, index) => index),
    breakpoints: [
        {
            type: "short",
            color: "#282875"
        }, {
            type: "long",
            color: "#282875"
        }
    ]
}
const TEMPO_CHANGERS = [
    {
        id: 0,
        text: "1",
        changer: 1,
        color: 0x515c6f
    }, {
        id: 1,
        text: "1/2",
        changer: 1 / 2,
        color: 0x517553
    }, {
        id: 2,
        text: "1/4",
        changer: 1 / 4,
        color: 0x434c7d
    }, {
        id: 3,
        text: "1/8",
        changer: 1 / 8,
        color: 0x774D6D
    }
] as const
export type TempoChanger = typeof TEMPO_CHANGERS[number]
function isTwa() {
    return JSON.parse(sessionStorage?.getItem('isTwa') || 'null')
}
export type AppName = 'Sky' | 'Genshin'

const EMPTY_LAYER = "0000"
const IS_MOBILE = isMobile()
const VSRG_TEMPO_CHANGER = [2, 1.75, 1.5, 1.25, 1, 0.75, 0.50, 0.25]
const MIDI_MAP_TO_NOTE = new Map(Object.entries((APP_NAME === 'Sky'
    ? {
        60: [0, false],
        61: [0, true],
        62: [1, false],
        63: [1, true],
        64: [2, false],
        65: [3, false],
        66: [3, true],
        67: [4, false],
        68: [4, true],
        69: [5, false],
        70: [5, true],
        71: [6, false],
        72: [7, false],
        73: [7, true],
        74: [8, false],
        75: [8, true],
        76: [9, false],
        77: [10, false],
        78: [10, true],
        79: [11, false],
        80: [11, true],
        81: [12, false],
        82: [12, true],
        83: [13, false],
        84: [14, false],
    }
    : {
        48: [14, false],
        49: [14, true],
        50: [15, false],
        51: [15, true],
        52: [16, false],
        53: [17, false],
        54: [17, true],
        55: [18, false],
        56: [18, true],
        57: [19, false],
        58: [19, true],
        59: [20, false],
        60: [7, false],
        61: [7, true],
        62: [8, false],
        63: [8, true],
        64: [9, false],
        65: [10, false],
        66: [10, true],
        67: [11, false],
        68: [11, true],
        69: [12, false],
        70: [12, true],
        71: [13, false],
        72: [0, false],
        73: [0, true],
        74: [1, false],
        75: [1, true],
        76: [2, false],
        77: [3, false],
        78: [3, true],
        79: [4, false],
        80: [4, true],
        81: [5, false],
        82: [5, true],
        83: [6, false],
        84: [6, false],
    })))
const DEFAULT_VSRG_KEYS_MAP = {
    4: ["A", "S", "G", "H"],
    6: ["A", "S", "D", "G", "H", "J"],
}
const VSRG_SCORE_COLOR_MAP = {
    amazing: '#cff3e3',
    perfect: '#d9af0a',
    great: '#358a55 ',
    good: '#380cc4',
    bad: '#dd8d46',
    miss: '#f24b5b',
    '': '#ffffff',
}
const FOLDER_FILTER_TYPES = ["alphabetical", "date-created"] as const

const MIDI_BOUNDS = APP_NAME === "Genshin"
    ? {
        upper: 84,
        lower: 48
    }
    : {
        upper: 84,
        lower: 60
    }
const PIXI_VERTICAL_ALIGN = [0.5, 0] as [number, number]
const PIXI_HORIZONTAL_ALIGN = [0, 0.5] as [number, number]
const PIXI_CENTER_X_END_Y = [0.5, 1] as [number, number]
const PIXI_CENTER_ALIGN = 0.5
//get only non accidentals
const entries = Object.entries(Object.fromEntries(MIDI_MAP_TO_NOTE)).filter(([k, v]) => v[1] === false)
const NOTE_MAP_TO_MIDI = new Map(entries.map(([k, v]) => [v[0], Number(k)]))
const DEFAULT_DOM_RECT = new DOMRect()
export {
    INSTRUMENTS,
    INSTRUMENTS_DATA,
    COMPOSER_NOTE_POSITIONS,
    IMPORT_NOTE_POSITIONS,
    APP_NAME,
    LAYOUT_KINDS,
    NOTES_CSS_CLASSES,
    NOTES_PER_COLUMN,
    NOTE_SCALE,
    PITCHES,
    APP_VERSION,
    SPEED_CHANGERS,
    AUDIO_CONTEXT,
    isTwa,
    CACHE_DATA,
    UPDATE_MESSAGE,
    MIDI_STATUS,
    IS_MIDI_AVAILABLE,
    BASE_THEME_CONFIG,
    TEMPO_CHANGERS,
    EMPTY_LAYER,
    MIDI_MAP_TO_NOTE,
    NOTE_MAP_TO_MIDI,
    MIDI_BOUNDS,
    IS_TAURI,
    TAURI,
    PLAY_BAR_OFFSET,
    DEFAULT_VSRG_KEYS_MAP,
    PIXI_VERTICAL_ALIGN,
    PIXI_HORIZONTAL_ALIGN,
    PIXI_CENTER_ALIGN,
    VSRG_TEMPO_CHANGER,
    DEFAULT_DOM_RECT,
    PIXI_CENTER_X_END_Y,
    IS_MOBILE,
    VSRG_SCORE_COLOR_MAP,
    UPDATE_URL,
    PITCH_TO_INDEX,
    INSTRUMENT_NOTE_LAYOUT_KINDS,
    FOLDER_FILTER_TYPES
}
export type {
    Pitch,
    BaseNote
}