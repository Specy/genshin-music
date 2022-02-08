import React, { Component } from 'react';
import Analytics from 'lib/Analytics';
import Home from 'components/Index/Home';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import { delayMs } from "lib/Utils"
import { appName, appVersion, updateMessage } from "appConfig"
import Logger from 'components/Index/Logger'
import { withRouter } from "react-router-dom";
class App extends Component {
	constructor(props) {
		super(props)
		const hasVisited = localStorage.getItem(appName + "_Visited")
		let canShowHome = localStorage.getItem(appName + "_ShowHome")
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
		this.dispose = this.props.history.listen((path) => {
			Analytics.pageView({
				page_title: path.pathName
			})
		})
		Analytics.UIEvent('version', { version: appVersion })
		this.pageHeight = window.innerHeight

	}
	componentWillUnmount() {
		window.removeEventListener('resize', this.handleResize)
		window.removeEventListener('blur', this.handleBlur)
		this.dispose()
	}
	handleResize = () => {
		if (document.activeElement?.tagName === 'INPUT') {
			if (this.pageHeight === window.innerHeight || this.pageHeight !== 0) return
			return this.setHeight(this.pageHeight)
		}
		this.pageHeight = window.innerHeight
		this.resetHeight()
	}

	setHeight = (h) => {
		document.body.style.minHeight = h + 'px'
	}

	resetHeight = () => {
		document.body.style = ''
	}

	handleBlur = () => {
		const active = document.activeElement
		if (active.tagName === 'INPUT') active?.blur()
		this.resetHeight()
	}

	setDontShowHome = (override = false) => {
		localStorage.setItem(appName + "_ShowHome", override)
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
		localStorage.setItem(appName + "_Visited", true)
		this.setState({ hasVisited: true })
	}
	checkUpdate = async () => {
		await delayMs(1000)
		if (this.updateChecked) return
		let storedVersion = localStorage.getItem(appName + "_Version")
		if (!this.state.hasVisited) {
			return localStorage.setItem(appName + "_Version", appVersion)
		}

		if (appVersion !== storedVersion) {
			LoggerStore.log("Update V" + appVersion, updateMessage, 6000).trigger()
			localStorage.setItem(appName + "_Version", appVersion)
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
		</>
	}
}
export default withRouter(App)