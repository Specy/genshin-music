import mainPageImg from 'assets/images/mainpage.png'
import composerImg from 'assets/images/composer.png'
import songsImg from 'assets/images/songs.png'
import { faCrosshairs, faDownload } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { BsCircle } from 'react-icons/bs'

export function HelpTab() {
    return <>
        <div className='help-title'>
            Main page
        </div>
        <div>
            <img src={mainPageImg} className='help-img' alt='tutorial for the main page' />
            <ol>
                <li>Record the keyboard as an audio file</li>
                <li>Current note position, you can change it to reload</li>
                <li>Playback speed</li>
                <li>Approaching circles score</li>
                <li>Approaching circle, click when it's close to the note</li>
            </ol>
        </div>
                <div className='help-title'>
                Main page shortcuts
        </div>
        <div style={{marginBottom:'0.5rem'}}>
            The main page has shortcuts for PC users:
        </div>
        <table className='keys-table'>
            <tbody>
                <tr>
                    <td><Key>Shift + R</Key></td><td>reload song </td>
                </tr>
                <tr>
                    <td><Key>Shift + S</Key></td><td>stop song </td>
                </tr>
            </tbody>
        </table>

        <div className='help-title'>
            Songs menu
        </div>
        <div>
            <img src={songsImg} className='help-img' alt='tutorial for songs page' />
            <ol>
                <li>Open composer to create a song</li>
                <li>Import song (as json)</li>
                <li>Play song (click the name)</li>
                <li>Practice the song</li>
                <li>Play with the approaching circles mode</li>
                <li>Download the song (as json)</li>
            </ol>
            <div className="column">
                <div>
                    <FontAwesomeIcon icon={faCrosshairs} /> = practice the song
                </div>
                <div>
                    <BsCircle /> = Approaching circles mode
                </div>
                <div>
                    <FontAwesomeIcon icon={faDownload} /> = download the song
                </div>

            </div>
        </div>

        <div className='help-title'>
            Composer
        </div>
        <div>
            <img src={composerImg} className='help-img' alt="tutorial for composer" />
            <ol>
                <li>Go to the next / previous breakpoint</li>
                <li>Timeline of the breakpoints</li>
                <li>Open the tools</li>
                <li>Add 16 columns to the end</li>
                <li>Remove the current selected column</li>
                <li>Add column after the current one</li>
                <li>Change layer (instrument)</li>
                <li>Change column's duration</li>
            </ol>
        </div>

        <div className='help-title'>
                Composer shortcuts
            </div>
            <div style={{marginBottom:'0.5rem'}}>
                The composer has shortcuts for PC users:
            </div>
            <table className='keys-table'>
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
            <div style={{marginBottom: "1rem"}}>

            </div>
    </>
}


function Key(props){
    return <div className='keyboard-key'>
        {props.children}
    </div>
}