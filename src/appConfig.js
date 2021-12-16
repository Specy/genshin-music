const appName = process.env.REACT_APP_NAME || ["Sky","Genshin"][0]
const appVersion = '2.1'
console.log(`${appName}-V${appVersion}`)
const pages = ["", "Composer", "ErrorPage", "Changelog","Donate", "Partners","Home","Help"]

const cssClasses = {
    noteComposer: appName === "Genshin" ? "note-composer" : "note-composer-sky",
    note: appName === "Genshin" ? "note" : "note-sky",
    noteAnimation: appName === 'Genshin' ? "note-animation" : "note-animation-sky",
    approachCircle: appName === "Genshin" ? "approach-circle" : "approach-circle-sky",
    noteName: appName === "Genshin" ? "note-name" : "note-name-sky"
}
const audioContext = new (window.AudioContext || window.webkitAudioContext)()

const instruments = appName === "Genshin" 
    ? [
        "Lyre",
        "Zither",
        "Old-Zither",
        "DunDun"
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
            filter: 'sepia(100%)',
        },
        clickColor: '#ddcba8'
    },
    "Old-Zither":{
        notes: 21,
        effects: {
            filter: 'sepia(100%)',
        },
        clickColor: '#ddcba8'
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
const speedChangers = [0.25,0.5,0.75,1,1.25,1.5,2].map(e => {
    return {
        name: `x${e}`,
        value: e
    }
})

const pitchArr = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] 

const composerNotePositions =  appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0, 1, 2, 3, 4, 5, 6].reverse() : [15,16,17,18,19,20,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14].reverse()

const importNotePositions = appName === "Genshin" ? [14, 15, 16, 17, 18, 19, 20, 7, 8, 9, 10, 11, 12, 13, 0] :  [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14]

const layoutImages = {
    15: "dmcr dm cr dm cr cr dm dmcr dm cr cr dm cr dm dmcr".split(" "),
    8: appName === "Sky"? "cr dm cr dm cr dm cr dm".split(" ") : "do re mi fa do re mi fa".split(" "),
    21: "do re mi fa so la ti do re mi fa so la ti do re mi fa so la ti".split(" ")
}

const cacheData = {
    noteData: {
        background: "#d3bd8e",
        border: "#de4545",
        center: "#de4545"
    },
    horizontalLineBreak: notesPerColumn / 3,
    standards: [
        {
            color: 0x515c6f //lighter
        },
        {
            color: 0x485363 //darker
        },
        {
            color: 0x1a968b //selected
        },
        {
            color: 0xd6722f
        }
    ],
    layersCombination: ["000", "001", "010", "011", "100", "101", "110", "111"],
    breakpoints: [
        {
            type: "short",
            color: "#282875"
        },
        {
            type: "long",
            color: "#282875"
        }
    ]
}


function isTwa() {
    let isTwa = JSON.parse(sessionStorage.getItem('isTwa'))
    return isTwa
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
    layoutImages,
    appVersion,
    speedChangers,
    audioContext,
    pages,
    isTwa,
    cacheData
}