const appName = process.env.REACT_APP_NAME || ["Sky","Genshin"][1]
console.log("App name:",appName)
const cssClasses = {
    noteComposer: appName === "Genshin" ? "note-composer" : "note-composer-sky",
    note: appName === "Genshin" ? "note" : "note-sky"
}
const instruments = appName === "Genshin" ? [
    "Lyre",
    "DunDun",
    "Zither"
    ]:[
        "Piano",
        "Contrabass",
        "Guitar",
        "Harp",
        "Horn",
        "Trumpet",
        "Pipa",
        "WinterPiano",
        "Xylophone",
        "Flute",
        "Ocarina",
        "Kalimba",
        "ToyUkulele",
        "Drum",
        "Bells",
        "DunDun",
        "HandPan"
    ]
const notesPerColumn = appName === "Genshin" ? 21 : 15
const instrumentsData = {
    Lyre: {
        notes: 21
    },
    Zither:{
        notes: 21,
        effects: {
            filter: 'sepia(100%)'
        }
    },
    DunDun: {
        notes: 8
    },
    Bells: {
        notes: 8
    },
    Trumpet:{
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
    ToyUkulele:{
        notes:15
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
    Ocarina:{
        notes:15
    }
}


const layoutData = {
    21: {
        keyboardLayout: ("Q W E R T Y U " +
            "A S D F G H J " +
            "Z X C V B N M").split(" "),

        mobileLayout: ("do re mi fa so la ti " +
            "do re mi fa so la ti " +
            "do re mi fa so la ti").split(" "),

        keyboardCodes: ("81 87 69 82 84 89 85 " +
            "65 83 68 70 71 72 74 " +
            "90 88 67 86 66 78 77").split(" ")
    },
    8: {
        keyboardLayout: ("Q W E R " +
            "A S D F").split(" "),

        mobileLayout: ("do re mi fa " +
            "do re mi fa").split(" "),

        keyboardCodes: ("81 87 69 82 " +
        "65 83 68 70").split(" ")
    },
    15: {
        keyboardLayout: ("Q W E R T " +
            "A S D F G " +
            "Z X C V B").split(" "),

        mobileLayout: ("do re mi fa so " +
            "do re mi fa so " +
            "do re mi fa so").split(" "),

        keyboardCodes: ("81 87 69 82 84 " +
            "65 83 68 70 71 " +
            "90 88 67 86 66").split(" ")
    }
}

const keyNames = {
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
    Genshin:{
        0: ["C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B", "C", "D", "E", "F", "G", "A", "B"],
        1: ["Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db", "Eb", "F", "Gb", "Ab", "Bb", "C", "Db" , "Eb", "F", "Gb", "Ab", "Bb", "C", "Db"],
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


const pitchArr = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] 

const composerNotePositions =  appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6].reverse() : [15,16,17,18,19,20,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].reverse()

const importNotePositions = appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0] :  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]

const layoutImages = {
    15: "dmcr dm cr dm cr cr dm dmcr dm cr cr dm cr dm dmcr".split(" "),
    8: appName === "Sky"? "cr dm cr dm cr dm cr dm".split(" ") : "do re mi fa do re mi fa".split(" "),
    21: "do re mi fa so la ti do re mi fa so la ti do re mi fa so la ti".split(" ")
}
export {
    instruments,
    instrumentsData,
    composerNotePositions,
    importNotePositions,
    appName,
    layoutData,
    cssClasses,
    notesPerColumn,
    keyNames,
    pitchArr,
    layoutImages
}