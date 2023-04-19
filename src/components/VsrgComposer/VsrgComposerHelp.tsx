import helpImg from '$/assets/images/help-vsrg-composer.png';
import { keyBinds } from '$stores/KeybindsStore';
import Image from 'next/image';
import { Key } from '../HelpTab';


export function VsrgComposerHelp() {
    const keys = keyBinds.getVsrgKeybinds(6)
    return <>
        <div className="column">
            <div className='column' style={{padding: '0.4rem'}}>
                <h2 style={{margin: 0}}>Vsrg Composer info</h2>
                <p style={{marginLeft: '0.4rem'}}>
                    This is a composer to create beatmaps for the songs you have in the app.
                    Here are explained how the composer works and how to use it.
                </p>
                <h2 style={{margin: 0}}> 
                    How to use
                </h2>
                <p style={{marginLeft: '0.4rem'}}>
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
                className="help-img"
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
            <div style={{ marginBottom: '0.5rem' }}>
                The main page has shortcuts for PC users:
            </div>
            <table className='keys-table'>
                <tbody>
                    <tr>
                        <td><Key>Space</Key></td><td> toggle playback </td>
                    </tr>
                    <tr>
                        <td><Key>Arrow Left/Right</Key></td><td>Move to Previous/Next breakpoint</td>
                    </tr>
                    <tr>
                        <td><Key>Arrow Up/Down</Key></td><td>Select instrument</td>
                    </tr>
                    <tr>
                        <td><Key>{keys.join("/")}</Key></td><td>Add hit object (syncs to the registered keybinds)</td>
                    </tr>
                    <tr>
                        <td><Key>1/2/3</Key></td><td>Select tap/hold/delete</td>
                    </tr>
                    <tr>
                        <td><Key>Shift + W/A/S/D</Key></td><td>Move the selected hit object up / left / down / right, inverts if the editor is horizontal</td>
                    </tr>
                    <tr>
                        <td><Key>Esc</Key></td><td> Deselect current hitObject </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </>
}