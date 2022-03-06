

import { StrictMode} from 'react';
import {render} from 'react-dom';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { isTwa } from "appConfig"
import { Router } from './Router'

render(
	<StrictMode>
		<Router />
	</StrictMode>,
	document.getElementById('root')
);

function setIfInTWA() {
	if (isTwa()) return console.log('inTWA')
	const isInTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', JSON.stringify(isInTwa))
}


setIfInTWA()
serviceWorkerRegistration.register();






