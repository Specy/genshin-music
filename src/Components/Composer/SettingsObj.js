let instruments = [
    "lyre"
]
let ComposerSettings = {
    settingVesion: 2,

    instrument: {
        name: "Instrument (Layer 1)",
        type: "select",
        songSetting: false,
        value: 0,
        options: instruments
    },
    layer2: {
        name: "Instrument (Layer 2)",
        type: "select",
        songSetting: false,
        value: 0,
        options: instruments
    },
    layer3: {
        name: "Instrument (Layer 3)",
        type: "select",
        songSetting: false,
        value: 0,
        options: instruments
    },
    bpm: {
        name: "Bpm",
        type: "number",
        songSetting: true,
        threshold: [0, 1000],
        value: 220
    },
    beatMarks: {
        name: "Beat marks",
        type: "select",
        songSetting: false,
        value: 0,
        options: [
            0,
            3,
            4
        ]
    },
    pitch: {
        name: "Pitch",
        type: "select",
        songSetting: true,
        value: "C",
        options: [
            "C",
            "Db",
            "D",
            "Eb",
            "E",
            "F",
            "Gb",
            "G",
            "Ab",
            "A",
            "Bb",
            "B",
        ]
    },
    columnsPerCanvas: {
        name: "Number of visible columns",
        type: "select",
        songSetting: false,
        value: 35,
        options: [
            20,
            25,
            30,
            35,
            40,
            45,
            50
        ]
    },
    caveMode:{
        name: "Reverb (cave mode)",
        type: "checkbox",
        songSetting: false,
        value: false,
    }
}
let MainPageSettings = {
    settingVesion: 1,
    keyboardSize: {
        name: "Keyboard size",
        type: "number",
        songSetting: false,
        value: 100,
        threshold: [0, 200]
    },
    instrument: {
        name: "Instrument",
        type: "select",
        songSetting: false,
        value: 0,
        options: [
            "lyre"
        ]
    },
    pitch: {
        name: "Pitch",
        type: "select",
        songSetting: true,
        value: "C",
        options: [
            "C",
            "Db",
            "D",
            "Eb",
            "E",
            "F",
            "Gb",
            "G",
            "Ab",
            "A",
            "Bb",
            "B",
        ]
    },
    caveMode:{
        name: "Reverb (cave mode)",
        type: "checkbox",
        songSetting: false,
        value: false,
    }
}
export {
    ComposerSettings,
    MainPageSettings
}