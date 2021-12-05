import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import App from 'pages/Main';
import Composer from "pages/Composer"
import ErrorPage from "pages/ErrorPage"
import Changelogpage from 'pages/Changelog'
import Partners from 'pages/Partners';
import Home from 'pages/Home';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { HashRouter, Route, Redirect } from "react-router-dom";
import { LoggerEvent, delayMs } from "lib/SongUtils"
import { appName, appVersion, pages,isTwa } from "appConfig"
import FloatingMessage from 'components/FloatingMessage'
import Support from 'pages/Support';
import rotateImg from "assets/icons/rotate.svg"

class Index extends Component {
	constructor(props) {
		super(props)
		let path = window.location.href.split("/")
		path = path.length === 0 ? "" : path = path[path.length - 1]
		if (!pages.includes(path)) path = ""
		const hasVisited = localStorage.getItem(appName + "_Visited")
		let canShowHome = localStorage.getItem(appName + "_ShowHome")
		canShowHome = canShowHome === null ? 'true' : canShowHome
		this.state = {
			floatingMessage: {
				timestamp: 0,
				visible: false,
				text: "Text",
				title: "Title"
			},
			homeData: {
				canShow: canShowHome === 'true',
				visible: canShowHome === 'true',
				isInPosition: false,
				hasPersistentStorage: Boolean(navigator.storage && navigator.storage.persist)
			},
			selectedPage: path,
			hasVisited: hasVisited === 'true'
		}
		this.updateChecked = false
	}
	componentDidMount() {
		window.addEventListener('logEvent', this.logEvent);
		this.checkUpdate()	
	}
	changePage = (page) => {
		if(page === 'home') return this.toggleHome(true)
		if(this.state.homeData.visible) this.toggleHome(false)
		this.setState({
			selectedPage: page,
			homeVisible:false
		})
	}
	toggleHome = (override = false) =>{
		//TODO please refactor this
		const lastState = this.state.homeData
		if(override){ //if its to be shown then just show it
			return this.setState({
				homeData: {...lastState, visible:true, isInPosition:false }
			})
		}
		this.setState({ //if it needs to be hidden, first trigger the animation
			homeData: {...lastState, isInPosition:true }
		},() => {
			setTimeout(() => { //then demount it
				this.setState({
					homeData: {...lastState, visible: false }
				})
			},150)
		})
	}
	setDontShowHome = (override = false) => {
		localStorage.setItem(appName + "_ShowHome",override)
		const lastState = this.state.homeData
		this.setState({
			homeData: {...lastState, canShow:override }
		})
	}
	componentDidCatch() {
		this.setState({
			selectedPage: "ErrorPage"
		})
	}
	componentWillUnmount() {
		window.removeEventListener('logEvent', this.logEvent);
	}
	askForStorage = async () => {
		try {
			if (navigator.storage && navigator.storage.persist) {
				let result = await navigator.storage.persist()
				if (result) {
					new LoggerEvent("Success", "Storage permission allowed").trigger()
				} else {
					new LoggerEvent("Warning", "Storage permission refused, will try next time", 6000).trigger()
				}
			}
		} catch (e) {
			console.log(e)
			new LoggerEvent("Error", "There was an error with setting up persistent storage").trigger()
		}
		this.closeWelcomeScreen()
	}
	closeWelcomeScreen = () => {
		localStorage.setItem(appName + "_Visited", true)
		this.setState({
			hasVisited: true
		})
	}
	hideMessage = () => {
		let state = this.state
		state.floatingMessage.visible = false
		this.setState({
			floatingMessage: state.floatingMessage
		})
	}
	checkUpdate = async () => {
		await delayMs(1500) //wait for page to render
		if (this.updateChecked) return
		let currentVersion = appVersion
		let updateMessage =
			`   - Added Approaching circles mode, a new way to learn a song
				- Better performance in the main page
				- On pc, you can now add notes with your keyboard while playing
				- Added changelog page
				More info in the changelog page (Info tab)`
		let storedVersion = localStorage.getItem(appName + "_Version")
		if (!this.state.hasVisited) {
			return localStorage.setItem(appName + "_Version", currentVersion)
		}

		if (currentVersion !== storedVersion) {
			new LoggerEvent("Update V" + currentVersion, updateMessage, 6000).trigger()
			localStorage.setItem(appName + "_Version", currentVersion)
		}
		this.updateChecked = true
		if(!this.state.hasVisited) return
		if (navigator.storage && navigator.storage.persist) {
			let isPersisted = await navigator.storage.persisted()
			if (!isPersisted) isPersisted = await navigator.storage.persist()
			console.log(isPersisted ? "Storage Persisted" : "Storage Not persisted")
		}
	}

	logEvent = (error) => {
		error = error.detail
		error.timestamp = new Date().getTime()
		if (typeof error !== "object") return
		this.setState({
			floatingMessage: {
				timestamp: error.timestamp,
				visible: true,
				text: error.text,
				title: error.title
			}
		})
		setTimeout(() => {
			if (this.state.floatingMessage.timestamp !== error.timestamp) return
			this.setState({
				floatingMessage: {
					timestamp: 0,
					visible: false,
					text: "",
					title: ""
				}
			})
		}, error.timeout)
	}
	render() {
		const {floatingMessage, hasVisited,homeData} = this.state
		return <div className="index">

			<FloatingMessage 
				title={floatingMessage.title}
				visible={floatingMessage.visible}
				onClick={this.hideMessage}
				text={floatingMessage.text}
			/>
			{homeData.visible && <Home 
				toggleHome={this.toggleHome}
				changePage={this.changePage}
				setDontShowHome={this.setDontShowHome}
				askForStorage={this.askForStorage}
				hasVisited={hasVisited}
				data={homeData}
			/>}
			<HashRouter>
				<Redirect to={"/" + this.state.selectedPage}></Redirect>
				{this.state.selectedPage === "ErrorPage"
					? <Route exact path={"/ErrorPage"}>
						<ErrorPage changePage={this.changePage} />
					</Route>
					: <>
						<Route exact path={"/ErrorPage"}>
							<ErrorPage changePage={this.changePage} />
						</Route>
						<Route exact path="/">
							<App changePage={this.changePage} />
						</Route>

						<Route exact path="/Composer">
							<Composer changePage={this.changePage} />
						</Route>

						<Route exact path="/Support">
							<Support changePage={this.changePage} />
						</Route>

						<Route exact path="/Changelog">
							<Changelogpage changePage={this.changePage} />
						</Route>

						<Route exact path="/Partners">
							<Partners changePage={this.changePage} />
						</Route>

						<Route exact path='/Home'>
							<Home changePage={this.changePage} />
						</Route>
					</>
				}
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



