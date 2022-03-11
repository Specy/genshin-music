type Update = {
    version: string
    title: string
    date: string
    changes: string[]
}

export const updates: Update[] = [
    {
        version: '2.5',
        title: 'Composer improvements',
        date: '2022- 06/03',
        changes: [
            'Improved the rendering of the composer to be more sharp and easier to see on mobile',
            'Added 4th layer in the composer',
            'Added theming of more parts of the composer',
            'App rewrite in TypeScript',
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
