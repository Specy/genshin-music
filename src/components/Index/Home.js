import { FaCompactDisc, FaTimes } from 'react-icons/fa'
import { BsMusicPlayerFill } from 'react-icons/bs'
import { appName, isTwa } from "appConfig"
import HomeStore from 'stores/HomeStore'
import { useEffect, useState } from 'react'
import { useHistory } from 'react-router-dom'
import { observe } from 'mobx'
import './Home.css'
import { ThemeStore } from 'stores/ThemeStore'

export default function Home({ askForStorage, hasVisited, setDontShowHome, closeWelcomeScreen }) {
    const [data, setData] = useState(HomeStore.state.data)
    const [currentPage, setCurrentPage] = useState('')
    const [breakpoint, setBreakpoint] = useState(false)
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const history = useHistory()
    const [theme, setTheme] = useState(ThemeStore)
    function handleClick(page){
        history.push('./'+page)
        HomeStore.close()
    }
    useEffect(() => {
        const dispose = observe(HomeStore.state, (newState) => {
            setData(newState.object.data)
        })
        const dispose2 = history.listen((path) => {
            setCurrentPage(path.pathname.replace('/',''))
        })
        const dispose3 = observe(ThemeStore.state.data, (newState) => {
            setTheme({...ThemeStore})
        })
        setBreakpoint(window.innerWidth > 900)
        return () => {
            dispose()
            dispose2()
            dispose3()
        }
    },[history])
    return <div 
            className={homeClass} 
            style={{
                ...!data.visible ? {display: 'none'} : {},
                backgroundColor: theme.get('background').fade(0.1)
            }}
        >
        <FaTimes className='close-home' onClick={HomeStore.close} />
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
                <div className='home-spacing'>
                    <div className="red-text">WARNING</div>:
                    Clearing your browser cache / storage might delete your songs, make sure you make backups
                </div>
                {data.hasPersistentStorage ?
                    <div>
                        <div className="red-text">WARNING</div>: {"Click the button below to make sure that your browser won't delete your songs if you lack storage"}    
                    </div>
                    : null
                }
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="home-accept-storage"
                    onClick={() => {
                        closeWelcomeScreen()
                        askForStorage()
                    }}
                >
                    Confirm
                </button>
            </div>

        </div>}
        <div className='home-content'>
            <MainContentelement
                icon={<FaCompactDisc />}
                title='Composer'
                style={{backgroundColor: theme.layer('background',0.15,0.2).fade(0.15).mix(theme.get('primary'))}}
                background={`./manifestData/composer.png`}
                href='Composer'
                onClick={handleClick}
                current={currentPage === 'Composer'}
            >
                Create or edit songs with a fully fledged music composer. Also with MIDI.
            </MainContentelement>
            <MainContentelement
                icon={<BsMusicPlayerFill />}
                title='Player'
                style={{backgroundColor: theme.layer('background',0.15,0.2).fade(0.15).mix(theme.get('primary'))}}
                background={`./manifestData/main.png`}
                href=''
                onClick={handleClick}
                current={currentPage === '' || currentPage === 'Player'}
            >
                Play, download, record and import songs. Learn a song with approaching circle
                mode and practice mode.
            </MainContentelement>
        </div>
        <Separator/>
        <div className='page-redirect-wrapper'>
            <PageRedirect href='Changelog' current={currentPage === 'Changelog'} onClick={handleClick}>
                Changelog
            </PageRedirect>
            {!isTwa() &&
                <PageRedirect href='Donate' current={currentPage === 'Donate'} onClick={handleClick}>
                    Donate
                </PageRedirect>
            }
            <PageRedirect href='Partners' current={currentPage === 'Partners'} onClick={handleClick}>
                Partners
            </PageRedirect>
            <PageRedirect href='Help' current={currentPage === 'Help'} onClick={handleClick}>
                Help
            </PageRedirect>
            <PageRedirect href='SheetVisualizer' current={currentPage === 'SheetVisualizer'} onClick={handleClick}>
                Sheet visualizer
            </PageRedirect>
            <PageRedirect href='Theme' current={currentPage === 'Theme'} onClick={handleClick}>
                App Theme
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

function PageRedirect({ children, current, onClick, href}) {
    return <button className={current ? 'current-page' : ''} onClick={() => onClick(href)}>
            {children}
        </button>


}

function MainContentelement({ title, icon, children, background, current, onClick, href, style = {}}) {
    return <div 
            className={`home-content-element ${current ? 'current-page' : ''}`}  
            onClick={() => onClick(href)}
        >
            <div className='home-content-background' style={{ backgroundImage: `url(${background})`}}>
            </div>
            <div className='home-content-main' style={style}>
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

function Separator({ children }) {
    return <div className='home-separator'>
        {children}
    </div>
}