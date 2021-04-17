import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Components/audio/Keyboard"
import Menu from "./Components/menu/Menu"
import ZangoDb from "zangodb"
import { Song, Recording, LoggerEvent} from "./Components/SongUtils"
class App extends Component {
  constructor(props) {
    super(props)
    this.db = new ZangoDb.Db("Genshin", { songs: [] })
    this.recording = new Recording()
    this.dbCol = {
      songs: this.db.collection("songs")
    }
    this.state = {
      keyboardData: {
        instrument: "lyre",
        playingSong: {
          timestamp: 0,
          notes: []
        }
      },
      isRecording: false,
      songs: [],
      floatingMessage: {
        timestamp: 0,
        visible: false,
        text: "Text",
        title: "Title"
      }
    }
    this.syncSongs()
  }
  componentDidMount() {
    window.addEventListener('logEvent', this.logEvent);
  }
  componentWillUnmount() {
    window.removeEventListener('logEvent', this.logEvent);
  }
  logEvent = (error) => {
    error = error.detail
    error.timestamp = new Date().getTime()
    if(typeof error !== "object") return
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
  syncSongs = async () => {
    let songs = await this.dbCol.songs.find().toArray()
    this.setState({
      songs: songs
    })
  }
  songExists = async (name) => {
    return await this.dbCol.songs.findOne({ name: name }) !== undefined
  }
  addSong = async (song) => {
    if (await this.songExists(song.name)){
      return new LoggerEvent("Warning","A song with this name already exists! \n"+ song.name).trigger()
    }
    await this.dbCol.songs.insert(song)
    this.syncSongs()
  }
  removeSong = async (name) => {
    this.dbCol.songs.remove({ name: name }, this.syncSongs)
  }
  handleRecording = (note) => {
    if (this.state.isRecording) {
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
    let event = new CustomEvent("playSong", { detail: playingSong })
    window.dispatchEvent(event)
  }
  toggleRecord = async (override) => {
    if (typeof override !== "boolean") override = undefined
    let newState = override !== undefined ? override : !this.state.isRecording
    if (!newState && this.recording.notes.length > 0) {
      let songName
      let promptString = "Write song name, press cancel to ignore"
      while (true) {
        songName = prompt(promptString)
        if (songName !== "") {
          if (await this.songExists(songName)) {
            promptString = "This song already exists: " + songName
          } else {
            break
          }
        } else {
          promptString = "Write song name, press cancel to ignore"
        }
      }
      let song = new Song(songName, this.recording.notes)
      this.addSong(song)
    } else {
      this.recording = new Recording()
      let eventData = {
        timestamp: new Date().getTime(),
        notes: []
      }
      let event = new CustomEvent("playSong", { detail: eventData })
      window.dispatchEvent(event)
    }
    this.state.isRecording = newState
    this.setState({
      open: this.state.isRecording
    })
  }
  render() {
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
      songs: state.songs
    }
    let floatingMessage = this.state.floatingMessage
    let floatingMessageClass = floatingMessage.visible ? "floating-message floating-message-visible" : "floating-message"
    return <div className="app">
      <div className={floatingMessageClass}>
        <div className="floating-message-title">
          {floatingMessage.title}
        </div>
        <div className="floating-message-text">
          {floatingMessage.text}
        </div>
      </div>
      <Menu functions={menuFunctions} data={menuData} />
      <div className="right-panel">
        <div className="upper-right">
          <GenshinButton
            active={state.isRecording}
            click={this.toggleRecord}
          >
            {state.isRecording ? "Stop" : "Record"}
          </GenshinButton>
        </div>
        <Keyboard
          data={state.keyboardData}
          functions={keyboardFunctions}
          isRecording={state.isRecording}
        />
      </div>

    </div>
  }
}



function GenshinButton(props) {
  let className = "genshin-button " + (props.active ? "selected" : "")
  return <button className={className} onClick={props.click}>
    {props.children}
  </button>
}
export default App;
