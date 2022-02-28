import { APP_NAME } from "appConfig"
import React from "react"


interface WelcomePopupProps{
    hasPersistentStorage: boolean,
    askForStorage: (e: any) => void
}
export default function WelcomePopup({ hasPersistentStorage, askForStorage }: WelcomePopupProps) {
    return <div className="welcome-message">
        <div className='welcome-overflow'>
            <div className={"welcome-message-title"}>Welcome to {APP_NAME} music {APP_NAME === "Sky" ? "nightly" : ""}</div>
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
            <button className="welcome-message-button" onClick={askForStorage}>
                Confirm
            </button>
        </div>
    </div>
}