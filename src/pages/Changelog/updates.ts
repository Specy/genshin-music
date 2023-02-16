type Update = {
    version: string
    title: string
    date: string
    changes: string[]
}

export const updates: Update[] = [
    {
        version: '3.1.0',
        title: 'Aurora, transparency and layouts',
        date: '2022 - 16/02',
        changes: [
            "Added aurora (Sky)",
            "Added switch/playstation layouts (Sky)",
            "Added backup warnings",
            "Added tranparency to themes",
            "Bug fixes and improvements"
        ]
    },
    {
        version: '3.0.1',
        title: 'Performance and bug fixes',
        date: '2022 - 01/11',
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
        date: '2022 - 18/09',
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
            "Other bug fixes and features...",
        ]
    },{
        version: '2.8',
        title: 'More Composer layers and UI rework',
        date: '2022 - 7/07',
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
        date: '2022 - 15/06',
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
        date: '2022 - 30/05',
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
        date: '2022 - 27/03',
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
        date: '2022 - 15/02',
        changes: [
            'Added app themes, fully customise the look of the app',
            'Added start and end slider for selecting which part of the song to play/practice',
            'Bug fixes'
        ]
    },{
        version: '2.3',
        title: 'MIDI Keyboard and Performance',
        date: '2022 - 3/02',
        changes: [
            'Added MIDI Keyboard support on all pages with custom layouts and shortcuts',
            'Big performance improvements of main page',
            'Added note names to sheet visualizer and empty cells',
            'Added ABC format',
            'Added Panflute (Sky)',
            'UI improvements and bug fixes'
        ]
    },{
        version: '2.2',
        title: 'Sheet visualizer',
        date: '2022 - 17/01',
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
        date: '2021 - 16/12',
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
        date: '2021 - 11/12',
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
        date: '2021 - 28/11',
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
        date: '2021 - 20/10',
        changes: [
            '(For genshin) Added Zither',
            'Added back "do re mi" format'
        ]
    }, {
        version: '1.6',
        title: 'Performance tweaks',
        date: '2021 - 17/10',
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
        date: '2021 - 14/10',
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
        date: '2021 - 28/08',
        changes: [
            'Added song library integration, directly import songs from the app (700+ songs)',
            'Bug fixes'
        ]
    }, {
        version: '1.3',
        title: 'New audio files',
        date: '2021 - 25/08',
        changes: [
            'Changed audio files',
            'Added ocarina',
            'Removed support button in TWA',
            'Bug fixes'
        ]
    }, {
        version: '1.2',
        title: 'Bug fixes and PWA',
        date: '2021 - 18/08',
        changes: [
            "(For sky) Fixed bug where sheets couldn't be imported in sky studio",
            'Changed app install to more modern approach with description and images'
        ]
    }, {
        version: '1.1',
        title: 'Sheets compatibility',
        date: '2021 - 07/08',
        changes: [
            '(For sky) Added backwards compatibility for sheets, now sheets made in sky music nightly can be imported into sky music and sky studio (with some losses)',
            'Bug fixes',
            'General improvement in performance'
        ]
    }, {
        version: '1.0',
        title: 'Release',
        date: '2021 - 22/05',
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
