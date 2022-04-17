const APP_NAME: 'Sky'| 'Genshin' = process.env.REACT_APP_NAME as 'Sky'| 'Genshin' || ["Sky", "Genshin"][1]
const APP_VERSION = '2.6' as const

console.log(`${APP_NAME}-V${APP_VERSION}`)
const UPDATE_MESSAGE = APP_NAME === 'Genshin'
    ? ` - Improved the rendering of the composer to be sharper and easier to see on mobile
        - Added 4th layer in the composer
        - Improved performance in the composer
        - Added more theming in the composer
    `.trim()
    : ` - Improved the rendering of the composer to be sharper and easier to see on mobile
        - Added 4th layer in the composer
        - Improved performance in the composer
        - Added more theming in the composer
    `.trim()
const LAYERS_INDEXES = [1,2,3,4] as const
const EMPTY_LAYER = '0000'
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
    ] as const: [
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
const NOTES_PER_COLUMN = APP_NAME === "Genshin" ? 21 : 15
const BaseinstrumentsData = {
    Lyre: {
        notes: 21
    },
    Zither: {
        notes: 21,
        fill: '#cdb68e',
        clickColor: '#ddcba8'
    },
    "Old-Zither": {
        notes: 21,
        fill: '#cdb68e',
        clickColor: '#ddcba8'
    },
    DunDun: {
        notes: 8
    },
    Panflute: {
        notes: 15
    },
    LightGuitar: {
        notes: 15
    },  
    Bells: {
        notes: 8
    },
    Trumpet: {
        notes: 15
    },
    Contrabass: {
        notes: 15
    },
    Drum: {
        notes: 8
    },
    Flute: {
        notes: 15
    },
    Guitar: {
        notes: 15
    },
    HandPan: {
        notes: 8
    },
    ToyUkulele: {
        notes: 15
    },
    Harp: {
        notes: 15
    },
    Horn: {
        notes: 15
    },
    Piano: {
        notes: 15
    },
    Pipa: {
        notes: 15
    },
    Kalimba: {
        notes: 15
    },
    WinterPiano: {
        notes: 15
    },
    Xylophone: {
        notes: 15
    },
    Ocarina: {
        notes: 15
    }
}
type InstrumentsDataKeys = keyof typeof BaseinstrumentsData
type InstrumentsDataProps = {
    [key in InstrumentsDataKeys]: {
        notes: 8 | 15 | 21
        fill?: string
        clickColor?: string
    }
}
//@ts-ignore
const INSTRUMENTS_DATA: InstrumentsDataProps = BaseinstrumentsData
interface LayoutDataType{
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
type PitchesType = typeof PITCHES[number]
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
        border: "#de4545",
        center: "#de4545"
    },
    horizontalLineBreak: NOTES_PER_COLUMN / 3,
    standards: [
        {
            color: 0x515c6f //lighter
        },{
            color: 0x485363 //darker
        },{
            color: 0x1a968b //current
        },{
            color: 0xd6722f //selected
        }
    ],
    layersCombination: ["0000" , "0001" , "0010" , "0011" , "0100" , "0101" , "0110" , "0111" ,"1000" , "1001" , "1010" , "1011" , "1100" , "1101" , "1110" , "1111"],
    breakpoints: [
        {
            type: "short",
            color: "#282875"
        },{
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
    return JSON.parse(sessionStorage.getItem('isTwa') || 'null')
}

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
    LAYERS_INDEXES,
    BASE_THEME_CONFIG,
    TEMPO_CHANGERS,
    EMPTY_LAYER
}
export type {
    PitchesType
}