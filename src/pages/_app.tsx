import { DropZoneProviderWrapper } from "$cmp/ProviderWrappers/DropZoneProviderWrapper";
import { GeneralProvidersWrapper } from "$cmp/ProviderWrappers/GeneralProvidersWrapper";
import { ThemeProviderWrapper } from "$cmp/ProviderWrappers/ThemeProviderWrapper";
import { useEffect } from "react";


import '$pages/App.css';
import '$cmp/Index/Home.css'
import '$pages/Utility.scss'
import "$cmp/Player/Keyboard.css"
import "$cmp/Player/menu.css"
import "$pages/composer/Composer.css"
import '$pages/theme/Theme.css'
import '$pages/vsrg-composer/VsrgComposer.css';

import type { AppProps } from "next/app";
import AppBase from "$cmp/AppBase";
import { NextComponentType, NextPageContext } from "next";
import { setIfInTWA } from "$lib/Utilities";
import * as serviceWorker from "$/serviceWorkerRegistration"
import { BASE_PATH, IS_TAURI } from "$config";
import ErrorBoundaryRedirect from "$cmp/Utility/ErrorBoundaryRedirect";
import { logger } from "$stores/LoggerStore";
import { logsStore } from "$stores/LogsStore";
import { GoogleAnalyticsScript } from "$cmp/GoogleAnalyticsScript";
import Head from "next/head";

interface CustomPageProps {

}

export default function App({ Component, pageProps }: AppProps<CustomPageProps>) {
	useEffect(() => {
		if (window.location.hostname === "localhost") return
		const originalErrorLog = console.error.bind(console)
		//intercept console errors and log them to the logger store
		console.error = (...args: any[]) => {
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
				serviceWorker.register()
			}
		} catch (e) {
			console.error(e)
		}
	}, [])
	// @ts-ignore
	const getLayout = Component.getLayout || ((page: NextComponentType<NextPageContext, any, any>) => page)
	return (<>
		<Head>
			<meta name="viewport"
				content="user-scalable=no, width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0" />

			<meta name="theme-color" content="#63aea7" />
			<link rel="icon" href={BASE_PATH + "/favicon.ico"} />
			<link rel="apple-touch-icon" href={BASE_PATH + "/logo192.png"} />
			<link rel="manifest" href={BASE_PATH + "/manifest.json"} />
			{process.env.NEXT_PUBLIC_APP_NAME === "Sky"
				? <>
					<meta name="description" content="Sky music nightly, a website to play, practice and compose songs" />
					<title>Sky Music Nightly</title>
				</>
				: <>
					<meta name="description" content="Genshin music, a website to play, practice and compose songs" />
					<title>Genshin Music Nightly</title>
				</>
			}
		</Head>
		<GoogleAnalyticsScript />
		<ThemeProviderWrapper>
			<DropZoneProviderWrapper>
				<GeneralProvidersWrapper>
					<ErrorBoundaryRedirect
						onErrorGoTo="/error"
						onError={() => logger.error("There was an error with the app!")}
					>
						<>
							<AppBase />
							{getLayout(<Component {...pageProps} />)}
						</>
					</ErrorBoundaryRedirect>
				</GeneralProvidersWrapper>
			</DropZoneProviderWrapper>
		</ThemeProviderWrapper>

	</>


	)
}