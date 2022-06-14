import { isMobile } from "is-mobile"
import { INSTRUMENTS, APP_NAME, BASE_THEME_CONFIG } from "appConfig"
import { MIDINote, MIDIShortcut } from "./Tools"
import { SettingsCheckbox, SettingsInstrument, SettingsNumber, SettingsSelect, SettingsSlider } from "types/SettingsPropriety"

export type ComposerSettingsDataType = {
    bpm: SettingsNumber
    beatMarks: SettingsSelect
    noteNameType: SettingsSelect
    pitch: SettingsSelect
    columnsPerCanvas: SettingsSelect
    caveMode: SettingsCheckbox
    autosave: SettingsCheckbox
    syncTabs: SettingsCheckbox
}
export type ComposerSettingsType = {
    other: {
        settingVersion: string
    }
    data: ComposerSettingsDataType
}
export const ComposerSettings: ComposerSettingsType = {
    other: {
        settingVersion: APP_NAME + 38,
    },
    data: {
        bpm: {
            name: "Bpm",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 1600],
            value: 220,
            category: "Song Settings",
        },
        pitch: {
            name: "Pitch",
            type: "select",
            songSetting: true,
            value: "C",
            category: "Song Settings",
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
        beatMarks: {
            name: "Beat marks",
            type: "select",
            songSetting: false,
            value: 3,
            category: "General Settings",
            options: [
                3,
                4
            ]
        },
        noteNameType: {
            name: "Note name type",
            type: "select",
            songSetting: false,
            category: "General Settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",
            options: APP_NAME === "Genshin"
                ? [
                    "Note name",
                    "Keyboard layout",
                    "Do Re Mi",
                    "ABC",
                    "No Text"
                ]
                : [
                    "Note name",
                    "Keyboard layout",
                    "ABC",
                    "No Text"
                ]
        },
        columnsPerCanvas: {
            name: "Number of visible columns",
            type: "select",
            songSetting: false,
            category: "General Settings",
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
            category: "General Settings",
            type: "checkbox",
            songSetting: false,
            value: false,
        },
        autosave: {
            name: "Autosave changes",
            type: "checkbox",
            category: "General Settings",
            songSetting: false,
            value: false,
        },
        syncTabs: {
            name: "Autoplay in all tabs (pc only)",
            type: "checkbox",
            category: "General Settings",
            songSetting: false,
            value: false
        }
    }

}

export type MainPageSettingsDataType = {
    instrument: SettingsInstrument
    pitch: SettingsSelect
    caveMode: SettingsCheckbox
    noteNameType: SettingsSelect
    keyboardSize: SettingsSlider
    keyboardYPosition: SettingsSlider
    approachSpeed: SettingsNumber
    noteAnimation: SettingsCheckbox
}
export type MainPageSettingsType = {
    other: {
        settingVersion: string,
    },
    data: MainPageSettingsDataType
}
export const MainPageSettings: MainPageSettingsType = {
    other: {
        settingVersion: APP_NAME + 37
    },
    data: {
        instrument: {
            name: "Instrument",
            type: "instrument",
            songSetting: false,
            value: INSTRUMENTS[0],
            volume: 100,
            options: [...INSTRUMENTS],
            category: "Song Settings",
        },
        pitch: {
            name: "Pitch",
            type: "select",
            songSetting: true,
            value: "C",
            category: "Song Settings",
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
            category: "General Settings",
        },
        noteNameType: {
            name: "Note name type",
            type: "select",
            songSetting: false,
            category: "General Settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",

            options: APP_NAME === "Genshin"
                ? [
                    "Note name",
                    "Keyboard layout",
                    "Do Re Mi",
                    "ABC",
                    "No Text"
                ]
                : [
                    "Note name",
                    "Keyboard layout",
                    "ABC",
                    "No Text"
                ]
        },
        keyboardSize: {
            name: "Keyboard size",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "General Settings",
            threshold: [80, 150]
        },
        keyboardYPosition: {
            name: "Vertical position",
            type: "slider",
            songSetting: false,
            value: -20,
            category: "General Settings",
            threshold: [-60, 80]
        },
        approachSpeed: {
            name: "Approach Rate (AR)",
            type: "number",
            increment: 50,
            songSetting: false,
            value: 1500,
            category: "General Settings",
            threshold: [0, 5000]
        },
        noteAnimation: {
            name: "Note animation",
            type: "checkbox",
            category: "General Settings",
            songSetting: false,
            value: false
        }
    }
}

export const MIDISettings = {
    settingVersion: APP_NAME + 4,
    enabled: false,
    currentSource: '',
    notes: new Array(APP_NAME === 'Genshin' ? 21 : 15).fill(0).map((e, i) => new MIDINote(i, -1)),
    shortcuts: [
        new MIDIShortcut('toggle_play', -1),
        new MIDIShortcut('next_column', -1),
        new MIDIShortcut('previous_column', -1),
        new MIDIShortcut('add_column', -1),
        new MIDIShortcut('remove_column', -1),
        new MIDIShortcut('change_layer', -1)
    ]
}


export const ThemeSettings = {
    editable: false,
    other: {
        backgroundImageMain: '',
        backgroundImageComposer: '',
        name: 'Default',
        id: 'default',
    },
    data: {
        background: {
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
            text: BASE_THEME_CONFIG.text.light
        },
        accent: {
            name: 'accent',
            css: 'accent',
            value: '#63aea7',
            text: BASE_THEME_CONFIG.text.dark
        },
        composer_accent: {
            name: 'composer_accent',
            css: 'composer-accent',
            value: '#2A8C84',
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
            value: 'rgba(237, 229, 216, 0.95)',
            text: BASE_THEME_CONFIG.text.dark
        },
        note_background: {
            name: 'note_background',
            css: 'note-background',
            value: APP_NAME === 'Genshin' ? '#fff9ef' : '#495466',
            text: BASE_THEME_CONFIG.text.note
        }
    }
}
