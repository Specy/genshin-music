import { isMobile } from "is-mobile"
import { INSTRUMENTS, APP_NAME, BASE_THEME_CONFIG, PITCHES, Pitch, IS_MOBILE } from "$/appConfig"
import { MIDINote, MIDIShortcut } from "./Utilities"
import { SettingsCheckbox, SettingsInstrument, SettingsNumber, SettingsSelect, SettingsSlider } from "$types/SettingsPropriety"
import { NoteNameType } from "$types/GeneralTypes"
import { VsrgSongKeys } from "./Songs/VsrgSong"
import { VsrgKeyboardLayout } from "$cmp/VsrgPlayer/VsrgPlayerKeyboard"

export type ComposerSettingsDataType = {
    bpm: SettingsNumber
    beatMarks: SettingsSelect<number>
    noteNameType: SettingsSelect<NoteNameType>
    pitch: SettingsSelect<Pitch>
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
        settingVersion: APP_NAME + 43,
    },
    data: {
        bpm: {
            name: "Bpm",
            tooltip: "Beats per minute, the speed of the song",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 1600],
            value: 220,
            category: "Song Settings",
        },
        pitch: {
            name: "Base pitch",
            tooltip: "The main pitch of the song",
            type: "select",
            songSetting: true,
            value: "C",
            category: "Song Settings",
            options: [...PITCHES]
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
            tooltip: "The type of text which will be written on the note",
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
            tooltip: "Makes it sound like you are in a cave",
            category: "General Settings",
            type: "checkbox",
            songSetting: false,
            value: false,
        },
        autosave: {
            name: "Autosave changes",
            tooltip: "Autosaves the changes to a song every 5 edits, and when you change page/change song",
            type: "checkbox",
            category: "General Settings",
            songSetting: false,
            value: false,
        },
        syncTabs: {
            name: "Autoplay in all tabs (pc only)",
            tooltip: "Advanced feature, it syncs other browser tabs to all play at the same time",
            type: "checkbox",
            category: "General Settings",
            songSetting: false,
            value: false
        }
    }

}

export type MainPageSettingsDataType = {
    instrument: SettingsInstrument
    pitch: SettingsSelect<Pitch>
    caveMode: SettingsCheckbox
    noteNameType: SettingsSelect<NoteNameType>
    keyboardSize: SettingsSlider
    keyboardYPosition: SettingsSlider
    approachSpeed: SettingsNumber
    noteAnimation: SettingsCheckbox
    metronomeBeats: SettingsNumber
    bpm: SettingsNumber
    metronomeVolume: SettingsSlider
    syncSongData: SettingsCheckbox
}
export type MainPageSettingsType = {
    other: {
        settingVersion: string,
    },
    data: MainPageSettingsDataType
}
export const MainPageSettings: MainPageSettingsType = {
    other: {
        settingVersion: APP_NAME + 44
    },
    data: {
        instrument: {
            name: "Instrument",
            tooltip: "The main instrument of the player, will also be saved in the song you record",
            type: "instrument",
            songSetting: false,
            value: INSTRUMENTS[0],
            volume: 100,
            options: [...INSTRUMENTS],
            category: "Song Settings",
        },
        pitch: {
            name: "Pitch",
            tooltip: "The pitch of the player, will also be saved in the song you record",
            type: "select",
            songSetting: true,
            value: "C",
            category: "Song Settings",
            options: [...PITCHES]
        },
        bpm: {
            name: "Bpm",
            tooltip: "Beats per minute, used by the metronome and will be used when converting the song with the compsoer",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 1600],
            value: 220,
            category: "Song Settings",
        },
        syncSongData: {
            name: "Auto use the song's instruments and pitch",
            tooltip: "Whenever you load a song, the instruments and pitch of that song will be loaded too",
            type: "checkbox",
            songSetting: false,
            value: true,
            category: "General Settings",
        },
        metronomeBeats: {
            name: "Metronome beats",
            tooltip: "After how many times a stronger beat is played",
            type: "number",
            songSetting: false,
            increment: 1,
            value: 4,
            threshold: [0, 16],
            category: "General Settings",
        },
        metronomeVolume: {
            name: "Metronome volume",
            tooltip: "The volume of the metronome",
            type: "slider",
            songSetting: false,
            value: 50,
            category: "General Settings",
            threshold: [0, 120]
        },
        caveMode: {
            name: "Reverb (cave mode)",
            tooltip: "Makes it sound like you are in a cave",
            type: "checkbox",
            songSetting: false,
            value: false,
            category: "General Settings",
        },
        noteNameType: {
            name: "Note name type",
            tooltip: "The type of text which will be written on the note",
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
            tooltip: "Scales the keyboard size",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "General Settings",
            threshold: [80, 150]
        },
        keyboardYPosition: {
            name: "Vertical position",
            tooltip: "The vertical position of the keyboard",
            type: "slider",
            songSetting: false,
            value: -20,
            category: "General Settings",
            threshold: [-60, 80]
        },
        approachSpeed: {
            name: "Approach Rate (AR)",
            tooltip: "The time between when the notes appear and when they reach the end (in ms)",
            type: "number",
            increment: 50,
            songSetting: false,
            value: 1500,
            category: "General Settings",
            threshold: [0, 5000]
        },
        noteAnimation: {
            name: "Note animation",
            tooltip: "Toggle the animation of the notes",
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
    id: null,
    type: 'theme',
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


export type VsrgComposerSettingsDataType = {
    keys: SettingsSelect<VsrgSongKeys>
    bpm: SettingsNumber
    pitch: SettingsSelect<Pitch>
    isVertical: SettingsCheckbox
    autosave: SettingsCheckbox
    maxFps: SettingsSelect<number>
    difficulty: SettingsSelect<number>
}
export type VsrgComposerSettingsType = {
    other: {
        settingVersion: string,
    },
    data: VsrgComposerSettingsDataType
}
export const VsrgComposerSettings: VsrgComposerSettingsType = {
    other: {
        settingVersion: APP_NAME + 7
    },
    data: {
        keys: {
            name: "Keys",
            tooltip: "How many keys the song has",
            type: "select",
            songSetting: true,
            value: 6,
            category: "Song Settings",
            options: [
                4,
                6,
            ]
        },
        bpm: {
            name: "Bpm",
            tooltip: "Beats per minute, the speed of the song",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 1600],
            value: 220,
            category: "Song Settings",
        },
        pitch: {
            name: "Base pitch",
            tooltip: "The main pitch of the song",
            type: "select",
            songSetting: true,
            value: "C",
            category: "Song Settings",
            options: [...PITCHES]
        },
        isVertical: {
            name: "Vertical editor",
            tooltip: "If the editor is set horizontally or vertically",
            type: "checkbox",
            songSetting: false,
            value: false,
            category: "Editor Settings",
        },
        maxFps: {
            name: "Max FPS (high values could lag)",
            tooltip: "The FPS limiter of the editor, higher values could more lag",
            type: "select",
            songSetting: true,
            value: 48,
            category: "Song Settings",
            options: [
                24,
                30,
                48,
                60,
                90,
                120
            ]
        },
        autosave: {
            name: "Autosave changes",
            tooltip: "Autosaves the changes to a song every 5 edits, and when you change page/change song",
            type: "checkbox",
            category: "Editor Settings",
            songSetting: false,
            value: false,
        },
        difficulty: {
            name: "Difficulty",
            tooltip: "Higher values means the notes need to be pressed more accurately",
            type: "select",
            songSetting: true,
            value: 5,
            category: "Song Settings",
            options: new Array(10).fill(0).map((_, i) => i + 1)
        },
    }
}


export type VsrgPlayerSettingsDataType = {
    scrollSpeed: SettingsNumber
    keyboardLayout: SettingsSelect<VsrgKeyboardLayout>
}
export type VsrgPlayerSettingsType = {
    other: {
        settingVersion: string,
    },
    data: VsrgPlayerSettingsDataType
}
export const VsrgPlayerSettings: VsrgPlayerSettingsType = {
    other: {
        settingVersion: APP_NAME + 7
    },
    data: {
        scrollSpeed: {
            name: "Scroll speed",
            tooltip: "The time between when the notes appear and when they reach the end (in ms)",
            type: "number",
            songSetting: true,
            increment: 100,
            threshold: [200, 5000],
            value: 2000,
            category: "Player Settings",
        },
        keyboardLayout: {
            name: "Keyboard layout",
            tooltip: "The keyboard layout of the player",
            type: "select",
            songSetting: true,
            value: IS_MOBILE ? 'line' : 'circles',
            category: "Player Settings",
            options: [
                'circles',
                'line'
            ]
        },
    }
}