import React, { Component } from 'react';
import './App.css';
import Keyboard from "./Keyboard"
import Menu from "./Menu"
import ZangoDb from "zangodb"
import { Song, Recording, LoggerEvent, prepareSongImport, getPitchChanger } from "../SongUtils"
import { MainPageSettings } from "../SettingsObj"

import { asyncConfirm, asyncPrompt } from "../AsyncPrompts"
import rotateImg from "../../assets/icons/rotate.svg"
import { appName } from "../../appConfig"
import Instrument from "../Instrument"
import { songStore } from './SongStore'
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
			instrument: new Instrument(),
			audioContext: new (window.AudioContext || window.webkitAudioContext)(),
			reverbAudioContext: new (window.AudioContext || window.webkitAudioContext)(),
			isRecording: false,
			songs: [],
			settings: settings,

			isDragging: false,
			thereIsSong: false
		}
		this.loadInstrument(settings.instrument.value)
		this.syncSongs()
	}

	componentDidMount() {
		document.body.addEventListener('dragenter', this.handleDrag)
		document.body.addEventListener('dragleave', this.resetDrag)
		document.body.addEventListener('dragover', this.handleDragOver)
		document.body.addEventListener('drop', this.handleDrop)
	}
	componentWillUnmount() {
		document.body.removeEventListener('dragenter', this.handleDrag)
		document.body.removeEventListener('dragleave', this.resetDrag)
		document.body.removeEventListener('drop', this.handleDrop)
		document.body.addEventListener('dragover', this.handleDragOver)
	}
	resetDrag = (e) => {
		this.setState({
			isDragging: false
		})
	}
	handleDragOver = (e) => {
		e.preventDefault()
		this.setState({
			isDragging: true
		})
	}
	handleDrag = (e) => {
		e.preventDefault()
		this.setState({
			isDragging: true
		})
	}
	setHasSong = (data) => {
		this.setState({
			thereIsSong: data
		})
	}
	handleDrop = async (e) => {
		this.resetDrag()
		e.preventDefault()
		let songs = await Promise.all(Array.from(e.dataTransfer.files).map(file => file.text()))
		for (let i = 0; i < songs.length; i++) {
			try {
				let song = prepareSongImport(JSON.parse(songs[i]))
				await this.addSong(song)
			} catch (e) {
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
	loadInstrument = async (name) => {
		let newInstrument = new Instrument(name)
		await newInstrument.load(this.state.audioContext)
		this.setState({
			instrument: newInstrument
		})
	}
	loadReverb() {
		let audioCtx = this.state.audioContext
		fetch("./assets/audio/reverb4.wav")
			.then(r => r.arrayBuffer())
			.then(b => {
				audioCtx.decodeAudioData(b, (impulse_response) => {
					let convolver = audioCtx.createConvolver()
					let gainNode = audioCtx.createGain()
					gainNode.gain.value = 2.5
					convolver.buffer = impulse_response
					convolver.connect(gainNode)
					gainNode.connect(audioCtx.destination)
					this.setState({
						reverbAudioContext: convolver
					})
				})
			}).catch((e) => {
				console.log("Error with reverb1", e)
			})
	}
	playSound = (note) => {
		const { state } = this
		const { settings } = state
		if (note === undefined) return
		if (state.isRecording) this.handleRecording(note)
		const source = state.audioContext.createBufferSource()
		source.playbackRate.value = getPitchChanger(settings.pitch.value)
		source.buffer = note.buffer
		if (settings.caveMode.value) {
			source.connect(state.reverbAudioContext)
		} else {
			source.connect(state.audioContext.destination)
		}
		source.start(0)
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

	songExists = async (name) => {
		return await this.dbCol.songs.findOne({ name: name }) !== undefined
	}
	addSong = async (song) => {
		try {
			if (await this.songExists(song.name)) {
				return new LoggerEvent("Warning", "A song with this name already exists! \n" + song.name).trigger()
			}
			await this.dbCol.songs.insert(song)
			this.syncSongs()
			new LoggerEvent("Success", `Song added to the ${song.data.isComposedVersion ? "Composed" : "Recorded"} tab!`, 4000).trigger()
		} catch (e) {
			console.error(e)
			return new LoggerEvent("Error", 'There was an error importing the song').trigger()
		}

	}
	componentDidCatch() {
		new LoggerEvent("Warning", "There was an error with the song! Restoring default...").trigger()
		songStore.data = {
			song: {}, eventType: 'stop', start: 0
		}
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


	stopSong = () => {
		songStore.data = {
			song: {},
			start: 0,
			eventType: 'stop'
		}
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
		if (!newState && this.recording.notes.length > 0) { //if there was a song recording
			let songName = await this.askForSongName()
			let song = new Song(songName, this.recording.notes)
			song.pitch = this.state.settings.pitch.value
			if (songName !== null) this.addSong(song)
		} else {
			this.recording = new Recording()
		}
		this.state.isRecording = newState
		this.setState({
			open: this.state.isRecording
		})
	}
	render() {
		const { state } = this
		let keyboardFunctions = {
			changeSliderState: this.changeSliderState,
			playSound: this.playSound,
			setHasSong: this.setHasSong
		}
		let keyboardData = {
			keyboard: state.instrument,
			pitch: state.settings.pitch.value,
			keyboardSize: state.settings.keyboardSize.value,
			noteNameType: state.settings.noteNameType.value,
			hasSong: state.thereIsSong,
			hasAnimation: state.settings.noteAnimation.value,
			approachRate: state.settings.approachSpeed.value
		}
		let menuFunctions = {
			addSong: this.addSong,
			removeSong: this.removeSong,
			changePage: this.props.changePage,
			handleSettingChange: this.handleSettingChange,

		}
		let menuData = {
			songs: state.songs,
			settings: state.settings
		}

		return <div className='app bg-image' style={{ backgroundImage: `url(${state.settings.backgroundImage.value})` }}>
				<div className="rotate-screen">
					<img src={rotateImg} alt="icon for the rotating screen">
					</img>
					For a better experience, add the website to the home screen, and rotate your device
				</div>
				{state.isDragging && <div className='drag-n-drop'>
					Drop file here	
				</div>}
				<Menu functions={menuFunctions} data={menuData} />
				<div className="right-panel">
					<div className="upper-right">
						{!this.state.thereIsSong
							&&
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
							key={state.instrument.instrumentName}
							data={keyboardData}
							functions={keyboardFunctions}
						/>
					</div>

				</div>
		</div>


	}
}

function checkIfTWA() {
	let isTwa = JSON.parse(sessionStorage.getItem('isTwa'))
	return isTwa
}

function setIfInTWA() {
	if (checkIfTWA()) return console.log('inTWA')
	let isTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', isTwa)
}
setIfInTWA()
function GenshinButton(props) {
	let className = "genshin-button record-btn " + (props.active ? "selected" : "")
	return <button className={className} onClick={props.click}>
		{props.children}
	</button>
}
export default App;
