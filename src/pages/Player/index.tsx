import { Component } from 'react';
import Keyboard from "components/Player/Keyboard"
import Menu from "components/Player/Menu"
import { playerStore, subscribePlayer } from 'stores/PlayerStore'
import { RecordedSong } from 'lib/Songs/RecordedSong';
import { ComposedSong } from 'lib/Songs/ComposedSong';
import { Recording } from 'lib/Songs/SongClasses';
import { MainPageSettingsDataType } from "lib/BaseSettings"
import Instrument from 'lib/Instrument';
import AudioRecorder from 'lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "components/AsyncPrompts"
import { Pitch } from "appConfig"
import Analytics from 'lib/Analytics';
import { withRouter } from 'react-router-dom'
import { logger } from 'stores/LoggerStore';
import { SettingUpdate, SettingVolumeUpdate } from 'types/SettingsPropriety';
import { InstrumentName, NoteNameType } from 'types/GeneralTypes';
import { AppButton } from 'components/AppButton';
import { KeyboardProvider } from 'lib/Providers/KeyboardProvider';
import { AudioProvider } from 'lib/Providers/AudioProvider';
import { settingsService } from 'lib/Services/SettingsService';
import { songsStore } from 'stores/SongsStore';
import { Title } from 'components/Title';
import { metronome } from 'lib/Metronome';
import { GiMetronome } from 'react-icons/gi';
import { Lambda } from 'mobx';
import { NoteLayer } from 'lib/Layer';

interface PlayerState {
	settings: MainPageSettingsDataType
	instruments: Instrument[]
	isLoadingInstrument: boolean
	isRecordingAudio: boolean
	isRecording: boolean
	isMetronomePlaying: boolean
	isLoadingInstruments: boolean
	hasSong: boolean
}

class Player extends Component<any, PlayerState>{
	state: PlayerState
	recording: Recording
	mounted: boolean
	cleanup: (Function | Lambda)[] = []
	constructor(props: any) {
		super(props)
		this.recording = new Recording()
		const settings = settingsService.getPlayerSettings()
		this.state = {
			instruments: [new Instrument()],
			settings: settings,
			isLoadingInstrument: true,
			isRecording: false,
			isRecordingAudio: false,
			isMetronomePlaying: false,
			isLoadingInstruments: false,
			hasSong: false,

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
		this.init()
		this.cleanup.push(subscribePlayer(({ eventType, song }) => {
			const { settings } = this.state
			if (!settings.syncSongData.value || song === null) return
			if (['play', 'practice', 'approaching'].includes(eventType))
				this.handleSettingChange({
					data: {
						...settings.pitch,
						value: song.pitch
					}, key: 'pitch'
				})
			this.syncInstruments(song)
		}))
	}
	componentWillUnmount() {
		KeyboardProvider.unregisterById('player')
		playerStore.reset()
		AudioProvider.clear()
		this.state.instruments.forEach(ins => ins.delete())
		this.cleanup.forEach(c => c())
		this.mounted = false
		metronome.stop()
	}

	registerKeyboardListeners = () => {
		KeyboardProvider.registerLetter('C', () => this.toggleRecord(), { shift: true, id: "player" })
	}
	setHasSong = (data: boolean) => {
		this.setState({ hasSong: data })
	}
	changeVolume = (obj: SettingVolumeUpdate) => {
		const { settings } = this.state
		if (obj.key === "instrument") {
			settings.instrument = { ...settings.instrument, volume: obj.value }
			this.state.instruments.forEach(ins => ins.changeVolume(obj.value))
		}
		this.setState({ settings }, this.updateSettings)
	}

	loadInstrument = async (name: InstrumentName) => {
		const oldInstrument = this.state.instruments[0]
		AudioProvider.disconnect(oldInstrument.endNode)
		this.state.instruments[0].delete()
		const { settings, instruments } = this.state
		const instrument = new Instrument(name)
		instrument.changeVolume(settings.instrument.volume || 100)
		AudioProvider.connect(instrument.endNode)
		this.setState({ isLoadingInstrument: true })
		await instrument.load()
		if (!this.mounted) return
		instruments.splice(0, 1, instrument)
		this.setState({
			instruments,
			isLoadingInstrument: false
		}, () => AudioProvider.setReverb(settings.caveMode.value))
	}
	syncInstruments = async (song: ComposedSong | RecordedSong) => {
		const { instruments } = this.state
		//remove excess instruments
		const extraInstruments = instruments.splice(song.instruments.length)
		extraInstruments.forEach(ins => {
			AudioProvider.disconnect(ins.endNode)
			ins.delete()
		})
		this.setState({ isLoadingInstruments: true })
		const promises = song.instruments.map(async (ins, i) => {
			if (instruments[i] === undefined) {
				//If it doesn't have a layer, create one
				const instrument = new Instrument(ins.name)
				instruments[i] = instrument
				await instrument.load()
				if (!this.mounted) return instrument.delete()
				AudioProvider.connect(instrument.endNode)
				instrument.changeVolume(ins.volume)
				return instrument
			}
			if (instruments[i].name === ins.name) {
				//if it has a layer and it's the same, just set the volume
				instruments[i].changeVolume(ins.volume)
				return instruments[i]
			} else {
				//if it has a layer and it's different, delete the layer and create a new one
				const old = instruments[i]
				AudioProvider.disconnect(old.endNode)
				old.delete()
				const instrument = new Instrument(ins.name)
				instruments[i] = instrument
				await instrument.load()
				if (!this.mounted) return instrument.delete()
				AudioProvider.connect(instrument.endNode)
				instrument.changeVolume(ins.volume)
				return instrument
			}
		})
		const newInstruments = await Promise.all(promises) as Instrument[]
		if (!this.mounted) return
		this.setState({ instruments: newInstruments, isLoadingInstruments:false })
	}
	playSound = (index: number, layers?: NoteLayer) => {
		const { state } = this
		const { settings, instruments } = state
		if (state.isRecording) this.handleRecording(index)
		if (!layers) {
			instruments[0].play(index, settings.pitch.value as Pitch)
		} else {
			instruments.forEach((ins, i) => {
				if (layers.test(i)) ins.play(index, settings.pitch.value as Pitch)
			})
		}
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
		if (setting.key === 'bpm') metronome.bpm = data.value as number
		if (setting.key === 'metronomeBeats') metronome.beats = data.value as number
		if (setting.key === 'metronomeVolume') metronome.changeVolume(data.value as number)
		this.setState({
			settings: settings,
		}, this.updateSettings)
	}

	addSong = async (song: RecordedSong | ComposedSong) => {
		try {
			const id = await songsStore.addSong(song)
			song.id = id
			const type = song.type ?? (song.data.isComposedVersion ? "composed" : "recorded")
			logger.success(`Song added to the ${type} tab!`, 4000)
		} catch (e) {
			console.error(e)
			return logger.error('There was an error importing the song')
		}
	}

	removeSong = async (name: string, id: string) => {
		const result = await asyncConfirm(`Are you sure you want to delete the song: "${name}" ?`)
		if (!this.mounted) return
		if (result) {
			await songsStore.removeSong(id)
			Analytics.userSongs('delete', { page: 'player' })
		}
	}
	renameSong = async (newName: string, id: string) => {
		await songsStore.renameSong(id, newName)
	}
	handleRecording = (index: number) => {
		if (this.state.isRecording) {
			this.recording.addNote(index)
		}
	}
	toggleMetronome = () => {
		const { isMetronomePlaying } = this.state
		this.setState({ isMetronomePlaying: !isMetronomePlaying })
		if (isMetronomePlaying) {
			metronome.stop()
		} else {
			metronome.start()
		}
	}
	toggleRecord = async (override?: boolean | null) => {
		if (typeof override !== "boolean") override = null
		const newState = override !== null ? override : !this.state.isRecording
		if (!newState && this.recording.notes.length > 0) { //if there was a song recording
			const { instruments, settings } = this.state
			const songName = await asyncPrompt("Write song name, press cancel to ignore")
			if (!this.mounted) return
			if (songName !== null) {
				const song = new RecordedSong(songName, this.recording.notes, [instruments[0].name])
				song.bpm = settings.bpm.value as number
				song.pitch = settings.pitch.value as Pitch
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
		this.setState({ isRecordingAudio: newState })
		if (newState) {
			AudioProvider.startRecording()
		} else {
			const recording = await AudioProvider.stopRecording()
			const fileName = await asyncPrompt("Write the song name, press cancel to ignore")
			if (!this.mounted || !recording) return
			if (fileName) AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
		}
	}
	render() {
		const { state, renameSong, playSound, setHasSong, removeSong, handleSettingChange, changeVolume, addSong, toggleMetronome } = this
		const { settings, isLoadingInstruments, isLoadingInstrument, instruments, hasSong, isRecordingAudio, isRecording, isMetronomePlaying } = state
		return <>
			<Title text="Player" />
			<Menu
				functions={{ addSong, removeSong, handleSettingChange, changeVolume, renameSong }}
				data={{ settings }}
			/>
			<div className="right-panel">
				<div className="upper-right">
					{!hasSong &&
						<AppButton
							toggled={isRecording}
							onClick={() => this.toggleRecord()}
							style={{ marginTop: "0.8rem" }}
						>
							{isRecording ? "Stop" : "Record"}
						</AppButton>
					}
				</div>
				<div className="keyboard-wrapper" style={{ marginBottom: '2vh' }}>
					<Keyboard
						key={instruments[0].layout.length}
						data={{
							isLoading: isLoadingInstrument,
							keyboard: instruments[0],
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
			{isLoadingInstruments &&
				<div style={{ position: 'absolute', bottom: '0.5rem', left:'50%', transform:"translateX(-50%)", fontSize: '0.9rem'}}>
					Loading song instruments...
				</div>
			}

			{playerStore.eventType !== 'approaching' &&
				<div className='record-button'>
					<AppButton
						toggled={isRecordingAudio}
						onClick={() => this.toggleRecordAudio()}
					>
						{isRecordingAudio ? "Finish recording" : "Record audio"}
					</AppButton>
				</div>
			}
			<AppButton 
				toggled={isMetronomePlaying} 
				onClick={toggleMetronome} 
				className='metronome-button'
				ariaLabel='Toggle metronome'
			>
				<GiMetronome size={22} />
			</AppButton>
		</>
	}
}

//@ts-ignore
export default withRouter(Player);
