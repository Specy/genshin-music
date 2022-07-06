import { useCallback, useEffect, useState } from 'react';
import Analytics from 'lib/Analytics';
import Home from 'components/Index/Home';
import HomeStore from 'stores/HomeStore';
import { logger } from 'stores/LoggerStore';
import { delay } from "lib/Utilities"
import { APP_NAME, APP_VERSION, UPDATE_MESSAGE } from "appConfig"
import Logger from 'components/Index/Logger'
import rotateImg from "assets/icons/rotate.svg"

import { withRouter } from "react-router-dom";
import './App.css';
import './Utility.css'
import { historyTracker } from 'stores/History';

function App({history}:any) {
	const [hasVisited, setHasVisited] = useState(false)
	const [checkedUpdate, setCheckedUpdate] = useState(false)
	const [pageHeight, setPageHeight] = useState(0)

	useEffect(() => {
		const hasVisited = localStorage.getItem(APP_NAME + "_Visited")
		let canShowHome = localStorage.getItem(APP_NAME + "_ShowHome")
		canShowHome = canShowHome === null ? 'true' : canShowHome
		HomeStore.setState({
			canShow: canShowHome === 'true',
			visible: canShowHome === 'true',
			isInPosition: false,
			hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
		})
		setHasVisited(hasVisited === 'true')
		setPageHeight(window.innerHeight)
	}, [])

	const setHeight = useCallback((h: number) => {
		document.body.style.minHeight = h + 'px'
	},[])

	const resetHeight = useCallback(() => {
		//@ts-ignore
		document.body.style = ''
	},[])

	const handleResize = useCallback(() => {
		if (document.activeElement?.tagName === 'INPUT') {
			if (pageHeight === window.innerHeight || pageHeight === 0) return
			return setHeight(pageHeight)
		}
		setHeight(window.innerHeight)
		resetHeight()
	},[pageHeight,resetHeight, setHeight])

	const handleBlur = useCallback(() => {
		const active = document.activeElement
		//@ts-ignore
		if (active && active.tagName === 'INPUT') active?.blur()
		resetHeight()
	},[resetHeight])

	const setDontShowHome = useCallback((override = false) => {
		localStorage.setItem(APP_NAME + "_ShowHome", JSON.stringify(override))
		HomeStore.setState({ canShow: override })
	},[])

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
		const visited  = localStorage.getItem(APP_NAME + "_Visited")
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
	},[checkedUpdate])

	useEffect(() => {
		window.addEventListener('resize', handleResize)
		window.addEventListener('blur', handleBlur)
		checkUpdate()
		return () => {
			window.removeEventListener('resize', handleResize)
			window.removeEventListener('blur', handleBlur)
		}
	},[checkUpdate,handleResize, handleBlur])

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
		<div className="rotate-screen">
			<img src={rotateImg} alt="icon for the rotating screen">
			</img>
			For a better experience, add the website to the home screen, and rotate your device
		</div>
	</>
}

export default withRouter(App)