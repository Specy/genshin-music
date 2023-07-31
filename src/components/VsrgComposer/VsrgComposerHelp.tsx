import helpImg from '$/assets/images/help-vsrg-composer.png';
import { keyBinds } from '$stores/KeybindsStore';
import Image from 'next/image';
import sh from "$cmp/HelpTab/HelpTab.module.css"
import { useObservableMap } from '$lib/Hooks/useObservable';
import { useConfig } from '$lib/Hooks/useConfig';
import { Key, ShortcutsTable } from '$cmp/HelpTab/ShortcutsHelp';
import Link from 'next/link';
import { AppButton } from '$cmp/Inputs/AppButton';

export function VsrgComposerHelp() {
    const keys = keyBinds.getVsrgKeybinds(6)
    const { IS_MOBILE } = useConfig()
    const [vsrgComposerShortcuts] = useObservableMap(keyBinds.getShortcutMap("vsrg_composer"))
    return <>
        <div className="column">
            <div className='column' style={{ padding: '0.4rem' }}>
                <h2 style={{ margin: 0 }}>Vsrg Composer info</h2>
                <p style={{ marginLeft: '0.4rem' }}>
                    This is a composer to create beatmaps for the songs you have in the app.
                    Here are explained how the composer works and how to use it.
                </p>
                <h2 style={{ margin: 0 }}>
                    How to use
                </h2>
                <p style={{ marginLeft: '0.4rem' }}>
                    You start off by selecting the song you want to create a beatmap for, you can find it in the Settings
                    as "background song", you can mute and hide the layers of the song, the shown layers will have the notes appear in the
                    timeline above the composer.
                    <br /><br />
                    Then you can select the bpm of the beatmap, usually it should be the same of the song or /2 or /4 of it.
                    You can then select the different snap points, it's where the notes will be placed when you click on the editor.
                    Then you can add notes to the editor by clicking them or using the keyboard.
                    Once finished you can test the song in the vsrg player
                </p>
            </div>
            <Image
                src={helpImg}
                alt="tutorial for the vsrg composer page"
                className={sh['help-img']}
                loading="lazy"
            />
            <ol>
                <li>Selected hit object</li>
                <li>Held hit object</li>
                <li>Background song notes</li>
                <li>Instruments</li>
                <li>Selected hit object's notes</li>
                <li>Hit object type</li>
                <li>Horizontal scaling</li>
                <li>Slow down / Speed up the playback</li>
                <li>BPM Snap points</li>
                <li>Current timestamp in the timeline</li>
                <li>Add/Remove breakpoint</li>
            </ol>
            {
                !IS_MOBILE && <>
                    <div className={sh['help-title']}>
                        VSRG Composer shortcuts
                    </div>
                    <div className={sh['help-margin-left']}>
                        <ShortcutsTable shortcuts={vsrgComposerShortcuts} />
                        <div className='row' style={{padding: '0.1rem', gap: "1rem", marginTop: "-0.1rem"}}>
                            <Key>{keys.join("/")}</Key>
                            <div> Add hit object (syncs to the registered keybinds) </div>
                        </div>
                        <Link href={'/keybinds'} style={{ marginTop: "1rem" }}>
                            <AppButton>
                                Change shortcuts
                            </AppButton>
                        </Link>
                    </div>
                </>
            }
        </div>
    </>
}