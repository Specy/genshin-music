import { SimpleMenu } from 'components/SimpleMenu'

export default function Privacy() {
    return <div className='default-page partners-page'>
        <SimpleMenu />
        <div className='default-content partner-wrapper'>
            This website uses cookies to collect data about usage of the app through IP anonymized Google Analytics.
            We use this information to improve user experience and find how our users use the app. 
            All data (songs, themes, folders, etc) produced by you is stored in the browser.

            If you wish to see how Google Analytics collects data, please visit <a href='https://support.google.com/analytics/answer/11593727' target='_blank' rel="noreferrer">here</a>.
        </div>
    </div>
}