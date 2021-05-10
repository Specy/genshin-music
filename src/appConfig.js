const appName = "Genshin"
const cssClasses = {
    noteComposer: appName === "Genshin" ? "note-composer" : "note-composer-sky",
    note: appName === "Genshin" ? "note" : "note-sky"
}
const instruments = appName === "Genshin" ? [
    "Lyre",
    "DunDun"
    ]:[
        "Bells",
        "Contrabass",
        "Drum",
        "DunDun",
        "Flute",
        "Guitar",
        "HandPan",
        "Harp",
        "Horn",
        "Piano",
        "Pipa",
        "WinterPiano",
        "Xylophone"
    ]
const notesPerColumn = appName === "Genshin" ? 21 : 15
const instrumentsData = {
    Lyre: {
        notes: 21
    },
    Dundun: {
        notes: 8
    },
    Bells: {
        notes: 8
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
    WinterPiano: {
        notes: 15
    },
    Xylophone: {
        notes: 15
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

        keyboardCodes: ("81 87 69 82" +
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

const composerNotePositions =  appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6].reverse() : [15,16,17,18,19,20,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].reverse()

const importNotePositions = appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0] :  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]

export {
    instruments,
    instrumentsData,
    composerNotePositions,
    importNotePositions,
    appName,
    layoutData,
    cssClasses,
    notesPerColumn
}