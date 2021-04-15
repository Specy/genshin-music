import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Components/audio/Keyboard"
import Menu from "./Components/menu/Menu"
import ZangoDb from "zangodb"
import {Song, Recording} from "./Components/SongUtils"
class App extends Component{
  constructor(props){
      super(props)
      this.db = new ZangoDb.Db("Genshin",{songs: []})
      this.recording = new Recording()
      this.dbCol = {
        songs:  this.db.collection("songs")
      }
      this.state = {
          keyboardData: {
            instrument: "lyre",
            playingSong: {
              timestamp: new Date().getTime(),
              notes: []
            }
          },
          isRecording: false,
          songs: [],

      }
      this.syncSongs()
  }
  syncSongs = async () => {
    let songs = await this.dbCol.songs.find().toArray()
    this.setState({
      songs: songs
    })
  }
  songExists = async (name) => {
    return await this.dbCol.songs.findOne({name: name}) !== undefined
  }
  addSong = async (song) => {
    await this.dbCol.songs.insert(song)
    this.syncSongs()
  }
  removeSong = async (name) => {
    this.dbCol.songs.remove({name: name},this.syncSongs)
  }
  handleRecording = (note) => {
      if(this.state.isRecording){
        this.recording.addNote(note.index)
      }
  }
  playSong = (song) => {
    let playingSong = {
      timestamp: new Date().getTime(),
      notes: song.notes
    }
    this.state.keyboardData.playingSong = playingSong
    this.setState({
      keyboardData: this.state.keyboardData
    })
    let event = new CustomEvent("playSong",{detail: playingSong})
    window.dispatchEvent(event)
  }
  toggleRecord = async (override) => {
    if(typeof override !== "boolean") override = undefined
    let newState = override !== undefined ? override : !this.state.isRecording
    if(!newState && this.recording.notes.length > 0){
      let songName
      let promptString = "Write song name, press cancel to ignore"
      while(true){
        songName = prompt(promptString)
        if(songName !== ""){
          if(await this.songExists(songName)){
            promptString = "This song already exists: " + songName
          }else{
            break
          }
        }else{
          promptString = "Write song name, press cancel to ignore"
        }
      }
      let song = new Song(songName,this.recording.notes)
      this.addSong(song)
    }else{
      this.recording = new Recording()
      let eventData = {
        timestamp: new Date().getTime(),
        notes: []
      }
      let event = new CustomEvent("playSong",{detail: eventData})
      window.dispatchEvent(event)
    }
    this.state.isRecording = newState
    this.setState({
        open: this.state.isRecording
    })
  }
  render(){
      let state = this.state
      let keyboardFunctions = {
        handleRecording: this.handleRecording
      }
      let menuFunctions = {
        addSong: this.addSong,
        removeSong: this.removeSong,
        playSong: this.playSong
      }
      let menuData = {
        songs: this.state.songs
      }
      return <div className="app">
      <Menu functions={menuFunctions} data={menuData}/>
      <div className="right-panel">
        <div className="upper-right">
          <GenshinButton 
            active={this.state.isRecording} 
            click={this.toggleRecord}
          >
            {this.state.isRecording ? "Stop" : "Record"}
          </GenshinButton>
        </div>
        <Keyboard 
          data={state.keyboardData} 
          functions={keyboardFunctions}
          isRecording={this.state.isRecording}
          />
      </div>
      
      </div>
  }
}



function GenshinButton(props){
  let className = "genshin-button " + (props.active ? "selected" : "")
  return  <button className={className} onClick={props.click}>
      {props.children}
</button>
}
export default App;
