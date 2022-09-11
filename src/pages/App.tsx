import { useCallback, useEffect, useState } from 'react';
import Analytics from '$/lib/Stats';
import Home from '$cmp/Index/Home';
import {homeStore} from '$stores/HomeStore';
import { logger } from '$stores/LoggerStore';
import { delay } from "$lib/Utilities"
import { APP_NAME, APP_VERSION, AUDIO_CONTEXT, UPDATE_MESSAGE } from "$/Config"
import Logger from '$cmp/Index/Logger'
import rotateImg from "$/assets/icons/rotate.svg"

import { withRouter } from "react-router-dom";
import './App.css';
import './Utility.scss'
import { historyTracker } from '$stores/History';
import isMobile from 'is-mobile';
import { FaExpandAlt, FaVolumeMute } from 'react-icons/fa';
import { IconButton } from '$/components/Inputs/IconButton';
import { metronome } from '$/lib/Metronome';
import { logsStore } from '$stores/LogsStore';
import { needsUpdate } from '$/lib/needsUpdate';
import { AsyncPromptWrapper } from '$/components/Utility/AsyncPrompt';


function App({ history }: any) {
	const [hasVisited, setHasVisited] = useState(false)
	const [audioContextState, setAudioContextState] = useState(AUDIO_CONTEXT.state)
	const [checkedUpdate, setCheckedUpdate] = useState(false)
	const [pageHeight, setPageHeight] = useState(0)
	const [isOnMobile, setIsOnMobile] = useState(false)
	const handleAudioContextStateChange = useCallback(() => {
		setAudioContextState(AUDIO_CONTEXT.state)
	}, [])
	useEffect(() => {
		AUDIO_CONTEXT.addEventListener('statechange', handleAudioContextStateChange)
		return () => {
			AUDIO_CONTEXT.removeEventListener('statechange', handleAudioContextStateChange)
		}
	}, [handleAudioContextStateChange])
	useEffect(() => {
		if(window.location.hostname === "localhost") return
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
		const windowIntercepter = (e: ErrorEvent) => {
			//intercept window errors and log them to the logger store
			logsStore.addLog({
				error: e.error,
				message: e.error.stack
			})
		}
		window.addEventListener("error", windowIntercepter)
		return () => {
			console.error = originalErrorLog
			window.removeEventListener("error", windowIntercepter)
		}
	}, [])
	useEffect(() => {
		const hasVisited = localStorage.getItem(APP_NAME + "_Visited")
		let canShowHome = localStorage.getItem(APP_NAME + "_ShowHome")
		canShowHome = canShowHome === null ? 'true' : canShowHome
		homeStore.setState({
			canShow: canShowHome === 'true',
			visible: canShowHome === 'true',
			isInPosition: false,
			hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
		})

		setIsOnMobile(isMobile())
		setHasVisited(hasVisited === 'true')
		setPageHeight(window.innerHeight)
		needsUpdate()
	}, [])

	const setHeight = useCallback((h: number) => {
		document.body.style.minHeight = h + 'px'
	}, [])

	const resetHeight = useCallback(() => {
		//@ts-ignore
		document.body.style = ''
	}, [])

	const handleResize = useCallback(() => {
		if (document.activeElement?.tagName === 'INPUT') {
			if (pageHeight === window.innerHeight || pageHeight === 0) return
			return setHeight(pageHeight)
		}
		setHeight(window.innerHeight)
		resetHeight()
		setIsOnMobile(isMobile())
	}, [pageHeight, resetHeight, setHeight])

	const handleBlur = useCallback(() => {
		const active = document.activeElement
		//@ts-ignore
		if (active && active.tagName === 'INPUT') active?.blur()
		resetHeight()
	}, [resetHeight])
	const setDontShowHome = useCallback((override = false) => {
		localStorage.setItem(APP_NAME + "_ShowHome", JSON.stringify(override))
		homeStore.setState({ canShow: override })
	}, [])

	const askForStorage = async () => {
		try {
			if (navigator.storage && navigator.storage.persist) {
				if (await navigator.storage.persist()) {
					logger.success("Storage permission allowed")
				}
			}
		} catch (e) {
			console.log(e)
			logger.error("There was an error with setting up persistent storage")
		}
		closeWelcomeScreen()
	}
	const closeWelcomeScreen = () => {
		localStorage.setItem(APP_NAME + "_Visited", JSON.stringify(true))
		setHasVisited(true)
	}
	const checkUpdate = useCallback(async () => {
		await delay(1000)
		const visited = localStorage.getItem(APP_NAME + "_Visited")
		if (checkedUpdate) return
		const storedVersion = localStorage.getItem(APP_NAME + "_Version")
		if (!visited) {
			return localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
		}
		if (APP_VERSION !== storedVersion) {
			logger.log("Update V" + APP_VERSION + "\n" + UPDATE_MESSAGE, 6000)
			localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
		}
		setCheckedUpdate(true)
		if (!visited) return
		if (navigator.storage && navigator.storage.persist) {
			let isPersisted = await navigator.storage.persisted()
			if (!isPersisted) isPersisted = await navigator.storage.persist()
			console.log(isPersisted ? "Storage Persisted" : "Storage Not persisted")
		}
	}, [checkedUpdate])

	useEffect(() => {
		window.addEventListener('resize', handleResize)
		window.addEventListener('blur', handleBlur)
		checkUpdate()
		return () => {
			window.removeEventListener('resize', handleResize)
			window.removeEventListener('blur', handleBlur)
		}
	}, [checkUpdate, handleResize, handleBlur])

	useEffect(() => {
		Analytics.UIEvent('version', { version: APP_VERSION })
		Analytics.pageView(history.location.pathname.replace('/', ''))
		return history.listen((path: any) => {
			Analytics.pageView({
				page_title: path.pathName as string
			})
			historyTracker.addPage(path.pathName)
		})
	}, [history])
	return <>
		<Logger />
		<Home
			hasVisited={hasVisited}
			closeWelcomeScreen={closeWelcomeScreen}
			setDontShowHome={setDontShowHome}
			askForStorage={askForStorage}
		/>
		<AsyncPromptWrapper />
		{audioContextState !== 'running' &&
			<IconButton
				className='resume-audio-context box-shadow'
				size='3rem'
				onClick={() => {
					metronome.tick()
				}}
			>
				<FaVolumeMute style={{ width: '1.4rem', height: '1.4rem' }} />
			</IconButton>
		}
		<div className="rotate-screen">
			{isOnMobile && <>
				<img src={rotateImg} alt="icon for the rotating screen" />
				<p>
					For a better experience, add the website to the home screen, and rotate your device
				</p>
			</>}
			{!isOnMobile && <>
				<FaExpandAlt />
				<p>
					Please increase your window size
				</p>
			</>}
		</div>
	</>
}

export default withRouter(App)