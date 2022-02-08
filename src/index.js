import React from 'react';
import ReactDOM from 'react-dom';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { HashRouter, Route, Switch } from "react-router-dom";
import { isTwa } from "lib/Utils"
import rotateImg from "assets/icons/rotate.svg"

import Main from 'pages/Main';
import Composer from "pages/Composer"
import ErrorPage from "pages/ErrorPage"
import Changelogpage from 'pages/Changelog'
import Partners from 'pages/Partners';
import Help from 'pages/Help';
import SheetVisualizer from 'pages/SheetVisualizer';
import MidiSetup from 'pages/MidiSetup';
import Donate from 'pages/Donate'
import Error404 from 'pages/404';
import { App } from 'pages/App';

function Index() {
	return <div className="index">
		<HashRouter>
			<App />
			<Switch>
				<Route exact path={"/ErrorPage"}>
					<ErrorPage />
				</Route>
				<Route exact path="/">
					<Main />
				</Route>
				<Route exact path="/Player">
					<Main />
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