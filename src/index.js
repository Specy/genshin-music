import React, { Component } from 'react';
import ReactDOM from 'react-dom';
import App from './App';
import Composer from "./Composer"
import ErrorPage from "./Components/ErrorPage"
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import "./App.css"
import { BrowserRouter, Route, Redirect } from "react-router-dom";


const getBasename = path => path.substr(0, path.lastIndexOf('/'));
let pages = ["","Composer","ErrorPage"]
class Index extends Component {
  constructor(props) {
    super(props)
    let path = window.location.pathname.split("/")
    if(path.length !== 0){
      path = path[path.length - 1]
    }else{
      path = ""
    }
    if(!pages.includes(path)) path = ""
    this.state = {
      floatingMessage: {
        timestamp: 0,
        visible: false,
        text: "Text",
        title: "Title"
      },
      selectedPage: path
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
  componentDidCatch() {
    this.setState({
      selectedPage: "ErrorPage"
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
    let baseName = getBasename(window.location.pathname).replace("//","/")
    return <div className="index">
      <div className={floatingMessageClass}>
        <div className="floating-message-title">
          {floatingMessage.title}
        </div>
        <div className="floating-message-text">
          {floatingMessage.text}
        </div>
      </div>
      <BrowserRouter basename={baseName}>
        <Redirect to={"/" + this.state.selectedPage}></Redirect>
        {this.state.selectedPage === "ErrorPage"
          ? <Route exact path={"/ErrorPage"}>
            <ErrorPage changePage={this.changePage}/>
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

