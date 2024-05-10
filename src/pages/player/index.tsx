import {ChangeEvent, Component, ReactNode} from 'react';
import KeyboardPlayer from "$cmp/pages/Player/PlayerKeyboard"
import Menu from "$cmp/pages/Player/PlayerMenu"
import {playerStore} from '$stores/PlayerStore'
import {RecordedSong} from '$lib/Songs/RecordedSong';
import {ComposedSong} from '$lib/Songs/ComposedSong';
import {InstrumentData, Recording} from '$lib/Songs/SongClasses';
import {PlayerSettingsDataType} from "$lib/BaseSettings"
import {Instrument} from '$lib/audio/Instrument'
import AudioRecorder from '$lib/audio/AudioRecorder';
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts"
import Analytics from '$lib/Analytics';
import {logger} from '$stores/LoggerStore';
import {SettingUpdate, SettingVolumeUpdate} from '$types/SettingsPropriety';
import {InstrumentName} from '$types/GeneralTypes';
import {AppButton} from '$cmp/shared/Inputs/AppButton';
import {AudioProvider} from '$lib/Providers/AudioProvider';
import {settingsService} from '$lib/Services/SettingsService';
import {songsStore} from '$stores/SongsStore';
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata';
import {metronome} from '$lib/audio/Metronome';
import {Lambda} from 'mobx';
import {NoteLayer} from '$lib/Songs/Layer';
import {subscribeObeservableObject} from '$lib/Hooks/useObservable';
import {INSTRUMENTS, SPEED_CHANGERS} from '$config';
import {playerControlsStore} from '$stores/PlayerControlsStore';
import {PlayerSongControls} from '$cmp/pages/Player/PlayerSongControls';
import {AppBackground} from '$cmp/shared/pagesLayout/AppBackground';
import {createShortcutListener} from '$/stores/KeybindsStore';
import {i18n} from "$i18n/i18n";

interface PlayerState {
    settings: PlayerSettingsDataType
    instruments: Instrument[]
    instrumentsData: InstrumentData[]
    isLoadingInstrument: boolean
    isRecordingAudio: boolean
    isRecording: boolean
    isMetronomePlaying: boolean
    hasSong: boolean
    speedChanger: typeof SPEED_CHANGERS[number]
}

class Player extends Component<{ inPreview?: boolean }, PlayerState> {
    state: PlayerState
    recording: Recording
    mounted: boolean
    cleanup: (Function | Lambda)[] = []

    constructor(props: {}) {
        super(props)
        this.recording = new Recording()
        this.state = {
            instruments: [new Instrument(INSTRUMENTS[0])],
            instrumentsData: [new InstrumentData({name: INSTRUMENTS[0]})],
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
        this.setState({settings})
        this.mounted = true
        const instrument = this.state.instruments[0]
        if (instrument) playerStore.setKeyboardLayout(instrument.notes)
        const shortcutDisposer = createShortcutListener("player", "player", ({shortcut}) => {
            const {name} = shortcut
            if (name === "toggle_record") this.toggleRecord()
        })
        this.cleanup.push(shortcutDisposer)
        await this.init(settings)
        const dispose = subscribeObeservableObject(playerStore.state, ({eventType, song}) => {
            const {settings} = this.state
            if (!settings.syncSongData.value || song === null) return
            if (['play', 'practice', 'approaching'].includes(eventType)) {
                this.handleSettingChange({
                    data: {
                        ...settings.pitch,
                        value: song.pitch
                    }, key: 'pitch'
                })
                this.handleSettingChange({
                    data: {
                        ...settings.reverb,
                        value: song.reverb
                    }, key: 'reverb'
                })
            }
            this.loadInstruments(song.instruments)
        })
        this.cleanup.push(dispose)
    }

    init = async (settings: PlayerSettingsDataType) => {
        await AudioProvider.waitReverb()
        await this.loadInstrument(settings.instrument.value)

        AudioProvider.setReverb(settings.reverb.value)
    }

    componentWillUnmount() {
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

    setHasSong = (data: boolean) => {
        this.setState({hasSong: data})
    }
    changeVolume = (obj: SettingVolumeUpdate) => {
        const {settings, instruments} = this.state
        if (obj.key === "instrument") {
            settings.instrument = {...settings.instrument, volume: obj.value}
            instruments.forEach(ins => ins.changeVolume(obj.value))
        }
        this.setState({settings}, this.updateSettings)
    }

    loadInstrument = async (name: InstrumentName) => {
        const {settings, instruments, instrumentsData} = this.state
        const oldInstrument = instruments[0]
        AudioProvider.disconnect(oldInstrument.endNode)
        this.state.instruments[0].dispose()
        const instrument = new Instrument(name)
        const volume = settings.instrument.volume ?? 100
        instrument.changeVolume(volume)
        this.setState({isLoadingInstrument: true})
        const loaded = await instrument.load(AudioProvider.getAudioContext())
        if (!loaded) logger.error(i18n.t('logs:error_loading_instrument'))
        AudioProvider.connect(instrument.endNode, null)
        if (!this.mounted) return
        playerStore.setKeyboardLayout(instrument.notes)
        instruments[0] = instrument
        instrumentsData[0] = new InstrumentData({name, volume})
        this.setState({
            instruments: [...instruments],
            isLoadingInstrument: false,
            instrumentsData: [...instrumentsData]
        }, () => AudioProvider.setReverb(settings.reverb.value))
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
        const {instruments, settings} = this.state
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
                if (!loaded) logger.error(i18n.t('logs:error_loading_instrument'))
                if (!this.mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            } else if (instruments[i].name === ins.name) {
                //if it has a layer and it's the same, just set the volume and reverb
                instruments[i].changeVolume(ins.volume)
                AudioProvider.setReverbOfNode(instruments[i].endNode, ins.reverbOverride)
                return instruments[i]
            } else {
                //if it has a layer and it's different, delete the layer and create a new one
                const old = instruments[i]
                AudioProvider.disconnect(old.endNode)
                old.dispose()
                const instrument = new Instrument(ins.name)
                instruments[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(i18n.t('logs:error_loading_instrument'))
                if (!this.mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
        })
        const newInstruments = await Promise.all(promises) as Instrument[]
        if (!this.mounted) return
        if (instruments[0]) {
            settings.instrument = {...settings.instrument, value: instruments[0].name}
            playerStore.setKeyboardLayout(instruments[0].notes)
        }
        this.setState({
            instruments: newInstruments,
            settings,
            instrumentsData: toLoad
        }, () => {
            logger.hidePill()
            this.updateSettings()
        })
    }
    playSound = (index: number, layers?: NoteLayer) => {
        const {state} = this
        const {settings, instruments, instrumentsData} = state
        if (state.isRecording) this.handleRecording(index)
        if (!layers) {
            instruments[0].play(index, settings.pitch.value)
        } else {
            instruments.forEach((ins, i) => {
                const insData = instrumentsData[i]

                if (layers.test(i) && !insData?.muted) {
                    const pitch = insData?.pitch || settings.pitch.value
                    ins.play(index, pitch)
                }
            })
        }
    }

    updateSettings = (override?: PlayerSettingsDataType) => {
        settingsService.updatePlayerSettings(override !== undefined ? override : this.state.settings)
    }

    //TODO make method to sync settings to the song
    handleSettingChange = (setting: SettingUpdate) => {
        const {settings} = this.state
        const {data} = setting
        //@ts-ignore
        settings[setting.key] = {...settings[setting.key], value: data.value}
        if (setting.key === "instrument") {
            this.loadInstrument(data.value as InstrumentName)
        }
        if (setting.key === 'reverb') AudioProvider.setReverb(data.value as boolean)
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
            return logger.error(i18n.t("logs:error_importing_song"))
        }
    }

    removeSong = async (name: string, id: string) => {
        const result = await asyncConfirm(i18n.t("confirm:delete_song", {song_name: name}))
        if (!this.mounted) return
        if (result) {
            await songsStore.removeSong(id)
            Analytics.userSongs('delete', {page: 'player'})
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
        const {isMetronomePlaying, settings} = this.state
        this.setState({isMetronomePlaying: !isMetronomePlaying})
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
            const {instruments, settings} = this.state
            const songName = await asyncPrompt(i18n.t("question:ask_song_name_cancellable"))
            if (!this.mounted) return
            if (songName !== null) {
                const song = new RecordedSong(songName, this.recording.notes, [instruments[0].name])
                song.bpm = settings.bpm.value
                song.pitch = settings.pitch.value
                song.reverb = settings.reverb.value
                this.addSong(song)
                Analytics.userSongs('record', {page: 'player'})
            }
        } else {
            this.recording = new Recording()
        }
        this.setState({isRecording: newState})
    }

    toggleRecordAudio = async (override?: boolean | null) => {
        if (!this.mounted) return
        if (typeof override !== "boolean") override = null
        const newState = override !== null ? override : !this.state.isRecordingAudio
        this.setState({isRecordingAudio: newState})
        if (newState) {
            AudioProvider.startRecording()
        } else {
            const recording = await AudioProvider.stopRecording()
            const fileName = await asyncPrompt(i18n.t("question:ask_song_name_cancellable"))
            if (!this.mounted || !recording) return
            try {
                if (fileName) await AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
            } catch (e) {
                console.error(e)
                logger.error(i18n.t("logs:error_downloading_audio"))
            }
        }
    }

    render() {
        const {
            state,
            renameSong,
            playSound,
            setHasSong,
            removeSong,
            handleSettingChange,
            changeVolume,
            addSong,
            toggleMetronome
        } = this
        const {
            settings,
            isLoadingInstrument,
            instruments,
            hasSong,
            isRecordingAudio,
            isRecording,
            isMetronomePlaying,
            speedChanger
        } = state
        return <>
            <PageMetadata text={i18n.t("home:player_name")}
                          description='Learn how to play songs, play them by hand and record them. Use the approaching circles mode or the guided tutorial to learn sections of a song at your own pace. Share your sheets or import existing ones.'/>
            <Menu
                functions={{addSong, removeSong, handleSettingChange, changeVolume, renameSong}}
                data={{settings}}
                inPreview={this.props.inPreview}
            />
            <div className="right-panel appear-on-mount">
                <div className="upper-right">
                    {!hasSong &&
                        <AppButton
                            toggled={isRecording}
                            onClick={() => this.toggleRecord()}
                            style={{marginTop: "0.8rem"}}
                        >
                            {isRecording ? i18n.t('common:stop'): i18n.t("common:record")}
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
                        functions={{playSound, setHasSong}}
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

export default function PlayerPage({inPreview}: { inPreview?: boolean }) {
    return <Player inPreview={inPreview}/>
}

PlayerPage.getLayout = function getLayout(page: ReactNode) {
    return <AppBackground page='Main'>{page}</AppBackground>
}