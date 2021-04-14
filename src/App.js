import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Components/audio/Keyboard"
import Menu from "./Components/menu/Menu"
class App extends Component{
  constructor(props){
      super(props)
      this.state = {
          keyboardData: {
            instrument: "lyre"
          }
      }
  }
  render(){
      let state = this.state
      return <div className="app">
      <Menu/>
      <div className="right-panel">
        <div className="upper-right">
          
        </div>
        <Keyboard data={state.keyboardData}/>
      </div>
      
      </div>
  }
}
export default App;
