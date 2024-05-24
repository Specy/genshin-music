import {DropZoneProviderWrapper} from "$cmp/shared/ProviderWrappers/DropZoneProviderWrapper";
import {GeneralProvidersWrapper} from "$cmp/shared/ProviderWrappers/GeneralProvidersWrapper";
import {ThemeProviderWrapper} from "$cmp/shared/ProviderWrappers/ThemeProviderWrapper";
import {useEffect} from "react";


import '$pages/App.css';
import '$cmp/pages/Index/Home.css'
import '$pages/Utility.scss'
import "$cmp/pages/Player/Keyboard.css"
import "$cmp/pages/Player/menu.css"
import "$pages/composer/Composer.css"
import '$pages/theme/Theme.css'
import '$pages/vsrg-composer/VsrgComposer.css';

import type {AppProps} from "next/app";
import AppBase from "$cmp/AppBase";
import {NextComponentType, NextPageContext} from "next";
import {delay, setIfInTWA} from "$lib/utils/Utilities";
import * as serviceWorker from "$/serviceWorkerRegistration"
import {APP_NAME, BASE_PATH, IS_TAURI} from "$config";
import ErrorBoundaryRedirect from "$cmp/shared/Utility/ErrorBoundaryRedirect";
import {logger} from "$stores/LoggerStore";
import {logsStore} from "$stores/LogsStore";
import {GoogleAnalyticsScript} from "$cmp/GoogleAnalyticsScript";
import Head from "next/head";
import {asyncConfirm} from "$cmp/shared/Utility/AsyncPrompts";

import {i18n} from "$i18n/i18n"

interface CustomPageProps {

}

export default function App({Component, pageProps}: AppProps<CustomPageProps>) {
    useEffect(() => {
        if (window.location.hostname === "localhost") return
        const originalErrorLog = console.error.bind(console)
        //intercept console errors and log them to the logger store
        console.error = (...args: any[]) => {
            try {
                originalErrorLog(...args)
                logsStore.addLog({
                    error: args.find(arg => arg instanceof Error),
                    message: args.map(arg => {
                        if (arg instanceof Error) {
                            return arg.stack
                        }
                        return typeof arg === 'object' ? JSON.stringify(arg, null, 4) : arg
                    }).join(' ')
                })
            } catch (e) {
                console.log("Error logging error", e)
            }
        }
        return () => {
            console.error = originalErrorLog
        }
    }, [])
    useEffect(() => {
        function windowIntercepter(e: ErrorEvent) {
            //intercept window errors and log them to the logger store
            logsStore.addLog({
                error: e.error,
                message: e.error.stack
            })
        }

        window.addEventListener("error", windowIntercepter)
        return () => {
            window.removeEventListener("error", windowIntercepter)
        }
    }, [])
    useEffect(() => {
        async function registerSw() {
            try {
                if ('virtualKeyboard' in navigator) {
                    //@ts-ignore
                    navigator.virtualKeyboard.overlaysContent = true;
                    console.log("virtual keyboard supported")
                } else {
                    console.log("virtual keyboard not supported")
                }
                if (!IS_TAURI) {
                    setIfInTWA()
                    console.log("Registering service worker")
                    serviceWorker.register({
                        onUpdate: async (registration) => {
                            const confirm = await asyncConfirm(i18n.t('logs:update_available'), false)
                            if (confirm) {
                                registration.waiting?.postMessage({type: "SKIP_WAITING"})
                                localStorage.setItem(APP_NAME + "_repeat_update_notice", "true")
                                await delay(1000)
                                window.location.reload()
                            }
                        }
                    })
                }
            } catch (e) {
                console.error(e)
            }
        }

        console.log("Checking for changelog...")
        registerSw()
    }, [])
    // @ts-ignore
    const getLayout = Component.getLayout || ((page: NextComponentType<NextPageContext, any, any>) => page)
    return (<>
            <Head>
                <meta name="viewport"
                      content="user-scalable=no, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0"/>

                <meta name="theme-color" content="#63aea7"/>
                <link rel="icon" href={BASE_PATH + "/favicon.ico"}/>
                <link rel="apple-touch-icon" href={BASE_PATH + "/logo192.png"}/>
                <link rel="manifest" href={BASE_PATH + "/manifest.json"}/>
                {process.env.NEXT_PUBLIC_APP_NAME === "Sky"
                    ? <>
                        <meta name="description"
                              content="Sky music nightly, a website to play, practice and compose songs"/>
                        <title>Sky Music Nightly</title>
                    </>
                    : <>
                        <meta name="description"
                              content="Genshin music, a website to play, practice and compose songs"/>
                        <title>Genshin Music Nightly</title>
                    </>
                }
            </Head>
            <GoogleAnalyticsScript/>
            <ThemeProviderWrapper>
                <DropZoneProviderWrapper>
                    <GeneralProvidersWrapper>
                        <ErrorBoundaryRedirect
                            onErrorGoTo="/error"
                            onError={() => logger.error(i18n.t("logs:error_with_the_app"))}
                        >
                            <>
                                <AppBase/>
                                {getLayout(<Component {...pageProps} />)}
                            </>
                        </ErrorBoundaryRedirect>
                    </GeneralProvidersWrapper>
                </DropZoneProviderWrapper>
            </ThemeProviderWrapper>

        </>


    )
}