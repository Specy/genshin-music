import { Component } from 'react';
import Keyboard from "./Keyboard"
import Menu from "./Components/Menu"
import { DB } from 'Database';
import { SongStore } from 'stores/SongStore'
import { prepareSongImport, getPitchChanger } from "lib/Utils/Tools"
import { SerializedSong, Song } from 'lib/Utils/Song';
import { ComposedSong, SerializedComposedSong } from 'lib/Utils/ComposedSong';
import { Recording } from 'lib/Utils/SongClasses';
import { MainPageSettings, MainPageSettingsDataType, MainPageSettingsType } from "lib/BaseSettings"
import Instrument, { NoteData } from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { APP_NAME, AUDIO_CONTEXT, isTwa, PitchesType } from "appConfig"
import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import LoggerStore from 'stores/LoggerStore';
import { AppBackground } from 'components/AppBackground';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { InstrumentKeys, NoteNameType } from 'types/GeneralTypes';
import { AppButton } from 'components/AppButton';



class Player extends Component{
	state: {
		songs: ComposedSong[] | Song[]
		settings: MainPageSettingsDataType
		instrument: Instrument
		isDragging: boolean
		isLoadingInstrument: boolean
		isRecordingAudio: boolean
		isRecording: boolean
		thereIsSong: boolean
	}
	recording: Recording
	mounted: boolean
	reverbNode: ConvolverNode | null
	audioContext: AudioContext | null
	reverbVolumeNode: GainNode | null
	recorder: AudioRecorder | null

	constructor(props: any) {
		super(props)
		this.recording = new Recording()
		const settings = this.getSettings()
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
		this.reverbNode = null
		this.reverbVolumeNode = null
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
		this.audioContext = null
		this.recorder = null
		this.reverbNode = null
		this.reverbVolumeNode = null
		this.state.instrument.delete()
	}

	componentDidCatch() {
		LoggerStore.warn("There was an error with the song! Restoring default...")
		SongStore.reset()
	}

	handleKeyboard = async (event: KeyboardEvent) => {
		const { thereIsSong } = this.state
		if (event.repeat) return
		if (document.activeElement?.tagName === "INPUT") return
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

	resetDrag = () => {
		this.setState({
			isDragging: false
		})
	}

	handleDragOver = (e: DragEvent) => {
		e.preventDefault()
		this.setState({
			isDragging: true
		})
	}

	handleDrag = (e: DragEvent) => {
		e.preventDefault()
		this.setState({
			isDragging: true
		})
	}

	setHasSong = (data: boolean) => {
		this.setState({
			thereIsSong: data
		})
	}

	handleDrop = async (e: DragEvent) => {
		this.resetDrag()
		e.preventDefault()
		const files = await Promise.all(Array.from(e.dataTransfer?.files || []).map(file => file.text()))
		try {
			for (let i = 0; i < files.length; i++) {
				const songs = JSON.parse(files[i])
				for (let j = 0; j < songs.length; j++) {
					await this.addSong(prepareSongImport(songs[j]))
				}
			}
		} catch (e) {
			console.error(e)
		}

	}

	toggleReverbNodes = (override: boolean) => {
		if (!this.mounted) return
		const { instrument } = this.state
		if(!this.audioContext) return
		if (override) {
			if (!this.reverbNode) return console.log("Couldn't connect to reverb")
			instrument.disconnect()
			instrument.connect(this.reverbNode)
		} else {
			instrument.disconnect()
			instrument.connect(this.audioContext.destination)
		}
	}

	changeVolume = (obj: SettingVolumeUpdate) => {
		let settings = this.state.settings
		if (obj.key === "instrument") {
			settings.instrument = { ...settings.instrument, volume: obj.value }
			this.state.instrument.changeVolume(obj.value)
		}
		this.setState({
			settings: settings
		}, this.updateSettings)
	}

	getSettings = () => {
        const json = localStorage.getItem(APP_NAME + "_Player_Settings")
        try {
            const storedSettings = JSON.parse(json || 'null') as MainPageSettingsType | null
            if (storedSettings) {
                if (storedSettings.other?.settingVersion !== MainPageSettings.other.settingVersion) {
                    this.updateSettings(MainPageSettings.data)
                    return MainPageSettings.data
                }
                return storedSettings.data
            }
            return MainPageSettings.data
        } catch (e) {
            return MainPageSettings.data
        }
	}

	loadInstrument = async (name: InstrumentKeys) => {
		this.state.instrument?.delete?.()
		let newInstrument = new Instrument(name)
		newInstrument.changeVolume(this.state.settings.instrument.volume || 100)
		this.setState({ isLoadingInstrument: true })
		await newInstrument.load()
		if (!this.mounted || !this.audioContext) return
		newInstrument.connect(this.audioContext.destination)
		this.setState({
			instrument: newInstrument,
			isLoadingInstrument: false
		}, () => this.toggleReverbNodes(this.state.settings.caveMode.value))
	}

	loadReverb() : Promise<void>{
		//TODO export this to a function 
		return new Promise(resolve => {
			fetch("./assets/audio/reverb4.wav")
				.then(r => r.arrayBuffer())
				.then(b => {
					if (!this.mounted || !this.audioContext) return
					this.audioContext.decodeAudioData(b, (impulse_response) => {
						if (!this.mounted || !this.audioContext) return
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

	playSound = (note: NoteData) => {
		const { state } = this
		const { settings } = state
		if (note === undefined) return
		if (state.isRecording) this.handleRecording(note)
		this.state.instrument.play(note.index, getPitchChanger(settings.pitch.value as PitchesType))
	}

	updateSettings = (override?: MainPageSettingsDataType) => {
		//TODO make settings a global state and wrap it into a class to update it
		const state = {
			other: MainPageSettings.other,
			data: override !== undefined ? override : this.state.settings
		}
		localStorage.setItem(APP_NAME + "_Player_Settings", JSON.stringify(state))
	}

	handleSettingChange = (setting: SettingUpdate) => {
		const { settings } = this.state
		const { data } = setting
		//@ts-ignore
		settings[setting.key] = { ...settings[setting.key], value: data.value }
		if (setting.key === "instrument") {
			this.loadInstrument(data.value as InstrumentKeys)
		}
		if (setting.key === 'caveMode') {
			this.toggleReverbNodes(data.value as boolean)
		}
		this.setState({
			settings: settings,
		}, this.updateSettings)
	}

	syncSongs = async () => {
		const songs = (await DB.getSongs()).map((song) => {
			if(song.data?.isComposedVersion) return ComposedSong.deserialize(song as SerializedComposedSong)
			return Song.deserialize(song as SerializedSong)
		})
		this.setState({
			songs: songs
		})
	}
	songExists = async (name: string) => {
		return await DB.existsSong({ name: name })
	}

	addSong = async (song: Song | ComposedSong) => {
		try {
			if (await this.songExists(song.name)) {
				return LoggerStore.warn("A song with this name already exists! \n" + song.name)
			}
			await DB.addSong(song.serialize())
			this.syncSongs()
			LoggerStore.success(`Song added to the ${song.isComposed ? "Composed" : "Recorded"} tab!`, 4000)
		} catch (e) {
			console.error(e)
			return LoggerStore.error('There was an error importing the song')
		}
	}

	removeSong = async (name: string) => {
		let result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
		if (!this.mounted) return
		if (result) {
			await DB.removeSong({ name: name })
			this.syncSongs()
		}
		Analytics.userSongs('delete',{ name: name, page: 'player' })
	}

	handleRecording = (note: NoteData) => {
		if (this.state.isRecording) {
			this.recording.addNote(note.index)
		}
	}

	askForSongName = (): Promise<string | null> => {
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

	toggleRecord = async (override?: boolean | null) => {
		if (typeof override !== "boolean") override = null
		const newState = override !== null ? override : !this.state.isRecording
		if (!newState && this.recording.notes.length > 0) { //if there was a song recording
			const songName = await this.askForSongName()
			if (!this.mounted) return
			if (songName !== null) {
				const song = new Song(songName, this.recording.notes)
				song.pitch = this.state.settings.pitch.value as PitchesType
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

	toggleRecordAudio = async (override?: boolean | null) => {
		if (!this.mounted) return
		if (typeof override !== "boolean") override = null
		const { instrument } = this.state
		const { recorder } = this
		const hasReverb = this.state.settings.caveMode.value
		const newState = override !== null ? override : !this.state.isRecordingAudio
		if(!this.reverbVolumeNode || !recorder || !this.audioContext) return
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
	changePage = (page: string) => {
		//@ts-ignore
		this.props.history.push(page)
	}
	render() {
		const { state } = this
		const keyboardFunctions = {
			playSound: this.playSound,
			setHasSong: this.setHasSong
		}
		const keyboardData = {
			isLoading: state.isLoadingInstrument,
			keyboard: state.instrument,
			pitch: state.settings.pitch.value as PitchesType,
			keyboardSize: state.settings.keyboardSize.value,
			noteNameType: state.settings.noteNameType.value as NoteNameType,
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
						
						toggled={state.isRecordingAudio}
						onClick={this.toggleRecordAudio}
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
							toggled={state.isRecording}
							onClick={this.toggleRecord}
							style={{ marginTop: "0.8rem" }}
						>
							{state.isRecording ? "Stop" : "Record"}
						</AppButton>

					}
				</div>
				<div className="keyboard-wrapper" style={{ marginBottom: '2vh' }}>
					<Keyboard
						key={state.instrument.layout.length}
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
	sessionStorage.setItem('isTwa', JSON.stringify(isInTwa))
}
setIfInTWA()
//@ts-ignore
export default withRouter(Player);
