import { APP_NAME } from 'appConfig'
import composerImg from 'assets/images/help-composer.png'
import playerImg from 'assets/images/help-player.png'
import { HelpTooltip } from 'components/HelpTooltip'
import isMobile from 'is-mobile'
import './HelpComponent.css'

export function HelpTab() {
    return <>
        <span>
            If you are on PC, hover over the buttons to see a tooltip, if you are on mobile, long press the buttons.
            
            When clicking the
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
        <div className='help-title'>
            Main page
        </div>
        <div>
            <img src={playerImg} className='help-img' alt='tutorial for the main page' loading='lazy'/>
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
            </ol>
        </div>
        {
            !isMobile() && <>
                <div className='help-title'>
                    Main page shortcuts
                </div>
                <div className='help-margin-left'>
                    <div style={{ marginBottom: '0.5rem' }}>
                        The main page has shortcuts for PC users:
                    </div>
                    <table className='keys-table'>
                        <tbody>
                            <tr>
                                <td><Key>Shift + R</Key></td><td>reload song </td>
                            </tr>
                            <tr>
                                <td><Key>Shift + R</Key></td><td>Start/Stop recording when there are no songs playing</td>
                            </tr>
                            <tr>
                                <td><Key>Shift + M</Key></td><td>Open/Close the menu</td>
                            </tr>
                            <tr>
                                <td><Key>Esc</Key></td><td> Close the menu </td>
                            </tr>
                            <tr>
                                <td><Key>Shift + S</Key></td><td>stop song </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

            </>
        }

        <div className='help-title'>
            Composer
        </div>
        <div>
            <img src={composerImg} className='help-img' alt="tutorial for composer" loading='lazy'/>
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
            !isMobile() && <>
                <div className='help-title'>
                    Composer shortcuts
                </div>
                <div className='help-margin-left'>

                    <div style={{ marginBottom: '0.5rem' }}>
                        The composer has shortcuts for PC users:
                    </div>
                    <table>
                        <tbody>
                            <tr>
                                <td><Key>A / D</Key></td><td>move left / right</td>
                            </tr>
                            <tr>
                                <td><Key>1 / 2 / 3 / 4</Key></td><td>change tempo</td>
                            </tr>
                            <tr>
                                <td><Key>Space bar</Key></td><td>play / pause song</td>
                            </tr>
                            <tr>
                                <td><Key>Arrow Left</Key></td><td>go to previous breakpoint</td>
                            </tr>
                            <tr>
                                <td><Key>Arrow Right</Key></td><td>go to next breakpoint</td>
                            </tr>
                            <tr>
                                <td><Key>Arrow Up</Key></td><td>select previous layer</td>
                            </tr>
                            <tr>
                                <td><Key>Arrow Down</Key></td><td>select next layer </td>
                            </tr>
                            <tr>
                                <td><Key>Shift + Note</Key></td><td>Adds/remove a note in the column </td>
                            </tr>
                            <tr>
                                <td><Key>Q</Key></td><td>remove current column</td>
                            </tr>
                            <tr>
                                <td><Key>E</Key></td><td>add column </td>
                            </tr>
                        </tbody>
                    </table>
                    When playing a song, you can press on the PC keyboard to add notes
                    <div style={{ marginBottom: "1rem" }}>

                    </div>
                </div>

            </>
        }
    </>
}

interface KeyProps{
    children: React.ReactNode
}
function Key({children}: KeyProps) {
    return <div className='keyboard-key'>
        {children}
    </div>
}