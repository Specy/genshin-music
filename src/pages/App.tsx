import { Component } from 'react';
import Analytics from 'lib/Analytics';
import Home from 'components/Index/Home';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { delay } from "lib/Utils/Tools"
import { APP_NAME, APP_VERSION, UPDATE_MESSAGE } from "appConfig"
import Logger from 'components/Index/Logger'
import rotateImg from "assets/icons/rotate.svg"

import { withRouter } from "react-router-dom";
import './App.css';


class App extends Component<any>{
	state: {
		hasVisited: boolean
	}
	updateChecked: boolean
	pageHeight: number
	dispose: () => void
	constructor(props: any) {
		super(props)
		const hasVisited = localStorage.getItem(APP_NAME + "_Visited")
		let canShowHome = localStorage.getItem(APP_NAME + "_ShowHome")
		canShowHome = canShowHome === null ? 'true' : canShowHome
		HomeStore.setState({
			canShow: canShowHome === 'true',
			visible: canShowHome === 'true',
			isInPosition: false,
			hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
		})
		this.state = {
			hasVisited: hasVisited === 'true'
		}
		this.updateChecked = false
		this.pageHeight = 0
		this.dispose = () => { }
	}
	componentDidMount() {
		window.addEventListener('resize', this.handleResize)
		window.addEventListener('blur', this.handleBlur)
		this.checkUpdate()
		this.dispose = this.props.history.listen((path: any) => {
			Analytics.pageView({
				page_title: path.pathName as string
			})
		})
		Analytics.UIEvent('version', { version: APP_VERSION })
		Analytics.pageView(this.props?.history?.location?.pathname.replace('/', ''))
		this.pageHeight = window.innerHeight

	}
	componentWillUnmount() {
		window.removeEventListener('resize', this.handleResize)
		window.removeEventListener('blur', this.handleBlur)
		this.dispose()
	}
	handleResize = () => {
		if (document.activeElement?.tagName === 'INPUT') {
			if (this.pageHeight === window.innerHeight || this.pageHeight === 0) return
			return this.setHeight(this.pageHeight)
		}
		this.pageHeight = window.innerHeight
		this.resetHeight()
	}

	setHeight = (h: number) => {
		document.body.style.minHeight = h + 'px'
	}

	resetHeight = () => {
		//@ts-ignore
		document.body.style = ''
	}

	handleBlur = () => {
		const active = document.activeElement
		//@ts-ignore
		if (active && active.tagName === 'INPUT') active?.blur()
		this.resetHeight()
	}

	setDontShowHome = (override = false) => {
		localStorage.setItem(APP_NAME + "_ShowHome", JSON.stringify(override))
		HomeStore.setState({ canShow: override })
	}

	askForStorage = async () => {
		try {
			if (navigator.storage && navigator.storage.persist) {
				let result = await navigator.storage.persist()
				if (result) {
					LoggerStore.success("Storage permission allowed")
				}
			}
		} catch (e) {
			console.log(e)
			LoggerStore.error("There was an error with setting up persistent storage")
		}
		this.closeWelcomeScreen()
	}
	closeWelcomeScreen = () => {
		localStorage.setItem(APP_NAME + "_Visited", JSON.stringify(true))
		this.setState({ hasVisited: true })
	}
	checkUpdate = async () => {
		await delay(1000)
		if (this.updateChecked) return
		let storedVersion = localStorage.getItem(APP_NAME + "_Version")
		if (!this.state.hasVisited) {
			return localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
		}
		if (APP_VERSION !== storedVersion) {
			LoggerStore.log("Update V" + APP_VERSION, UPDATE_MESSAGE, 6000)
			localStorage.setItem(APP_NAME + "_Version", APP_VERSION)
		}
		this.updateChecked = true
		if (!this.state.hasVisited) return
		if (navigator.storage && navigator.storage.persist) {
			let isPersisted = await navigator.storage.persisted()
			if (!isPersisted) isPersisted = await navigator.storage.persist()
			console.log(isPersisted ? "Storage Persisted" : "Storage Not persisted")
		}
	}
	render() {
		const { hasVisited } = this.state
		return <>
			<Logger />
			<Home
				hasVisited={hasVisited}
				closeWelcomeScreen={this.closeWelcomeScreen}
				setDontShowHome={this.setDontShowHome}
				askForStorage={this.askForStorage}
			/>
			<div className="rotate-screen">
				<img src={rotateImg} alt="icon for the rotating screen">
				</img>
				For a better experience, add the website to the home screen, and rotate your device
			</div>
		</>
	}
}
export default withRouter(App)