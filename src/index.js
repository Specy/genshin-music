import React, { Component, useState } from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import Composer from "./Composer"
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import "./App.css"


class Index extends Component {
  constructor(props) {
    super(props)
    this.state = {
      floatingMessage: {
        timestamp: 0,
        visible: false,
        text: "Text",
        title: "Title"
      },
      selectedPage: "Composer"
    }
  }
  componentDidMount() {
    window.addEventListener('logEvent', this.logEvent);
  }
  changePage = (page) => {
    this.setState({
      selectedPage: page
    })
  }
  componentWillUnmount() {
    window.removeEventListener('logEvent', this.logEvent);
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
  
    return <div className="index">
      <div className={floatingMessageClass}>
        <div className="floating-message-title">
          {floatingMessage.title}
        </div>
        <div className="floating-message-text">
          {floatingMessage.text}
        </div>
      </div>
      {this.state.selectedPage === "App" ?<App changePage={this.changePage} /> : <></>}
      {this.state.selectedPage === "Composer" ?<Composer changePage={this.changePage}/> : <></>}
    </div>
  }
}

ReactDOM.render(
  <React.StrictMode>
    <Index/>

  </React.StrictMode>,
  document.getElementById('root')
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register();

