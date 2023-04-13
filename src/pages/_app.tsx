import { DropZoneProviderWrapper } from "$/components/ProviderWrappers/DropZoneProviderWrapper";
import { GeneralProvidersWrapper } from "$/components/ProviderWrappers/GeneralProvidersWrapper";
import { ThemeProviderWrapper } from "$/components/ProviderWrappers/ThemeProviderWrapper";
import { useEffect } from "react";
import '$pages/App.css';
import '$pages/player/Player.css'

import '$cmp/Index/Home.css'
import '$cmp/Inputs/Switch/switch.css'
import '$cmp/Settings/Settings.css'
import '$pages/Utility.scss'
import "$cmp/Player/Keyboard.css"
import "$cmp/Player/menu.css"
import '$cmp/Player/Track.css'

import "$pages/composer/Composer.css"
import '$pages/error/ErrorPage.scss'
import '$pages/changelog/Changelog.css'
import '$pages/partners/Partners.css'
import '$cmp/HelpTab/HelpComponent.css'
import '$pages/sheet-visualizer/SheetVisualizer.css'
import '$pages/midi-setup/MidiSetup.css'
import '$pages/donate/Donate.css'
import '$pages/theme/Theme.css'
import '$pages/vsrg-player/VsrgPlayer.css'
import '$pages/vsrg-composer/VsrgComposer.css';
import "$pages/zen-keyboard/ZenKeyboard.css"

import type { AppProps } from "next/app";
import AppBase from "./App";
import { NextComponentType, NextPageContext } from "next";
import { setIfInTWA } from "$/lib/Utilities";
import * as serviceWorker from "$/serviceWorkerRegistration"
import { BASE_PATH, IS_TAURI } from "$/Config";
import ErrorBoundaryRedirect from "$/components/Utility/ErrorBoundaryRedirect";
import { logger } from "$/stores/LoggerStore";
import Head from "next/head";
import Script from "next/script";

interface CustomPageProps {

}
export default function App({ Component, pageProps }: AppProps<CustomPageProps>) {
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
					<Script async src="https://www.googletagmanager.com/gtag/js?id=G-YEHPSLXGYT" />
					<Script>
						{`
							window.dataLayer = window.dataLayer || [];
								function gtag() {dataLayer.push(arguments); }
								gtag('js', new Date());
		
								gtag('config', 'G-YEHPSLXGYT', {
									send_page_view: false,
								anonymize_ip: true
							});
						`}
					</Script>
					<title>Sky Music Nightly</title>
				</>
				: <>
					<meta name="description" content="Genshin music, a website to play, practice and compose songs" />
					<Script async src="https://www.googletagmanager.com/gtag/js?id=G-T3TJDT2NFS" />
					<Script>
						{`
							window.dataLayer = window.dataLayer || [];
								function gtag() { dataLayer.push(arguments); }
								gtag('js', new Date());
						
								gtag('config', 'G-BSC3PC58G4', {
									send_page_view: false,
									anonymize_ip: true
							});
						`}
					</Script>
					<title>Genshin Music Nightly</title>
				</>

			}
		</Head>
		<DropZoneProviderWrapper>
			<ThemeProviderWrapper>
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
			</ThemeProviderWrapper>
		</DropZoneProviderWrapper>
	</>


	)
}