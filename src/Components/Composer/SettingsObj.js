let ComposerSettings = {
    settingVesion: Math.floor(Math.random() * 10),
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
}

export {
    ComposerSettings
}