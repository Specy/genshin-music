import helpImg from '$/assets/images/help-vsrg-composer.png';
import { useObservableArray } from '$/lib/Hooks/useObservable';
import { keyBinds } from '$/stores/Keybinds';
import { vsrgPlayerStore } from '$/stores/VsrgPlayerStore';
import { Key } from '../HelpTab';


export function VsrgComposerHelp() {
    const keys = keyBinds.getVsrgKeybinds(6)
    return <>
        <div className="column">

            <img src={helpImg} className="help-img" alt="tutorial for the vsrg composer page" loading="lazy" />
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
                </tbody>
            </table>
        </div>
    </>
}