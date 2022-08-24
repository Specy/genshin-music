import 'pepjs';
import { StrictMode } from 'react';
import { render } from 'react-dom';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { Router } from './Router'
import { setIfInTWA } from '$lib/Utilities'
import { IS_TAURI } from './appConfig';

render(
	<StrictMode>
		<Router />
	</StrictMode>,
	document.getElementById('root')
)

setIfInTWA()
if(!IS_TAURI) serviceWorkerRegistration.register()



