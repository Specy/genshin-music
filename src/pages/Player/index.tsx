import { Component } from 'react';
import Keyboard from "./Keyboard"
import Menu from "./Components/Menu"
import { DB } from 'Database';
import { SongStore } from 'stores/SongStore'
import { parseSong, getPitchChanger } from "lib/Utils/Tools"
import { SerializedSong, Song } from 'lib/Utils/Song';
import { ComposedSong, SerializedComposedSong } from 'lib/Utils/ComposedSong';
import { Recording } from 'lib/Utils/SongClasses';
import { MainPageSettings, MainPageSettingsDataType, MainPageSettingsType } from "lib/BaseSettings"
import Instrument, { NoteData } from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { APP_NAME, AUDIO_CONTEXT, PitchesType } from "appConfig"
import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import LoggerStore from 'stores/LoggerStore';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { InstrumentName, NoteNameType } from 'types/GeneralTypes';
import { AppButton } from 'components/AppButton';
import { KeyboardListener } from 'lib/KeyboardListener';
import { AudioProvider } from 'lib/AudioProvider';


interface PlayerState{
	songs: (ComposedSong | Song)[]
	settings: MainPageSettingsDataType
	instrument: Instrument
	isDragging: boolean
	isLoadingInstrument: boolean
	isRecordingAudio: boolean
	isRecording: boolean
	hasSong: boolean
}
class Player extends Component<any,PlayerState>{
	state: PlayerState
	recording: Recording
	mounted: boolean
	keyboardListener: KeyboardListener
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
			hasSong: false
		}
		this.mounted = false
		this.keyboardListener = new KeyboardListener()
	}

	init = async () => {
		const { settings } = this.state
		await this.loadInstrument(settings.instrument.value)
		AudioProvider.setReverb(settings.caveMode.value)
	}
	componentDidMount() {
		document.body.addEventListener('dragenter', this.handleDrag)
		document.body.addEventListener('dragleave', this.resetDrag)
		document.body.addEventListener('dragover', this.handleDragOver)
		document.body.addEventListener('drop', this.handleDrop)
		this.mounted = true
		this.syncSongs()
		this.init()
	}
	componentWillUnmount() {
		document.body.removeEventListener('dragenter', this.handleDrag)
		document.body.removeEventListener('dragleave', this.resetDrag)
		document.body.removeEventListener('dragover', this.handleDragOver)
		document.body.removeEventListener('drop', this.handleDrop)
		this.keyboardListener.destroy()
		SongStore.reset()
		AudioProvider.clear()
		this.state.instrument.delete()
		this.mounted = false
	}
	registerKeyboardListeners = () => {
		const { keyboardListener } = this
		keyboardListener.registerLetter('C',() => this.toggleRecord(), {shift: true})
	}
	componentDidCatch() {
		LoggerStore.warn("There was an error with the song! Restoring default...")
		SongStore.reset()
	}

	resetDrag = () => {
		this.setState({ isDragging: false })
	}

	handleDragOver = (e: DragEvent) => {
		e.preventDefault()
		this.setState({ isDragging: true })
	}

	handleDrag = (e: DragEvent) => {
		e.preventDefault()
		this.setState({ isDragging: true })
	}

	setHasSong = (data: boolean) => {
		this.setState({ hasSong: data })
	}

	handleDrop = async (e: DragEvent) => {
		this.resetDrag()
		e.preventDefault()
		try {
			const files = await Promise.all(Array.from(e.dataTransfer?.files || []).map(file => file.text()))
			for (let i = 0; i < files.length; i++) {
				const songs = JSON.parse(files[i])
				const parsed = Array.isArray(songs) ? songs : [songs]
				for (let j = 0; j < parsed.length; j++) {
					await this.addSong(parseSong(parsed[j]))
				}
			}
		} catch (e) {
			console.error(e)
			LoggerStore.error(
				`Error importing song, invalid format (Only supports the ${APP_NAME.toLowerCase()}sheet.json format)`,
				8000
			)
		}

	}

	changeVolume = (obj: SettingVolumeUpdate) => {
		const {settings} = this.state
		if (obj.key === "instrument") {
			settings.instrument = { ...settings.instrument, volume: obj.value }
			this.state.instrument.changeVolume(obj.value)
		}
		this.setState({ settings }, this.updateSettings)
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

	loadInstrument = async (name: InstrumentName) => {
		const oldInstrument = this.state.instrument
		AudioProvider.disconnect(oldInstrument.endNode)
		this.state.instrument.delete()
		const { settings } = this.state
		const instrument = new Instrument(name)
		instrument.changeVolume(settings.instrument.volume || 100)
		AudioProvider.connect(instrument.endNode)
		this.setState({ isLoadingInstrument: true })
		await instrument.load()
		if (!this.mounted) return
		this.setState({
			instrument,
			isLoadingInstrument: false
		}, () => AudioProvider.setReverb(settings.caveMode.value))
	}

	playSound = (note: NoteData) => {
		const { state } = this
		const { settings } = state
		if (note === undefined) return
		if (state.isRecording) this.handleRecording(note)
		this.state.instrument.play(note.index, settings.pitch.value as PitchesType)
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
			this.loadInstrument(data.value as InstrumentName)
		}
		if (setting.key === 'caveMode') {
			AudioProvider.setReverb(data.value as boolean)
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
		this.setState({ songs })
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
		const result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
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
				const songName = await asyncPrompt(promptString)
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
		this.setState({ isRecording: newState })
	}

	toggleRecordAudio = async (override?: boolean | null) => {
		if (!this.mounted) return
		if (typeof override !== "boolean") override = null
		const newState = override !== null ? override : !this.state.isRecordingAudio
		if (newState) {
			AudioProvider.startRecording()
		} else {
			const recording = await AudioProvider.stopRecording()
			const fileName = await asyncPrompt("Write the song name, press cancel to ignore")
			if (!this.mounted || !recording) return
			if (fileName) AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
		}
		this.setState({isRecordingAudio: newState})
	}
	changePage = (page: string) => {
		//@ts-ignore
		this.props.history.push(page)
	}
	render() {
		const { state } = this
		const { settings, isLoadingInstrument, songs, instrument, hasSong,isRecordingAudio,isRecording,isDragging } = state
		const keyboardFunctions = {
			playSound: this.playSound,
			setHasSong: this.setHasSong
		}
		const keyboardData = {
			isLoading: isLoadingInstrument,
			keyboard: instrument,
			pitch: settings.pitch.value as PitchesType,
			keyboardSize: settings.keyboardSize.value,
			noteNameType: settings.noteNameType.value as NoteNameType,
			hasSong,
			hasAnimation: settings.noteAnimation.value,
			approachRate: settings.approachSpeed.value,
			keyboardYPosition: settings.keyboardYPosition.value
		}
		const menuFunctions = {
			addSong: this.addSong,
			removeSong: this.removeSong,
			changePage: this.changePage,
			handleSettingChange: this.handleSettingChange,
			changeVolume: this.changeVolume
		}
		const menuData = { songs, settings }

		return <>
			{SongStore.eventType !== 'approaching' &&
				<div className='record-button'>
					<AppButton	
						toggled={isRecordingAudio}
						onClick={this.toggleRecordAudio}
					>
						{isRecordingAudio ? "Finish recording" : "Record audio"}
					</AppButton>
				</div>
			}

			{isDragging && <div className='drag-n-drop'>
				Drop file here
			</div>}
			<Menu functions={menuFunctions} data={menuData} />
			<div className="right-panel">
				<div className="upper-right">
					{!hasSong
						&&
						<AppButton
							toggled={isRecording}
							onClick={this.toggleRecord}
							style={{ marginTop: "0.8rem" }}
						>
							{isRecording ? "Stop" : "Record"}
						</AppButton>

					}
				</div>
				<div className="keyboard-wrapper" style={{ marginBottom: '2vh' }}>
					<Keyboard
						key={instrument.layout.length}
						data={keyboardData}
						functions={keyboardFunctions}
					/>
				</div>
			</div>
		</>
	}
}

//@ts-ignore
export default withRouter(Player);
