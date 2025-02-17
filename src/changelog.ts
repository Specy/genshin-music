import {APP_NAME} from "$config";

type Update = {
    version: string
    title: string
    date: Date
    changes: string[]
}

export const CHANGELOG: Update[] = [
    {
        version: '3.6.1',
        title: "Improved timing",
        date: new Date('2025-02-17'),
        changes: [
            "Improved timing in the whole app, songs might play slightly faster now as they are more accurately following the BPM. You might need to decrese the BPM, especially for songs that have it very high."
        ]
    },
    {
        version: '3.6.0',
        title: "Multi color rows" + (APP_NAME === 'Genshin' ? ' and new instruments' : ''),
        date: new Date('2025-01-04'),
        changes: [
            "In the sheet visualizer you can now select the rows to have different background colors",
            ...(APP_NAME === 'Genshin' ? ["Added Ukulele and Djem Djem Drum"] : []),
        ]
    },
    {
        version: '3.5.0',
        title: "Loop, Visual sheets settings, Turkish translation",
        date: new Date('2024-07-02'),
        changes: [
            'Added looping of section for practice/playing/approaching mode',
            'The notes of the section to repeat can now be also be written as a number',
            'Added ability to hide notes in practice mode, to help you test your memory of the song',
            'You can now select how many chunks to show in the visual sheet',
            'Added Turkish translation',
        ]
    },
    {
        version: '3.4.1',
        title: "Indonesian, Portuguese translations",
        date: new Date('2024-06-01'),
        changes: [
            "Added Indonesian and Portuguese translation",
            "Bug fixes to MIDI connection",
            "Bug fixes on old iOS devices",
        ]
    },
    {
        version: '3.4.0',
        title: "Translations",
        date: new Date('2024-05-24'),
        changes: [
            "Added chinese translation, we are looking for translators!",
            "Added button to install app to home screen",
            "Added custom keyboard layout as a note name type",
            "Added \"your keyboard layout\" note name type, which uses your device's keyboard layout",
            "Bug fixes and improvements",
        ]
    },
    {
        version: '3.3.0',
        title: "Audio/Video transcription, reverb",
        date: new Date('2024-04-08'),
        changes: [
            "Added tool in the composer to convert audio/video to a sheet",
            "Reverb now can be set for each instrument",
            "Added quick settings in the zen keyboard",
            "Added customisable presets in MIDI settings",
            "Improved MIDI connection",
            "Zen keyboard now emits MIDI notes events when pressed",
            "Changed Sky Music Nightly icon",
            //"Added personal custom layout in the visual song",
            "Added app's blog",
            "Other bug fixes and improvements"
        ]
    },
    {
        version: '3.2.0',
        title: "Shortcuts, Do Re Mi, performance, Layers",
        date: new Date('2023-07-26'),
        changes: [
            "All shortcuts and keyboard layout are now customizable",
            "Added Do Re Mi layout with note shifting",
            "Rewrote app in next.js, improving performance and navigation",
            "Improved theming in the composer",
            "Added opacity to the composer and custom layers colors",
            "Added new visual sheet format with more info",
            "Added song search",
            "Increased composer layers limit to 52",
            "Improved composer sliding controls",
            "(Sky) Added new instruments: TR-909, BassSynth, SineSynth and ChimesSynth",
            "Changed the file formats so they can be double clicked to open",
            "Added export as zip file",
            "Added two new default themes",
            "Added lookahead settings to the composer to improve audio accuracy",
            "Other bug fixes and improvements"
        ]
    },
    {
        version: '3.1.0',
        title: 'Aurora, transparency and layouts',
        date: new Date('2022-02-16'),
        changes: [
            "Added aurora (Sky)",
            "Added switch/playstation layouts (Sky)",
            "Added backup warnings",
            "Added tranparency to themes",
            "Other bug fixes and improvements"
        ]
    },
    {
        version: '3.0.1',
        title: 'Performance and bug fixes',
        date: new Date('2022-01-11'),
        changes: [
            "Fixed an IOS bug preventing audio from playing",
            "Improved performance for users that have many songs",
            "Added tempo changer quick selection in the composer tools",
            "Other bug fixes and improvements"
        ]
    },
    {
        version: '3.0',
        title: 'VSRG mode, Zen keyboard, Calls and more!',
        date: new Date('2022-09-18'),
        changes: [
            "Added VSRG mode to compose and play vsrg songs",
            "Added Zen keyboard, where you can simply focus on playing by hand",
            "Added Visual sheet to the player",
            "Added app scaling",
            "Added alphabetical folder ordering",
            "Added backup page",
            "(Genshin) added vintage lyre",
            "(Sky) Added SFX of the calls and dance emote",
            "Changed metronome sounds",
            "Improved player performance",
            "Multi type export, you can now export/import songs, folders, themes etc",
            "Fixed bug that would remove a song from the folder when saved",
            "Fixed bug that would not play audio",
            "Fixed issues when opening/saving songs in the composer",
            "Fixed bug in pasting notes in the composer",
            "Exporting a song would not work in sky music and sky studio",
            "Other bug fixes and improvements",
        ]
    }, {
        version: '2.8',
        title: 'More Composer layers and UI rework',
        date: new Date('2022-07-07'),
        changes: [
            "Increased instrument limit in the composer to 30",
            "Redesigned the tools in the composer",
            "Added UNDO to the composer tools",
            "Added paste/insert to certain layer",
            "Added tool to move notes up/down",
            "Added metronome in player",
            "Added multiple instruments in player",
            "Added more tooltips, also for mobile",
            "Bug fixes and improvements"
        ]
    },
    {
        version: '2.7',
        title: 'Song rename, MIDI export, folders',
        date: new Date('2022-06-15'),
        changes: [
            "Added option to rename songs",
            "Song names are not unique anymore",
            "Added folders and new song menu UI",
            "Added MIDI export of a song (DO NOT USE INSTEAD OF NORMAL FORMAT)",
            "Improved song playback in the player",
            "Fixed some bugs"
        ]
    },
    {
        version: '2.6',
        title: 'Light guitar & Tooltips',
        date: new Date('2022-05-30'),
        changes: [
            "Added tooltips",
            "Added help buttons",
            "Added Light guitar (Sky, notes can't be held)",
            "Bug fixes for main page loading songs",
            "Added drag and drop in the composer",
            "Composer on pc now resizes with the page",
            "Fixed some bugs"
        ]
    },
    {
        version: '2.5',
        title: 'Composer improvements',
        date: new Date('2022-03-27'),
        changes: [
            'Improved the rendering of the composer to be sherper and easier to see on mobile',
            'Improved performance in the composer',
            'Added 4th layer in the composer',
            'Added theming of more parts of the composer',
            'App rewrite in TypeScript',
            'Bug fixes'
        ]
    },
    {
        version: '2.4',
        title: 'Multi Slider and Themes',
        date: new Date('2022-02-15'),
        changes: [
            'Added app themes, fully customise the look of the app',
            'Added start and end slider for selecting which part of the song to play/practice',
            'Bug fixes'
        ]
    }, {
        version: '2.3',
        title: 'MIDI Keyboard and Performance',
        date: new Date('2022-02-03'),
        changes: [
            'Added MIDI Keyboard support on all pages with custom layouts and shortcuts',
            'Big performance improvements of main page',
            'Added note names to sheet visualizer and empty cells',
            'Added ABC format',
            'Added Panflute (Sky)',
            'UI improvements and bug fixes'
        ]
    }, {
        version: '2.2',
        title: 'Sheet visualizer',
        date: new Date('2022-01-17'),
        changes: [
            'Added sheet visualizer',
            'Changed timeline behaviour when dragging the scroll bar',
            'Improved performance by 2 times in some places',
            'UI improvements and bug fixes'
        ]
    },
    {
        version: '2.1.1',
        title: 'Zither and icons',
        date: new Date('2021-12-16'),
        changes: [
            'Changed note icon and animation (Genshin)',
            'Added Help page',
            'Changed zither audio (Genshin)',
            'UI improvements'
        ]
    },
    {
        version: '2.1',
        title: 'Home menu and pages',
        date: new Date('2021-12-11'),
        changes: [
            'Restructured code',
            'Added opacity to some elements',
            'Changed margins and padding of some elements',
            'Added home page',
            'Added Partners page',
            'Added shortcuts for main page',
            'Fixed loading bug in composer and main page',
            'Added Donate page'
        ]
    },
    {
        version: '2.0',
        title: 'Approaching circles',
        date: new Date('2021-11-28'),
        changes: [
            `Added Approaching cirlces mode, a new way to learn a song, or a way to challange yourself.
            You can find it in the main page, next to the practice button`,
            `Rewrite of the main page to increase overall performance`,
            `Added changelog page`,
            `Added audio recording feature in main page and composer`,
            `Added tabs autoplay (composer) on pc as a setting`,
            `Added note animations when pressing the note`,
            `Added possibility to change background image from URL`,
            `Updated info page`,
            `In the composer you can now press shift + note name to add a note`,
            `In the composer you can press up/down keys to change layer`,
            `While in the composer on PC, you can now add new notes by simply pressing the PC keyboard while in "playing" mode`
        ]
    }, {
        version: '1.7',
        title: 'Zither',
        date: new Date('2021-10-20'),
        changes: [
            '(For genshin) Added Zither',
            'Added back "do re mi" format'
        ]
    }, {
        version: '1.6',
        title: 'Performance tweaks',
        date: new Date('2021-10-17'),
        changes: [
            'Performance of composer improved by 2x',
            'Added note names for genshin (made it a setting)',
            'Fixed instrument volume bug',
            'Fixed keyboard layout issues',
            'Fixed other small bugs'
        ]
    }, {
        version: '1.5',
        title: 'MIDI import',
        date: new Date('2021-10-14'),
        changes: [
            `Added to both Sky and Genshin music nightly the MIDI import feature $l
            - Music track selection (select or deselect which tracks to include) $l
            - Instrument track selection (select what instrument to give to each track) $l
            - Track info (get info on how successful your parsing was, accidentals and notes out of range) $l
            - Change note offset (in case that the song is outside of the octaves available) 
            `
        ]
    }, {
        version: '1.4',
        title: 'Song library',
        date: new Date('2021-08-28'),
        changes: [
            'Added song library integration, directly import songs from the app (700+ songs)',
            'Bug fixes'
        ]
    }, {
        version: '1.3',
        title: 'New audio files',
        date: new Date('2021-08-25'),
        changes: [
            'Changed audio files',
            'Added ocarina',
            'Removed support button in TWA',
            'Bug fixes'
        ]
    }, {
        version: '1.2',
        title: 'Bug fixes and PWA',
        date: new Date('2021-08-18'),
        changes: [
            "(For sky) Fixed bug where sheets couldn't be imported in sky studio",
            'Changed app install to more modern approach with description and images'
        ]
    }, {
        version: '1.1',
        title: 'Sheets compatibility',
        date: new Date('2021-08-07'),
        changes: [
            '(For sky) Added backwards compatibility for sheets, now sheets made in sky music nightly can be imported into sky music and sky studio (with some losses)',
            'Bug fixes',
            'General improvement in performance'
        ]
    }, {
        version: '1.0',
        title: 'Release',
        date: new Date('2021-05-22'),
        changes: [
            '3 Instruments composition',
            'Better performance than previous version',
            'Better practice tool',
            'Better interface',
            'Breakpoints for the composer',
            'New features for both composer and main page',
            'Feature rich customisability to make learning and composition easier'
        ]
    }
]
