import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Keyboard"
import Menu from "./Menu"
import ZangoDb from "zangodb"
import { Song, Recording, LoggerEvent, PlayingSong, ComposerToRecording, prepareSongImport} from "../SongUtils"
import { MainPageSettings } from "../SettingsObj"
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSyncAlt, faStop } from '@fortawesome/free-solid-svg-icons'
import { asyncConfirm, asyncPrompt } from "../AsyncPrompts"
import rotateImg from "../../assets/icons/rotate.svg"
import { appName } from "../../appConfig"

class App extends Component {
  constructor(props) {
    super(props)
    this.db = new ZangoDb.Db(appName, { songs: [] })
    this.recording = new Recording()
    let settings = this.getSettings()
    this.dbCol = {
      songs: this.db.collection("songs")
    }
    this.state = {
      keyboardData: {
        instrument: settings.instrument.value,
        playingSong: {
          timestamp: 0,
          notes: []
        },
        practicingSong: {
          timestamp: 0,
          notes: [],
          threshold: 100
        }
      },
      isRecording: false,
      songs: [],
      settings: settings,
      sliderState: {
        position: 0,
        size: 0
      },
      thereIsSong: "none",
      isDragging: false
    }
    this.lastPlayedSong = new Recording()
    this.syncSongs()
  }
  
  componentDidMount(){
    document.body.addEventListener('dragenter',this.handleDrag)
    document.body.addEventListener('dragleave',this.resetDrag)
    document.body.addEventListener('dragover',this.handleDragOver)
    document.body.addEventListener('drop',this.handleDrop)
  }
  componentWillUnmount(){
    document.body.removeEventListener('dragenter',this.handleDrag)
    document.body.removeEventListener('dragleave',this.resetDrag)
    document.body.removeEventListener('drop',this.handleDrop)
    document.body.addEventListener('dragover',this.handleDragOver)
  }
  resetDrag = (e) =>{
    this.setState({
      isDragging:false
    })
  }
  handleDragOver= (e) =>{
    e.preventDefault()
    this.setState({
      isDragging:true
    })
  }
  handleDrag = (e) =>{
    e.preventDefault()
    this.setState({
      isDragging:true
    })
  }
  handleDrop = async(e) =>{
    this.resetDrag()
    e.preventDefault()
    let songs = await Promise.all(Array.from(e.dataTransfer.files).map(file => file.text()))
    for(let i = 0; i<songs.length;i++){
      try{
        let song = prepareSongImport(JSON.parse(songs[i]))
        await this.addSong(song)
      }catch(e){
        console.error(e)
      }

    }
  }
  getSettings = () => {
    let storedSettings = localStorage.getItem(appName + "_Main_Settings")
    try {
      storedSettings = JSON.parse(storedSettings)
    } catch (e) {
      storedSettings = null
    }
    if (storedSettings !== null) {
      if (storedSettings.settingVesion !== MainPageSettings.settingVesion) {
        this.updateSettings(MainPageSettings)
        return MainPageSettings
      }
      return storedSettings
    }
    return MainPageSettings
  }
  updateSettings = (override) => {
    let state
    if (override !== undefined) {
      state = override
    } else {
      state = this.state.settings
    }
    localStorage.setItem(appName + "_Main_Settings", JSON.stringify(state))
  }
  handleSettingChange = (setting) => {
    let settings = this.state.settings
    let data = setting.data
    settings[setting.key].value = data.value
    if (setting.key === "instrument") {
      this.loadInstrument(data.value)
    }
    this.setState({
      settings: settings,
    }, this.updateSettings)
  }
  syncSongs = async () => {
    let songs = await this.dbCol.songs.find().toArray()
    this.setState({
      songs: songs
    })
  }
  loadInstrument = (instrument) => {
    let state = this.state
    state.keyboardData.instrument = instrument
    this.setState({
      keyboardData: state.keyboardData
    })
  }
  practiceSong = async (song, start = 0) => {
    await this.stopSong()
    let oldState = this.state.keyboardData.practicingSong
    if (song.data?.isComposedVersion) {
      song = ComposerToRecording(song)
      oldState.threshold = 10
    }
    oldState.notes = song.notes
    oldState.timestamp = new Date().getTime()
    let songToPractice = JSON.parse(JSON.stringify(this.state.keyboardData.practicingSong))
    songToPractice.start = start
    this.setState({
      keyboardData: this.state.keyboardData,
      thereIsSong: "practicing"
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
    try{
      if (await this.songExists(song.name)) {
        return new LoggerEvent("Warning", "A song with this name already exists! \n" + song.name).trigger()
      }
      await this.dbCol.songs.insert(song)
      this.syncSongs()
      new LoggerEvent("Success", `Song added to the ${song.data.isComposedVersion ? "Composed" : "Recorded"} tab!`, 4000).trigger()
    }catch(e){
      console.error(e)
      return new LoggerEvent("Error", 'There was an error importing the song').trigger()
    }
    
  }
  componentDidCatch() {
    new LoggerEvent("Warning", "There was an error with the song! Restoring default...").trigger()
    this.stopSong()
  }
  removeSong = async (name) => {
    let result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
    if (result) {
      this.dbCol.songs.remove({ name: name }, this.syncSongs)
    }
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
      let keyboardData = this.state.keyboardData
      keyboardData.practicingSong = new PlayingSong([])
      keyboardData.playingSong = new PlayingSong([])
      this.setState({
        thereIsSong: "none",
        keyboardData: keyboardData
      }, () => {
        let event = new CustomEvent("playSong", { detail: new PlayingSong([]) })
        window.dispatchEvent(event)
        event = new CustomEvent("practiceSong", { detail: new PlayingSong([]) })
        window.dispatchEvent(event)
        setTimeout(resolve, 300)
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
    let settings = this.state.settings
    settings.pitch.value = song.pitch
    if (song.data.isComposedVersion) {
      song = ComposerToRecording(song)
    }
    let playingSong = {
      timestamp: new Date().getTime(),
      notes: song.notes
    }
    this.state.keyboardData.playingSong = playingSong
    this.setState({
      keyboardData: this.state.keyboardData,
      thereIsSong: "playing",
      settings:settings
    })

    let event = new CustomEvent("playSong", { detail: playingSong })
    window.dispatchEvent(event)
    this.lastPlayedSong = song
  }
  askForSongName = () => {
    return new Promise(async resolve => {
        let promptString = "Write song name, press cancel to ignore"
        while (true) {
            let songName = await asyncPrompt(promptString)
            if (songName === null) return resolve(null)
            if (songName !== "") {
                if (await this.songExists(songName)) {
                    promptString = "This song already exists: " + songName
                } else {
                    return resolve(songName)
                }
            } else {
                promptString = "Write song name, press cancel to ignore"
            }
        }
    })

}
  toggleRecord = async (override) => {
    if (typeof override !== "boolean") override = undefined
    let newState = override !== undefined ? override : !this.state.isRecording
    if (!newState && this.recording.notes.length > 0) {
      let songName = await this.askForSongName()
      let song = new Song(songName, this.recording.notes)
      song.pitch = this.state.settings.pitch.value
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
      changePage: this.props.changePage,
      handleSettingChange: this.handleSettingChange,
    }
    let menuData = {
      songs: state.songs,
      settings: this.state.settings
    }

    return <div className="app">
      <div className="rotate-screen">
        <img src={rotateImg}>
        </img>
          For a better experience, add the website to the home screen, and rotate your device
      </div>
      {state.isDragging && <div className='drag-n-drop'>
          Drop file here
      </div>}
      <Menu functions={menuFunctions} data={menuData} />
      <div className="right-panel">
        <div className="upper-right">
          {this.state.thereIsSong !== "none"
            ? <div className="slider-wrapper">
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
              <button className="song-button" onClick={async () => {
                if (this.state.thereIsSong === "practicing") {
                  this.practiceSong(state.keyboardData.practicingSong, state.sliderState.position)
                } else {
                  await this.stopSong()
                  this.playSong(this.lastPlayedSong)
                }
              }}>
                <FontAwesomeIcon icon={faSyncAlt} />
              </button>
            </div>
            :
            <GenshinButton
              active={state.isRecording}
              click={this.toggleRecord}
            >
              {state.isRecording ? "Stop" : "Record"}
            </GenshinButton>

          }



        </div>
        <div className="keyboard-wrapper">

          <Keyboard
            key={state.keyboardData.instrument}
            data={state.keyboardData}
            settings={this.state.settings}
            functions={keyboardFunctions}
            isRecording={state.isRecording}
          />
        </div>

      </div>

    </div>
  }
}

function checkIfTWA(){
  let isTwa = JSON.parse(sessionStorage.getItem('isTwa'))
  return isTwa
}

function setIfInTWA(){
  if(checkIfTWA()) return console.log('inTWA')
  let isTwa = document.referrer.includes('android-app://')
  sessionStorage.setItem('isTwa',isTwa)
}
setIfInTWA()
function GenshinButton(props) {
  let className = "genshin-button record-btn " + (props.active ? "selected" : "")
  return <button className={className} onClick={props.click}>
    {props.children}
  </button>
}
export default App;
