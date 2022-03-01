import React, { Component } from 'react';
import Keyboard from "./Keyboard"
import Menu from "./Components/Menu"
import { DB } from 'Database';
import { SongStore } from 'stores/SongStore'
import { prepareSongImport, getPitchChanger } from "lib/Utils"
import { Song } from 'lib/Utils/Song';
import { ComposedSong } from 'lib/Utils/ComposedSong';
import { Recording } from 'lib/Utils/SongClasses';
import { MainPageSettings } from "lib/BaseSettings"
import Instrument from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { APP_NAME, AUDIO_CONTEXT, isTwa } from "appConfig"
import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import LoggerStore from 'stores/LoggerStore';
import { AppBackground } from 'components/AppBackground';

class Main extends Component {
	constructor(props) {
		super(props)
		this.recording = new Recording()
		let settings = this.getSettings()
		this.state = {
			instrument: new Instrument(),
			isLoadingInstrument: true,
			isRecording: false,
			isRecordingAudio: false,
			songs: [],
			settings: settings,
			isDragging: false,
			thereIsSong: false
		}
		this.mounted = false
		this.reverbNode = undefined
		this.reverbVolumeNode = undefined
		this.audioContext = AUDIO_CONTEXT
		this.recorder = new AudioRecorder()
	}

	init = async () => {
		const { settings } = this.state
		await this.loadInstrument(settings.instrument.value)
		await this.loadReverb()
		this.toggleReverbNodes(settings.caveMode.value)
	}
	componentDidMount() {
		document.body.addEventListener('dragenter', this.handleDrag)
		document.body.addEventListener('dragleave', this.resetDrag)
		document.body.addEventListener('dragover', this.handleDragOver)
		document.body.addEventListener('drop', this.handleDrop)
		window.addEventListener('keydown', this.handleKeyboard)
		this.mounted = true
		this.syncSongs()
		this.init()
	}
	componentWillUnmount() {
		document.body.removeEventListener('dragenter', this.handleDrag)
		document.body.removeEventListener('dragleave', this.resetDrag)
		document.body.removeEventListener('dragover', this.handleDragOver)
		document.body.removeEventListener('drop', this.handleDrop)
		window.removeEventListener('keydown', this.handleKeyboard)

		SongStore.reset()
		this.mounted = false
		this.audioContext = undefined
		this.recorder = undefined
		this.reverbNode = undefined
		this.reverbVolumeNode = undefined
		this.state.instrument.delete()
	}

	componentDidCatch() {
		LoggerStore.warn("There was an error with the song! Restoring default...")
		SongStore.reset()
	}

	handleKeyboard = async (event) => {
		const { thereIsSong } = this.state
		if (event.repeat) return
		if (document.activeElement.tagName === "INPUT") return
		if (event.shiftKey) {
			switch (event.code) {
				case "KeyC": {
					if (!thereIsSong) {
						this.toggleRecord()
						event.preventDefault()
					}
					break;
				}
				default: break;
			}
		}
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
		const files = await Promise.all(Array.from(e.dataTransfer.files).map(file => file.text()))
		try {
			for (let i = 0; i < files.length; i++) {
				const songs = JSON.parse(files[i])
				for (let j = 0; j < songs.length; j++) {
					let song = prepareSongImport(songs[j])
					await this.addSong(song)
				}
			}
		} catch (e) {
			console.error(e)
		}

	}

	toggleReverbNodes = (hasReverb) => {
		if (!this.mounted) return
		const { instrument } = this.state
		if (hasReverb) {
			if (!this.reverbNode) return console.log("Couldn't connect to reverb")
			instrument.disconnect()
			instrument.connect(this.reverbNode)
		} else {
			instrument.disconnect()
			instrument.connect(this.audioContext.destination)
		}
	}

	changeVolume = (obj) => {
		let settings = this.state.settings
		if (obj.key === "instrument") {
			settings.instrument = { ...settings.instrument, volume: obj.value }
			this.state.instrument.changeVolume(obj.value)
		}
		this.setState({
			settings: settings
		}, () => this.updateSettings())
	}

	getSettings = () => {
		//TODO export this into a function / class
		let storedSettings = localStorage.getItem(APP_NAME + "_Main_Settings")
		try {
			storedSettings = JSON.parse(storedSettings)
		} catch (e) {
			storedSettings = null
		}
		if (storedSettings !== null) {
			if (storedSettings.other?.settingVesion !== MainPageSettings.other.settingVesion) {
				this.updateSettings(MainPageSettings.data)
				return MainPageSettings.data
			}
			return storedSettings.data
		}
		return MainPageSettings.data
	}

	loadInstrument = async (name) => {
		this.state.instrument?.delete?.()
		let newInstrument = new Instrument(name)
		newInstrument.changeVolume(this.state.settings.instrument.volume || 100)
		this.setState({ isLoadingInstrument: true })
		await newInstrument.load()
		if (!this.mounted) return
		newInstrument.connect(this.audioContext.destination)
		this.setState({
			instrument: newInstrument,
			isLoadingInstrument: false
		}, () => this.toggleReverbNodes(this.state.settings.caveMode.value))
	}

	loadReverb() {
		//TODO export this to a function 
		return new Promise(resolve => {
			fetch("./assets/audio/reverb4.wav")
				.then(r => r.arrayBuffer())
				.then(b => {
					if (!this.mounted) return
					this.audioContext.decodeAudioData(b, (impulse_response) => {
						if (!this.mounted) return
						let convolver = this.audioContext.createConvolver()
						let gainNode = this.audioContext.createGain()
						gainNode.gain.value = 2.5
						convolver.buffer = impulse_response
						convolver.connect(gainNode)
						gainNode.connect(this.audioContext.destination)
						this.reverbVolumeNode = gainNode
						this.reverbNode = convolver
						resolve()
					})
				}).catch((e) => {
					console.log("Error with reverb", e)
				})
		})
	}

	playSound = (note) => {
		const { state } = this
		const { settings } = state
		if (note === undefined) return
		if (state.isRecording) this.handleRecording(note)
		this.state.instrument.play(note.index, getPitchChanger(settings.pitch.value))
	}

	updateSettings = (override) => {
		//TODO make settings a global state and wrap it into a class to update it
		const state = {
			other: MainPageSettings.other,
			data: override !== undefined ? override : this.state.settings
		}
		localStorage.setItem(APP_NAME + "_Main_Settings", JSON.stringify(state))
	}

	handleSettingChange = (setting) => {
		const { settings } = this.state
		const { data } = setting
		settings[setting.key] = { ...settings[setting.key], value: data.value }
		if (setting.key === "instrument") {
			this.loadInstrument(data.value)
		}
		if (setting.key === 'caveMode') {
			this.toggleReverbNodes(data.value)
		}
		this.setState({
			settings: settings,
		}, this.updateSettings)
	}

	syncSongs = async () => {
		const songs = (await DB.getSongs()).map((song) => {
			if(song.data?.isComposedVersion) return ComposedSong.deserialize(song)
			return Song.deserialize(song)
		})
		this.setState({
			songs: songs
		})
	}

	songExists = async (name) => {
		return await DB.existsSong({ name: name })
	}

	addSong = async (song) => {
		try {
			if (await this.songExists(song.name)) {
				return LoggerStore.warn("A song with this name already exists! \n" + song.name)
			}
			await DB.addSong(song)
			this.syncSongs()
			LoggerStore.success(`Song added to the ${song.data.isComposedVersion ? "Composed" : "Recorded"} tab!`, 4000)
		} catch (e) {
			console.error(e)

			return new LoggerStore.error('There was an error importing the song')
		}
	}

	removeSong = async (name) => {
		let result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
		if (!this.mounted) return
		if (result) {
			await DB.removeSong({ name: name })
			this.syncSongs()
		}
		Analytics.userSongs('delete',{ name: name, page: 'player' })
	}

	handleRecording = (note) => {
		if (this.state.isRecording) {
			this.recording.addNote(note.index)
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
			if (!this.mounted) return
			const song = new Song(songName, this.recording.notes)
			song.pitch = this.state.settings.pitch.value
			if (songName !== null) {
				this.addSong(song)
				Analytics.userSongs('record',{ name: songName, page: 'player' })
			}
		} else {
			this.recording = new Recording()
		}
		this.state.isRecording = newState
		this.setState({
			open: this.state.isRecording
		})

	}

	toggleRecordAudio = async (override) => {
		if (!this.mounted) return
		if (typeof override !== "boolean") override = undefined
		const { instrument } = this.state
		const { recorder } = this
		const hasReverb = this.state.settings.caveMode.value
		const newState = override !== undefined ? override : !this.state.isRecordingAudio
		if (newState) {
			if (hasReverb) {
				this.reverbVolumeNode.connect(recorder.node)
			} else {
				instrument.connect(recorder.node)
			}
			recorder.start()
		} else {
			let recording = await recorder.stop()
			let fileName = await asyncPrompt("Write the song name, press cancel to ignore")
			if (!this.mounted) return
			if (fileName) recorder.download(recording.data, fileName + '.wav')
			this.toggleReverbNodes(hasReverb)
			this.reverbVolumeNode.disconnect()
			this.reverbVolumeNode.connect(this.audioContext.destination)

		}
		this.setState({
			isRecordingAudio: newState
		})
	}
	changePage = (page) => {
		this.props.history.push(page)
	}
	render() {
		const { state } = this
		const keyboardFunctions = {
			changeSliderState: this.changeSliderState,
			playSound: this.playSound,
			setHasSong: this.setHasSong
		}
		const keyboardData = {
			isLoading: state.isLoadingInstrument,
			keyboard: state.instrument,
			pitch: state.settings.pitch.value,
			keyboardSize: state.settings.keyboardSize.value,
			noteNameType: state.settings.noteNameType.value,
			hasSong: state.thereIsSong,
			hasAnimation: state.settings.noteAnimation.value,
			approachRate: state.settings.approachSpeed.value,
			keyboardYPosition: state.settings.keyboardYPosition.value
		}
		const menuFunctions = {
			addSong: this.addSong,
			removeSong: this.removeSong,
			changePage: this.changePage,
			handleSettingChange: this.handleSettingChange,
			changeVolume: this.changeVolume
		}
		const menuData = {
			songs: state.songs,
			settings: state.settings
		}

		return <AppBackground page='Main'>
			{SongStore.eventType !== 'approaching' &&
				<div className='record-button'>
					<AppButton
						active={state.isRecordingAudio}
						click={this.toggleRecordAudio}
					>
						{state.isRecordingAudio ? "Finish recording" : "Record audio"}
					</AppButton>
				</div>
			}

			{state.isDragging && <div className='drag-n-drop'>
				Drop file here
			</div>}
			<Menu functions={menuFunctions} data={menuData} />
			<div className="right-panel">
				<div className="upper-right">
					{!this.state.thereIsSong
						&&
						<AppButton
							active={state.isRecording}
							click={this.toggleRecord}
							style={{ marginTop: "0.8rem" }}
						>
							{state.isRecording ? "Stop" : "Record"}
						</AppButton>

					}
				</div>
				<div className="keyboard-wrapper" style={{ marginBottom: '2vh' }}>
					<Keyboard
						key={state.instrument.instrumentName}
						data={keyboardData}
						functions={keyboardFunctions}
					/>
				</div>
			</div>
		</AppBackground>


	}
}


function setIfInTWA() {
	if (isTwa()) return console.log('inTWA')
	let isInTwa = document.referrer.includes('android-app://')
	sessionStorage.setItem('isTwa', isInTwa)
}
setIfInTWA()
function AppButton(props) {
	let className = "genshin-button " + (props.active ? "selected" : "")
	return <button className={className} onClick={props.click} style={{ ...(props.style || {}) }}>
		{props.children}
	</button>
}
export default withRouter(Main);
