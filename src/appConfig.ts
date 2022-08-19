import isMobile from "is-mobile"
import { Tauri } from "types/TauriTypes"

const APP_NAME: AppName = process.env.REACT_APP_NAME as AppName || ["Sky", "Genshin"][1]
const APP_VERSION = '3.0' as const
console.log(`${APP_NAME}-V${APP_VERSION}`)
const UPDATE_MESSAGE = APP_NAME === 'Genshin'
    ? `
        Check the updates page for more info
    `.trim() :
    `
        Check the updates page for more info

    `.trim()

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
    ] as const
const PLAY_BAR_OFFSET = 200
const NOTES_PER_COLUMN = APP_NAME === "Genshin" ? 21 : 15
const BaseinstrumentsData = {
    Lyre: {
        notes: 21,
        family: "strings",
        midiName: "pizzicato strings",
    },
    Zither: {
        notes: 21,
        fill: '#cdb68e',
        family: "strings",
        midiName: "pizzicato strings", //maybe koto?
        clickColor: '#ddcba8',
    },
    "Old-Zither": {
        notes: 21,
        fill: '#cdb68e',
        family: "strings",
        midiName: "pizzicato strings",
        clickColor: '#ddcba8',
    },
    DunDun: {
        notes: 8,
        family: "percussive",
        midiName: "synth drum",
        ...(APP_NAME === "Genshin" ? {
            fill: '#F99C55',
            clickColor: '#f5a262'
        } : {})
    },
    Panflute: {
        notes: 15,
        family: "pipe",
        midiName: "pan flute"
    },
    LightGuitar: {
        notes: 15,
        family: "guitar",
        midiName: "electric guitar (clean)"
    },
    Bells: {
        notes: 8,
        family: "chromatic percussion",
        midiName: "tubular bells"
    },
    Trumpet: {
        notes: 15,
        family: "brass",
        midiName: "trumpet"
    },
    Contrabass: {
        notes: 15,
        family: "guitar",
        midiName: "contrabass"
    },
    Drum: {
        notes: 8,
        family: "percussive",
        midiName: "synth drum"
    },
    Flute: {
        notes: 15,
        family: "pipe",
        midiName: "flute"
    },
    Guitar: {
        notes: 15,
        family: "guitar",
        midiName: "acoustic guitar (steel)"
    },
    HandPan: {
        notes: 8,
        family: "percussive",
        midiName: "steel drums"
    },
    ToyUkulele: {
        notes: 15,
        family: "guitar",
        midiName: "acoustic guitar (nylon)"
    },
    Harp: {
        notes: 15,
        family: "strings",
        midiName: "orchestral harp"
    },
    Horn: {
        notes: 15,
        family: "brass",
        midiName: "tuba"
    },
    Piano: {
        notes: 15,
        family: "piano",
        midiName: "acoustic grand piano"
    },
    Pipa: {
        notes: 15,
        family: "reed",
        midiName: "oboe"
    },
    Kalimba: {
        notes: 15,
        family: "piano",
        midiName: "bright acoustic piano"
    },
    WinterPiano: {
        notes: 15,
        family: "piano",
        midiName: "bright acoustic piano"
    },
    Xylophone: {
        notes: 15,
        family: "chromatic percussion",
        midiName: "xylophone"
    },
    Ocarina: {
        notes: 15,
        family: "pipe",
        midiName: "pan flute"
    }
}
type InstrumentsDataKeys = keyof typeof BaseinstrumentsData
type InstrumentsDataProps = {
    [key in InstrumentsDataKeys]: {
        notes: 8 | 15 | 21
        fill?: string
        clickColor?: string
        family: string,
        midiName: string
    }
}
//@ts-ignore
const INSTRUMENTS_DATA: InstrumentsDataProps = BaseinstrumentsData
interface LayoutDataType {
    keyboardLayout: string[],
    mobileLayout: string[],
    keyboardCodes: string[],
    abcLayout: string[]
}

const LAYOUT_DATA = {
    21: {
        keyboardLayout: (
            "Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M").split(" "),

        mobileLayout: (
            "do re mi fa so la ti " +
            "do re mi fa so la ti " +
            "do re mi fa so la ti").split(" "),

        keyboardCodes: (
            "81 87 69 82 84 89 85 " +
            "65 83 68 70 71 72 74 " +
            "90 88 67 86 66 78 77").split(" "),
        abcLayout: (
            "A1 A2 A3 A4 A5 A6 A7 " +
            "B1 B2 B3 B4 B5 B6 B7 " +
            "C1 C2 C3 C4 C5 C6 C7").split(" ")
    },
    8: {
        keyboardLayout: (
            "Q W E R " +
            "A S D F").split(" "),

        mobileLayout: (
            "do re mi fa " +
            "do re mi fa").split(" "),

        keyboardCodes: (
            "81 87 69 82 " +
            "65 83 68 70").split(" "),
        abcLayout: (
            "A1 A2 A3 A4" +
            "B1 B2 B3 B4").split(" ")
    },
    15: {
        keyboardLayout: (
            "Q W E R T " +
            "A S D F G " +
            "Z X C V B").split(" "),

        mobileLayout: (
            "do re mi fa so " +
            "do re mi fa so " +
            "do re mi fa so").split(" "),

        keyboardCodes: (
            "81 87 69 82 84 " +
            "65 83 68 70 71 " +
            "90 88 67 86 66").split(" "),
        abcLayout: (
            "A1 A2 A3 A4 A5 " +
            "B1 B2 B3 B4 B5 " +
            "C1 C2 C3 C4 C5").split(" ")
    }
} as {
    8: LayoutDataType,
    15: LayoutDataType
    21: LayoutDataType,
}

const NOTE_NAMES = {
    Sky: {
        0: ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B", "C"],
        1: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db"],
        2: ["D", "E", "F#", "G", "A", "B", "C#", "D", "E", "F#", "G", "A", "B", "C#", "D"],
        3: ["Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb"],
        4: ["E", "F#", "G#", "A", "B", "C#", "D#", "E", "F#", "G#", "A", "B", "C#", "D#", "E"],
        5: ["F", "G", "A", "Bb", "C", "D", "E", "F", "G", "A", "Bb", "C", "D", "E", "F"],
        6: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb"],
        7: ["G", "A", "B", "C", "D", "E", "F#", "G", "A", "B", "C", "D", "E", "F#", "G"],
        8: ["Ab", "Bb", "C", "Db", "Eb", "F", "G", "Ab", "Bb", "C", "Db", "Eb", "F", "G", "Ab"],
        9: ["A", "B", "C#", "D", "E", "F#", "G#", "A", "B", "C#", "D", "E", "F#", "G#", "A"],
        10: ["Bb", "C", "D", "Eb", "F", "G", "A", "Bb", "C", "D", "Eb", "F", "G", "A", "Bb"],
        11: ["B", "C#", "D#", "E", "F#", "G#", "A#", "B", "C#", "D#", "E", "F#", "G#", "A#", "B"]
    },
    Genshin: {
        0: ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B"],
        1: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db"],
        2: ["D", "E", "F#", "G", "A", "B", "C#", "D", "E", "F#", "G", "A", "B", "C#", "D", "E", "F#", "G", "A", "B", "C#", "D"],
        3: ["Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb", "F", "G", "Ab", "Bb", "C", "D", "Eb"],
        4: ["E", "F#", "G#", "A", "B", "C#", "D#", "E", "F#", "G#", "A", "B", "C#", "D#", "E", "F#", "G#", "A", "B", "C#", "D#", "E"],
        5: ["F", "G", "A", "Bb", "C", "D", "E", "F", "G", "A", "Bb", "C", "D", "E", "F", "G", "A", "Bb", "C", "D", "E", "F"],
        6: ["Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb", "Ab", "Bb", "Cb", "Db", "Eb", "F", "Gb"],
        7: ["G", "A", "B", "C", "D", "E", "F#", "G", "A", "B", "C", "D", "E", "F#", "G", "A", "B", "C", "D", "E", "F#", "G"],
        8: ["Ab", "Bb", "C", "Db", "Eb", "F", "G", "Ab", "Bb", "C", "Db", "Eb", "F", "G", "Ab", "Bb", "C", "Db", "Eb", "F", "G", "Ab"],
        9: ["A", "B", "C#", "D", "E", "F#", "G#", "A", "B", "C#", "D", "E", "F#", "G#", "A", "B", "C#", "D", "E", "F#", "G#", "A"],
        10: ["Bb", "C", "D", "Eb", "F", "G", "A", "Bb", "C", "D", "Eb", "F", "G", "A", "Bb", "C", "D", "Eb", "F", "G", "A", "Bb"],
        11: ["B", "C#", "D#", "E", "F#", "G#", "A#", "B", "C#", "D#", "E", "F#", "G#", "A#", "B", "C#", "D#", "E", "F#", "G#", "A#", "B"]
    }
}
const SPEED_CHANGERS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(e => {
    return {
        name: `x${e}`,
        value: e
    }
})

const PITCHES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const
type Pitch = typeof PITCHES[number]
const COMPOSER_NOTE_POSITIONS = APP_NAME === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6].reverse() : [15, 16, 17, 18, 19, 20, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].reverse()

const IMPORT_NOTE_POSITIONS = APP_NAME === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0] : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]

const LAYOUT_IMAGES = {
    15: "dmcr dm cr dm cr cr dm dmcr dm cr cr dm cr dm dmcr".split(" "),
    8: APP_NAME === "Sky" ? "cr dm cr dm cr dm cr dm".split(" ") : "do re mi fa do re mi fa".split(" "),
    21: "do re mi fa so la ti do re mi fa so la ti do re mi fa so la ti".split(" ")
}

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
    layersCombination: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
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
    4: ["A", "S", "G", "H"] ,
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
    LAYOUT_DATA,
    NOTES_CSS_CLASSES,
    NOTES_PER_COLUMN,
    NOTE_NAMES,
    PITCHES,
    LAYOUT_IMAGES,
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
    VSRG_SCORE_COLOR_MAP
}
export type {
    Pitch
}