import { APP_NAME } from '$config'
import composerImg from '$/assets/images/help-composer.png'
import playerImg from '$/assets/images/help-player.webp'
import { useConfig } from '$lib/Hooks/useConfig'
import { HelpTooltip } from '$cmp/Utility/HelpTooltip'
import Image from 'next/image'
import sh from '$cmp/HelpTab/HelpTab.module.css'
import { useObservableMap } from '$lib/Hooks/useObservable'
import { Shortcut, keyBinds } from '$stores/KeybindsStore'
import Link from 'next/link'
import { AppButton } from '$cmp/Inputs/AppButton'
import { ShortcutsTable } from './ShortcutsHelp'
export function HelpTab() {
    const { IS_MOBILE } = useConfig()
    const [composerShortcuts] = useObservableMap(keyBinds.getShortcutMap("composer"))
    const [playerShortcuts] = useObservableMap(keyBinds.getShortcutMap("player"))

    return <>
        <span>
            {IS_MOBILE
                ? 'Long press the buttons to see a tooltip. '
                : 'Hover over the buttons to see a tooltip. '
            }

            When clicking
            <HelpTooltip
                parentStyle={{
                    display: 'inline-flex'
                }}
                buttonStyle={{
                    width: '1.2rem',
                    height: '1.2rem',
                    margin: '0 0.4rem'
                }}
            >
                Example help
            </HelpTooltip>
            it will show you more info.
        </span>
        {APP_NAME === "Sky" && <span>
            The images are from the genshin version of the app, but the functionality is the same
        </span>}
        <div className={sh['help-title']}>
            Player
        </div>
        <div style={{margin: "1rem"}}>
                The player is meant to help you record a song by hand or practice an existing song with the two 
                practice tools. <br/>
                You can also import songs / record audio of the keybord and play freely, you also have a metronome to help you with the tempo. <br/>
                If you want a more simple keyboard you can use the <Link style={{color: 'var(--accent)'}} href={'/zen-keyboard'}>Zen keyboard</Link> <br/>
                In the settings you can change the instrument, pitch, reverb, volume, keyboard size, etc...
        </div>
        <div>
            <Image
                src={playerImg}
                alt='tutorial for the main page'
                className={sh['help-img']}
                loading='lazy'
            />
            <ol>
                <li>Record the keyboard as an audio file</li>
                <li>The selection where you want the song to start/end</li>
                <li>Playback speed</li>
                <li>Restart the song from the selected starting point</li>
                <li>Practice tool note, you should press this note</li>
                <li>Practice tool note, this will need to be clicked after all the red ones</li>
                <li>Public Song library</li>
                <li>Your songs</li>
                <li>Open the Page selection menu</li>
                <li>Visual sheet of the song</li>
            </ol>
        </div>
        {
            !IS_MOBILE && <>
                <div className={sh['help-title']}>
                    Player shortcuts
                </div>
                <div className={sh['help-margin-left']}>
                    <ShortcutsTable shortcuts={playerShortcuts} />
                    <Link href={'/keybinds'} style={{ marginTop: "1rem" }}>
                        <AppButton>
                            Change shortcuts
                        </AppButton>
                    </Link>
                </div>
            </>
        }

        <div className={sh['help-title']}>
            Composer
        </div>
        <div style={{margin: "1rem"}}>
            The composer is meant to help you create songs with many tools and features to help you with creation/transposition of songs. <br/>
            You can use multiple instruments, each with a different pitch and volume, change tempo in small sections with tempo changers and use breakpoints to more quickly navigate the song. <br/>
            If you don't want to transpose a song by hand, you can use the automatic MIDI converter which will help you get started with the transposition by converting as much as it can into the app format, as there are no accidentals and because of the size of the keyboard, not all songs can be directly converted. <br/>
            Alternatively there is also an Audio/Video converter which is less accurate but can convert any one instrument song into the app format. <br/>
            In the settings you can change the base pitch, bpm, beatmarks etc...
        </div>
        <div>
            <Image
                src={composerImg}
                alt='tutorial for the composer'
                className={sh['help-img']}
                loading='lazy'
            />
            <ol>
                <li>Go to the next / previous breakpoint</li>
                <li>Timeline of the breakpoints</li>
                <li>Open the tools</li>
                <li>Add 16 columns to the end</li>
                <li>Remove the current selected column</li>
                <li>Add column after the current one</li>
                <li>Layer (instrument) selection</li>
                <li>Change column's duration</li>
            </ol>
        </div>

        {
            !IS_MOBILE && <>
                <div className={sh['help-title']}>
                    Composer shortcuts
                </div>
                <div className={sh['help-margin-left']}>
                    <ShortcutsTable shortcuts={composerShortcuts} />
                    <Link href={'/keybinds'} style={{ marginTop: "1rem" }}>
                        <AppButton>
                            Change shortcuts
                        </AppButton>
                    </Link>
                </div>
            </>
        }
    </>
}

