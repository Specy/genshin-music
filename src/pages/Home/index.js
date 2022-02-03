import './Home.css'
import { FaCompactDisc, FaTimes } from 'react-icons/fa'
import { BsMusicPlayerFill } from 'react-icons/bs'
import { appName, isTwa } from 'appConfig'

export default function Home({changePage,data, askForStorage, hasVisited, toggleHome, currentPage, setDontShowHome}) {
    const to = changePage
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const breakpoint = window.innerWidth > 900
    return <div className={homeClass}>
        <FaTimes className='close-home' onClick={() => toggleHome(false)} />
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
                current={currentPage === 'Composer'}
            >
                Create or edit songs with a fully fledged music composer. Also with MIDI.
            </MainContentelement>
            <MainContentelement
                icon={<BsMusicPlayerFill />}
                title='Player'
                background={`./manifestData/main.png`}
                onClick={() => to("")}
                current={currentPage === '' || currentPage === 'Player' }
            >
                Play, download, record and import songs. Learn a song with approaching circle
                mode and practice mode.
            </MainContentelement>
        </div>
        <Separator> Other pages </Separator>
        <div className='page-redirect-wrapper'>
            <PageRedirect onClick={() => to("Changelog")} current={currentPage === 'Changelog'}>
                Changelog
            </PageRedirect>
            {!isTwa() &&
                <PageRedirect onClick={() => to("Donate")} current={currentPage === 'Donate'}>
                    Donate
                </PageRedirect>
            }
            <PageRedirect onClick={() => to("Partners")} current={currentPage === 'Partners'}>
                Partners
            </PageRedirect>
            <PageRedirect onClick={() => to("Help")} current={currentPage === 'Help'}>
                Help
            </PageRedirect>
            <PageRedirect onClick={() => to("SheetVisualizer")} current={currentPage === 'SheetVisualizer'}>
                Sheet visualizer
            </PageRedirect>
        </div>
        <div className='home-dont-show-again' onClick={() => setDontShowHome(!data.canShow)}>
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

function PageRedirect({children, onClick, current}) {
    return <button onClick={onClick} className={current ? 'current-page' : ''}>
        {children}
    </button>
}

function MainContentelement({title, icon, children, background, onClick, current}) {
    return <div className={`home-content-element ${current ? 'current-page' : ''}`} onClick={onClick}>
        <div className='home-content-background' style={{ backgroundImage: `url(${background})` }}>
        </div>
        <div className='home-content-main'>
            <div className='home-content-title'>
                {icon} {title}
            </div>
            <div className='home-content-text'>
                {children}
            </div>
            <div className='home-content-open'>
                <button>
                    OPEN
                </button>
            </div>
        </div>
    </div>
}

function Separator({children}) {
    return <div className='home-separator'>
        {children}
    </div>
}