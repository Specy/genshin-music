import {instruments, appName} from "../../appConfig"
let ComposerSettings = {
    settingVesion: appName + 2,
    instrument: {
        name: "Instrument (Layer 1)",
        type: "instrument",
        songSetting: false,
        value: instruments[0],
        volume: 100,
        options: instruments
    },
    layer2: {
        name: "Instrument (Layer 2)",
        type: "instrument",
        songSetting: false,
        value: instruments[0],
        volume: 100,
        options: instruments
    },
    layer3: {
        name: "Instrument (Layer 3)",
        type: "instrument",
        songSetting: false,
        value: instruments[0],
        volume: 100,
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
        value: 3,
        options: [
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
    caveMode: {
        name: "Reverb (cave mode)",
        type: "checkbox",
        songSetting: false,
        value: false,
    },
    autosave: {
        name: "Autosave changes",
        type: "checkbox",
        songSetting: false,
        value: false,
    }
}
let MainPageSettings = {
    settingVesion:appName + 2,
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
        value: instruments[0],
        options: instruments
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
    caveMode: {
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