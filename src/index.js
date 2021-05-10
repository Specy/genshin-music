import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import Composer from "./Composer"
import ErrorPage from "./Components/ErrorPage"
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import "./App.css"
import { BrowserRouter, Route, Redirect } from "react-router-dom";
import { LoggerEvent } from "./Components/SongUtils"
import {appName} from "./appConfig"
const getBasename = path => path.substr(0, path.lastIndexOf('/'));
let pages = ["", "Composer", "ErrorPage"]
class Index extends Component {
  constructor(props) {
    super(props)
    let path = window.location.pathname.split("/")
    if (path.length !== 0) {
      path = path[path.length - 1]
    } else {
      path = ""
    }
    if (!pages.includes(path)) path = ""
    this.state = {
      floatingMessage: {
        timestamp: 0,
        visible: false,
        text: "Text",
        title: "Title"
      },
      hasVisited: localStorage.getItem(appName+"_Visited"),
      hasPersistentStorage: navigator.storage && navigator.storage.persist,
      selectedPage: path
    }
    this.checkUpdate()
  }
  componentDidMount() {
    window.addEventListener('logEvent', this.logEvent);
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
          new LoggerEvent("Denied", "Storage permission refused, reload if you want to try again").trigger()
        }
      }
    } catch (e) {
      console.log(e)
      new LoggerEvent("Error", "There was an error with setting up persistent storage").trigger()
    }
    this.closeWelcomeScreen()
  }
  closeWelcomeScreen = () => {
    localStorage.setItem(appName+"_Visited", true)
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
  checkUpdate = () => {
    setTimeout(() => {
      let currentVersion = 1.1
      let updateMessage =
        `
          Added tools in composer
          Fixed song loading bugs and others fixes
        `
      let storedVersion = localStorage.getItem(appName+"_Version")
      if (currentVersion != storedVersion) {
        console.log("update")
        new LoggerEvent("Update V" + currentVersion, updateMessage, 8000).trigger()
        localStorage.setItem(appName+"_Version", currentVersion)
      }
    }, 1000)
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
    let floatingMessage = this.state.floatingMessage
    let floatingMessageClass = floatingMessage.visible ? "floating-message floating-message-visible" : "floating-message"
    let baseName = getBasename(window.location.pathname).replace("//", "/")
    return <div className="index">
      <div className={floatingMessageClass} onClick={this.hideMessage}>
        <div className="floating-message-title">
          {floatingMessage.title}
        </div>
        <div className="floating-message-text">
          {floatingMessage.text}
        </div>
      </div>
      {[null, false, "false"].includes(this.state.hasVisited) ?
        <div className="welcome-message">
          <div className={"welcome-message-title"}>Welcome to {appName} music {appName==="Sky" ? "nightly" : ""}</div>
          <div>
            This is a webapp which is run in your browser, if you currently are on one, please add
            the website to the homescreen to have a fullscreen view and a more "app" feel.
            <br /><br />
            <div className="red-text">WARNING</div>: Clearing your browser cache / storage might also delete your songs, make sure to
            make a backup sometimes.
            <br /><br />
            {this.state.hasPersistentStorage ?
              <div>
                To prevent your browser from automatically clearing the app storage, click the "confirm" button below, if asked,
                allow permission to keep the website data (Persistent storage).
              </div>

              : null}



          </div>
          <div className="welcome-message-button-wrapper">
            <button className="welcome-message-button" onClick={this.askForStorage}>
              Confirm
                </button>
          </div>
        </div> : null
      }
      <BrowserRouter basename={baseName}>
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

          </>
        }

      </BrowserRouter>
    </div>
  }
}

ReactDOM.render(
  <React.StrictMode>
    <Index />

  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();

