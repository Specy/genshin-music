import { SimpleMenu } from 'components/SimpleMenu'
import MenuItem from 'components/MenuItem'
import { FaGithub } from 'react-icons/fa'
import './Changelog.css'

export default function Changelogpage(props) {
    return <div className='changelog-page'>
        <div className='changelog-page-title'>
            Changelog
        </div>
        <SimpleMenu functions={{changePage: props.changePage}}>
            <MenuItem>
                <a href='https://github.com/Specy/genshin-music' className='icon' target="_blank" rel='noreferrer'>
                    <FaGithub />
                </a>
            </MenuItem>
        </SimpleMenu>
        {changelogs.map(e => <ChangelogRow
            data={e}
            key={e.version}
        />)}
        <div className='changelog-ending'>

        </div>
    </div>
}

function ChangelogRow(props) {
    const { version, title, changes, date } = props.data
    return <div className='changelog-wrapper'>
        <div className='changelog-title'>
            <div className='clt-1'>
                {version}
            </div>
            <div className='clt-2'>
                {date}
            </div>
        </div>
        <div className='changelog-list'>
            <div className='cll-1'>
                {title}
            </div>
            <ul>
                {changes.map((e, i) =>
                    <li key={i}>
                        {e.split('$l').map((item, i, arr) => {
                            if (i === 0) {
                                return <div key={i}>{item}</div>
                            }
                            return <p key={i} className='cll-new-line'>
                                {item}
                            </p>
                        })}
                    </li>
                )}
            </ul>
        </div>

    </div>
}
const changelogs = [
    {
        version: '2.2',
        title: 'Sheet displayer',
        date: '2021 - 3/12',
        changes: [
            'Added sheet displayer',
            'Changed timeline behaviour when dragging the scroll bar',
            'fixed UI issues and bug fixes',
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
