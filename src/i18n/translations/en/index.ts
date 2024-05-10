export const i18n_en = {
    logs: {
        update_available: "There is a new version of the app available, do you want to reload to update? Make sure you close/refresh other tabs of the app",
        error_with_the_app: "There was an error with the app!",
        loading_instruments: "Loading instruments...",
        could_not_find_song: "Could not find song",
        error_loading_instrument: "There was an error loading the instrument",
        error_importing_song: 'There was an error importing the song',
        error_downloading_audio: "There was an error downloading the audio, maybe the song is too long?",
        song_downloaded: "Song downloaded",
        error_downloading_song: "Error downloading song",
        error_importing_file: ""
    },
    question: {
        unsaved_song_save: `You have unsaved changes to the song: "{{song_name}}" do you want to save now? UNSAVED CHANGES WILL BE LOST`,
        enter_song_name: "Enter song name",
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
        confirm: "Confirm",
        loading: "Loading",
        privacy: "Privacy",
        donate: "Donate",
        open: "Open",
        play: "Play",
        record: "Record", //start recording
        stop: "Stop",
        pause: "Pause",
        settings: "Settings",
        search: "Search",
        rename: "Rename",
        create_song: "Create song",
        none: "None",
        download: "Download",
        pitch: "Pitch", //audio pitch
        bpm: 'bpm',
        connect: "Connect",
        import: "Import",
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
        open_settings: "Open settings",
        open_home_menu: "Open home menu",
        settings: "Settings",
        song_menu: "Song menu",
        help: "Help",
        settings_menu: "Settings menu",
        song_name: "Song name",
        go_back: "Go back",
        play_song: "Play song",
        invalid_song: "Invalid song",
        download_song: "Download song {{song_name}}",
        delete_song: "Delete song {{song_name}}"
    },
    settings: {
        toggle_metronome: "Toggle metronome",
        change_keybinds: "Change keybinds",
        more_options: 'More options'
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
        vsrg_keybinds: "Vsrg keybinds"
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
        error_importing_file: `Error importing file "{{file_name}}}"`,
        validating_songs: "Validating songs",
        validating_folders: "Validating folders",
        validating_themes: "Validating themes",
        write_delete_to_delete: "",
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
        no_songs_to_backup: "There are no songs to backup",
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
        cant_remove_all_layers: "You can't remove all layers!",
        confirm_layer_remove: `Are you sure you want to remove "{{layer_name}}"? ALL NOTES OF THIS LAYER WILL BE DELETED`,
        cant_add_more_than_n_layers: `You can't add more than {{max_layers}} layers!`,
        ask_song_name_for_composed_song_version:"Write the song name for the composed version, press cancel to ignore"
    }
} as const



