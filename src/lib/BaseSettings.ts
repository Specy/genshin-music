import {isMobile} from "is-mobile"
import {
    APP_NAME,
    BASE_THEME_CONFIG,
    INSTRUMENTS,
    MIDIPreset,
    NOTE_NAME_TYPES,
    NoteNameType,
    Pitch,
    PITCHES
} from "$config"
import {MIDIShortcut} from "./utils/Utilities"
import {
    SettingsCheckbox,
    SettingsInstrument,
    SettingsNumber,
    SettingsSelect,
    SettingsSlider
} from "$types/SettingsPropriety"
import {VsrgSongKeys} from "./Songs/VsrgSong"
import {VsrgKeyboardLayout} from "$cmp/pages/VsrgPlayer/VsrgPlayerKeyboard"

export type BaseSettings<T> = {
    data: T,
    other: {
        settingVersion: string
    }
}
export type ComposerSettingsDataType = {
    bpm: SettingsNumber
    beatMarks: SettingsSelect<number>
    noteNameType: SettingsSelect<NoteNameType>
    pitch: SettingsSelect<Pitch>
    columnsPerCanvas: SettingsSelect
    reverb: SettingsCheckbox
    autosave: SettingsCheckbox
    syncTabs: SettingsCheckbox
    useKeyboardSideButtons: SettingsCheckbox
    lookaheadTime: SettingsNumber
}
export type ComposerSettingsType = BaseSettings<ComposerSettingsDataType>
export const ComposerSettings: ComposerSettingsType = {
    other: {
        settingVersion: APP_NAME + 67,
    },
    data: {
        bpm: {
            name: "Bpm",
            tooltip: "Beats per minute, the speed of the song. Usually the BPM inside the app should be 4 times the BPM of the song you are trying to compose",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 10000],
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
            tooltip: "The number of beats per measure, 3/4 is 3 beats per measure, 4/4 is 4 beats per measure",
            type: "select",
            songSetting: false,
            value: 3,
            category: "Composer Settings",
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
            category: "Composer Settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",
            options: NOTE_NAME_TYPES
        },
        columnsPerCanvas: {
            name: "Number of visible columns",
            tooltip: "How many columns are visible at a time, more columns might cause lag",
            type: "select",
            songSetting: false,
            category: "Composer Settings",
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
        reverb: {
            name: "Base reverb (cave mode)",
            tooltip: "Makes it sound like you are in a cave, this is the default value applied to every instrument",
            category: "Song Settings",
            type: "checkbox",
            songSetting: true,
            value: false,
        },
        autosave: {
            name: "Autosave changes",
            tooltip: "Autosaves the changes to a song every 5 edits, and when you change page/change song",
            type: "checkbox",
            category: "Composer Settings",
            songSetting: false,
            value: false,
        },
        useKeyboardSideButtons: {
            name: "Put next/previous column buttons around keyboard",
            tooltip: "Puts the buttons to select the next/previous column on the left/right of the keyboard",
            type: "checkbox",
            category: "Composer Settings",
            songSetting: false,
            value: false
        },
        syncTabs: {
            name: "Autoplay in all tabs (pc only)",
            tooltip: "Advanced feature, it syncs other browser tabs to all play at the same time",
            type: "checkbox",
            category: "Composer Settings",
            songSetting: false,
            value: false
        },
        lookaheadTime: {
            name: "Lookahead time",
            tooltip: "How many milliseconds ahead the composer will look for notes to play, a higher value improves playback accuracy but feels less responsive",
            type: "number",
            category: "Composer Settings",
            songSetting: false,
            value: 250,
            increment: 50,
            threshold: [0, 500]
        }
    }

}

export type PlayerSettingsDataType = {
    instrument: SettingsInstrument
    pitch: SettingsSelect<Pitch>
    reverb: SettingsCheckbox
    noteNameType: SettingsSelect<NoteNameType>
    keyboardSize: SettingsSlider
    keyboardYPosition: SettingsSlider
    approachSpeed: SettingsNumber
    noteAnimation: SettingsCheckbox
    metronomeBeats: SettingsNumber
    bpm: SettingsNumber
    metronomeVolume: SettingsSlider
    syncSongData: SettingsCheckbox
    showVisualSheet: SettingsCheckbox
}
export type PlayerSettingsType = BaseSettings<PlayerSettingsDataType>
export const PlayerSettings: PlayerSettingsType = {
    other: {
        settingVersion: APP_NAME + 72 //change when instrument is added
    },
    data: {
        instrument: {
            name: "Instrument",
            tooltip: "The main (first) instrument of the player, will also be saved in the song you record",
            type: "instrument",
            songSetting: true,
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
            threshold: [0, 10000],
            value: 220,
            category: "Song Settings",
        },
        syncSongData: {
            name: "Auto sync the song's instruments and pitch",
            tooltip: "Whenever you load a song, the instruments and pitch of that song will be loaded too",
            type: "checkbox",
            songSetting: false,
            value: true,
            category: "Player Settings",
        },
        metronomeBeats: {
            name: "Metronome beats",
            tooltip: "After how many times a stronger beat is played",
            type: "number",
            songSetting: false,
            increment: 1,
            value: 4,
            threshold: [0, 16],
            category: "Player Settings",
        },
        metronomeVolume: {
            name: "Metronome volume",
            tooltip: "The volume of the metronome",
            type: "slider",
            songSetting: false,
            value: 50,
            category: "Player Settings",
            threshold: [0, 120]
        },
        reverb: {
            name: "Reverb (cave mode)",
            tooltip: "Makes it sound like you are in a cave",
            type: "checkbox",
            songSetting: true,
            value: false,
            category: "Song Settings",
        },
        noteNameType: {
            name: "Note name type",
            tooltip: "The type of text which will be written on the note",
            type: "select",
            songSetting: false,
            category: "Player Settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",

            options: NOTE_NAME_TYPES
        },
        keyboardSize: {
            name: "Keyboard size",
            tooltip: "Scales the keyboard size",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "Player Settings",
            threshold: [80, 150]
        },
        keyboardYPosition: {
            name: "Keyboard vertical position",
            tooltip: "The vertical position of the keyboard",
            type: "slider",
            songSetting: false,
            value: -20,
            category: "Player Settings",
            threshold: [-60, 180]
        },
        approachSpeed: {
            name: "Approach Rate (AR)",
            tooltip: "The time between when the notes appear and when they reach the end (in ms)",
            type: "number",
            increment: 50,
            songSetting: false,
            value: 1500,
            category: "Player Settings",
            threshold: [0, 5000]
        },
        noteAnimation: {
            name: "Note animation",
            tooltip: "Toggle the animation of the notes (will reduce performance)",
            type: "checkbox",
            category: "Player Settings",
            songSetting: false,
            value: false
        },
        showVisualSheet: {
            name: "Show visual sheet",
            tooltip: "Show the sheet above the keyboard (might reduce performance)",
            type: "checkbox",
            songSetting: false,
            value: true,
            category: "Player Settings",
        },
    }
}


export const MIDISettings = {
    settingVersion: APP_NAME + 6,
    enabled: false,
    selectedPreset: 'default',
    presets: {} as Record<string, MIDIPreset>,
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
        },
        composer_main_layer: {
            name: "composer_main_layer",
            css: "composer-main-layer",
            value: "#d3bd8e",
            text: BASE_THEME_CONFIG.text.dark
        },
        composer_secondary_layer: {
            name: "composer_secondary_layer",
            css: "composer-secondary-layer",
            value: "#de6b45",
            text: BASE_THEME_CONFIG.text.dark
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
    scrollSnap: SettingsCheckbox
}
export type VsrgComposerSettingsType = BaseSettings<VsrgComposerSettingsDataType>
export const VsrgComposerSettings: VsrgComposerSettingsType = {
    other: {
        settingVersion: APP_NAME + 13
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
            threshold: [0, 10000],
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
            songSetting: false,
            value: 48,
            category: "Editor Settings",
            options: [
                24,
                30,
                48,
                60,
                90,
                120
            ]
        },
        scrollSnap: {
            name: "Snap scroll to snap point",
            tooltip: "When scrolling, snap the timestamp to the closest snap point",
            type: "checkbox",
            category: "Editor Settings",
            songSetting: false,
            value: false,
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
    approachTime: SettingsNumber
    maxFps: SettingsSelect<number>
    keyboardLayout: SettingsSelect<VsrgKeyboardLayout>
    offset: SettingsNumber
    horizontalOffset: SettingsSlider
    verticalOffset: SettingsSlider
}
export type VsrgPlayerSettingsType = BaseSettings<VsrgPlayerSettingsDataType>
export const VsrgPlayerSettings: VsrgPlayerSettingsType = {
    other: {
        settingVersion: APP_NAME + 5
    },
    data: {
        approachTime: {
            name: "Approaching time",
            tooltip: "The time between when the notes appear and when they reach the end (in ms)",
            type: "number",
            songSetting: true,
            increment: 100,
            threshold: [1, 5000],
            value: 2000,
            category: "Player Settings",
        },
        maxFps: {
            name: "Max FPS",
            tooltip: "The FPS limiter of the player, too high values could cause lag or stutters",
            type: "select",
            songSetting: false,
            value: 48,
            category: "Player Settings",
            options: [
                24,
                30,
                48,
                60,
                90,
                120
            ]
        },
        keyboardLayout: {
            name: "Keyboard layout",
            tooltip: "The keyboard layout of the player",
            type: "select",
            songSetting: true,
            value: 'line',
            category: "Player Settings",
            options: [
                'circles',
                'line'
            ]
        },
        offset: {
            name: "Audio Offset",
            tooltip: "An offset to the audio if it plays too early/late (in ms)",
            type: "number",
            songSetting: true,
            increment: 2,
            threshold: [-1000, 1000],
            value: 0,
            category: "Player Settings",
        },
        verticalOffset: {
            name: "Vertical position",
            tooltip: "The Vertical offset for the line layout",
            type: "slider",
            songSetting: false,
            value: -0,
            category: "pagesLayout Settings",
            threshold: [-40, 40]
        },
        horizontalOffset: {
            name: "Horizontal position",
            tooltip: "The Horizontal offset for the line layout",
            type: "slider",
            songSetting: false,
            value: 0,
            category: "pagesLayout Settings",
            threshold: [-40, 40]
        },
    }
}
export type ZenKeyboardSettingsDataType = {
    instrument: SettingsInstrument
    pitch: SettingsSelect<Pitch>
    reverb: SettingsCheckbox
    noteNameType: SettingsSelect<NoteNameType>
    keyboardSize: SettingsSlider
    keyboardYPosition: SettingsSlider
    keyboardSpacing: SettingsSlider
    metronomeBeats: SettingsNumber
    metronomeVolume: SettingsSlider
    metronomeBpm: SettingsNumber
}
export type ZenKeyboardSettingsType = BaseSettings<ZenKeyboardSettingsDataType>

export const ZenKeyboardSettings: ZenKeyboardSettingsType = {
    other: {
        settingVersion: APP_NAME + 20 //change when instrument is added
    },
    data: {
        instrument: {
            name: "Instrument",
            tooltip: "The main instrument of the keyboard",
            type: "instrument",
            songSetting: false,
            value: INSTRUMENTS[0],
            volume: 100,
            options: [...INSTRUMENTS],
            category: "Keyboard",
        },
        pitch: {
            name: "Pitch",
            tooltip: "The pitch of the keyboard",
            type: "select",
            songSetting: false,
            value: "C",
            category: "Keyboard",
            options: [...PITCHES]
        },
        metronomeBeats: {
            name: "Metronome beats",
            tooltip: "After how many times a stronger beat is played",
            type: "number",
            songSetting: false,
            increment: 1,
            value: 4,
            threshold: [0, 16],
            category: "Metronome",
        },
        metronomeVolume: {
            name: "Metronome volume",
            tooltip: "The volume of the metronome",
            type: "slider",
            songSetting: false,
            value: 50,
            category: "Metronome",
            threshold: [0, 120]
        },
        metronomeBpm: {
            name: "Metronome bpm",
            tooltip: "The bpm of the metronome",
            type: "number",
            songSetting: false,
            value: 200,
            increment: 5,
            category: "Metronome",
            threshold: [0, 10000]
        },
        reverb: {
            name: "Reverb (cave mode)",
            tooltip: "Makes it sound like you are in a cave",
            type: "checkbox",
            songSetting: false,
            value: false,
            category: "Keyboard",
        },
        noteNameType: {
            name: "Note name type",
            tooltip: "The type of text which will be written on the note",
            type: "select",
            songSetting: false,
            category: "Keyboard",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "No Text",

            options: NOTE_NAME_TYPES
        },
        keyboardSize: {
            name: "Keyboard size",
            tooltip: "Scales the keyboard size",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "Keyboard",
            threshold: [70, 170]
        },
        keyboardYPosition: {
            name: "Vertical position",
            tooltip: "The vertical position of the keyboard",
            type: "slider",
            songSetting: false,
            value: 0,
            category: "Keyboard",
            threshold: [-100, 100]
        },
        keyboardSpacing: {
            name: "Keyboard spacing",
            tooltip: "The spacing between the notes",
            type: "slider",
            songSetting: false,
            value: 0.35,
            step: 0.01,
            category: "Keyboard",
            threshold: [0.15, 1]
        }
    }
}

