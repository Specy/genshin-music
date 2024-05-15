import {FaCompactDisc, FaMinus, FaPlus, FaTimes} from 'react-icons/fa'
import {BsMusicPlayerFill} from 'react-icons/bs'
import {APP_NAME, BASE_PATH, IS_BETA, LANG_PREFERENCE_KEY_NAME} from "$config"
import {CSSProperties, FC, ReactNode, useEffect, useState} from 'react'
import Link from 'next/link'
import {useTheme} from '$lib/Hooks/useTheme'
import {MenuButton} from '$cmp/shared/Menu/MenuItem'
import {KeyboardProvider} from '$lib/Providers/KeyboardProvider'
import {AppButton} from '$cmp/shared/Inputs/AppButton'
import {VsrgIcon} from '$cmp/shared/icons/VsrgIcon'
import {VsrgComposerIcon} from '$cmp/shared/icons/VsrgComposerIcon'
import {useObservableObject} from '$lib/Hooks/useObservable'
import {homeStore} from '$stores/HomeStore'
import {useRouter} from 'next/router'
import {clearClientCache, isTWA} from '$lib/utils/Utilities'
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts'
import {MdOutlinePiano} from "react-icons/md";
import {usePathname} from "next/navigation";
import {logger} from "$stores/LoggerStore";
import {Row} from "$cmp/shared/layout/Row";
import {useTranslation} from "react-i18next";
import {DefaultLanguageSelector, LanguageSelector} from "$cmp/shared/i18n/LanguageSelector";


interface HomeProps {
    askForStorage: () => void,
    setDontShowHome: (override: boolean) => void,
    closeWelcomeScreen: () => void,
    hasVisited: boolean,
}

export default function Home({askForStorage, hasVisited, setDontShowHome, closeWelcomeScreen}: HomeProps) {
    const {t, i18n} = useTranslation(['home', 'common'])
    const data = useObservableObject(homeStore.state)
    const [appScale, setAppScale] = useState(100)
    const currentPage = usePathname()
    const [breakpoint, setBreakpoint] = useState(false)
    const [isTwa, setIsTwa] = useState(false)
    const homeClass = data.isInPosition ? "home" : "home home-visible"
    const history = useRouter()
    const [theme] = useTheme()

    async function clearCache() {
        if (!await asyncConfirm(t('cache_reload_warning'))) return
        clearClientCache()
            .then(() => {
                logger.success(t('cache_cleared'))
                setTimeout(() => {
                    window.location.href = BASE_PATH || "/"
                }, 1000)
            })
            .catch((e) => {
                console.error(e)
                logger.error(t('error_clearing_cache'))
            })
    }

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

        KeyboardProvider.register("Escape", () => {
            if (homeStore.state.visible) {
                homeStore.close()
            }
        }, {id: "home"})
        setBreakpoint(window.innerWidth > 900)
        return () => {
            KeyboardProvider.unregisterById("home")
        }
    }, [history])
    return <div
        className={`${homeClass} ignore_click_outside column`}
        style={{
            ...!data.visible ? {display: 'none'} : {},
            backgroundColor: theme.get('background').fade(0.1).toString(),
            overflowX: 'hidden'
        }}
    >
        <MenuButton
            className='close-home'
            onClick={homeStore.close}
            ariaLabel={t('close_home_menu')}
        >
            <FaTimes size={25}/>
        </MenuButton>
        <div className='home-padded column'>

            {(breakpoint || !hasVisited) && <div className='home-top'>
                <div className='home-title'>
                    {APP_NAME} Music Nightly
                </div>
                <div className='home-top-text'>
                    {t('app_description', {APP_NAME})}
                </div>
            </div>
            }


            {!hasVisited && <div className='home-welcome'>
                <div>
                    {!isTwa && <div className='home-spacing'>
                        {t("add_to_home_screen")}
                    </div>}
                    <div className='home-spacing'>
                        <div className="red-text">{t('common:warning')}</div>
                        :
                        {t("clear_cache_warning")}
                    </div>

                    {data.hasPersistentStorage &&
                        <div>
                            <div className="red-text">{t('common:warning')}</div>
                            : {t('home:persistent_storage_button')}
                        </div>
                    }
                    <div>
                        <span style={{marginRight: '0.2rem'}}>
                            {t("privacy_policy")}
                        </span>
                        <Link
                            href='/privacy'
                            style={{color: 'var(--primary-text)', textDecoration: "underline"}}
                            onClick={homeStore.close}
                        >
                            {t('common:privacy')}
                        </Link>
                    </div>
                    <div>
                        {t('home:no_affiliation', {company_name: APP_NAME === "Sky" ? "thatgamecompany" : "HoYoverse"})}
                    </div>
                </div>
                <div style={{display: 'flex', justifyContent: 'flex-end'}}>
                    <button className="home-accept-storage"
                            onClick={() => {
                                closeWelcomeScreen()
                                askForStorage()
                            }}
                    >
                        {t('common:confirm')}
                    </button>
                </div>

            </div>}
            <div className='home-content'>
                <MainContentElement
                    icon={<FaCompactDisc/>}
                    title={t('composer_name')}
                    style={{backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString()}}
                    background={`${BASE_PATH}/manifestData/composer.webp`}
                    href='/composer'
                    isCurrent={currentPage === '/composer'}
                >
                    {t('composer_description')}
                </MainContentElement>
                <MainContentElement
                    icon={<BsMusicPlayerFill/>}
                    title={t('player_name')}
                    style={{backgroundColor: theme.layer('primary', 0.15, 0.2).fade(0.15).toString()}}
                    background={`${BASE_PATH}/manifestData/player.webp`}
                    href='/'
                    isCurrent={currentPage === '/' || currentPage === '/player'}
                >
                    {t('player_description')}
                </MainContentElement>
            </div>
            <div className='row space-around middle-size-pages-wrapper'>
                <MiddleSizePage
                    Icon={VsrgComposerIcon}
                    current={currentPage === '/vsrg-composer'}
                    href='/vsrg-composer'
                >
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        {t('vsrg_composer_name')}
                    </span>

                </MiddleSizePage>

                <MiddleSizePage
                    Icon={VsrgIcon}
                    current={currentPage === '/vsrg-player'}
                    href='/vsrg-player'
                >
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        {t('vsrg_player_name')}
                    </span>
                </MiddleSizePage>
                <MiddleSizePage
                    Icon={MdOutlinePiano}
                    current={currentPage === '/zen-keyboard'}
                    href='/zen-keyboard'
                >
                    <span style={{fontSize: '1rem'}} className='row-centered'>
                        {t('zen_keyboard_name')}
                    </span>
                </MiddleSizePage>
            </div>
            <Separator/>
            <div className='page-redirect-wrapper'>
                {!isTwa &&
                    <PageRedirect href='/donate' current={currentPage === '/donate'}>
                        {t('common:donate')}
                    </PageRedirect>
                }

                <PageRedirect href='/sheet-visualizer' current={currentPage === '/sheet-visualizer'}>
                    {t('sheet_visualizer_name')}
                </PageRedirect>
                <PageRedirect href='/theme' current={currentPage === '/theme'}>
                    {t('themes_name')}
                </PageRedirect>
                <PageRedirect href={'/blog'} current={currentPage.startsWith("/blog")}>
                    {t('blog_and_guides_name')}
                </PageRedirect>
                <PageRedirect href='/keybinds' current={currentPage === '/keybinds'}>
                    {t('keybinds_or_midi_name')}
                </PageRedirect>

                <PageRedirect href='/partners' current={currentPage === '/partners'}>
                    {t('partners_name')}
                </PageRedirect>

                <PageRedirect href='/backup' current={currentPage === '/backup'}>
                    {t('backup_name')}
                </PageRedirect>
                <PageRedirect href='/changelog' current={currentPage === '/changelog'}>
                    {t('changelog_name')}
                </PageRedirect>

                <Link onClick={async (e) => {
                    e.preventDefault()
                    const confirm = await asyncConfirm(t('about_to_leave_warning', {to: 'specy.app'}))
                    if (!confirm) return
                    window.open('https://specy.app', '_blank')
                }} href={'https://specy.app'} target='_blank'>
                    {t('other_apps_name')}
                </Link>
                <AppButton onClick={clearCache}>
                    {t('clear_cache_name')}
                </AppButton>
                <PageRedirect href='/blog/posts/easyplay-1s' current={currentPage === '/blog/posts/easyplay-1s'}>
                    EASYPLAY 1s
                </PageRedirect>

            </div>

        </div>

        <div className='home-bottom'>
            <Row align={'center'} className='home-app-scaling'>
                <span>
                    {t('scale')}
                </span>
                <AppButton
                    ariaLabel='Decrease app scale'
                    className='flex-centered'
                    onClick={() => {
                        const newScale = appScale - 2
                        if (newScale < 75) return
                        setAppScale(newScale)
                    }}
                >
                    <FaMinus/>
                </AppButton>
                <AppButton
                    className='flex-centered'
                    ariaLabel='Increase app scale'
                    style={{marginRight: '0.5rem'}}
                    onClick={() => {
                        const newScale = appScale + 2
                        if (newScale > 125) return
                        setAppScale(newScale)
                    }}
                >
                    <FaPlus/>
                </AppButton>
                {appScale}%
            </Row>
            <span style={{padding: '0 1rem', textAlign: 'center'}}>
                {t('rights', {company_name: APP_NAME === 'Genshin' ? 'HoYoverse' : 'TGC'})}
            </span>
            <Row gap={'0.5rem'}>
                <div className='home-dont-show-again row-centered' onClick={() => setDontShowHome(!data.canShow)}>
                    <input type='checkbox' checked={!data.canShow} readOnly id='hide-on-open-checkbox'/>
                    <label htmlFor='hide-on-open-checkbox'>
                        {t('hide_on_open')}
                    </label>
                </div>
                <DefaultLanguageSelector />
            </Row>
        </div>
        {IS_BETA &&
            <div className={'top-right-home-label'}>
                {t('beta')}
            </div>
        }
    </div>
}

interface MiddleSizePageProps {
    children: ReactNode,
    href: string
    current: boolean
    Icon: FC<{ className?: string }>
}

function MiddleSizePage({href, children, Icon, current}: MiddleSizePageProps) {
    return <Link
        href={href}
        onClick={homeStore.close}
        className={`middle-size-page row ${current ? 'current-page' : ''}`}
    >
        <Icon className='middle-size-page-icon'/>
        {children}
    </Link>
}


interface PageRedirectProps {
    children: ReactNode,
    current: boolean,
    href: string
}

function PageRedirect({children, current, href}: PageRedirectProps) {
    return <Link onClick={homeStore.close} href={href} className={current ? 'current-page' : ''}>
        {children}
    </Link>
}

interface MainContentElementProps {
    title: string,
    icon: ReactNode,
    children: ReactNode,
    background: string,
    isCurrent: boolean,
    href: string,
    style?: CSSProperties

}

function MainContentElement({title, icon, children, background, isCurrent, href, style = {}}: MainContentElementProps) {
    const {t} = useTranslation('common')
    return <Link
        className={`home-content-element ${isCurrent ? 'current-page' : ''}`}
        href={href}
        onClick={homeStore.close}
    >
        <div className='home-content-background' style={{backgroundImage: `url(${background})`}}>
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
                    {t('open').toUpperCase()}
                </button>
            </div>
        </div>
    </Link>
}

interface SeparatorProps {
    children?: ReactNode
}

function Separator({children}: SeparatorProps) {
    return <div className='home-separator'>
        {children}
    </div>
}

