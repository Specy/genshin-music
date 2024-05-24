import {useCallback, useEffect, useState} from 'react';
import Analytics from '$lib/Analytics';
import Home from '$cmp/pages/Index/Home';
import {homeStore} from '$stores/HomeStore';
import {logger} from '$stores/LoggerStore';
import {delay} from "$lib/utils/Utilities"
import {APP_NAME, APP_VERSION, UPDATE_MESSAGE} from "$config"
import rotateImg from "$/assets/icons/rotate.svg"
import {browserHistoryStore} from '$stores/BrowserHistoryStore';
import {FaExpandAlt} from 'react-icons/fa';
import {checkIfneedsUpdate} from '$lib/needsUpdate';
import {settingsService} from '$lib/Services/SettingsService';
import {linkServices} from '$lib/Services/globalServices';
import {useRouter} from 'next/router';
import Image from 'next/image';
import isMobile from 'is-mobile';
import {asyncConfirm} from '$cmp/shared/Utility/AsyncPrompts';
import {fileService} from '$lib/Services/FileService';
import {useTranslation} from "react-i18next";
import {AppLanguage, AVAILABLE_LANGUAGES} from "$i18n/i18n";
import {usePathname} from "next/navigation";


function AppBase() {
    const {i18n, t} = useTranslation(['home', 'logs'])
    const [hasVisited, setHasVisited] = useState(false)
    const [checkedUpdate, setCheckedUpdate] = useState(false)
    const [isOnMobile, setIsOnMobile] = useState(false)
    const router = useRouter()
    const path = usePathname()
    useEffect(() => {
        function handleBlur() {
            const active = document.activeElement
            //@ts-ignore
            if (active && active.tagName === 'INPUT') active?.blur()
        }

        window.addEventListener("blur", handleBlur)
        return () => {
            window.removeEventListener("blur", handleBlur)
        }
    })
    useEffect(() => {
        const hasVisited = localStorage.getItem(APP_NAME + "_Visited")
        let canShowHomeStorage = localStorage.getItem(APP_NAME + "_ShowHome")
        canShowHomeStorage = canShowHomeStorage === null ? 'true' : canShowHomeStorage
        const canShowHome = canShowHomeStorage === 'true' && !window.location.pathname.startsWith("/blog")
        homeStore.setState({
            canShow: canShowHome,
            visible: canShowHome,
            isInPosition: false,
            hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
        })
        setIsOnMobile("ontouchstart" in window || isMobile())
        setHasVisited(hasVisited === 'true')
        checkIfneedsUpdate()
        linkServices()
        const shouldShowBakcupWarning = settingsService.shouldShowBackupWarning(1000 * 60 * 60 * 24 * 7 * 3) //3 weeks
        if (shouldShowBakcupWarning) {
            logger.warn(i18n.t('logs:suggest_backup'), 8000)
            settingsService.setLastBackupWarningTime(Date.now())
        }
    }, [])

    useEffect(() => {
        if ("launchQueue" in window) {
            async function consumer(launchParams: any) {
                if (launchParams.files && launchParams.files.length) {
                    const name = launchParams.files.join(", ")
                    const confirm = await asyncConfirm(i18n.t('confirm:confirm_import_opened_file', {files_names: name}), false)
                    if (!confirm) return
                    for (const file of launchParams.files) {
                        const blob = await file.getFile()
                        blob.handle = file
                        const text = await blob.text()
                        const parsedFile = JSON.parse(text)
                        if (parsedFile) {
                            fileService.importAndLog(parsedFile)
                        }
                    }
                }
            }

            window.launchQueue.setConsumer(consumer)
            //not sure if this is needed
            return () => window.launchQueue.setConsumer(() => {
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setDontShowHome = useCallback((override = false) => {
        localStorage.setItem(APP_NAME + "_ShowHome", JSON.stringify(override))
        homeStore.setState({canShow: override})
    }, [])

    const askForStorage = async () => {
        try {
            if (navigator.storage && navigator.storage.persist) {
                if (await navigator.storage.persist()) {
                    logger.success(t('logs:storage_persisted'), 5000)
                }
            }
        } catch (e) {
            console.log(e)
            logger.error(t('logs:storage_persisted_error'), 5000)
        }
        closeWelcomeScreen()
    }
    const closeWelcomeScreen = () => {
        localStorage.setItem(APP_NAME + "_Visited", JSON.stringify(true))
        setHasVisited(true)
    }

    useEffect(() => {
        try {
            const lang = (localStorage.getItem(APP_NAME + "_Lang") ?? navigator.language ?? "en") as string | string[]
            const rootLang = ((Array.isArray(lang) ? lang[0] : lang).split("-")[0]).toLowerCase()
            const langToUse = AVAILABLE_LANGUAGES.includes(rootLang as AppLanguage) ? rootLang : 'en'
            window.document.documentElement.lang = langToUse
            i18n.changeLanguage(langToUse)
        } catch (e) {
            console.error(e)
        }
    }, []);


    useEffect(() => {
        async function checkUpdate() {
            await delay(1000)
            const visited = localStorage.getItem(APP_NAME + "_Visited")
            if (checkedUpdate) return
            const storedVersion = localStorage.getItem(APP_NAME + "_Version")
            const repeatNotice = localStorage.getItem(APP_NAME + "_repeat_update_notice") === "true"
            if (!visited) {
                return localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
            }
            if (APP_VERSION !== storedVersion || repeatNotice) {
                logger.log("Update V" + APP_VERSION + "\n" + UPDATE_MESSAGE, 6000)
                localStorage.setItem(APP_NAME + "_repeat_update_notice", "false")
                localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
            }
            setCheckedUpdate(true)
            if (!visited) return
            if (navigator.storage && navigator.storage.persist) {
                let isPersisted = await navigator.storage.persisted()
                if (!isPersisted) isPersisted = await navigator.storage.persist()
                console.log(isPersisted ? "Storage Persisted" : "Storage Not persisted")
            }
        }

        checkUpdate()
    }, [checkedUpdate])
    useEffect(() => {
        Analytics.UIEvent('version', {version: APP_VERSION})
        Analytics.pageView({
            page_title: router.pathname
        })
        return router.events.on("beforeHistoryChange", (path: any) => {
            Analytics.pageView({
                page_title: path.pathName as string
            })
            browserHistoryStore.addPage(path.pathName)
        })
    }, [router])

    //disable the screen rotate for the blog
    const inBlog = path.startsWith("/blog")
    return <>
        <Home
            hasVisited={hasVisited}
            closeWelcomeScreen={closeWelcomeScreen}
            setDontShowHome={setDontShowHome}
            askForStorage={askForStorage}
        />
        {!inBlog &&
            <div className="rotate-screen">
                {isOnMobile && <>
                    <Image
                        src={rotateImg}
                        alt="icon for the rotating screen"
                    />
                    <p>
                        {t('rotate_screen')}
                    </p>
                </>}
                {!isOnMobile && <>
                    <FaExpandAlt/>
                    <p>
                        {t('expand_screen')}
                    </p>
                </>}
            </div>
        }
    </>
}


export default AppBase

