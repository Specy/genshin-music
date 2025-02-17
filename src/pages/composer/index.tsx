import {Component, ReactElement} from 'react'
import {FaPause, FaPlay, FaPlus, FaTools} from 'react-icons/fa';
import {APP_NAME, INSTRUMENTS, Pitch, TEMPO_CHANGERS, TempoChanger} from "$config"
import AddColumn from '$cmp/shared/icons/AddColumn';
import RemoveColumn from "$cmp/shared/icons/RemoveColumn"
import MidiParser from "$cmp/pages/Composer/MidiParser"
import ComposerTools from "$cmp/pages/Composer/ComposerTools"
import ComposerKeyboard from "$cmp/pages/Composer/ComposerKeyboard"
import ComposerCanvas from "$cmp/pages/Composer/ComposerCanvas"
import Menu from "$cmp/pages/Composer/ComposerMenu"
import Memoized, {MemoizedIcon} from '$cmp/shared/Utility/Memoized';
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts"
import {ComposerSettingsDataType} from "$lib/BaseSettings"
import {Instrument, ObservableNote} from "$lib/audio/Instrument"
import {calculateSongLength, delay, formatMs, routeChangeBugFix} from "$lib/utils/Utilities"
import {ComposedSong, UnknownSerializedComposedSong} from '$lib/Songs/ComposedSong';
import {InstrumentData, NoteColumn} from '$lib/Songs/SongClasses';
import AudioRecorder from '$lib/audio/AudioRecorder'
import Analytics from '$lib/Analytics';
import {homeStore} from '$stores/HomeStore';
import {logger} from '$stores/LoggerStore';
import {RecordedSong, SerializedRecordedSong} from '$lib/Songs/RecordedSong';
import {SettingUpdate, SettingVolumeUpdate} from '$types/SettingsPropriety';
import {MIDIEvent, MIDIProvider} from '$lib/Providers/MIDIProvider';
import {KeyboardProvider} from '$lib/Providers/KeyboardProvider';
import type {KeyboardNumber} from '$lib/Providers/KeyboardProvider/KeyboardTypes';
import {AudioProvider} from '$lib/Providers/AudioProvider';
import {CanvasTool} from '$cmp/pages/Composer/CanvasTool';
import {settingsService} from '$lib/Services/SettingsService';
import {SerializedSong, Song} from '$lib/Songs/Song';
import {songsStore} from '$stores/SongsStore';
import {InstrumentControls} from '$cmp/pages/Composer/InstrumentControls';
import {AppButton} from '$cmp/shared/Inputs/AppButton';
import {Theme, ThemeProvider} from '$stores/ThemeStore/ThemeProvider';
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata';
import {songService} from '$lib/Services/SongService';
import {NextRouter, useRouter} from 'next/router';
import {AppBackground} from '$cmp/shared/pagesLayout/AppBackground';
import {createKeyboardListener, createShortcutListener, ShortcutListener} from '$/stores/KeybindsStore';
import {NoteLayer} from "$lib/Songs/Layer";
import {globalConfigStore} from '$stores/GlobalConfigStore';
import {useTranslation} from "react-i18next";
import {WithTranslation} from "react-i18next/index";
import {fileService} from "$lib/Services/FileService";
import {VsrgSong} from "$lib/Songs/VsrgSong";
import {useSetPageVisited} from "$cmp/shared/PageVisit/pageVisit";
import {i18n} from "$i18n/i18n";

interface ComposerState {
    layers: Instrument[]
    song: ComposedSong
    settings: ComposerSettingsDataType
    layer: number
    selectedColumns: number[]
    undoHistory: NoteColumn[][]
    copiedColumns: NoteColumn[]
    isToolsVisible: boolean
    isMidiVisible: boolean
    isRecordingAudio: boolean
    isPlaying: boolean
    theme: Theme
}

type PageProps = {
    songId: string | null
    showMidi: boolean
}
type ComposerProps = PageProps & {
    inPreview?: boolean
    router: NextRouter
    t: WithTranslation<['composer', 'home', 'logs', 'question', 'common', 'menu']>['t']
}

class Composer extends Component<ComposerProps, ComposerState> {
    state: ComposerState
    broadcastChannel: BroadcastChannel | null
    mounted: boolean
    changes: number
    unblock: (...events: any[]) => void = () => {
    }
    cleanup: (() => void)[] = []

    constructor(props: any) {
        super(props)
        const settings = settingsService.getDefaultComposerSettings()
        this.state = {
            layers: [new Instrument(INSTRUMENTS[1])], //TODO not sure if this is the best idea
            //it doesnt change the instrument because it is the same as the one in the base song
            isPlaying: false,
            song: new ComposedSong("Untitled", [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]]),
            settings: settings,
            layer: 0,
            selectedColumns: [],
            undoHistory: [],
            copiedColumns: [],
            isToolsVisible: false,
            isMidiVisible: this.props.showMidi || false,
            isRecordingAudio: false,
            theme: ThemeProvider
        }
        this.state.song.bpm = settings.bpm.value
        this.mounted = false
        this.changes = 0
        this.broadcastChannel = null
    }

    get currentInstrument() {
        return this.state.layers[this.state.layer]
    }

    componentDidMount() {
        this.mounted = true
        const settings = settingsService.getComposerSettings()
        const shortcutListener = createShortcutListener(
            "composer",
            "composer_shortcuts",
            this.handleShortcut,
        )
        const shortcutKeyboardListener = createKeyboardListener(
            "composer_shortcuts_keyboard",
            this.handleKeyboardShortcut,
        )
        this.cleanup.push(shortcutKeyboardListener, shortcutListener)
        this.setState({settings})
        this.init(settings)
        this.broadcastChannel = window.BroadcastChannel ? new BroadcastChannel(APP_NAME + '_composer') : null
        if (this.broadcastChannel) {
            this.broadcastChannel.addEventListener('message', (event) => {
                if (!this.state.settings.syncTabs.value) return
                if (!['play', 'stop'].includes(event?.data)) return
                this.togglePlay(event.data === 'play')
            })
        }
        this.unblock = ((data: any) => {
            if (this.changes !== 0) {
                this.changePage(data)
                this.props.router.events.emit('routeChangeError');
                throw 'routeChange aborted.'
            }
            this.props.router.events.off('routeChangeStart', this.unblock)
            this.props.router.push(routeChangeBugFix(data))
        })
        this.props.router.events.on("routeChangeStart", this.unblock)
        if (window.location.hostname !== "localhost") {
            window.addEventListener("beforeunload", this.handleUnload)
        }
    }

    componentWillUnmount() {
        const {state} = this
        const {layers} = state
        this.mounted = false
        AudioProvider.clear()
        layers.forEach(instrument => instrument.dispose())
        this.broadcastChannel?.close?.()
        state.isPlaying = false
        this.props.router.events.off("routeChangeStart", this.unblock)
        this.cleanup.forEach(dispose => dispose())
        KeyboardProvider.unregisterById('composer')
        MIDIProvider.removeListener(this.handleMidi)
        if (AudioProvider.isRecording) AudioProvider.stopRecording()
        if (window.location.hostname !== "localhost") {
            window.removeEventListener("beforeunload", this.handleUnload)
        }
    }

    init = async (settings: ComposerSettingsDataType) => {
        await this.syncInstruments()
        AudioProvider.setReverb(settings.reverb.value)
        MIDIProvider.addListener(this.handleMidi)
        TEMPO_CHANGERS.forEach((tempoChanger, i) => {
            KeyboardProvider.registerNumber(i + 1 as KeyboardNumber, () => this.handleTempoChanger(tempoChanger), {id: "composer_keyboard"})
        })
        try {
            const {songId} = this.props
            if (!songId) return
            const song = await songService.getSongById(songId)
            if (!song) return
            this.loadSong(song)
        } catch (e) {
            console.error("Error loading song")
            console.error(e)
        }
    }


    handleKeyboardShortcut: ShortcutListener<"keyboard"> = ({shortcut, event}) => {
        if (event.repeat) return
        const {isPlaying} = this.state
        const shouldEditKeyboard = isPlaying || event.shiftKey
        if (shouldEditKeyboard) {
            const note = this.currentInstrument.getNoteFromCode(shortcut.name)
            if (note !== null) this.handleClick(note)
        }
    }
    handleShortcut: ShortcutListener<"composer"> = ({shortcut, event}) => {
        const {isPlaying, layer, layers, settings, song} = this.state
        const {name} = shortcut
        if (name === "next_column" && !isPlaying) this.selectColumn(song.selected + 1)
        if (name === "previous_column" && !isPlaying) this.selectColumn(song.selected - 1)
        if (name === "remove_column" && !isPlaying) this.removeColumns(1, song.selected)
        if (name === "add_column" && !isPlaying) this.addColumns(1, song.selected)
        if (name === "previous_layer") {
            const previousLayer = layer - 1
            if (previousLayer >= 0) this.changeLayer(previousLayer)
        }
        if (name === "next_layer") {
            const nextLayer = layer + 1
            if (nextLayer < layers.length) this.changeLayer(nextLayer)
        }
        if (name === "toggle_play") {
            if (event.repeat) return
            //@ts-ignore
            if (event.target?.tagName === "BUTTON") {
                //@ts-ignore
                event.target?.blur()
            }
            event.preventDefault()
            this.togglePlay()
            if (settings.syncTabs.value) {
                this.broadcastChannel?.postMessage?.(isPlaying ? 'play' : 'stop')
            }
        }
    }
    handleUnload = (event: BeforeUnloadEvent) => {
        event.preventDefault()
        event.returnValue = ''
    }

    handleAutoSave = () => {
        this.changes++
        if (this.changes > 5 && this.state.settings.autosave.value) {
            //TODO maybe add here that songs which arent saved dont get autosaved
            if (this.state.song.name !== "Untitled") {
                this.updateSong(this.state.song)
            }

        }
    }
    handleMidi = ([eventType, note, velocity]: MIDIEvent) => {
        if (!this.mounted) return
        const {song, layer} = this.state
        if (MIDIProvider.isDown(eventType) && velocity !== 0) {
            const keyboardNotes = MIDIProvider.getNotesOfMIDIevent(note)
            keyboardNotes.forEach(keyboardNote => {
                this.handleClick(this.currentInstrument.notes[keyboardNote.index])
            })
            const shortcut = MIDIProvider.settings.shortcuts.find(e => e.midi === note)
            if (!shortcut) return
            switch (shortcut.type) {
                case 'toggle_play':
                    this.togglePlay();
                    break;
                case 'next_column':
                    this.selectColumn(song.selected + 1);
                    break;
                case 'previous_column':
                    this.selectColumn(song.selected - 1);
                    break;
                case 'add_column':
                    this.addColumns(1, song.selected);
                    break;
                case 'remove_column':
                    this.removeColumns(1, song.selected);
                    break;
                case 'change_layer': {
                    let nextLayer = layer + 1
                    if (nextLayer >= this.state.layers.length) nextLayer = 0
                    this.changeLayer(nextLayer)
                    break;
                }
                default:
                    break;
            }
        }
    }

    updateSettings = (override?: ComposerSettingsDataType) => {
        settingsService.updateComposerSettings(override !== undefined ? override : this.state.settings)
    }

    handleSettingChange = ({data, key}: SettingUpdate) => {
        const {song, settings} = this.state
        //@ts-ignore
        settings[key] = {...settings[key], value: data.value}
        if (data.songSetting) {
            //@ts-ignore
            song[key] = data.value
        }
        if (key === "reverb") {
            AudioProvider.setReverb(data.value as boolean)
        }
        this.setState({settings: {...settings}, song}, this.updateSettings)
    }

    addInstrument = () => {
        const {song} = this.state
        const isUmaMode = globalConfigStore.get().IS_UMA_MODE
        if (song.instruments.length >= NoteLayer.MAX_LAYERS && !isUmaMode) return logger.error(this.props.t('composer:cant_add_more_than_n_layers', {max_layers: NoteLayer.MAX_LAYERS}))
        song.addInstrument(INSTRUMENTS[0])
        this.setState({song})
        this.syncInstruments(song)
    }
    removeInstrument = async (index: number) => {
        const {song, layers} = this.state
        if (layers.length <= 1) return logger.warn(this.props.t('composer:cant_remove_all_layers'))
        const confirm = await asyncConfirm(this.props.t('composer:confirm_layer_remove', {
            layer_name: song.instruments[index].alias ?? i18n.t('instruments.' + song.instruments[index].name)
        }))
        if (confirm) {
            song.removeInstrument(index)
            this.syncInstruments(song)
            this.setState({song, layer: Math.max(0, index - 1)})
        }
    }
    editInstrument = (instrument: InstrumentData, index: number) => {
        const {song} = this.state
        song.instruments[index] = instrument.clone()
        song.instruments = [...song.instruments]
        this.syncInstruments(song)
        this.setState({song})
    }
    syncInstruments = async (song?: ComposedSong) => {
        const {layers} = this.state
        if (!song) song = this.state.song
        //remove excess instruments
        const extraInstruments = layers.splice(song.instruments.length)
        extraInstruments.forEach(ins => {
            AudioProvider.disconnect(ins.endNode)
            ins.dispose()
        })
        const promises = song.instruments.map(async (ins, i) => {
            if (layers[i] === undefined) {
                //If it doesn't have a layer, create one
                const instrument = new Instrument(ins.name)
                layers[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(this.props.t('logs:error_loading_instrument'))
                if (!this.mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
            if (layers[i].name === ins.name) {
                //if it has a layer and it's the same, just set the volume and reverb
                layers[i].changeVolume(ins.volume)
                AudioProvider.setReverbOfNode(layers[i].endNode, ins.reverbOverride)
                return layers[i]
            } else {
                //if it has a layer and it's different, delete the layer and create a new one
                const old = layers[i]
                AudioProvider.disconnect(old.endNode)
                old.dispose()
                const instrument = new Instrument(ins.name)
                layers[i] = instrument
                const loaded = await instrument.load(AudioProvider.getAudioContext())
                if (!loaded) logger.error(this.props.t('logs:error_loading_instrument'))
                if (!this.mounted) return instrument.dispose()
                AudioProvider.connect(instrument.endNode, ins.reverbOverride)
                instrument.changeVolume(ins.volume)
                return instrument
            }
        })
        if (!this.mounted) return
        const instruments = (await Promise.all(promises)) as Instrument[]
        this.setState({layers: instruments})
    }
    changeVolume = (obj: SettingVolumeUpdate) => {
        const settings = this.state.settings
        const layer = Number(obj.key.split("layer")[1]) - 1
        //@ts-ignore
        settings[obj.key] = {...settings[obj.key], volume: obj.value}
        this.state.layers[layer].changeVolume(obj.value)
        this.setState({settings: {...settings}}, this.updateSettings)
    }
    startRecordingAudio = async (override?: boolean) => {
        if (!this.mounted) return
        if (!override) {
            this.setState({isRecordingAudio: false})
            return this.togglePlay(false)
        }
        AudioProvider.startRecording()
        this.setState({isRecordingAudio: true})
        await delay(300)
        await this.togglePlay(true) //wait till song finishes
        //wait untill audio has finished playing
        await delay(this.state.settings.lookaheadTime.value + 1000)
        if (!this.mounted) return
        this.setState({isRecordingAudio: false})
        const recording = await AudioProvider.stopRecording()
        if (!recording) return
        const fileName = await asyncPrompt(this.props.t('question:ask_song_name_cancellable'))
        try {
            if (fileName) await AudioRecorder.downloadBlob(recording.data, fileName + '.wav')
        } catch (e) {
            console.error(e)
            logger.error(this.props.t('logs:error_downloading_audio'))
        }
    }
    playSound = (layer: number, index: number, delay?: number) => {
        const instrument = this.state.layers[layer]
        const note = instrument?.notes[index]
        if (note === undefined) return
        if (this.state.song.instruments[layer].muted) return
        const pitch = this.state.song.instruments[layer].pitch || this.state.settings.pitch.value
        instrument.play(note.index, pitch, delay)
    }
    changePitch = (value: Pitch) => {
        const {settings} = this.state
        settings.pitch = {...settings.pitch, value}
        this.setState({settings: {...settings}}, this.updateSettings)
    }
    handleClick = (note: ObservableNote) => {
        const {song, layer} = this.state
        const column = song.selectedColumn
        const index = column.getNoteIndex(note.index)
        if (index === null) { //if it doesn't exist, create a new one
            const columnNote = column.addNote(note.index)
            columnNote.setLayer(layer, true)
        } else { //if it exists, toggle the current layer and if it's 000 delete it
            const currentNote = column.notes[index]
            currentNote.toggleLayer(layer)
            if (currentNote.layer.isEmpty()) column.removeAtIndex(index)
        }
        this.setState({song})
        this.handleAutoSave()
        this.playSound(
            layer,
            note.index
        )
    }
    renameSong = async (newName: string, id: string) => {
        const {song} = this.state
        await songsStore.renameSong(id, newName)
        if (this.state.song.id === id) {
            song.name = newName
            this.setState({song})
        }
    }
    addSong = async (song: ComposedSong | RecordedSong) => {
        const id = await songsStore.addSong(song)
        song.id = id
        return song
    }
    updateSong = async (song: ComposedSong): Promise<boolean> => {
        //if it is the default song, ask for name and add it
        if (song.name === "Untitled") {
            const name = await asyncPrompt(this.props.t('question:ask_song_name_cancellable'))
            if (name === null || !this.mounted) return false
            song.name = name
            this.changes = 0
            this.setState({})
            await this.addSong(song)
            return true
        }
        return new Promise(async resolve => {
            //if it exists, update it
            const existingSong = await songService.getSongById(song.id!)
            if (existingSong) {
                song.folderId = existingSong.folderId
                await songsStore.updateSong(song)
                console.log("song saved:", song.name)
                this.changes = 0
                this.setState({})
            } else {
                //if it doesn't exist, add it
                if (song.name.includes("- Composed")) {
                    const name = await asyncPrompt(this.props.t("composer:ask_song_name_for_composed_song_version"))
                    if (name === null) return resolve(false)
                    song.name = name
                    this.addSong(song)
                    return resolve(true)
                }
                console.warn("song doesn't exist")
                song.name = "Untitled"
                this.updateSong(song)
            }
            resolve(true)
        })
    }
    updateThisSong = async () => {
        this.updateSong(this.state.song)
    }
    askForSongUpdate = async () => {
        return await asyncConfirm(this.props.t('question:unsaved_song_save', {song_name: this.state.song.name}), true)
    }
    createNewSong = async () => {
        if (this.state.song.name !== "Untitled" && this.changes > 0) {
            const promptResult = await this.askForSongUpdate()
            if (promptResult === null) return
            if (promptResult) {
                await this.updateSong(this.state.song)
            }
        }
        const name = await asyncPrompt(this.props.t("question:ask_song_name_cancellable"))
        if (name === null) return
        const song = new ComposedSong(name, [INSTRUMENTS[0], INSTRUMENTS[0], INSTRUMENTS[0]])
        this.changes = 0
        if (!this.mounted) return
        const added = await this.addSong(song) as ComposedSong
        if (!this.mounted) return
        this.setState({song: added, layer: 0})
        Analytics.songEvent({type: 'create'})
    }
    loadSong = async (song: SerializedSong | ComposedSong) => {
        try {
            const state = this.state
            let parsed: ComposedSong | null = null
            if (song instanceof ComposedSong) {
                //TODO not sure if i should clone the song here
                parsed = song
            } else {
                if (song.type === 'recorded') {
                    const parsedRecorded = RecordedSong.deserialize(song as SerializedRecordedSong)
                    parsedRecorded.bpm = 400
                    parsed = parsedRecorded.toComposedSong(4)
                    parsed.name += " - Composed"
                }
                if (song.type === 'composed') {
                    parsed = ComposedSong.deserialize(song as UnknownSerializedComposedSong)
                }
            }
            if (!parsed) return
            if (this.changes !== 0) {
                let confirm = state.settings.autosave.value && state.song.name !== "Untitled"
                if (!confirm && state.song.columns.length > 0) {

                    //TODO is there a reason why this was not cancellable before?
                    const promptResult = await asyncConfirm(this.props.t('question:unsaved_song_save', {song_name: state.song.name}), true)
                    if (promptResult === null) return
                    confirm = promptResult
                }
                if (confirm) {
                    await this.updateSong(state.song)
                }
            }
            const settings = this.state.settings
            settings.bpm = {...settings.bpm, value: parsed.bpm}
            settings.pitch = {...settings.pitch, value: parsed.pitch}
            settings.reverb = {...settings.reverb, value: parsed.reverb}
            AudioProvider.setReverb(parsed.reverb)
            if (!this.mounted) return
            if (song.id && this.state.song.id === null) {
                this.setState({isMidiVisible: false})
            }
            this.changes = 0
            console.log("song loaded")
            this.setState({
                layer: 0,
                song: parsed,
                settings: {...settings},
                selectedColumns: []
            }, () => this.syncInstruments())
        } catch (e) {
            console.error(e)
            logger.error(this.props.t('logs:error_loading_song'))
        }

    }

    addColumns = (amount = 1, position: number | 'end' = "end"): Promise<void> => {
        return new Promise(resolve => {
            const {song} = this.state
            song.addColumns(amount, position)
            if (amount === 1) this.selectColumn(song.selected + 1)
            this.handleAutoSave()
            this.setState({song}, resolve)
        })
    }

    removeColumns = (amount: number, position: number) => {
        const {song, settings} = this.state
        if (song.columns.length < (settings.beatMarks.value * 4)) return
        song.removeColumns(amount, position)
        if (song.columns.length <= song.selected) this.selectColumn(song.selected - 1)
        this.handleAutoSave()
        this.setState({song})
    }

    togglePlay = async (override?: boolean): Promise<void> => {
        return new Promise(resolve => {
            const newState = typeof override === "boolean" ? override : !this.state.isPlaying
            this.setState({
                isPlaying: newState
            }, async () => {
                if (this.state.isPlaying) this.selectColumn(this.state.song.selected, false, this.state.settings.lookaheadTime.value / 1000)
                let delayOffset = 0
                let previousTime = Date.now()
                while (this.state.isPlaying) {
                    const {song, settings} = this.state
                    const tempoChanger = song.selectedColumn.getTempoChanger().changer
                    const msPerBeat = (60000 / settings.bpm.value * tempoChanger) + delayOffset
                    previousTime = Date.now()
                    await delay(Song.roundTime(msPerBeat))
                    if (!this.state.isPlaying || !this.mounted) break
                    delayOffset = previousTime + msPerBeat - Date.now()
                    const lookaheadTime = settings.lookaheadTime.value / 1000
                    //this schedules the next column counting for the error delay so that timing is more accurate
                    this.handlePlaybackTick(Math.max(0, lookaheadTime + delayOffset / 1000))
                }
                resolve()
            })
        })
    }
    handlePlaybackTick = (errorDelay: number) => {
        const newIndex = this.state.song.selected + 1
        if (this.state.isPlaying && newIndex > this.state.song.columns.length - 1) {
            return this.togglePlay(false)
        }
        this.selectColumn(newIndex, false, errorDelay)
    }
    toggleBreakpoint = (override?: number) => {
        const {song} = this.state
        song.toggleBreakpoint(override)
        this.validateBreakpoints()
        this.setState({song})
    }
    handleTempoChanger = (changer: TempoChanger) => {
        const {song, selectedColumns} = this.state
        if (selectedColumns.length) {
            this.addToHistory()
            selectedColumns.forEach(column => {
                song.columns[column]?.setTempoChanger(changer)
            })
        } else {
            song.selectedColumn.setTempoChanger(changer)
        }
        this.handleAutoSave()
        this.setState({song})
    }
    changePage = async (page: string | 'Home') => {
        const {song, settings} = this.state
        if (page === 'Home') return homeStore.open()
        if (this.changes !== 0) {
            if (settings.autosave.value) {
                await this.updateSong(song)
            } else {
                const confirm = await asyncConfirm(this.props.t('question:unsaved_song_save', {song_name: song.name}), true)
                if (confirm === null) return
                if (confirm) {
                    if (!await this.updateSong(song)) return console.log("Blocking redirect")
                }
            }
        }
        this.props.router.events.off('routeChangeStart', this.unblock)
        this.props.router.push(routeChangeBugFix(page))
    }
    selectColumn = (index: number, ignoreAudio?: boolean, delay?: number) => {
        const {song, isToolsVisible, layers, copiedColumns, isRecordingAudio} = this.state
        let selectedColumns = this.state.selectedColumns
        if (index < 0 || index > song.columns.length - 1) return
        song.selected = index
        if (isToolsVisible && copiedColumns.length === 0) {
            selectedColumns.push(index)
            const min = Math.min(...selectedColumns)
            const max = Math.max(...selectedColumns)
            selectedColumns = new Array(max - min + 1).fill(0).map((e, i) => min + i)
        }
        this.setState({song, selectedColumns})
        //add a bit of delay if recording audio to imrove the recording quality
        delay = delay
            ? delay + (isRecordingAudio ? 0.5  : 0)
            : 0
        if (ignoreAudio) return
        song.selectedColumn.notes.forEach(note => {
            layers.forEach((_, i) => {
                if (note.isLayerToggled(i)) this.playSound(i, note.index, delay)
            })
        })
    }
    selectColumnFromDirection = (direction: number) => {
        this.selectColumn(this.state.song.selected + direction)
    }
    changeLayer = (layer: number) => {
        this.setState({layer})
    }
    toggleTools = () => {
        this.setState({
            isToolsVisible: !this.state.isToolsVisible,
            selectedColumns: this.state.isToolsVisible ? [] : [this.state.song.selected],
            copiedColumns: [],
            undoHistory: []
        })
    }
    resetSelection = () => {
        this.setState({
            copiedColumns: [],
            selectedColumns: [this.state.song.selected]
        })
    }
    addToHistory = () => {
        const {song, undoHistory, isToolsVisible} = this.state
        if (!isToolsVisible) return
        this.setState({
            undoHistory: [...undoHistory, song.clone().columns]
        })
    }
    undo = () => {
        const {undoHistory, song} = this.state
        const history = undoHistory.pop()
        if (!history) return
        song.columns = history
        song.selected = (song.columns.length > song.selected) ? song.selected : song.columns.length - 1
        this.setState({undoHistory: [...undoHistory], song}, () => {
            setTimeout(() => {
                if (!this.mounted) return
                //TODO not sure why this is needed but it doesn't render
                this.setState({})
            }, 100)
        })
    }
    copyColumns = (layer: number | 'all') => {
        const {selectedColumns, song} = this.state
        const copiedColumns = song.copyColumns(selectedColumns, layer)
        this.changes++
        this.setState({selectedColumns: [], copiedColumns})
    }
    pasteColumns = async (insert: boolean, layer: number | 'all') => {
        const {song, copiedColumns} = this.state
        this.addToHistory()
        if (layer === 'all') song.pasteColumns(copiedColumns, insert)
        else if (Number.isFinite(layer)) song.pasteLayer(copiedColumns, insert, layer)
        this.syncInstruments()
        this.changes++
        this.setState({song})
    }
    eraseColumns = (layer: number | 'all') => {
        const {song, selectedColumns} = this.state
        this.addToHistory()
        song.eraseColumns(selectedColumns, layer)
        this.changes++
        this.setState({song, selectedColumns: [song.selected]})
    }
    moveNotesBy = (amount: number, position: number | "all") => {
        const {song, selectedColumns} = this.state
        this.addToHistory()
        song.moveNotesBy(selectedColumns, amount, position)
        this.changes++
        this.setState({song})
    }
    switchLayerPosition = (direction: 1 | -1) => {
        const {song, layer} = this.state
        const toSwap = layer + direction
        if (toSwap < 0 || toSwap > song.instruments.length - 1) return
        song.swapLayer(song.columns.length, 0, layer, toSwap)
        const tmp = song.instruments[layer]
        song.instruments[layer] = song.instruments[toSwap]
        song.instruments[toSwap] = tmp
        song.instruments = [...song.instruments]
        this.changes++
        this.syncInstruments()
        this.setState({song, layer: toSwap})
    }
    deleteColumns = async () => {
        const {song, selectedColumns} = this.state
        this.addToHistory()
        song.deleteColumns(selectedColumns)
        this.changes++
        this.setState({
            song,
            selectedColumns: [song.selected]
        }, this.validateBreakpoints)
    }
    validateBreakpoints = () => {
        const {song} = this.state
        song.validateBreakpoints()
        this.setState({song})
    }
    changeMidiVisibility = (visible: boolean) => {
        this.setState({isMidiVisible: visible})
        if (visible) Analytics.songEvent({type: 'create_MIDI'})
    }

    downloadSong = async (song: SerializedSong, as: 'song' | 'midi') => {
        try {
            if (song.id === this.state.song.id) {
                if (this.state.settings.autosave.value) {
                    await this.updateSong(this.state.song)
                    song = this.state.song.serialize()
                } else {
                    if (await asyncConfirm(this.props.t("ask_download_of_current_song", {song_name: song.name}))) {
                        await this.updateSong(this.state.song)
                        song = this.state.song.serialize()
                    }
                }
            }
            if (as === 'song') {
                const parsed = songService.parseSong(song)
                song.data.appName = APP_NAME
                const songName = song.name
                const converted = [APP_NAME === 'Sky' && (parsed instanceof ComposedSong || parsed instanceof RecordedSong)
                    ? parsed.toOldFormat()
                    : parsed.serialize()
                ]
                fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
                logger.success(this.props.t('logs:song_downloaded'))
                Analytics.userSongs('download', {page: 'composer'})
            } else if (as === 'midi') {
                const agrees = await asyncConfirm(this.props.t('menu:midi_download_warning'))
                const parsed = songService.parseSong(song)
                if (parsed instanceof VsrgSong) throw new Error("Can't convert Vsrg to MIDI")
                const midi = parsed.toMidi()
                if (!agrees) return
                fileService.downloadMidi(midi)
                logger.success(this.props.t('logs:song_downloaded'))
            }

        } catch (e) {
            console.error(e)
            logger.error(this.props.t('logs:error_downloading_song'))
        }
    }

    render() {
        const {
            isMidiVisible,
            song,
            isPlaying,
            copiedColumns,
            settings,
            isRecordingAudio,
            isToolsVisible,
            layer,
            selectedColumns,
            layers,
            undoHistory
        } = this.state
        const songLength = calculateSongLength(song.columns, settings.bpm.value, song.selected)
        const {t} = this.props
        return <>
            <PageMetadata
                text={`${t('home:composer_name')} - ${song.name}`}
                description='Create or edit songs with the composer, using up to 52 layers, tempo changers, multiple instruments and pitches. You can also convert a MIDI, video or audio into a sheet.'
            />
            {isMidiVisible &&
                <MidiParser
                    t={t}
                    functions={this}
                    data={{
                        instruments: song.instruments,
                        selectedColumn: song.selected,
                    }}
                />
            }
            <div className='composer-grid appear-on-mount'>
                <div className="column composer-left-control">
                    <AppButton
                        className='flex-centered'
                        style={{
                            height: '3rem',
                            minHeight: "3rem",
                            borderRadius: '0.3rem',
                            backgroundColor: "var(--primary-darken-10)"
                        }}
                        onClick={_ => {
                            this.togglePlay()
                            if (settings.syncTabs.value) {
                                this.broadcastChannel?.postMessage?.(isPlaying ? 'stop' : 'play')
                            }
                        }}
                        ariaLabel={isPlaying ? t('common:pause') : t('common:play')}
                    >
                        <Memoized>
                            {isPlaying
                                ? <FaPause key='pause' size={18} color='var(--icon-color)'/>
                                : <FaPlay key='play' size={18} color='var(--icon-color)'/>
                            }
                        </Memoized>
                    </AppButton>
                    <InstrumentControls
                        instruments={song.instruments}
                        selected={layer}
                        onLayerSelect={this.changeLayer}
                        onInstrumentAdd={this.addInstrument}
                        onInstrumentChange={this.editInstrument}
                        onInstrumentDelete={this.removeInstrument}
                        onChangePosition={this.switchLayerPosition}
                    />
                </div>
                <div className="top-panel-composer" style={{gridArea: "b"}}>
                    <div className='row' style={{height: 'fit-content', width: "100%"}}>
                        <ComposerCanvas
                            key={settings.columnsPerCanvas.value}
                            functions={this}
                            t={this.props.t}
                            data={{
                                inPreview: this.props.inPreview,
                                isRecordingAudio,
                                currentLayer: layer,
                                isPlaying,
                                song,
                                settings, selectedColumns,
                                columns: song.columns,
                                selected: song.selected,
                                breakpoints: song.breakpoints,
                            }}
                        />
                        <div className="buttons-composer-wrapper-right">
                            <CanvasTool
                                onClick={() => this.addColumns(1, song.selected)}
                                tooltip={t('composer:add_column')}
                                ariaLabel={t('composer:add_column')}
                            >
                                <MemoizedIcon icon={AddColumn} className={'tool-icon'}/>
                            </CanvasTool>
                            <CanvasTool
                                onClick={() => this.removeColumns(1, song.selected)}
                                tooltip={t('composer:remove_column')}
                                ariaLabel={t('composer:remove_column')}
                            >
                                <MemoizedIcon icon={RemoveColumn} className={'tool-icon'}/>
                            </CanvasTool>
                            <CanvasTool
                                onClick={() => this.addColumns(Number(settings.beatMarks.value) * 4, "end")}
                                tooltip={t('composer:add_new_page')}
                                ariaLabel={t('composer:add_new_page')}
                            >

                                <MemoizedIcon icon={FaPlus} size={16}/>
                            </CanvasTool>
                            <CanvasTool
                                onClick={this.toggleTools}
                                tooltip={t('composer:open_tools')}
                                ariaLabel={t('composer:open_tools')}
                            >
                                <MemoizedIcon icon={FaTools} size={16}/>
                            </CanvasTool>
                        </div>
                    </div>
                </div>
                <ComposerKeyboard
                    functions={this}
                    data={{
                        isPlaying,
                        settings,
                        isRecordingAudio,
                        currentLayer: layer,
                        instruments: song.instruments,
                        keyboard: layers[layer],
                        currentColumn: song.selectedColumn,
                        pitch: song.instruments[layer]?.pitch || settings.pitch.value,
                        noteNameType: settings.noteNameType.value,
                    }}
                />
            </div>
            <Menu
                data={{
                    isRecordingAudio, settings,
                    hasChanges: this.changes > 0,
                }}
                functions={this}
                inPreview={this.props.inPreview}
            />
            <ComposerTools
                data={{
                    isToolsVisible,
                    layer,
                    hasCopiedColumns: copiedColumns.length > 0,
                    selectedColumns,
                    undoHistory
                }}
                functions={this}
            />
            <div className="song-info">
                <div className='text-ellipsis'>
                    {song.name}
                </div>
                <div>
                    {formatMs(songLength.current)}
                    /
                    {formatMs(songLength.total)}
                </div>
            </div>
        </>
    }
}

interface ComposerPageProps {
    inPreview?: boolean
    songId?: string
}

export default function ComposerPage({inPreview, songId}: ComposerPageProps) {
    const router = useRouter()
    const {t} = useTranslation(['composer', 'home', 'logs', 'question', 'common', 'menu'])
    const {songId: querySongId, showMidi} = router.query
    useSetPageVisited('composer')
    return <Composer
        router={router}
        t={t}
        songId={(querySongId as string) ?? songId ?? null}
        showMidi={!!showMidi}
        inPreview={inPreview ?? false}
    />
}

ComposerPage.getLayout = function getLayout(page: ReactElement) {
    return <AppBackground page="Composer">
        {page}
    </AppBackground>
}