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
import {DeepWriteable} from "$lib/utils/UtilTypes";

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




export const ComposerSettings = {
    other: {
        settingVersion: APP_NAME + 68,
    },
    data: {
        bpm: {
            name: "composer_bpm",
            tooltip: "composer_bpm_description",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 10000],
            value: 220,
            category: "song_settings",
        },
        pitch: {
            name: "composer_base_pitch",
            tooltip: "composer_base_pitch_description",
            type: "select",
            songSetting: true,
            value: "C",
            category: "song_settings",
            options: [...PITCHES]
        },
        beatMarks: {
            name: "composer_beat_marks",
            tooltip: "composer_beat_marks_description",
            type: "select",
            songSetting: false,
            value: 3,
            category: "composer_settings",
            options: [
                3,
                4
            ]
        },
        noteNameType: {
            name: "composer_note_name_type",
            tooltip: "composer_note_name_type_description",
            type: "select",
            songSetting: false,
            category: "composer_settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",
            options: NOTE_NAME_TYPES
        },
        columnsPerCanvas: {
            name: "composer_columns_per_canvas",
            tooltip: "composer_columns_per_canvas_description",
            type: "select",
            songSetting: false,
            category: "composer_settings",
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
            name: "composer_reverb",
            tooltip: "composer_reverb_description",
            category: "song_settings",
            type: "checkbox",
            songSetting: true,
            value: false,
        },
        autosave: {
            name: "composer_autosave",
            tooltip: "composer_autosave_description",
            type: "checkbox",
            category: "composer_settings",
            songSetting: false,
            value: false,
        },
        useKeyboardSideButtons: {
            name: "composer_use_keyboard_side_buttons",
            tooltip: "composer_use_keyboard_side_buttons_description",
            type: "checkbox",
            category: "composer_settings",
            songSetting: false,
            value: false
        },
        syncTabs: {
            name: "composer_sync_tabs",
            tooltip: "composer_sync_tabs_description",
            type: "checkbox",
            category: "composer_settings",
            songSetting: false,
            value: false
        },
        lookaheadTime: {
            name: "composer_lookahead_time",
            tooltip: "composer_lookahead_time_description",
            type: "number",
            category: "composer_settings",
            songSetting: false,
            value: 250,
            increment: 50,
            threshold: [0, 500]
        }
    }

} as const satisfies ComposerSettingsType

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
export const PlayerSettings = {
    other: {
        settingVersion: APP_NAME + 73 //change when instrument is added
    },
    data: {
        instrument: {
            name: "player_instrument",
            tooltip: "player_instrument_description",
            type: "instrument",
            songSetting: true,
            value: INSTRUMENTS[0],
            volume: 100,
            options: [...INSTRUMENTS],
            category: "song_settings",
        },
        pitch: {
            name: "player_pitch",
            tooltip: "player_pitch_description",
            type: "select",
            songSetting: true,
            value: "C",
            category: "song_settings",
            options: [...PITCHES]
        },
        bpm: {
            name: "player_bpm",
            tooltip: "player_bpm_description",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 10000],
            value: 220,
            category: "song_settings",
        },
        syncSongData: {
            name: "player_sync_song_data",
            tooltip: "player_sync_song_data_description",
            type: "checkbox",
            songSetting: false,
            value: true,
            category: "player_settings",
        },
        metronomeBeats: {
            name: "player_metronome_beats",
            tooltip: "player_metronome_beats_description",
            type: "number",
            songSetting: false,
            increment: 1,
            value: 4,
            threshold: [0, 16],
            category: "player_settings",
        },
        metronomeVolume: {
            name: "player_metronome_volume",
            tooltip: "player_metronome_volume_description",
            type: "slider",
            songSetting: false,
            value: 50,
            category: "player_settings",
            threshold: [0, 120]
        },
        reverb: {
            name: "player_reverb",
            tooltip: "player_reverb_description",
            type: "checkbox",
            songSetting: true,
            value: false,
            category: "song_settings",
        },
        noteNameType: {
            name: "player_note_name_type",
            tooltip: "player_note_name_type_description",
            type: "select",
            songSetting: false,
            category: "player_settings",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "Note name",

            options: NOTE_NAME_TYPES
        },
        keyboardSize: {
            name: "player_keyboard_size",
            tooltip: "player_keyboard_size_description",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "player_settings",
            threshold: [80, 150]
        },
        keyboardYPosition: {
            name: "player_keyboard_y_position",
            tooltip: "player_keyboard_y_position_description",
            type: "slider",
            songSetting: false,
            value: -20,
            category: "player_settings",
            threshold: [-60, 180]
        },
        approachSpeed: {
            name: "player_approach_speed",
            tooltip: "player_approach_speed_description",
            type: "number",
            increment: 50,
            songSetting: false,
            value: 1500,
            category: "player_settings",
            threshold: [0, 5000]
        },
        noteAnimation: {
            name: "player_note_animation",
            tooltip: "player_note_animation_description",
            type: "checkbox",
            category: "player_settings",
            songSetting: false,
            value: false
        },
        showVisualSheet: {
            name: "player_show_visual_sheet",
            tooltip: "player_show_visual_sheet_description",
            type: "checkbox",
            songSetting: false,
            value: true,
            category: "player_settings",
        },
    }
} as const satisfies PlayerSettingsType

export type MIDIShortcutName = 'toggle_play' | 'next_column' | 'previous_column' | 'add_column' | 'remove_column' | 'change_layer'

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
export type MidiSettingsType = typeof MIDISettings


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
export const VsrgComposerSettings = {
    other: {
        settingVersion: APP_NAME + 14
    },
    data: {
        keys: {
            name: "vsrg_composer_keys",
            tooltip: "vsrg_composer_keys_description",
            type: "select",
            songSetting: true,
            value: 6,
            category: "song_settings",
            options: [
                4,
                6,
            ]
        },
        bpm: {
            name: "vsrg_composer_bpm",
            tooltip: "vsrg_composer_bpm_description",
            type: "number",
            songSetting: true,
            increment: 5,
            threshold: [0, 10000],
            value: 220,
            category: "song_settings",
        },
        pitch: {
            name: "vsrg_composer_pitch",
            tooltip: "vsrg_composer_pitch_description",
            type: "select",
            songSetting: true,
            value: "C",
            category: "song_settings",
            options: [...PITCHES]
        },
        isVertical: {
            name: "vsrg_composer_is_vertical",
            tooltip: "vsrg_composer_is_vertical_description",
            type: "checkbox",
            songSetting: false,
            value: false,
            category: "editor_settings",
        },
        maxFps: {
            name: "vsrg_composer_max_fps",
            tooltip: "vsrg_composer_max_fps_description",
            type: "select",
            songSetting: false,
            value: 48,
            category: "editor_settings",
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
            name: "vsrg_scroll_snap",
            tooltip: "vsrg_scroll_snap_description",
            type: "checkbox",
            category: "editor_settings",
            songSetting: false,
            value: false,
        },
        autosave: {
            name: "vsrg_composer_autosave",
            tooltip: "vsrg_composer_autosave_description",
            type: "checkbox",
            category: "editor_settings",
            songSetting: false,
            value: false,
        },
        difficulty: {
            name: "vsrg_composer_difficulty",
            tooltip: "vsrg_composer_difficulty_description",
            type: "select",
            songSetting: true,
            value: 5,
            category: "song_settings",
            options: new Array(10).fill(0).map((_, i) => i + 1)
        },
    }
} as const satisfies VsrgComposerSettingsType

export type VsrgPlayerSettingsDataType = {
    approachTime: SettingsNumber
    maxFps: SettingsSelect<number>
    keyboardLayout: SettingsSelect<VsrgKeyboardLayout>
    offset: SettingsNumber
    horizontalOffset: SettingsSlider
    verticalOffset: SettingsSlider
}
export type VsrgPlayerSettingsType = BaseSettings<VsrgPlayerSettingsDataType>
export const VsrgPlayerSettings = {
    other: {
        settingVersion: APP_NAME + 6
    },
    data: {
        approachTime: {
            name: "vsrg_player_approach_time",
            tooltip: "vsrg_player_approach_time_description",
            type: "number",
            songSetting: true,
            increment: 100,
            threshold: [1, 5000],
            value: 2000,
            category: "player_settings",
        },
        maxFps: {
            name: "vsrg_player_max_fps",
            tooltip: "vsrg_player_max_fps_description",
            type: "select",
            songSetting: false,
            value: 48,
            category: "player_settings",
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
            name: "vsrg_player_keyboard_layout",
            tooltip: "vsrg_player_keyboard_layout_description",
            type: "select",
            songSetting: true,
            value: 'line',
            category: "player_settings",
            options: [
                'circles',
                'line'
            ]
        },
        offset: {
            name: "vsrg_player_offset",
            tooltip: "vsrg_player_offset_description",
            type: "number",
            songSetting: true,
            increment: 2,
            threshold: [-1000, 1000],
            value: 0,
            category: "player_settings",
        },
        verticalOffset: {
            name: "vsrg_player_vertical_offset",
            tooltip: "vsrg_player_vertical_offset_description",
            type: "slider",
            songSetting: false,
            value: -0,
            category: "layout_settings",
            threshold: [-40, 40]
        },
        horizontalOffset: {
            name: "vsrg_player_horizontal_offset",
            tooltip: "vsrg_player_horizontal_offset_description",
            type: "slider",
            songSetting: false,
            value: 0,
            category: "layout_settings",
            threshold: [-40, 40]
        },
    }
} as const satisfies VsrgPlayerSettingsType
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

export const ZenKeyboardSettings = {
    other: {
        settingVersion: APP_NAME + 21 //change when instrument is added
    },
    data: {
        instrument: {
            name: "zen_instrument",
            tooltip: "zen_instrument_description",
            type: "instrument",
            songSetting: false,
            value: INSTRUMENTS[0],
            volume: 100,
            options: [...INSTRUMENTS],
            category: "keyboard",
        },
        pitch: {
            name: "zen_pitch",
            tooltip: "zen_pitch_description",
            type: "select",
            songSetting: false,
            value: "C",
            category: "keyboard",
            options: [...PITCHES]
        },
        metronomeBeats: {
            name: "zen_metronome_beats",
            tooltip: "zen_metronome_beats_description",
            type: "number",
            songSetting: false,
            increment: 1,
            value: 4,
            threshold: [0, 16],
            category: "metronome",
        },
        metronomeVolume: {
            name: "zen_metronome_volume",
            tooltip: "zen_metronome_volume_description",
            type: "slider",
            songSetting: false,
            value: 50,
            category: "metronome",
            threshold: [0, 120]
        },
        metronomeBpm: {
            name: "zen_metronome_bpm",
            tooltip: "zen_metronome_bpm_description",
            type: "number",
            songSetting: false,
            value: 200,
            increment: 5,
            category: "metronome",
            threshold: [0, 10000]
        },
        reverb: {
            name: "zen_reverb",
            tooltip: "zen_reverb_description",
            type: "checkbox",
            songSetting: false,
            value: false,
            category: "keyboard",
        },
        noteNameType: {
            name: "zen_note_name_type",
            tooltip: "zen_note_name_type_description",
            type: "select",
            songSetting: false,
            category: "keyboard",
            value: APP_NAME === "Genshin"
                ? isMobile()
                    ? "Do Re Mi"
                    : "Keyboard layout"
                : "No Text",

            options: NOTE_NAME_TYPES
        },
        keyboardSize: {
            name: "zen_keyboard_size",
            tooltip: "zen_keyboard_size_description",
            type: "slider",
            songSetting: false,
            value: 100,
            category: "keyboard",
            threshold: [70, 170]
        },
        keyboardYPosition: {
            name: "zen_keyboard_y_position",
            tooltip: "zen_keyboard_y_position_description",
            type: "slider",
            songSetting: false,
            value: 0,
            category: "keyboard",
            threshold: [-100, 100]
        },
        keyboardSpacing: {
            name: "zen_keyboard_spacing",
            tooltip: "zen_keyboard_spacing_description",
            type: "slider",
            songSetting: false,
            value: 0.35,
            step: 0.01,
            category: "keyboard",
            threshold: [0.15, 1]
        }
    }
} as const satisfies ZenKeyboardSettingsType



