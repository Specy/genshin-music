import { HashRouter, Route, Switch } from "react-router-dom";
import App from 'pages/App';
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
import Theme from 'pages/Theme'
import { ThemeProvider } from 'components/ThemeProvider';

export function Router() {
	return <div className="index">
		<HashRouter>
			<ThemeProvider>
				<App />
				<Switch>
					<Route exact path="/ErrorPage">
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
					<Route path='/Theme'>
						<Theme />
					</Route>
					<Route path='*'>
						<Error404 />
					</Route>
				</Switch>
			</ThemeProvider>
		</HashRouter>

	</div>
}