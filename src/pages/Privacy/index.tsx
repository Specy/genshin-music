import { SimpleMenu } from 'components/SimpleMenu'
import { Title } from 'components/Title'

export default function Privacy() {
    return <div className='default-page'>
        <Title text="Privacy" />

        <SimpleMenu />
        <div className='default-content'>
            <span>
                This website uses cookies to collect data about usage of the app through IP anonymized Google Analytics.
                We use this information to improve user experience and find how our users use the app.
                All data (songs, themes, folders, etc) produced by you is stored in the browser.

                If you wish to see how Google Analytics collects data, please visit 
                <a 
                    href='https://support.google.com/analytics/answer/11593727' 
                    target='_blank' 
                    rel="noreferrer"
                    style={{color: 'var(--primary-text)', textDecoration: "underline", marginLeft: '0.3rem'}}
                    >
                        here.
                    </a>

            </span>
        </div>
    </div>
}