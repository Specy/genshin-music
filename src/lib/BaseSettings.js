import { isMobile } from "is-mobile"
import { instruments, appName, BASE_THEME_CONFIG } from "appConfig"
import { MIDINote,MIDIShortcut } from "./Utils"
export const ComposerSettings = {
    settingVesion: appName + 20,
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
        threshold: [0, 1600],
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
    noteNameType: {
        name: "Note name type",
        type: "select",
        songSetting: false,
        value: appName === "Genshin"
            ? isMobile()
                ? "Do Re Mi"
                : "Keyboard layout"
            : "Note name",
        options: appName === "Genshin"
            ? [
                "Note name",
                "Keyboard layout",
                "Do Re Mi",
                "ABC"
            ]
            : [
                "Note name",
                "Keyboard layout",
                "ABC"
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
    },
    syncTabs: {
        name: "Autoplay in all tabs (pc only)",
        type: "checkbox",
        songSetting: false,
        value: false
    }
}

export const MainPageSettings = {
    settingVesion: appName + 20,
    instrument: {
        name: "Instrument",
        type: "instrument",
        songSetting: false,
        value: instruments[0],
        volume: 100,
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
    },
    keyboardSize: {
        name: "Keyboard size",
        type: "number",
        songSetting: false,
        value: 100,
        threshold: [0, 200]
    },
    noteNameType: {
        name: "Note name type",
        type: "select",
        songSetting: false,
        value: appName === "Genshin"
            ? isMobile()
                ? "Do Re Mi"
                : "Keyboard layout"
            : "Note name",

        options: appName === "Genshin"
            ? [
                "Note name",
                "Keyboard layout",
                "Do Re Mi",
                "ABC"
            ]
            : [
                "Note name",
                "Keyboard layout",
                "ABC"
            ]
    },
    approachSpeed: {
        name: "Approach Rate (AR)",
        type: "number",
        songSetting: false,
        value: 1500,
        threshold: [0, 5000]
    },
    noteAnimation: {
        name: "Note animation",
        type: "checkbox",
        songSetting: false,
        value: false
    }
}
export const MIDISettings = {
    settingVesion: appName + 4,
    enabled: false,
    currentSource: '',
    notes: new Array(appName === 'Genshin' ? 21 : 15).fill(0).map((e,i) => new MIDINote(i,-1)),
    shortcuts: [
        new MIDIShortcut('toggle_play',-1),
        new MIDIShortcut('next_column',-1),
        new MIDIShortcut('previous_column',-1),
        new MIDIShortcut('add_column',-1),
        new MIDIShortcut('remove_column',-1),
        new MIDIShortcut('change_layer',-1)
    ]
}

export function getMIDISettings(){
    //TODO make this a store
    let settings = localStorage.getItem(appName + '_MIDI_Settings')
    try {
        settings = JSON.parse(settings)
    } catch (e) {
        settings = null
    }
    if (settings !== null) {
        if (settings.settingVesion !== MIDISettings.settingVesion) {
            return MIDISettings
        }
    } else {
        return MIDISettings
    }
    return settings
}


export const ThemeSettings = {
    version: appName + 4,
    other: {
        backgroundImageMain: '',
        backgroundImageComposer: ''
    },
    data: {
        background:{
            name: 'background',
            css: 'background',
            value: '#394248',
            text: BASE_THEME_CONFIG.text.light
        },
        primary: {
            name: 'primary',
            css: 'primary',
            value: '#495466',
            text: BASE_THEME_CONFIG.text.light
        },
        secondary: {
            name: 'secondary',
            css: 'secondary',
            value: '#8c7063',
            text: BASE_THEME_CONFIG.text.dark
        },
        accent: {
            name: 'accent',
            css: 'accent',
            value: '#63aea7',
            text: BASE_THEME_CONFIG.text.dark
        },
        icon_color: {
            name: 'icon_color',
            css: 'icon-color',
            value: '#d3bd8e',
            text: BASE_THEME_CONFIG.text.dark
        },
        menu_background: {
            name: 'menu_background',
            css: 'menu-background',
            value: 'rgba(237, 229, 216,0.95)',
            text: BASE_THEME_CONFIG.text.light
        }
    }
}