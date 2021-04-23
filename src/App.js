import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Components/audio/Keyboard"
import Menu from "./Components/menu/Menu"
import ZangoDb from "zangodb"
import { Song, Recording, LoggerEvent, PlayingSong, ComposerToRecording } from "./Components/SongUtils"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt, faStop } from '@fortawesome/free-solid-svg-icons'
import rotateImg from "./assets/icons/rotate.svg"
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
        },
        practicingSong: {
          timestamp: 0,
          notes: []
        }
      },
      isRecording: false,
      songs: [],

      sliderState: {
        position: 0,
        size: 0
      },
      thereIsSong: false
    }
    this.syncSongs()
  }

  syncSongs = async () => {
    let songs = await this.dbCol.songs.find().toArray()
    this.setState({
      songs: songs
    })
  }
  practiceSong = async (song, start = 0) => {
    await this.stopSong()
    let oldState = this.state.keyboardData.practicingSong
    oldState.notes = song.notes
    oldState.timestamp = new Date().getTime()
    let songToPractice = JSON.parse(JSON.stringify(this.state.keyboardData.practicingSong))
    songToPractice.start = start
    this.setState({
      keyboardData: this.state.keyboardData,
      thereIsSong: true
    }, () => {
      let event = new CustomEvent("practiceSong", { detail: songToPractice })
      window.dispatchEvent(event)
    })
  }
  //to add the composed songs
  songExists = async (name) => {
    return await this.dbCol.songs.findOne({ name: name }) !== undefined
  }
  addSong = async (song) => {
    if (await this.songExists(song.name)) {
      return new LoggerEvent("Warning", "A song with this name already exists! \n" + song.name).trigger()
    }
    await this.dbCol.songs.insert(song)
    this.syncSongs()
  }
  removeSong = (name) => {
    this.dbCol.songs.remove({ name: name }, this.syncSongs)
  }
  handleRecording = (note) => {
    if (this.state.isRecording) {
      this.recording.addNote(note.index)
    }
  }
  handleSliderEvent = (event) => {

    this.changeSliderState({
      position: Number(event.target.value),
      size: this.state.sliderState.size
    })
  }
  stopSong = () => {
    return new Promise(resolve => {
      this.setState({
        thereIsSong: false,
        keyboardData: {
          practicingSong: new PlayingSong([]),
          playingSong: new PlayingSong([])
        }
      }, () => {
        let event = new CustomEvent("playSong", { detail: new PlayingSong([]) })
        window.dispatchEvent(event)
        event = new CustomEvent("practiceSong", { detail: new PlayingSong([]) })
        window.dispatchEvent(event)
        resolve()
      })
    })
  }
  changeSliderState = (newState) => {
    this.setState({
      sliderState: newState
    })
  }
  playSong = async (song) => {
    await this.stopSong()

    if(song.data.isComposedVersion){
      song = ComposerToRecording(song)
    }
    let playingSong = {
      timestamp: new Date().getTime(),
      notes: song.notes
    }
    this.state.keyboardData.playingSong = playingSong
    this.setState({
      keyboardData: this.state.keyboardData,
      thereIsSong: true
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
        if (songName === null) break
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
      if (songName !== null) this.addSong(song)
    } else {
      this.recording = new Recording()
      let eventData = new PlayingSong([])
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
      handleRecording: this.handleRecording,
      changeSliderState: this.changeSliderState,
      stopSong: this.stopSong
    }
    let menuFunctions = {
      addSong: this.addSong,
      removeSong: this.removeSong,
      playSong: this.playSong,
      practiceSong: this.practiceSong,
      stopSong: this.stopSong,
      changePage: this.props.changePage
    }
    let menuData = {
      songs: state.songs
    }
    
    return <div className="app">
      <div className="rotate-screen">
        <img src={rotateImg}>
        </img>
          For a better experience, add the website to the home screen, and rotate your device
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
        <div className="keyboard-wrapper">
          <div className={this.state.thereIsSong ? "slider-wrapper" : "slider-wrapper hidden-opacity"}>
            <button className="song-button" onClick={this.stopSong}>
              <FontAwesomeIcon icon={faStop} />
            </button>
            <input
              type="range"
              className="slider"
              min={0}
              onChange={this.handleSliderEvent}
              max={state.sliderState.size}
              value={state.sliderState.position}
            ></input>
            <button className="song-button" onClick={() => this.practiceSong(state.keyboardData.practicingSong, state.sliderState.position)}>
              <FontAwesomeIcon icon={faSyncAlt} />
            </button>
          </div>

          <Keyboard
            data={state.keyboardData}
            functions={keyboardFunctions}
            isRecording={state.isRecording}
          />
        </div>

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
