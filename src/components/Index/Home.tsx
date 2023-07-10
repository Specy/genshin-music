import { FaCompactDisc, FaMinus, FaPlus, FaTimes } from 'react-icons/fa'
import { BsMusicPlayerFill } from 'react-icons/bs'
import { APP_NAME, BASE_PATH } from "$config"
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTheme } from '$lib/Hooks/useTheme'
import { MenuItem } from '$cmp/Miscellaneous/MenuItem'
import { KeyboardProvider } from '$lib/Providers/KeyboardProvider'
import { AppButton } from '$cmp/Inputs/AppButton'
import { VsrgIcon } from '$cmp/icons/VsrgIcon'
import { VsrgComposerIcon } from '$cmp/icons/VsrgComposerIcon'
import { useObservableObject } from '$lib/Hooks/useObservable'
import { homeStore } from '$stores/HomeStore'
import { useRouter } from 'next/router'
import { isTWA } from '$lib/Utilities'
import { useConfig } from '$lib/Hooks/useConfig'


interface HomeProps {
    askForStorage: () => void,
    setDontShowHome: (override: boolean) => void,
    closeWelcomeScreen: () => void,
    hasVisited: boolean,
}

export default function Home({ askForStorage, hasVisited, setDontShowHome, closeWelcomeScreen }: HomeProps) {
    const data = useObservableObject(homeStore.state)
    const [appScale, setAppScale] = useState(100)
    const { IS_MOBILE } = useConfig()
    const [currentPage, setCurrentPage] = useState('Unknown')
    const [breakpoint, setBreakpoint] = useState(false)
    const [isTwa, setIsTwa] = useState(false)
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const history = useRouter()
    const [theme] = useTheme()

    useEffect(() => {
        const storedFontScale = JSON.parse(localStorage.getItem(APP_NAME + '-font-size') || '100')
        setIsTwa(isTWA())
        if (storedFontScale < 75 || storedFontScale > 125) return setAppScale(100)
        setAppScale(storedFontScale)
    }, [])
    useEffect(() => {
        const html = document.querySelector('html')
        if (!html) return
        localStorage.setItem(APP_NAME + '-font-size', `${appScale}`)
        if (appScale === 100) {
            html.style.removeProperty("font-size")
            return
        }
        html.style.fontSize = `${appScale}%`
    }, [appScale])

    useEffect(() => {
        const dispose = ((path: any) => {
            setCurrentPage(path.replace('/', ''))
        })
        history.events.on("routeChangeComplete", dispose)
        setCurrentPage(window.location.pathname.replace("/", ""))
        KeyboardProvider.register("Escape", () => {
            if (homeStore.state.visible) {
                homeStore.close()
            }
        }, { id: "home" })
        setBreakpoint(window.innerWidth > 900)
        return () => {
            history.events.off("routeChangeComplete", dispose)
            KeyboardProvider.unregisterById("home")
        }
    }, [history])

    return <div
        className={`${homeClass} ignore_click_outside column`}
        style={{
            ...!data.visible ? { display: 'none' } : {},
            backgroundColor: theme.get('background').fade(0.1).toString()
        }}
    >
        <MenuItem
            className='close-home'
            onClick={homeStore.close}
            ariaLabel='Close home menu'
        >
            <FaTimes size={25} />
        </MenuItem>
        <div className='home-padded column'>

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
                    {!isTwa && <div className='home-spacing'>
                        To have the webapp fullscreen and better view, please add the website to the home screen
                    </div>}
                    <div className='home-spacing'>
                        <div className="red-text">WARNING</div>:
                        Clearing your browser cache / storage might delete your songs, make sure you make backups
                    </div>

                    {data.hasPersistentStorage &&
                        <div>
                            <div className="red-text">WARNING</div>: {"Click the button below to make sure that your browser won't delete your songs if you lack storage"}
                        </div>
                    }
                    <div>
                        <span style={{ marginRight: '0.2rem' }}>
                            We use cookies for analytics, by continuing to use this app, you agree to our use of cookies, learn more
                        </span>
                        <Link
                            href='privacy'
                            style={{ color: 'var(--primary-text)', textDecoration: "underline" }}
                            onClick={homeStore.close}
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
                <MainContentElement
                    icon={<FaCompactDisc />}
                    title='Composer'
                    style={{ backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString() }}
                    background={`${BASE_PATH}/manifestData/composer.webp`}
                    href='composer'
                    isCurrent={currentPage === 'composer'}
                >
                    Create or edit songs with a fully fledged music composer. Also with MIDI.
                </MainContentElement>
                <MainContentElement
                    icon={<BsMusicPlayerFill />}
                    title='Player'
                    style={{ backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString() }}
                    background={`${BASE_PATH}/manifestData/player.webp`}
                    href='/'
                    isCurrent={currentPage === '' || currentPage === 'player'}
                >
                    Play, download, record and import songs. Learn a song with approaching circle
                    mode and practice mode.
                </MainContentElement>
            </div>
            <div className='row space-around middle-size-pages-wrapper'>
                <MiddleSizePage
                    Icon={VsrgComposerIcon}
                    current={currentPage === 'vsrg-composer'}
                    href='vsrg-composer'
                >
                    <span style={{ fontSize: '1rem' }} className='row-centered'>
                        Vsrg Composer
                    </span>

                </MiddleSizePage>

                <MiddleSizePage
                    Icon={VsrgIcon}
                    current={currentPage === 'vsrg-player'}
                    href='vsrg-player'
                >
                    <span style={{ fontSize: '1rem' }} className='row-centered'>
                        Vsrg Player
                    </span>
                </MiddleSizePage>
            </div>
            <Separator />
            <div className='page-redirect-wrapper'>
                {!isTwa &&
                    <PageRedirect href='donate' current={currentPage === 'donate'}>
                        Donate
                    </PageRedirect>
                }
                <PageRedirect href='zen-keyboard' current={currentPage === 'zen-keyboard'}>
                    Zen Keyboard
                </PageRedirect>
                <PageRedirect href='sheet-visualizer' current={currentPage === 'sheet-visualizer'}>
                    Sheet Visualizer
                </PageRedirect>
                <PageRedirect href='theme' current={currentPage === 'theme'}>
                    App Theme
                </PageRedirect>
                <PageRedirect href='changelog' current={currentPage === 'changelog'}>
                    Changelog
                </PageRedirect>
                <PageRedirect href='partners' current={currentPage === 'partners'}>
                    Partners
                </PageRedirect>
                <PageRedirect href='help' current={currentPage === 'help'}>
                    Help
                </PageRedirect>
                <PageRedirect href='backup' current={currentPage === 'backup'}>
                    Backup
                </PageRedirect>
                {!IS_MOBILE &&
                    <PageRedirect href='keybinds' current={currentPage === 'keybinds'}>
                        Keybinds
                    </PageRedirect>
                }
            </div>

        </div>

        <div className='home-bottom'>
            <div className='home-app-scaling row-centered'>
                <span>
                    App scale
                </span>
                <AppButton
                    className='flex-centered'
                    onClick={() => {
                        const newScale = appScale - 2
                        if (newScale < 75) return
                        setAppScale(newScale)
                    }}
                >
                    <FaMinus />
                </AppButton>
                <AppButton
                    className='flex-centered'
                    style={{ marginRight: '0.5rem' }}
                    onClick={() => {
                        const newScale = appScale + 2
                        if (newScale > 125) return
                        setAppScale(newScale)
                    }}
                >
                    <FaPlus />
                </AppButton>
                {appScale}%
            </div>
            <span style={{ padding: '0 1rem', textAlign: 'center' }}>
                © All rights reserved by {APP_NAME === 'Genshin' ? 'HoYoverse' : 'TGC'}. Other properties belong to their respective owners.
            </span>
            <div className='home-dont-show-again row-centered' onClick={() => setDontShowHome(!data.canShow)}>
                <input type='checkbox' checked={!data.canShow} readOnly />
                <span>
                    Hide on open
                </span>
            </div>
        </div>
    </div>
}

interface MiddleSizePageProps {
    children: React.ReactNode,
    href: string
    current: boolean
    Icon: React.FC<{ className?: string }>
}
function MiddleSizePage({ href, children, Icon, current }: MiddleSizePageProps) {
    return <Link
        href={href}
        onClick={homeStore.close}
        className={`middle-size-page row ${current ? 'current-page' : ''}`}
    >
        <Icon className='middle-size-page-icon' />
        {children}
    </Link>
}


interface PageRedirectProps {
    children: React.ReactNode,
    current: boolean,
    href: string
}

function PageRedirect({ children, current, href }: PageRedirectProps) {
    return <Link onClick={homeStore.close} href={href} className={current ? 'current-page' : ''}>
        {children}
    </Link>
}

interface MainContentElementProps {
    title: string,
    icon: React.ReactNode,
    children: React.ReactNode,
    background: string,
    isCurrent: boolean,
    href: string,
    style?: React.CSSProperties

}
function MainContentElement({ title, icon, children, background, isCurrent, href, style = {} }: MainContentElementProps) {
    return <Link
        className={`home-content-element ${isCurrent ? 'current-page' : ''}`}
        href={href}
        onClick={homeStore.close}
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

