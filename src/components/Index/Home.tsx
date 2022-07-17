import { FaCompactDisc, FaTimes } from 'react-icons/fa'
import { BsMusicPlayerFill } from 'react-icons/bs'
import { APP_NAME, isTwa } from "appConfig"
import HomeStore from 'stores/HomeStore'
import { useEffect, useState } from 'react'
import { useHistory, Link } from 'react-router-dom'
import { observe } from 'mobx'
import { useTheme } from 'lib/Hooks/useTheme'
import './Home.css'
import { MenuItem } from 'components/Miscellaneous/MenuItem'
import { KeyboardProvider } from 'lib/Providers/KeyboardProvider'

interface HomeProps {
    askForStorage: () => void,
    setDontShowHome: (override: boolean) => void,
    closeWelcomeScreen: () => void,
    hasVisited: boolean,
}

export default function Home({ askForStorage, hasVisited, setDontShowHome, closeWelcomeScreen }: HomeProps) {
    const [data, setData] = useState(HomeStore.state.data)
    const [currentPage, setCurrentPage] = useState('')
    const [breakpoint, setBreakpoint] = useState(false)
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const history = useHistory()
    const [theme] = useTheme()


    useEffect(() => {
        const dispose = history.listen((path) => {
            setCurrentPage(path.pathname.replace('/', ''))
        })
        KeyboardProvider.register("Escape", () => {
            if (HomeStore.state.data.visible) {
                HomeStore.close()
            }
        }, { id: "home" })
        setBreakpoint(window.innerWidth > 900)
        return () => {
            dispose()
            KeyboardProvider.unregisterById("home")
        }
    }, [history])

    useEffect(() => {
        const dispose = observe(HomeStore.state, (newState) => {
            setData(newState.object.data)
        })
        return dispose
    }, [])
    return <div
        className={`${homeClass} ignore_click_outside`}
        style={{
            ...!data.visible ? { display: 'none' } : {},
            backgroundColor: theme.get('background').fade(0.1).toString()
        }}
    >
        <MenuItem
            className='close-home'
            onClick={HomeStore.close}
            ariaLabel='Close home menu'
        >
            <FaTimes size={25} />
        </MenuItem>
        {(breakpoint || !hasVisited) && <div className='home-top'>
            <div className='home-title'>
                {APP_NAME} Music Nightly
            </div>
            <div className='home-top-text'>
                An app where you can create, practice and play songs for {APP_NAME}
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
                <div>
                    <span style={{ marginRight: '0.2rem' }}>
                        We use cookies for analytics, by continuing to use this app, you agree to our use of cookies, learn more
                    </span>
                    <Link
                        to='Privacy'
                        style={{ color: 'var(--primary-text)', textDecoration: "underline" }}
                        onClick={HomeStore.close}
                    >
                        here
                    </Link>
                </div>
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
            <MainContntElement
                icon={<FaCompactDisc />}
                title='Composer'
                style={{ backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString() }}
                background={`./manifestData/composer.webp`}
                href='Composer'
                current={currentPage === 'Composer'}
            >
                Create or edit songs with a fully fledged music composer. Also with MIDI.
            </MainContntElement>
            <MainContntElement
                icon={<BsMusicPlayerFill />}
                title='Player'
                style={{ backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString() }}
                background={`./manifestData/main.webp`}
                href=''
                current={currentPage === '' || currentPage === 'Player'}
            >
                Play, download, record and import songs. Learn a song with approaching circle
                mode and practice mode.
            </MainContntElement>
        </div>
        <Separator />
        <div className='page-redirect-wrapper'>
            <PageRedirect href='Changelog' current={currentPage === 'Changelog'}>
                Changelog
            </PageRedirect>
            {!isTwa() &&
                <PageRedirect href='Donate' current={currentPage === 'Donate'}>
                    Donate
                </PageRedirect>
            }
            <PageRedirect href='Partners' current={currentPage === 'Partners'}>
                Partners
            </PageRedirect>
            <PageRedirect href='Help' current={currentPage === 'Help'}>
                Help
            </PageRedirect>
            <PageRedirect href='SheetVisualizer' current={currentPage === 'SheetVisualizer'}>
                Sheet visualizer
            </PageRedirect>
            <PageRedirect href='Theme' current={currentPage === 'Theme'}>
                App Theme
            </PageRedirect>
        </div>
        <div className='home-dont-show-again' onClick={() => setDontShowHome(!data.canShow)}>
            <input type='checkbox' checked={!data.canShow} readOnly />
            Hide on open
        </div>
        <div className='home-bottom'>
            <div>
                © All rights reserved by {APP_NAME === 'Genshin' ? 'HoYoverse' : 'TGC'}. Other properties belong to their respective owners.
            </div>
        </div>
    </div>
}
interface PageRedirectProps {
    children: React.ReactNode,
    current: boolean,
    href: string
}
function PageRedirect({ children, current, href }: PageRedirectProps) {
    return <Link onClick={HomeStore.close} to={href} className={current ? 'current-page' : ''}>
        {children}
    </Link>
}

interface MainContntElementProps {
    title: string,
    icon: React.ReactNode,
    children: React.ReactNode,
    background: string,
    current: boolean,
    href: string,
    style?: React.CSSProperties

}
function MainContntElement({ title, icon, children, background, current, href, style = {} }: MainContntElementProps) {
    return <Link
        className={`home-content-element ${current ? 'current-page' : ''}`}
        to={href}
        onClick={HomeStore.close}
    >
        <div className='home-content-background' style={{ backgroundImage: `url(${background})` }}>
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
    </Link>
}

interface SeparatorProps {
    children?: React.ReactNode
}
function Separator({ children }: SeparatorProps) {
    return <div className='home-separator'>
        {children}
    </div>
}