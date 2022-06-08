import { Component } from 'react';
import Keyboard from "components/Player/Keyboard"
import Menu from "components/Player/Menu"
import { SongStore } from 'stores/SongStore'
import { parseSong } from "lib/Tools"
import { Song } from 'lib/Song';
import { ComposedSong } from 'lib/ComposedSong';
import { Recording } from 'lib/SongClasses';
import { MainPageSettingsDataType } from "lib/BaseSettings"
import Instrument, { NoteData } from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { Pitch } from "appConfig"
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
import { settingsService } from 'lib/Services/SettingsService';
import { songService } from 'lib/Services/SongService';

interface PlayerState {
	songs: SerializedSongType[]
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
		const settings = settingsService.getPlayerSettings()
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
		KeyboardProvider.unregisterById('player')
		SongStore.reset()
		AudioProvider.clear()
		this.state.instrument.delete()
		this.mounted = false
	}
	registerKeyboardListeners = () => {
		KeyboardProvider.registerLetter('C', () => this.toggleRecord(), { shift: true, id: "player" })
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
			try {
				const parsed = (Array.isArray(file) ? file.data : [file.data]) as SerializedSongType[]
				for (const song of parsed) {
					await this.addSong(parseSong(song))
				}
			} catch (e) {
				console.error(e)
				LoggerStore.error('Error while parsing song!')
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
		this.state.instrument.play(note.index, settings.pitch.value as Pitch)
	}

	updateSettings = (override?: MainPageSettingsDataType) => {
		settingsService.updatePlayerSettings(override !== undefined ? override : this.state.settings)
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
		try {
			const songs = await songService.getSongs()
			this.setState({ songs })
		} catch (e) {
			console.error(e)
			LoggerStore.warn('There was an error syncing the songs')
		}

	}

	addSong = async (song: Song | ComposedSong) => {
		try {
			const id = await songService.addSong(song.serialize())
			song.id = id
			this.syncSongs()
			LoggerStore.success(`Song added to the ${song.isComposed ? "Composed" : "Recorded"} tab!`, 4000)
		} catch (e) {
			console.error(e)
			return LoggerStore.error('There was an error importing the song')
		}
	}

	removeSong = async (name: string, id: string) => {
		const result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
		if (!this.mounted) return
		if (result) {
			await songService.removeSong(id)
			this.syncSongs()
			Analytics.userSongs('delete', { page: 'player' })
		}
	}
	renameSong = async (newName: string, id: string) => {
        await songService.renameSong(id, newName)
        await this.syncSongs()
	}
	handleRecording = (note: NoteData) => {
		if (this.state.isRecording) {
			this.recording.addNote(note.index)
		}
	}

	toggleRecord = async (override?: boolean | null) => {
		if (typeof override !== "boolean") override = null
		const newState = override !== null ? override : !this.state.isRecording
		if (!newState && this.recording.notes.length > 0) { //if there was a song recording
			const songName = await asyncPrompt("Write song name, press cancel to ignore")
			if (!this.mounted) return
			if (songName !== null) {
				const song = new Song(songName, this.recording.notes)
				song.pitch = this.state.settings.pitch.value as Pitch
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
		const { state, renameSong, playSound, setHasSong, removeSong, handleSettingChange, changeVolume, addSong, dropError, handleDrop } = this
		const { settings, isLoadingInstrument, songs, instrument, hasSong, isRecordingAudio, isRecording } = state
		return <>
			<Menu
				functions={{ addSong, removeSong, handleSettingChange, changeVolume, renameSong }}
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
							pitch: settings.pitch.value as Pitch,
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
