import { Component, ReactNode } from 'react';
import KeyboardPlayer from "$/components/Player/PlayerKeyboard"
import Menu from "$/components/Player/PlayerMenu"
import { playerStore } from '$stores/PlayerStore'
import { RecordedSong } from '$lib/Songs/RecordedSong';
import { ComposedSong } from '$lib/Songs/ComposedSong';
import { InstrumentData, Recording } from '$lib/Songs/SongClasses';
import { PlayerSettingsDataType } from "$lib/BaseSettings"
import Instrument from '$lib/Instrument';
import AudioRecorder from '$lib/AudioRecorder';
import { asyncConfirm, asyncPrompt } from "$cmp/Utility/AsyncPrompts"
import Analytics from '$/lib/Stats';
import { logger } from '$stores/LoggerStore';
import { SettingUpdate, SettingVolumeUpdate } from '$types/SettingsPropriety';
import { InstrumentName } from '$types/GeneralTypes';
import { AppButton } from '$cmp/Inputs/AppButton';
import { KeyboardProvider } from '$lib/Providers/KeyboardProvider';
import { AudioProvider } from '$lib/Providers/AudioProvider';
import { settingsService } from '$lib/Services/SettingsService';
import { songsStore } from '$stores/SongsStore';
import { Title } from '$cmp/Miscellaneous/Title';
import { metronome } from '$lib/Metronome';
import { Lambda } from 'mobx';
import { NoteLayer } from '$lib/Layer';
import { subscribeObeservableObject } from '$lib/Hooks/useObservable';
import { ChangeEvent } from 'react';
import { SPEED_CHANGERS } from '$/Config';
import { playerControlsStore } from '$stores/PlayerControlsStore';
import { PlayerSongControls } from '$cmp/Player/PlayerSongControls';
import { CustomNextPage } from '$/types/nextjsTypes';
import { AppBackground } from '$/components/Layout/AppBackground';

interface PlayerState {
	settings: PlayerSettingsDataType
	instruments: Instrument[]
	isLoadingInstrument: boolean
	isRecordingAudio: boolean
	isRecording: boolean
	isMetronomePlaying: boolean
	hasSong: boolean
	speedChanger: typeof SPEED_CHANGERS[number]
}

class Player extends Component<{}, PlayerState>{
	state: PlayerState
	recording: Recording
	mounted: boolean
	cleanup: (Function | Lambda)[] = []
	constructor(props: {}) {
		super(props)
		this.recording = new Recording()
		this.state = {
			instruments: [new Instrument()],
			settings: settingsService.getDefaultPlayerSettings(),
			isLoadingInstrument: true,
			isRecording: false,
			isRecordingAudio: false,
			isMetronomePlaying: false,
			hasSong: false,
			speedChanger: SPEED_CHANGERS.find(e => e.name === 'x1') as typeof SPEED_CHANGERS[number]
		}
		this.mounted = false
	}

	async componentDidMount() {
		const settings = settingsService.getPlayerSettings()
		this.setState({ settings })
		this.mounted = true
		const instrument = this.state.instruments[0]
		if(instrument) playerStore.setKeyboardLayout(instrument.notes)
		await this.init(settings)
		const dispose = subscribeObeservableObject(playerStore.state, ({ eventType, song }) => {
			const { settings } = this.state
			if (!settings.syncSongData.value || song === null) return
			if (['play', 'practice', 'approaching'].includes(eventType))
				this.handleSettingChange({
					data: {
						...settings.pitch,
						value: song.pitch
					}, key: 'pitch'
				})
			this.loadInstruments(song.instruments)
		})
		this.cleanup.push(dispose)
	}
	init = async (settings: PlayerSettingsDataType) => {
		await AudioProvider.waitReverb()
		await this.loadInstrument(settings.instrument.value)
		this.registerKeyboardListeners()
		AudioProvider.setReverb(settings.caveMode.value)
	}
	componentWillUnmount() {
		KeyboardProvider.unregisterById('player')
		playerStore.resetSong()
		playerStore.resetKeyboardLayout()
		playerControlsStore.clearPages()
		playerControlsStore.resetScore()
		AudioProvider.clear()
		logger.hidePill()
		this.state.instruments.forEach(ins => ins.dispose())
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
		const { settings, instruments } = this.state
		if (obj.key === "instrument") {
			settings.instrument = { ...settings.instrument, volume: obj.value }
			instruments.forEach(ins => ins.changeVolume(obj.value))
		}
		this.setState({ settings }, this.updateSettings)
	}

	loadInstrument = async (name: InstrumentName) => {
		const oldInstrument = this.state.instruments[0]
		AudioProvider.disconnect(oldInstrument.endNode)
		this.state.instruments[0].dispose()
		const { settings, instruments } = this.state
		const instrument = new Instrument(name)
		instrument.changeVolume(settings.instrument.volume || 100)
		this.setState({ isLoadingInstrument: true })
		const loaded = await instrument.load(AudioProvider.getAudioContext())
		if (!loaded) logger.error("There was an error loading the instrument")
		AudioProvider.connect(instrument.endNode)
		if (!this.mounted) return
		playerStore.setKeyboardLayout(instrument.notes)
		instruments.splice(0, 1, instrument)
		this.setState({
			instruments,
			isLoadingInstrument: false
		}, () => AudioProvider.setReverb(settings.caveMode.value))
	}
	handleSpeedChanger = (e: ChangeEvent<HTMLSelectElement>) => {
		const changer = SPEED_CHANGERS.find(el => el.name === e.target.value)
		if (!changer) return
		this.setState({
			speedChanger: changer
		}, () => this.restartSong())
	}
	restartSong = async (override?: number) => {
		if (!this.mounted) return
		playerStore.restartSong((typeof override === 'number') ? override : playerControlsStore.position, playerControlsStore.end)
	}

	loadInstruments = async (toLoad: InstrumentData[]) => {
		const { instruments } = this.state
		//remove excess instruments
		const extraInstruments = instruments.splice(toLoad.length)
		extraInstruments.forEach(ins => {
			AudioProvider.disconnect(ins.endNode)
			ins.dispose()
		})
		logger.showPill("Loading instruments...")
		const promises = toLoad.map(async (ins, i) => {
			if (instruments[i] === undefined) {
				//If it doesn't have a layer, create one
				const instrument = new Instrument(ins.name)
				instruments[i] = instrument
				const loaded = await instrument.load(AudioProvider.getAudioContext())
				if (!loaded) logger.error("There was an error loading the instrument")
				if (!this.mounted) return instrument.dispose()
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
				old.dispose()
				const instrument = new Instrument(ins.name)
				instruments[i] = instrument
				const loaded = await instrument.load(AudioProvider.getAudioContext())
				if (!loaded) logger.error("There was an error loading the instrument")
				if (!this.mounted) return instrument.dispose()
				AudioProvider.connect(instrument.endNode)
				instrument.changeVolume(ins.volume)
				return instrument
			}
		})
		const newInstruments = await Promise.all(promises) as Instrument[]
		if (!this.mounted) return
		const { settings } = this.state
		if(instruments[0]) {
			settings.instrument = { ...settings.instrument, value: instruments[0].name }
			playerStore.setKeyboardLayout(instruments[0].notes)
		}
		logger.hidePill()
		this.setState({ instruments: newInstruments, settings}, this.updateSettings)
	}
	playSound = (index: number, layers?: NoteLayer) => {
		const { state } = this
		const { settings, instruments } = state
		if (state.isRecording) this.handleRecording(index)
		if (!layers) {
			instruments[0].play(index, settings.pitch.value)
		} else {
			instruments.forEach((ins, i) => {
				if (layers.test(i)) ins.play(index, settings.pitch.value)
			})
		}
	}

	updateSettings = (override?: PlayerSettingsDataType) => {
		settingsService.updatePlayerSettings(override !== undefined ? override : this.state.settings)
	}

	//TODO make method to sync settings to the song
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
			settings,
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
		const { isMetronomePlaying, settings } = this.state
		this.setState({ isMetronomePlaying: !isMetronomePlaying })
		if (isMetronomePlaying) {
			metronome.stop()
		} else {
			metronome.bpm = settings.bpm.value
			metronome.beats = settings.metronomeBeats.value
			metronome.changeVolume(settings.metronomeVolume.value)
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
				song.bpm = settings.bpm.value
				song.pitch = settings.pitch.value
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
		const { settings, isLoadingInstrument, instruments, hasSong, isRecordingAudio, isRecording, isMetronomePlaying, speedChanger } = state
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
				<div className="keyboard-wrapper">
					<KeyboardPlayer
						data={{
							isLoading: isLoadingInstrument,
							instrument: instruments[0],
							pitch: settings.pitch.value,
							keyboardSize: settings.keyboardSize.value,
							noteNameType: settings.noteNameType.value,
							hasSong,
							hasAnimation: settings.noteAnimation.value,
							approachRate: settings.approachSpeed.value,
							keyboardYPosition: settings.keyboardYPosition.value,
							speedChanger,
						}}
						functions={{ playSound, setHasSong }}
					/>
				</div>
			</div>
			<PlayerSongControls
				isRecordingAudio={isRecordingAudio}
				isVisualSheetVisible={settings.showVisualSheet.value}
				onToggleRecordAudio={this.toggleRecordAudio}
				onRestart={this.restartSong}
				isMetronomePlaying={isMetronomePlaying}
				onToggleMetronome={toggleMetronome}
				onRawSpeedChange={this.handleSpeedChanger}
				hasSong={hasSong}
				speedChanger={speedChanger}
			/>
		</>
	}
}

//@ts-ignore
export default function PlayerPage() {
	return <Player />
}

PlayerPage.getLayout = function getLayout(page: ReactNode) {
	return <AppBackground page='Main'>{page}</AppBackground>
}