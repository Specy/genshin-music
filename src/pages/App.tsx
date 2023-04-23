import { useCallback, useEffect, useState } from 'react';
import Analytics from '$lib/Stats';
import Home from '$cmp/Index/Home';
import { homeStore } from '$stores/HomeStore';
import { logger } from '$stores/LoggerStore';
import { delay } from "$lib/Utilities"
import { APP_NAME, APP_VERSION, UPDATE_MESSAGE } from "$config"
import rotateImg from "$/assets/icons/rotate.svg"
import { historyTracker } from '$stores/History';
import { FaExpandAlt } from 'react-icons/fa';
import { checkIfneedsUpdate } from '$lib/needsUpdate';
import { settingsService } from '$lib/Services/SettingsService';
import { linkServices } from '$stores/globalLink';
import { useRouter } from 'next/router';
import Image from 'next/image';
import isMobile from 'is-mobile';


function AppBase() {
	const [hasVisited, setHasVisited] = useState(false)
	const [checkedUpdate, setCheckedUpdate] = useState(false)
	const [isOnMobile, setIsOnMobile] = useState(false)
	const router = useRouter()

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
		let canShowHome = localStorage.getItem(APP_NAME + "_ShowHome")
		canShowHome = canShowHome === null ? 'true' : canShowHome
		homeStore.setState({
			canShow: canShowHome === 'true',
			visible: canShowHome === 'true',
			isInPosition: false,
			hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
		})
		setIsOnMobile("ontouchstart" in window || isMobile())
		setHasVisited(hasVisited === 'true')
		checkIfneedsUpdate()
		linkServices()
		const lastBackupWarning = settingsService.getLastBackupWarningTime()
		//if the last backup warning was more than 2 weeks ago, show the backup warning
		if (lastBackupWarning > 0 && Date.now() - lastBackupWarning > 1000 * 60 * 60 * 24 * 14) {
			logger.warn("You haven't backed up your songs in a while, remember to download the backup sometimes!", 8000)
			settingsService.setLastBackupWarningTime(Date.now())
		}
	}, [])
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
	useEffect(() => {
		async function checkUpdate() {
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
		}
		checkUpdate()
	}, [checkedUpdate])
	useEffect(() => {
		Analytics.UIEvent('version', { version: APP_VERSION })
		Analytics.pageView({
			page_title: router.pathname
		})
		return router.events.on("beforeHistoryChange", (path: any) => {
			Analytics.pageView({
				page_title: path.pathName as string
			})
			historyTracker.addPage(path.pathName)
		})
	}, [router])
	return <>
		<Home
			hasVisited={hasVisited}
			closeWelcomeScreen={closeWelcomeScreen}
			setDontShowHome={setDontShowHome}
			askForStorage={askForStorage}
		/>
		<div className="rotate-screen">
			{isOnMobile && <>
				<Image
					src={rotateImg}
					alt="icon for the rotating screen"
				/>
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


export default AppBase

