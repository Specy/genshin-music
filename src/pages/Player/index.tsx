import { Component } from 'react';
import Keyboard from "./Keyboard"
import Menu from "./Components/Menu"
import { DB } from 'Database';
import { SongStore } from 'stores/SongStore'
import { parseSong } from "lib/Tools"
import { SerializedSong, Song } from 'lib/Song';
import { ComposedSong, SerializedComposedSong } from 'lib/ComposedSong';
import { Recording } from 'lib/SongClasses';
import { MainPageSettings, MainPageSettingsDataType, MainPageSettingsType } from "lib/BaseSettings"
import Instrument, { NoteData } from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { APP_NAME, PitchesType } from "appConfig"
import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import LoggerStore from 'stores/LoggerStore';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { InstrumentName, NoteNameType } from 'types/GeneralTypes';
import { AppButton } from 'components/AppButton';
import { KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import { AudioProvider } from 'lib/Providers/AudioProvider';
import { BodyDropper, DroppedFile } from 'components/BodyDropper';
import { SerializedSongType } from 'types/SongTypes';


interface PlayerState {
	songs: (ComposedSong | Song)[]
	settings: MainPageSettingsDataType
	instrument: Instrument
	isLoadingInstrument: boolean
	isRecordingAudio: boolean
	isRecording: boolean
	hasSong: boolean
}
class Player extends Component<any, PlayerState>{
	state: PlayerState
	recording: Recording
	mounted: boolean
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
			hasSong: false
		}
		this.mounted = false
	}

	init = async () => {
		const { settings } = this.state
		await this.loadInstrument(settings.instrument.value)
		AudioProvider.setReverb(settings.caveMode.value)
	}
	componentDidMount() {
		this.mounted = true
		this.syncSongs()
		this.init()
	}
	componentWillUnmount() {
		KeyboardProvider.clear()
		SongStore.reset()
		AudioProvider.clear()
		this.state.instrument.delete()
		this.mounted = false
	}
	registerKeyboardListeners = () => {
		KeyboardProvider.registerLetter('C', () => this.toggleRecord(), { shift: true })
	}
	componentDidCatch() {
		LoggerStore.warn("There was an error with the song! Restoring default...")
		SongStore.reset()
	}

	setHasSong = (data: boolean) => {
		this.setState({ hasSong: data })
	}

	handleDrop = async (files: DroppedFile<SerializedSongType>[]) => {
		for (const file of files) {
			const parsed = (Array.isArray(file) ? file.data : [file.data]) as SerializedSongType[]
			for (const song of parsed) {
				await this.addSong(parseSong(song))
			}
		}
	}
	dropError = () => {
		LoggerStore.error("There was an error importing the file! Was it the correct format?")
	}
	changeVolume = (obj: SettingVolumeUpdate) => {
		const { settings } = this.state
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
			if (song.data?.isComposedVersion) return ComposedSong.deserialize(song as SerializedComposedSong)
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
		Analytics.userSongs('delete', { name: name, page: 'player' })
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
				Analytics.userSongs('record', { name: songName, page: 'player' })
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
		this.setState({ isRecordingAudio: newState })
	}
	render() {
		const { state, playSound, setHasSong, removeSong, handleSettingChange, changeVolume, addSong, dropError, handleDrop } = this
		const { settings, isLoadingInstrument, songs, instrument, hasSong, isRecordingAudio, isRecording } = state
		return <>
			<Menu 
				functions={{ addSong, removeSong, handleSettingChange, changeVolume }} 
				data={{ songs, settings }} 
			/>
			<div className="right-panel">
				<div className="upper-right">
					{!hasSong &&
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
						data={{
							isLoading: isLoadingInstrument,
							keyboard: instrument,
							pitch: settings.pitch.value as PitchesType,
							keyboardSize: settings.keyboardSize.value,
							noteNameType: settings.noteNameType.value as NoteNameType,
							hasSong,
							hasAnimation: settings.noteAnimation.value,
							approachRate: settings.approachSpeed.value,
							keyboardYPosition: settings.keyboardYPosition.value
						}}
						functions={{ playSound, setHasSong }}
					/>
				</div>
			</div>
			<BodyDropper<SerializedSongType>
				as='json'
				onDrop={handleDrop}
				onError={dropError}
				showDropArea={true}
			/>
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
		</>
	}
}

//@ts-ignore
export default withRouter(Player);
