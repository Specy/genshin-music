import './Home.css'
import { FaCompactDisc, FaTimes } from 'react-icons/fa'
import { BsMusicPlayerFill } from 'react-icons/bs'
import { appName, isTwa } from 'appConfig'

export default function Home(props) {
    const to = props.changePage
    const { data, askForStorage, hasVisited } = props
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const breakpoint = window.innerWidth > 900
    return <div className={homeClass}>
        <FaTimes className='close-home' onClick={() => props.toggleHome(false)} />
        {(breakpoint || !hasVisited) && <div className='home-top'>
            <div className='home-title'>
                {appName} Music Nightly
            </div>
            <div className='home-top-text'>
                An app where you can create, practice and play songs for {appName}
            </div>
        </div>  
        }

        {!hasVisited && <div className='home-welcome'>
            <div>
                {!isTwa() && <div className='home-spacing'>
                    To have the webapp fullscreen and better view, please add the website to the home screen
                </div>}
                <div  className='home-spacing'>
                    <div className="red-text">WARNING</div>:
                    Clearing your browser cache / storage might delete your songs, make sure you make backups
                </div>
                {data.hasPersistentStorage ?
                    <div>
                        <div className="red-text">WARNING</div>: Click the button below to make sure that your browser won't delete your songs if you
                        lack storage
                    </div>
                    : null
                }
            </div>
            <div style={{display:'flex', justifyContent:'flex-end'}}>
                <button className="home-accept-storage" onClick={askForStorage}>
                    Confirm
                </button>
            </div>

        </div>}
        <div className='home-content'>
            <MainContentelement
                icon={<FaCompactDisc />}
                title='Composer'
                background={`./manifestData/composer.png`}
                onClick={() => to("Composer")}
            >
                Create or edit songs with a fully fledged music composer. Also with MIDI.
            </MainContentelement>
            <MainContentelement
                icon={<BsMusicPlayerFill />}
                title='Player'
                background={`./manifestData/main.png`}
                onClick={() => to("")}
            >
                Play, download, record and import songs. Learn a song with approaching circle
                mode and practice mode.
            </MainContentelement>
        </div>
        <Separator> Other pages </Separator>
        <div className='page-redirect-wrapper'>
            <PageRedirect onClick={() => to("Changelog")}>
                Changelog
            </PageRedirect>
            {!isTwa() &&
                <PageRedirect onClick={() => to("Donate")}>
                    Donate
                </PageRedirect>
            }
            <PageRedirect onClick={() => to("Partners")}>
                Partners
            </PageRedirect>
            <PageRedirect onClick={() => to("Help")}>
                Help
            </PageRedirect>
            <PageRedirect onClick={() => to("SheetVisualizer")}>
                Sheet visualizer
            </PageRedirect>
        </div>
        <div className='home-dont-show-again' onClick={() => props.setDontShowHome(!data.canShow)}>
            <input type='checkbox' checked={!data.canShow} readOnly />
            Hide on open
        </div>
        <div className='home-bottom'> 
            <div>
                © All rights reserved by {appName === 'Genshin' ? 'miHoYo' : 'TGC'}. Other properties belong to their respective owners. 
            </div>
        </div>

    </div>
}

// © 2021 {appName} Music. All rights reserved.   <br />
function PageRedirect(props) {
    return <button onClick={props.onClick}>
        {props.children}
    </button>
}

function MainContentelement(props) {
    return <div className='home-content-element' onClick={props.onClick}>
        <div className='home-content-background' style={{ backgroundImage: `url(${props.background})` }}>
        </div>
        <div className='home-content-main'>
            <div className='home-content-title'>
                {props.icon} {props.title}
            </div>
            <div className='home-content-text'>
                {props.children}
            </div>
            <div className='home-content-open'>
                <button>
                    OPEN
                </button>
            </div>
        </div>
    </div>
}

function Separator(props) {
    return <div className='home-separator'>
        {props.children}
    </div>
}