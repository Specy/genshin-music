import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import App from 'pages/mainPage';
import Composer from "pages/Composer"
import ErrorPage from "pages/ErrorPage"
import Changelogpage from 'pages/Changelog'
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { HashRouter, Route, Redirect } from "react-router-dom";
import { LoggerEvent, delayMs } from "lib/SongUtils"
import { appName, appVersion, pages,isTwa } from "appConfig"
import FloatingMessage from 'components/FloatingMessage'

let updateChecked = false
class Index extends Component {
	constructor(props) {
		super(props)
		let path = window.location.href.split("/")
		path = path.length === 0 ? "" : path = path[path.length - 1]
		if (!pages.includes(path)) path = ""
		let hasVisited = localStorage.getItem(appName + "_Visited")
		hasVisited = hasVisited === null ? false : Boolean(hasVisited)
		this.state = {
			floatingMessage: {
				timestamp: 0,
				visible: false,
				text: "Text",
				title: "Title"
			},
			updateChecked: false,
			hasPersistentStorage: navigator.storage && navigator.storage.persist,
			selectedPage: path,
			hasVisited: hasVisited
		}
	}
	componentDidMount() {
		window.addEventListener('logEvent', this.logEvent);
		this.checkUpdate()	
	}
	changePage = (page) => {
		this.setState({
			selectedPage: page
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
					new LoggerEvent("Warning", "Storage permission refused, if you weren't prompt, your browser denied it for you. Don't worry, it will still work fine", 6000).trigger()
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
		if (updateChecked) return
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
		updateChecked = true
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
		const {floatingMessage, hasPersistentStorage} = this.state
		return <div className="index">
			<FloatingMessage 
				title={floatingMessage.title}
				visible={floatingMessage.visible}
				onClick={this.hideMessage}
				text={floatingMessage.text}
			/>
			{!this.state.hasVisited && 
				<WelcomePopup 
					hasPersistentStorage={hasPersistentStorage}
				/>
			}
			<HashRouter>
				<Redirect to={"/" + this.state.selectedPage}></Redirect>
				{this.state.selectedPage === "ErrorPage"
					? <Route exact path={"/ErrorPage"}>
						<ErrorPage changePage={this.changePage} />
					</Route>
					: <>
						<Route exact path="/">
							<App changePage={this.changePage} />
						</Route>

						<Route exact path="/Composer">
							<Composer changePage={this.changePage} />
						</Route>

						<Route exact path="/Changelog">
							<Changelogpage changePage={this.changePage} />
						</Route>
					</>
				}
			</HashRouter>
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

function WelcomePopup(props){
	const { hasPersistentStorage } = props
	return <div className="welcome-message">
	<div className='welcome-overflow'>
		<div className={"welcome-message-title"}>Welcome to {appName} music {appName === "Sky" ? "nightly" : ""}</div>
		<div>
			This is a webapp which is run in your browser, if you currently are on one, please add
			the website to the homescreen to have a fullscreen view and a more "app" feel.
			<br /><br />
			<div className="red-text">WARNING</div>: Clearing your browser cache / storage might also delete your songs, make sure to
			make a backup sometimes.
			<br /><br />
			{hasPersistentStorage ?
				<div>
					<div className="red-text">WARNING</div>: To prevent your browser from automatically clearing the app storage, click the "confirm" button below, if asked,
					allow permission to keep the website data (Persistent storage). If it doesn't work, the program will try to request it again at every launch.
				</div>
				: null
			}
		</div>
	</div>
	<div className="welcome-message-button-wrapper">
		<button className="welcome-message-button" onClick={this.askForStorage}>
			Confirm
		</button>
	</div>
</div> 
}
setIfInTWA()
serviceWorkerRegistration.register();



