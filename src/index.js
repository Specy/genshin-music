import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import Main from 'pages/Main';
import Composer from "pages/Composer"
import ErrorPage from "pages/ErrorPage"
import Changelogpage from 'pages/Changelog'
import Partners from 'pages/Partners';
import Help from 'pages/Help';
import SheetVisualizer from 'pages/SheetVisualizer';
import MidiSetup from 'pages/MidiSetup';
import Donate from 'pages/Donate'
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { HashRouter, Route, withRouter, Switch } from "react-router-dom";
import { delayMs } from "lib/Utils"
import { appName, appVersion, isTwa, updateMessage } from "appConfig"
import Logger from 'components/Index/Logger'
import rotateImg from "assets/icons/rotate.svg"
import Analytics from 'lib/Analytics';
import Home from 'components/Index/Home';
import HomeStore from 'stores/HomeStore';
import LoggerStore from 'stores/LoggerStore';
import Error404 from 'pages/404';

const App = withRouter(class extends Component {
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
})
class Index extends Component {
	render() {
		return <div className="index">
			<HashRouter>
				<App />
				<Switch>
					<Route exact path={"/ErrorPage"}>
						<ErrorPage />
					</Route>
					<Route exact path="/">
						<Main/>
					</Route>

					<Route exact path="/Player">
						<Main/>
					</Route>

					<Route exact path="/Composer">
						<Composer />
					</Route>

					<Route exact path="/Donate">
						<Donate />
					</Route>

					<Route exact path="/Changelog">
						<Changelogpage />
					</Route>

					<Route exact path="/Partners">
						<Partners />
					</Route>

					<Route exact path='/Help'>
						<Help />
					</Route>
					<Route exact path='/SheetVisualizer'>
						<SheetVisualizer />
					</Route>
					<Route exact path='/MidiSetup'>
						<MidiSetup />
					</Route>
					<Route path='*'>
						<Error404 />
					</Route>
				</Switch>

			</HashRouter>
			<div className="rotate-screen">
				<img src={rotateImg} alt="icon for the rotating screen">
				</img>
				For a better experience, add the website to the home screen, and rotate your device
			</div>
		</div>
	}
}

ReactDOM.render(
	<React.StrictMode>
		<Index />
	</React.StrictMode>,
	document.getElementById('root')
);


function setIfInTWA() {
	if (isTwa()) return console.log('inTWA')
	let isInTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', isInTwa)
}


setIfInTWA()
serviceWorkerRegistration.register();