export const i18n_en = {
    logs: {
        update_available: "There is a new version of the app available, do you want to reload to update? Make sure you close/refresh other tabs of the app",
        error_with_the_app: "There was an error with the app!",
        loading_instruments: "Loading instruments...",
        loading_song: "Loading song...",
        could_not_find_song: "Could not find song",
        error_loading_instrument: "There was an error loading the instrument",
        error_opening_file: 'There was an error opening this file',
        error_importing_song: 'There was an error importing the song',
        error_downloading_audio: "There was an error downloading the audio, maybe the song is too long?",
        song_downloaded: "Song downloaded",
        error_downloading_song: "Error downloading song",
        error_downloading_songs: "Error downloading songs",
        error_importing_file: `Error importing file "{{file_name}}}"`,
        error_importing_file_generic: "Error importing file",
        error_importing_invalid_format: `Error importing file, invalid format`,
        song_backup_downloaded: "Song backup downloaded",
        no_songs_to_backup: "There are no songs to backup",
        no_empty_name: "Please write a non empty name",
        cloned_song: `Cloned song: "{{song_name}}"`,
        converting_recorded_to_composed_warning: 'Converting recorded song to composed, audio might not be accurate',
    },
    question: {
        unsaved_song_save: `You have unsaved changes to the song: "{{song_name}}" do you want to save now? UNSAVED CHANGES WILL BE LOST`,
        enter_song_name: "Write the song's name",
        enter_folder_name: "Write the folder's name",
        ask_song_name_cancellable: "Write the song name, press cancel to ignore",
    },
    confirm: {
        delete_song: `Are you sure you want to delete the song "{{song_name}}"?`
    },
    common: {
        warning: "Warning",
        error: "Error",
        success: "Success",
        cancel: "Cancel",
        close: "Close",
        save: "Save",
        delete: "Delete",
        edit: "Edit",
        create: "Create",
        add: "Add",
        remove: "Remove",
        yes: "Yes",
        no: "No",
        ok: "Ok",
        on: "On",
        off: "Off",
        help: "Help",
        reverb: "Reverb",
        undo: "Undo",
        confirm: "Confirm",
        loading: "Loading",
        privacy: "Privacy",
        donate: "Donate",
        open: "Open",
        play: "Play",
        record: "Record", //start recording
        stop: "Stop",
        erase: "Erase",
        copy: "Copy",
        paste: "Paste",
        pause: "Pause",
        settings: "Settings",
        search: "Search",
        rename: "Rename",
        create_song: "Create song",
        edit_song: "Edit song",
        none: "None",
        instrument: "instrument",
        download: "Download",
        download_midi: "Download MIDI",
        pitch: "Pitch", //audio pitch
        bpm: 'bpm',
        connect: "Connect",
        import: "Import",
        border: "Border",
        line: "Line",
        circle: "Circle"
    },
    translation: {},
    home: {
        app_description: "An app where you can create, practice and play songs for {{APP_NAME}}",
        add_to_home_screen: "To have the webapp in fullscreen, please add the website to the home screen",
        clear_cache_warning: "Clearing your browser cache / storage might delete your songs, make sure you make backups",
        persistent_storage_button: "Click the button below to make sure that your browser won't delete your songs if you lack storage",
        privacy_policy: "We use cookies for analytics, by continuing to use this app, you agree to our use of cookies, learn more:",
        no_affiliation: "This app is not affiliated with {{company_name}}, it is a fan made app.",
        composer_description: "Create or edit songs with a fully fledged music composer. Also with MIDI.",
        player_description: "Play, download, record and import songs. Learn a song with approaching circle mode and practice mode.",
        cache_reload_warning: "Are you sure you want to clear the cache? The page will reload",
        cache_cleared: "Cache cleared",
        error_clearing_cache: "Error clearing cache",
        close_home_menu: "Close home menu",
        composer_name: "Composer",
        player_name: "Player",
        vsrg_composer_name: "VSRG Composer",
        donate_name: "Donate",
        vsrg_player_name: "VSRG Player",
        zen_keyboard_name: "Zen Keyboard",
        sheet_visualizer_name: "Sheet Visualizer",
        themes_name: "Themes",
        blog_and_guides_name: "Blog & Guides",
        keybinds_or_midi_name: "Keybinds / MIDI",
        partners_name: "Partners",
        backup_name: "Backup",
        changelog_name: "Changelog",
        other_apps_name: "Other Apps",
        clear_cache_name: "Clear Cache",
        scale: "Scale",
        rights: "© All rights reserved by {{company_name}}. Other properties belong to their respective owners.",
        hide_on_open: "Hide on open",
        beta: "Beta",
    },
    menu: {
        close_menu: "Close menu",
        toggle_menu: "Toggle menu",
        open_settings_menu: "Open settings menu",
        open_home_menu: "Open home menu",
        open_songs_menu: "Open songs menu",
        open_library_menu: "Open library menu",
        open_info_menu: "Open info menu",
        settings: "Settings",
        song_menu: "Song menu",
        help: "Help",
        settings_menu: "Settings menu",
        song_name: "Song name",
        go_back: "Go back",
        play_song: "Play song",
        invalid_song: "Invalid song",
        download_song: "Download song {{song_name}}",
        delete_song: "Delete song {{song_name}}",
        change_app_theme: "Change app theme",
        download_all_songs_backup: "Download all songs (backup)",
        connect_midi_keyboard: "Connect MIDI keyboard",
        import_song_sheet: "Import song sheet",
        compose_song: "Compose song",
        select_menu: "Select a menu",
        create_folder: "Create folder",
        hint_no_composed_songs: "No songs here, compose one!",
        hint_no_recorded_songs: "No songs here, record one!",
        hint_no_songs_in_folder: "No songs here, add one!",
        folder_empty: 'The folder is empty',
        midi_download_warning: "If you use MIDI, the song will loose some accuracy, if you want to share the song with others, use the other format (button above). Do you still want to download?",
        confirm_delete_folder: `Are you sure you want to delete the folder "{{folder_name}}"?  
            The songs won't be deleted`,
        filter_alphabetical: "Alphabetical",
        "filter_date-created": "Date created",
        open_in_composer: "Open in composer"
    },
    settings: {
        toggle_metronome: "Toggle metronome",
        change_keybinds: "Change keybinds",
        more_options: 'More options',
        memory_persisted: "Storage is persisted",
        memory_not_persisted: "Storage is not persisted",
        memory_persisted_description: ` Your data is persisted in the browser, the browser should not automatically clear it.
                            Always make sure to download a backup sometimes, especially when you will not use the app
                            for a long time`,
        memory_not_persisted_description: `The browser didn't allow to store data persistently, it might happen that you will loose
                            data
                            when cache is automatically cleared. To get persistent storage, add the app to the home
                            screen.
                            If that still doesn't work, make sure you do a backup often`,
        props: {
            composer_bpm: "Bpm",
            composer_bpm_description: "Beats per minute, the speed of the song. Usually the BPM inside the app should be 4 times the BPM of the song you are trying to compose",
            composer_base_pitch: "Base pitch",
            composer_base_pitch_description: "The main pitch of the song",
            composer_beat_marks: "Beat marks",
            composer_beat_marks_description: "The number of beats per measure, 3/4 is 3 beats per measure, 4/4 is 4 beats per measure",
            composer_note_name_type: "Note name type",
            composer_note_name_type_description: "The type of text which will be written on the note",
            composer_columns_per_canvas: "Number of visible columns",
            composer_columns_per_canvas_description: "How many columns are visible at a time, more columns might cause lag",
            composer_reverb: "Base reverb (cave mode)",
            composer_reverb_description: "Makes it sound like you are in a cave, this is the default value applied to every instrument",
            composer_autosave: "Autosave changes",
            composer_autosave_description: "Autosaves the changes to a song every 5 edits, and when you change page/change song",
            composer_use_keyboard_side_buttons: "Put next/previous column buttons around keyboard",
            composer_use_keyboard_side_buttons_description: "Puts the buttons to select the next/previous column on the left/right of the keyboard",
            composer_sync_tabs: "Autoplay in all tabs (pc only)",
            composer_sync_tabs_description: "Advanced feature, it syncs other browser tabs to all play at the same time",
            composer_lookahead_time: "Lookahead time",
            composer_lookahead_time_description: "How many milliseconds ahead the composer will look for notes to play, a higher value improves playback accuracy but feels less responsive",

            player_instrument: "Instrument",
            player_instrument_description: "The main (first) instrument of the player, will also be saved in the song you record",
            player_pitch: "Pitch",
            player_pitch_description: "The pitch of the player, will also be saved in the song you record",
            player_bpm: "Bpm",
            player_bpm_description: "Beats per minute, used by the metronome and will be used when converting the song with the composer",
            player_sync_song_data: "Auto sync the song's instruments and pitch",
            player_sync_song_data_description: "Whenever you load a song, the instruments and pitch of that song will be loaded too",
            player_metronome_beats: "Metronome beats",
            player_metronome_beats_description: "After how many times a stronger beat is played",
            player_metronome_volume: "Metronome volume",
            player_metronome_volume_description: "The volume of the metronome",
            player_reverb: "Reverb (cave mode)",
            player_reverb_description: "Makes it sound like you are in a cave",
            player_note_name_type: "Note name type",
            player_note_name_type_description: "The type of text which will be written on the note",
            player_keyboard_size: "Keyboard size",
            player_keyboard_size_description: "Scales the keyboard size",
            player_keyboard_y_position: "Keyboard vertical position",
            player_keyboard_y_position_description: "The vertical position of the keyboard",
            player_approach_speed: "Approach Rate (AR)",
            player_approach_speed_description: "The time between when the notes appear and when they reach the end (in ms)",
            player_note_animation: "Note animation",
            player_note_animation_description: "Toggle the animation of the notes (will reduce performance)",
            player_show_visual_sheet: "Show visual sheet",
            player_show_visual_sheet_description: "Show the sheet above the keyboard (might reduce performance)",

            vsrg_composer_keys: "Keys",
            vsrg_composer_keys_description: "How many keys the song has",
            vsrg_composer_bpm: "Bpm",
            vsrg_composer_bpm_description: "Beats per minute, the speed of the song",
            vsrg_composer_pitch: "Base pitch",
            vsrg_composer_pitch_description: "The main pitch of the song",
            vsrg_composer_is_vertical: "Vertical editor",
            vsrg_composer_is_vertical_description: "If the editor is set horizontally or vertically",
            vsrg_composer_max_fps: "Max FPS (high values could lag)",
            vsrg_composer_max_fps_description: "The FPS limiter of the editor, higher values could more lag",
            vsrg_scroll_snap: "Snap scroll to snap point",
            vsrg_scroll_snap_description: "When scrolling, snap the timestamp to the closest snap point",
            vsrg_composer_autosave: "Autosave changes",
            vsrg_composer_autosave_description: "Autosaves the changes to a song every 5 edits, and when you change page/change song",
            vsrg_composer_difficulty: "Difficulty",
            vsrg_composer_difficulty_description: "Higher values means the notes need to be pressed more accurately",

            vsrg_player_approach_time: "Approaching time",
            vsrg_player_approach_time_description: "The time between when the notes appear and when they reach the end (in ms)",
            vsrg_player_max_fps: "Max FPS",
            vsrg_player_max_fps_description: "The FPS limiter of the player, too high values could cause lag or stutters",
            vsrg_player_keyboard_layout: "Keyboard layout",
            vsrg_player_keyboard_layout_description: "The keyboard layout of the player",
            vsrg_player_offset: "Audio Offset",
            vsrg_player_offset_description: "An offset to the audio if it plays too early/late (in ms)",
            vsrg_player_vertical_offset: "Vertical position",
            vsrg_player_vertical_offset_description: "The Vertical offset for the line layout",
            vsrg_player_horizontal_offset: "Horizontal position",
            vsrg_player_horizontal_offset_description: "The Horizontal offset for the line layout",

            zen_instrument: "Instrument",
            zen_instrument_description: "The main instrument of the keyboard",
            zen_pitch: "Pitch",
            zen_pitch_description: "The pitch of the keyboard",
            zen_metronome_beats: "Metronome beats",
            zen_metronome_beats_description: "After how many times a stronger beat is played",
            zen_metronome_volume: "Metronome volume",
            zen_metronome_volume_description: "The volume of the metronome",
            zen_metronome_bpm: "Metronome bpm",
            zen_metronome_bpm_description: "The bpm of the metronome",
            zen_reverb: "Reverb (cave mode)",
            zen_reverb_description: "Makes it sound like you are in a cave",
            zen_note_name_type: "Note name type",
            zen_note_name_type_description: "The type of text which will be written on the note",
            zen_keyboard_size: "Keyboard size",
            zen_keyboard_size_description: "Scales the keyboard size",
            zen_keyboard_y_position: "Vertical position",
            zen_keyboard_y_position_description: "The vertical position of the keyboard",
            zen_keyboard_spacing: "Keyboard spacing",
            zen_keyboard_spacing_description: "The spacing between the notes",
        },
        category: {
            'keyboard': "Keyboard",
            'metronome': "Metronome",
            'layout_settings': "Layout settings",
            "player_settings": "Player settings",
            "song_settings": "Song settings",
            "composer_settings": "Composer settings",
            "editor_settings": "Editor settings",
        }
    },

    zen_keyboard: {
        loading_instrument: "Loading instrument: {{instrument}}..."
    },
    vsrg_composer: {
        delete_track_question: "Are you sure you want to remove this track? All notes will be deleted.",
        cannot_delete_last_track: "Cannot delete last track",
        snap: 'Snap', //this means snapping to a point, like anchoring to it
        add_new_instrument: "Add new instrument",
        background_song: "Background Song",
        background_song_info: "You can select one of your songs to be played on the background",
        no_background_song_selected: "No background song selected",
        instrument_modifiers: 'Instrument modifiers',
        tap: 'Tap',
        hold: 'Hold',
        delete: 'Delete'
    },
    transfer: {
        connecting_please_wait: "Connecting please wait...",
        error_connecting: "Error connecting, please visit the domain, there might be changelog.",
        import_data_from_other_domains_title: "Import data from other domains",
        import_data_from_other_domains_description: `Here you can import data from other existing domains of the app, select the domain you want to import
                from and click import.
                You will be shown all the data from the other domain, and you can select to import it all at once or
                only what you need.`,
        select_a_website_to_import_data: "Select a website to import data from",
        data: "Data", //data to import
        import_all: "Import all",
        no_data_to_import: "No data to import"
    },
    theme: {
        error_importing_theme: 'There was an error importing this theme, is it the correct file?',
        choose_theme_name: 'How do you want to name the theme?',
        confirm_delete_theme: `Are you sure you want to delete the theme "{{theme_name}}"?`,
        import_theme: "Import Theme",
        theme_prop: {
            background_image: 'Background image (URL)',
            composer_background_image: "Composer Background image (URL)",
            theme_name: "Theme name",
        },
        opaque_performance_warning: 'GIF backgrounds and opaque (transparent) colors could reduce performance',
        your_themes: "Your Themes",
        new_theme: "New Theme",
        default_themes: "Default Themes",
        preview: "Preview",
        view_player: "View player", //shows the player preview
        view_composer: "View composer"
    },
    sheet_visualizer: {
        note_names: "Note names",
        merge_empty_spaces: "Merge empty spaces",
        no_song_selected: "No song selected",
        print_as_pdf: "Print as PDF",
        sheet_visualizer_instructions: `Select a song from the menu on the left.
                    Remember that you can learn a song with the interactive
                    practice tool in the Player`,
        per_row: 'Per row', //elements per row
        invalid_song_to_visualize: 'Invalid song, it is not composed or recorded',
        error_converting_to_visual_song_try_convert_in_recorded: 'Error converting song to visual song, trying to convert to recorded song first...',
        error_converting_to_visual_song: "Error converting song to visual song"
    },
    player: {
        finish_recording: "Finish recording",
        record_audio: "Record audio",
        change_speed: "Change speed",
        stop_song: "Stop song",
        accuracy: "Accuracy",
        score: "Score",
        combo: "Combo",
        practice_mode: "Practice", //song practice
        practice_mode_description: `Practice song "{{song_name}}"`,
        approach_mode: "Approach mode", //TODO find new name for this, it's the mode where circles "come towards" notes
        approach_mode_description: `Play in Approach mode the song "{{song_name}}"`,
        song_search_no_results: "No results",
        song_search_description: "Here you can find songs to learn, they are provided by the sky-music library.",
        midi_or_audio_import_redirect_warning: "You cannot directly import this file format. MIDI, Video and Audio files need to be converted in the composer, do you want to open it?",
    },
    keybinds: {
        already_used_keybind: `This keybind is already used by the note  "{{note_name}}"`,
        midi_keybinds: "MIDI keybinds",
        keyboard_keybinds: "Keyboard keybinds",
        keyboard_keybinds_description: `You can remap the keyboard keys to whatever key on your keyboard, press the note you want to remap
                    then press the key you want to assign to it.`,
        composer_shortcuts: "Composer shortcuts",
        player_shortcuts: "Player shortcuts",
        vsrg_composer_shortcuts: "Vsrg composer shortcuts",
        vsrg_player_shortcuts: "Vsrg player shortcuts",
        vsrg_keybinds: "Vsrg keybinds",
        connected_midi_devices: "Connected MIDI devices",
        no_connected_devices: "No connected devices",
        midi_layout_preset: "MIDI layout preset",
        delete_midi_preset: "Delete preset",
        create_midi_preset: "Create new preset",
        midi_note_selection_description: `Click on the note to select it, then press your MIDI keyboard to assign that note to the key. You
                    can click it again to change it.`,
        midi_shortcuts: "MIDI Shortcuts",
        confirm_delete_preset: `Are you sure you want to delete the preset "{{preset_name}}"?`,
        cannot_delete_builtin_preset: "Cannot delete built-in preset",
        already_existing_preset: "Preset with this name already exists",
        ask_preset_name: "Write the name of the preset",
        key_already_used: "Key already used",
        cannot_edit_builtin_preset: 'Cannot edit built-in preset, create a new one to edit it',
    },
    error: {
        confirm_delete_all_songs: "Are you sure you want to delete ALL SONGS?",
        settings_reset_notice: "Settings have been reset",
        error_page_description: `If you unexpectedly see this page it means an error has occoured.
            Here you can download or delete your songs, if one caused an error, delete it.
            If you need help, join our discord server and send the log file below.`,
        reset_settings: "Reset settings",
        delete_all_songs: "Delete all songs",
        error_logs: "Error logs",
        download_logs: "Download logs",
    },
    donate: {
        donate_message: `Each App I make takes months of learning and development. Added to that
            are also the costs of hosting. With a higher budget I can afford to not
            worry so much about how much I spend on the server, giving you the best
            possible experience.
            
            I care about giving users all features without
            having to pay for it, neither having intrusive ads which can be annoying.
            For this same reason, there is no source of income except donations.


            I would be really thankful if you could consider donating in order to fund
            development and costs.`
    },
    cache: {
        cache: 'Cache',
        reset_cache: "Reset cache",
        reset_cache_message: `This page will clear the cache of the application. This will remove all cached data and reload the page.
                It will not
                delete your songs or data, only the cached assets. As soon as you visit this page, it will clear the
                cache automatically.
                You can also click the button below to clear the cache manually.`,
        clear_cache: 'Clear Cache'
    },
    changelog: {
        view_error_logs: "View Error logs",
    },
    page404: {
        page_not_found: "The page was not found, click here to go back to the home page"
    },
    backup: {
        confirm_after_songs_validation_error: "There were errors validating some songs. Do you want to continue downloading?",
        confirm_after_folders_validation_error: "There were errors validating some folders. Do you want to continue downloading?",
        confirm_after_themes_validation_error: "There were errors validating some themes. Do you want to continue downloading?",
        confirm_delete_songs_step_1: "Write 'delete' if you want to delete all songs, press cancel to ignore", //do not translate 'delete'
        confirm_delete_songs_step_2: "Are you REALLY sure you want to delete all songs?",
        confirm_delete_themes_step_1: "Write 'delete' if you want to delete all themes, press cancel to ignore", //do not translate 'delete'
        confirm_delete_themes_step_2: "Are you REALLY sure you want to delete all themes?",
        deleted_all_songs_notice: "Deleted all songs",
        deleted_all_themes_notice: "Deleted all themes",
        error_validating_song: `Error validating song "{{song_name}}"`,
        error_validating_folder: `Error validating folder "{{folder_name}}`,
        error_validating_theme: `Error validating_theme "{{theme_name}}"`,
        validating_songs: "Validating songs",
        validating_folders: "Validating folders",
        validating_themes: "Validating themes",
        action_cancelled: 'Action cancelled',
        zipping_files: "Zipping files",
        transfer_from_other_domain: "Transfer from other domain",
        transfer_data_notice: "If you want to transfer your data from another domain of the app, click here",
        transfer: "Transfer",
        backup_as: "Backup as",
        backup_advice: `            Make sure you create a backup every now and then. Especially if you just finished a new song.
            The browser shouldn't delete your data, especially if you installed the app, but there is always a chance.`,
        backup_download_tooltip: "Download all the data of the app, aka themes, songs, folders",
        backup_downloaded: "Downloaded backup",
        backup_download_error: "Error downloading backup",
        download_all_backup: "Download all backup",
        download_all_backup_tooltip: "Downloads a backup containing all songs and folders",
        no_items_to_backup: "There is nothing to backup",
        download_songs_tooltip: "Downloads a backup containing all songs and folders",
        downloaded_songs_notice: "Downloaded songs backup",
        download_songs_backup: "Download songs backup",
        download_themes_tooltip: "Downloads a backup of all the custom themes",
        no_themes_to_backup: "There are no themes to backup",
        downloaded_themes_notice: "Downloaded themes backup",
        download_themes_backup: "Download themes backup",
        import_backup: "Import backup",
        import_backup_description: `If you have a backup, you can import it here, they will be added to your existing data. (if you already have
            the same song,
            a duplicate will be created).`,
        error_reading_file: "There was an error reading the file",
        import_backup_tooltip: "Here you can import any backup you have",
        songs: "songs",
        themes: "themes",
        delete_data: "Delete data",
        delete_data_description: `If you want, you can also delete all your data here, once deleted it can't be recovered.
            Don't worry you will be asked to confirm before anything is deleted.`,
        delete_songs_and_folders: "Delete songs and folders",
        delete_songs_and_folders_tooltip: "Here you can delete all your themes",
        delete_themes_tooltip: "Here you can delete all your themes",
        delete_themes: "Delete themes",
    },
    composer: {
        add_new_page: "Add new page",
        remove_column: "Remove column",
        add_column: "Add column",
        open_tools: "Open tools",
        clone_song: "Clone song",
        remove_breakpoint: "Remove breakpoint",
        add_breakpoint: "Add breakpoint",
        cant_remove_all_layers: "You can't remove all layers!",
        confirm_layer_remove: `Are you sure you want to remove "{{layer_name}}"? ALL NOTES OF THIS LAYER WILL BE DELETED`,
        cant_add_more_than_n_layers: `You can't add more than {{max_layers}} layers!`,
        ask_song_name_for_composed_song_version: "Write the song name for the composed version, press cancel to ignore",
        start_recording_audio: "Start recording audio",
        stop_recording_audio: "Stop recording audio",
        create_new_song: "Create new song",
        create_from_midi_or_audio: "Create from MIDI/Audio",
        previous_breakpoint: "Previous Breakpoint", //breakpoint is a sort of point to "jump", a sort of bookmark
        next_breakpoint: "Next Breakpoint",
        tempo: "Tempo", //this is musical tempo
        error_with_this_layer: "There was an error with this layer",
        recording_audio: "Recording Audio",
        tools: {
            move_notes_up: "Move notes up",
            move_notes_up_description: "Push notes up by 1 position",
            move_notes_down: "Move notes down",
            move_notes_down_description: "Push notes down by 1 position",
            only_layer: "Only layer", //this will be used as Only layer 1... etc
            clear_selection: "Clear selection",
            all_layers: "All layers",
            all_layers_description: "Select all the layers in the highlighted columns",
            paste_in_layer_n: "Paste in layer {{layer_number}}",
            insert_in_layer_n: "Insert in layer {{layer_number}}",
            paste_all_layers: "Paste all",
            insert_all_layers: "Insert all",
            select_layer_description: "Select all the notes in the highlighted columns or only the ones of the current layer",
            delete_selected_columns: "Delete selected columns",
            erase_all_selected_notes: "Erase all selected notes",
            insert_copied_notes: "Insert copied notes",
            paste_copied_notes: "Paste copied notes",
            copy_notes: "Copy all notes"
        },
        midi_parser: {
            out_of_range: "Out of range",
            accidentals: "Accidentals",
            total_notes: "Total notes",
            select_midi_tracks: "Select MIDI tracks",
            ignore_empty_tracks: "Ignore empty tracks",
            include_accidentals: "Include accidentals",
            global_note_offset: "Global note offset",
            global_note_offset_description: `The index of each note will be pushed up/down by this amount, you can use it to make
                            the song fit into the app range. You can also change the offset of each layer.`,
            local_note_offset: "Local track notes offset",
            local_note_offset_description: " Changes the index of each note by this amount.",
            max_octave_scaling: "Max notes octave scaling",
            max_octave_scaling_description: " Scale down/up the notes which are out of scale by theose octaves.",
            number_of_notes: "Number of notes",

            open_midi_audio_file: "Open MIDI/Audio/Video file",
            there_are_no_notes: "There are no notes",
            error_is_file_midi: "There was an error importing this file, is it a .mid file?",
            converting_audio_to_midi: "Converting audio to midi (might take a while)..",
            detecting_notes: "Detecting notes",
            loading_converter: 'Loading converter',
            audio_conversion_warning: `🔬 This feature is experimental, it might not work or get stuck. \nAudio and video conversion is less accurate than MIDI, if you can, it's better to use MIDI or compose manually. \nUse audio and videos that have only one instrument playing.`
        }

    },
    instrument_settings: {
        no_instrument_selected: "No instrument selected",
        layer_name: "Layer name",
        use_song_pitch: "Use song pitch",
        use_song_reverb: "Use song reverb",
        note_icon: "Note icon",
        volume: "Volume",
        volume_high_warning: "If you hear distortion, reduce the volume",
        move_down: "Move down",
        move_up: "Move up",
    }
} as const