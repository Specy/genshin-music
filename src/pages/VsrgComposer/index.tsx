import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import VsrgMenu from "$cmp/VsrgComposer/VsrgComposerMenu";
import { SnapPoint, VsrgBottom, VsrgHitObjectType } from "$cmp/VsrgComposer/VsrgBottom";
import './VsrgComposer.css';
import { VsrgTop } from "$cmp/VsrgComposer/VsrgTop";
import { VsrgHitObject, VsrgSong, VsrgSongKeys, VsrgTrack, VsrgTrackModifier } from "$lib/Songs/VsrgSong";
import { asyncConfirm, asyncPrompt } from "$cmp/Utility/AsyncPrompts";
import { logger } from "$stores/LoggerStore";
import { VsrgComposerCanvas } from "$cmp/VsrgComposer/VsrgComposerCanvas";
import { VsrgComposerSettingsDataType } from "$lib/BaseSettings";
import { settingsService } from "$lib/Services/SettingsService";
import { SettingUpdate } from "$types/SettingsPropriety";
import { vsrgComposerStore } from "$stores/VsrgComposerStore";
import { AudioPlayer } from "$lib/AudioPlayer";
import { KeyboardEventData, KeyboardProvider } from "$lib/Providers/KeyboardProvider";
import { songsStore } from "$stores/SongsStore";
import { RecordedSong } from "$lib/Songs/RecordedSong";
import { SerializedSong } from "$lib/Songs/Song";
import { songService } from "$lib/Services/SongService";
import { ComposedSong } from "$lib/Songs/ComposedSong";
import { isFocusable } from "$lib/Utilities";
import { DEFAULT_VSRG_KEYS_MAP } from "$/appConfig";
import { ClickType } from "$types/GeneralTypes"
import { RecordedNote } from "$lib/Songs/SongClasses";

type VsrgComposerProps = RouteComponentProps & {

}



interface VsrgComposerState {
    vsrg: VsrgSong
    selectedTrack: number
    audioPlayer: AudioPlayer
    audioPlaybackPlayer: AudioPlayer
    selectedType: VsrgHitObjectType
    isPlaying: boolean
    settings: VsrgComposerSettingsDataType
    snapPoint: SnapPoint
    snapPoints: number[]
    scaling: number
    snapPointDuration: number
    selectedHitObject: VsrgHitObject | null
    lastCreatedHitObject: VsrgHitObject | null
    audioSong: RecordedSong | null
    renderableNotes: RecordedNote[]
    tempoChanger: number
}
class VsrgComposer extends Component<VsrgComposerProps, VsrgComposerState> {
    lastTimestamp: number = 0
    changes: number = 0
    playbackTimestamp: number = 0
    mounted: boolean = false
    heldKeys: (boolean | undefined)[] = []
    pressedDownHitObjects: (VsrgHitObject | undefined)[] = []
    constructor(props: VsrgComposerProps) {
        super(props)
        const settings = settingsService.getVsrgComposerSettings()
        this.state = {
            vsrg: new VsrgSong("Untitled"),
            audioPlayer: new AudioPlayer(settings.pitch.value),
            audioPlaybackPlayer: new AudioPlayer(settings.pitch.value),
            selectedTrack: 0,
            snapPoint: 1,
            snapPoints: [0],
            snapPointDuration: 0,
            selectedHitObject: null,
            scaling: 60,
            selectedType: 'tap',
            isPlaying: false,
            lastCreatedHitObject: null,
            settings,
            audioSong: null,
            renderableNotes: [],
            tempoChanger: 1,
        }
        this.state.vsrg.addTrack("DunDun")
        this.state.vsrg.set({
            bpm: settings.bpm.value,
            keys: settings.keys.value,
        })
        this.mounted = false
    }
    addTrack = () => {
        const { vsrg } = this.state
        vsrg.addTrack()
        this.setState({
            vsrg
        }, () => vsrgComposerStore.emitEvent("tracksChange"))
    }
    componentDidMount() {
        this.mounted = true
        const id = 'vsrg-composer'
        this.calculateSnapPoints()
        this.syncInstruments()
        KeyboardProvider.listen(this.handleKeyboardDown, { id, type: 'keydown' })
        KeyboardProvider.register("ArrowLeft", () => {
            this.onBreakpointSelect(-1)
        }, { id })
        KeyboardProvider.register("ArrowRight", () => {
            this.onBreakpointSelect(1)
        }, { id })
        KeyboardProvider.register("ArrowUp", () => {
            this.selectTrack(Math.max(0, this.state.selectedTrack - 1))
        }, { id })
        KeyboardProvider.register("ArrowDown", () => {
            this.selectTrack(Math.min(this.state.vsrg.tracks.length - 1, this.state.selectedTrack + 1))
        }, { id })
        KeyboardProvider.listen(this.handleKeyboardUp, { id, type: 'keyup' })
        KeyboardProvider.register('Space', ({ event }) => {
            if (event.repeat) return
            if (isFocusable(document.activeElement)) {
                //@ts-ignore
                document.activeElement?.blur()
                //event.target?.blur()
            }
            this.togglePlay()
        }, { id: 'vsrg-composer' })
    }
    componentWillUnmount() {
        this.mounted = false
        KeyboardProvider.unregisterById('vsrg-composer')
        const { audioPlaybackPlayer, audioPlayer } = this.state
        audioPlaybackPlayer.destroy()
        audioPlayer.destroy()
    }
    updateSettings = (override?: VsrgComposerSettingsDataType) => {
        settingsService.updateVsrgComposerSettings(override !== undefined ? override : this.state.settings)
    }
    syncInstruments = () => {
        const { vsrg, audioPlayer } = this.state
        audioPlayer.syncInstruments(vsrg.tracks.map(t => t.instrument))
    }
    syncAudioSongInstruments = () => {
        const { audioSong, audioPlaybackPlayer } = this.state
        if (audioSong === null) return
        audioPlaybackPlayer.syncInstruments(audioSong.instruments)
        audioPlaybackPlayer.basePitch = audioSong.pitch
    }
    handleKeyboardDown = ({ event, letter }: KeyboardEventData) => {
        const { vsrg } = this.state
        const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter)
        if (key >= 0) {
            if (event.repeat) return
            this.startHitObjectTap(key)
        }
    }
    handleKeyboardUp = ({ letter }: KeyboardEventData) => {
        const { vsrg } = this.state
        const key = DEFAULT_VSRG_KEYS_MAP[vsrg.keys]?.indexOf(letter)
        if (key >= 0) {
            this.endHitObjectTap(key)
        }
    }
    startHitObjectTap = (key: number) => {
        const { vsrg, selectedTrack, selectedType } = this.state
        this.heldKeys[key] = true
        this.changes++
        const timestamp = this.findClosestSnapPoint(this.lastTimestamp)
        if (selectedType === 'delete') {
            vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key)
            return this.setState({ vsrg, selectedHitObject: null })
        }
        const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
        this.pressedDownHitObjects[key] = hitObject
        this.setState({ vsrg, selectedHitObject: hitObject })
    }
    endHitObjectTap = (key: number) => {
        const { vsrg, selectedTrack } = this.state
        const hitObject = this.pressedDownHitObjects[key]
        if (this.heldKeys[key] && hitObject) {
            const snap = this.findClosestSnapPoint(hitObject.timestamp + hitObject.holdDuration)
            vsrg.setHeldHitObjectTail(selectedTrack, hitObject, snap - hitObject.timestamp)
        }
        this.heldKeys[key] = false
        this.pressedDownHitObjects[key] = undefined
    }

    handleSettingChange = (setting: SettingUpdate) => {
        const { settings, vsrg } = this.state
        const { data } = setting
        //@ts-ignore
        settings[setting.key] = { ...settings[setting.key], value: data.value }
        if (setting.key === 'keys') {
            vsrg.changeKeys(data.value as VsrgSongKeys)
        }
        if (setting.key === "bpm") {
            vsrg.set({ bpm: data.value as number })
            this.calculateSnapPoints()
        }
        if (setting.key === "difficulty") {
            vsrg.set({ difficulty: data.value as number })
        }
        this.setState({
            settings: { ...settings }
        }, () => {
            this.updateSettings()
            if (setting.key === 'keys') vsrgComposerStore.emitEvent('updateKeys')
            if (setting.key === 'isVertical') vsrgComposerStore.emitEvent('updateOrientation')
            if (setting.key === 'maxFps') vsrgComposerStore.emitEvent('maxFpsChange')
        })
    }
    onSnapPointChange = (snapPoint: SnapPoint) => {
        const { vsrg } = this.state
        vsrg.set({ snapPoint })
        this.setState({ snapPoint, vsrg }, () => {
            this.calculateSnapPoints()
            vsrgComposerStore.emitEvent("snapPointChange")
        })
    }
    selectHitObject = (hitObject: VsrgHitObject, trackIndex: number, clickType: ClickType) => {
        const selectedType = hitObject.isHeld ? 'hold' : 'tap'
        if (this.state.selectedType === 'delete' || clickType === ClickType.Right) {
            this.state.vsrg.removeHitObjectInTrack(trackIndex, hitObject)
            this.setState({ selectedHitObject: null, vsrg: this.state.vsrg })
            return
        }
        this.setState({
            selectedHitObject: hitObject,
            selectedTrack: trackIndex,
            selectedType
        })
    }
    onSnapPointSelect = (timestamp: number, key: number, type?: ClickType) => {
        const { vsrg, selectedType, lastCreatedHitObject, selectedTrack } = this.state
        this.changes++
        if (timestamp < 0) return console.warn("Timestamp is less than 0")
        const existing = vsrg.getHitObjectsAt(timestamp, key)
        const firstNote = existing.find(h => h !== null)
        if (type === ClickType.Unknown) console.warn('unknown click type')
        //if wants to add a tap note
        if (selectedType === 'tap' && type === ClickType.Left) {
            if (firstNote) return this.setState({ selectedHitObject: firstNote })
            const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
            this.playHitObject(hitObject, selectedTrack)
            this.setState({ selectedHitObject: hitObject })
        }
        //if wants to add a hold note
        if (selectedType === 'hold' && type === ClickType.Left) {
            if (lastCreatedHitObject !== null) {
                vsrg.setHeldHitObjectTail(selectedTrack, lastCreatedHitObject, timestamp - lastCreatedHitObject.timestamp)
                this.setState({ lastCreatedHitObject: null, selectedHitObject: lastCreatedHitObject })
            } else {
                if (firstNote) return this.setState({ selectedHitObject: firstNote })
                const lastCreatedHitObject = vsrg.createHeldHitObject(selectedTrack, timestamp, key)
                this.setState({ lastCreatedHitObject, selectedHitObject: lastCreatedHitObject })
            }
        }
        //if wants to remove a note
        if (selectedType === 'delete' || type === ClickType.Right) {
            vsrg.removeHitObjectInTrackAtTimestamp(selectedTrack, timestamp, key)
            this.setState({ selectedHitObject: null })
        }
        this.setState({ vsrg })
    }
    selectTrack = (selectedTrack: number) => {
        this.setState({ selectedTrack })
    }
    setAudioSong = (song: SerializedSong | null) => {
        const { vsrg } = this.state
        this.changes++
        if (song === null) {
            vsrg.setAudioSong(null)
            return this.setState({ audioSong: null, renderableNotes: [] })
        }
        const parsed = songService.parseSong(song)
        if (parsed instanceof RecordedSong) {
            vsrg.setAudioSong(parsed)
            parsed.startPlayback(this.lastTimestamp)
            vsrg.setDurationFromNotes(parsed.notes)
            const renderableNotes = vsrg.getRenderableNotes(parsed)
            this.setState({ audioSong: parsed, renderableNotes }, this.syncAudioSongInstruments)
        }
        if (parsed instanceof ComposedSong) {
            const recorded = parsed.toRecordedSong(0)
            vsrg.setDurationFromNotes(recorded.notes)
            recorded.startPlayback(this.lastTimestamp)
            vsrg.setAudioSong(parsed) //set as composed song because it's the original song
            const renderableNotes = vsrg.getRenderableNotes(recorded)
            this.setState({ audioSong: recorded, renderableNotes }, this.syncAudioSongInstruments)
        }
    }
    askForSongUpdate = async () => {
        return await asyncConfirm(`You have unsaved changes to the song: "${this.state.vsrg.name}" do you want to save now?`, false)
    }
    createNewSong = async () => {
        if (this.state.vsrg.name !== "Untitled" && this.changes > 0) {
            if (await this.askForSongUpdate()) {
                await this.saveSong()
            }
        }
        const name = await asyncPrompt('Enter song name')
        if (name) {
            const vsrg = new VsrgSong(name)
            vsrg.set({
                bpm: this.state.settings.bpm.value,
                keys: this.state.settings.keys.value,
                pitch: this.state.settings.pitch.value,
                snapPoint: this.state.snapPoint
            })
            vsrg.addTrack()
            const id = await songsStore.addSong(vsrg)
            vsrg.set({ id })
            this.setState({ vsrg, renderableNotes: [] }, () => {
                vsrgComposerStore.emitEvent('songLoad')
                this.calculateSnapPoints()
                this.syncInstruments()
            })
        }
    }
    calculateSnapPoints = () => {
        const { vsrg, snapPoint } = this.state
        const amount = vsrg.duration / Math.floor(60000 / vsrg.bpm) * snapPoint
        const snapPointDuration = vsrg.duration / amount
        const snapPoints = new Array(Math.floor(amount)).fill(0).map((_, i) => i * snapPointDuration)
        this.setState({ snapPoints, snapPointDuration })
    }
    dragHitObject = (newTimestamp: number, key?: number) => {
        const { selectedHitObject, vsrg, settings } = this.state
        if (selectedHitObject === null) return
        selectedHitObject.timestamp = newTimestamp
        if (key !== undefined && key < settings.keys.value) selectedHitObject.index = key
        this.setState({ vsrg, selectedHitObject })
    }
    findClosestSnapPoint = (timestamp: number) => {
        const { snapPoints } = this.state
        const closest = snapPoints.reduce((prev, curr) => {
            if (Math.abs(curr - timestamp) < Math.abs(prev - timestamp)) return curr
            return prev
        })
        return closest
    }
    releaseHitObject = () => {
        const { selectedHitObject, vsrg } = this.state
        if (selectedHitObject === null) return
        selectedHitObject.timestamp = this.findClosestSnapPoint(selectedHitObject.timestamp)
        const tracks = vsrg.getHitObjectsBetween(selectedHitObject.timestamp, selectedHitObject.timestamp + selectedHitObject.holdDuration, selectedHitObject.index)
        tracks.forEach((t, i) => t.forEach(h => h !== selectedHitObject && vsrg.removeHitObjectInTrackAtTimestamp(i, h.timestamp, h.index)))
        this.changes++
        this.setState({ vsrg })
    }
    onTrackChange = (track: VsrgTrack, index: number) => {
        const { vsrg } = this.state
        vsrg.tracks[index] = track
        this.setState({ vsrg }, this.syncInstruments)
    }
    onNoteSelect = (note: number) => {
        const { selectedHitObject, audioPlayer, selectedTrack } = this.state
        selectedHitObject?.toggleNote(note)
        audioPlayer.playNoteOfInstrument(selectedTrack, note)
        this.setState({ selectedHitObject })
    }
    togglePlay = () => {
        const { isPlaying, vsrg, audioSong } = this.state
        vsrg.startPlayback(this.lastTimestamp)
        if (this.lastTimestamp >= vsrg.duration) return this.setState({ isPlaying: false })
        if (audioSong) audioSong.startPlayback(this.lastTimestamp)
        this.setState({ isPlaying: !isPlaying })
    }
    playHitObject = (hitObject: VsrgHitObject, trackIndex: number) => {
        const { audioPlayer } = this.state
        audioPlayer.playNotesOfInstrument(trackIndex, hitObject.notes)
    }
    onTimestampChange = (timestamp: number) => {
        const { vsrg, isPlaying, audioSong, audioPlaybackPlayer, snapPointDuration } = this.state
        this.lastTimestamp = timestamp
        if (isPlaying) {
            if (this.lastTimestamp >= vsrg.duration) return this.setState({ isPlaying: false })
            this.heldKeys.forEach((key, i) => {
                if (key) {
                    const hitObject = this.pressedDownHitObjects[i]
                    if (!hitObject) return
                    const diff = timestamp - hitObject.timestamp
                    if (diff > snapPointDuration) {
                        hitObject.holdDuration = diff
                        hitObject.isHeld = true
                    }
                }
            })
            if (audioSong) {
                const notes = audioSong.tickPlayback(timestamp)
                notes.forEach(n => {
                    const layers = n.layer.toArray()
                    layers.forEach((l, i) => {
                        if (l === 0 || vsrg.trackModifiers[i].muted) return
                        audioPlaybackPlayer.playNoteOfInstrument(i, n.index)
                    })
                })
            }
            const tracks = vsrg.tickPlayback(timestamp)
            tracks.forEach((track, index) => track.forEach(hitObject => this.playHitObject(hitObject, index)))
        }
    }
    deleteTrack = async (index: number) => {
        const { vsrg } = this.state
        if (vsrg.tracks.length === 1) return logger.error('Cannot delete last track')
        const confirm = await asyncConfirm("Are you sure you want to remove this track? All notes will be deleted.")
        if (!confirm || !this.mounted) return
        this.changes++
        vsrg.deleteTrack(index)
        this.setState({
            vsrg,
            selectedTrack: Math.max(0, index - 1)
        }, () => vsrgComposerStore.emitEvent("tracksChange"))
    }
    onSongOpen = async (song: VsrgSong) => {
        const { settings, vsrg } = this.state
        if (this.changes !== 0) {
            let confirm = settings.autosave.value && vsrg.name !== "Untitled"
            if (!confirm) {
                confirm = await asyncConfirm(`You have unsaved changes to the song: "${vsrg.name}" do you want to save? UNSAVED CHANGES WILL BE LOST`, false)
            }
            if (confirm) {
                await this.saveSong()
            }
        }
        settings.bpm.value = song.bpm
        settings.keys.value = song.keys
        settings.pitch.value = song.pitch
        this.updateSettings()
        this.changes++
        this.setState({
            vsrg: song,
            snapPoint: song.snapPoint,
            selectedTrack: 0,
            selectedHitObject: null,
            lastCreatedHitObject: null,
        }, async () => {
            vsrgComposerStore.emitEvent('songLoad')
            this.syncInstruments()
            const audioSong = await songsStore.getSongById(song.audioSongId)
            this.setAudioSong(audioSong)
            this.calculateSnapPoints()
        })
    }
    addTime = () => {
        const { vsrg } = this.state
        vsrg.duration += 1000
        this.calculateSnapPoints()
        this.changes++
        this.setState({ vsrg })
    }
    removeTime = () => {
        const { vsrg } = this.state
        vsrg.duration -= 1000
        this.calculateSnapPoints()
        this.changes++
        this.setState({ vsrg })
    }
    onScalingChange = (scaling: number) => {
        this.setState({ scaling }, () => vsrgComposerStore.emitEvent('scaleChange'))
    }
    saveSong = async () => {
        const { vsrg } = this.state
        const name = vsrg.name !== 'Untitled' ? vsrg.name : await asyncPrompt('Enter song name')
        if (name === null) return
        vsrg.set({ name })
        if (vsrg.id === null) {
            const id = await songsStore.addSong(vsrg)
            vsrg.set({ id })
        } else {
            songsStore.updateSong(vsrg)
        }
        this.changes = 0
        this.setState({ vsrg })
    }
    onTrackModifierChange = (trackModifier: VsrgTrackModifier, index: number, recalculate: boolean) => {
        const { vsrg, audioSong } = this.state
        vsrg.trackModifiers[index] = trackModifier
        vsrg.trackModifiers = [...vsrg.trackModifiers]
        this.changes++
        if (recalculate && audioSong) {
            const renderableNotes = vsrg.getRenderableNotes(audioSong)
            return this.setState({ renderableNotes, vsrg })
        }
        this.setState({ vsrg })
    }
    onTempoChangerChange = (tempoChanger: number) => {
        this.setState({ tempoChanger })
    }
    selectType = (selectedType: VsrgHitObjectType) => {
        this.setState({ selectedType, lastCreatedHitObject: null })
    }
    onBreakpointChange = (remove: boolean) => {
        const { vsrg } = this.state
        const timestamp = this.findClosestSnapPoint(this.lastTimestamp)
        vsrg.setBreakpoint(timestamp, !remove)
        this.setState({ vsrg })
    }
    onBreakpointSelect = (direction: -1 | 1) => {
        const { vsrg, isPlaying, audioSong } = this.state
        const breakpoint = vsrg.getClosestBreakpoint(this.lastTimestamp, direction)
        if (isPlaying) audioSong?.startPlayback(breakpoint)
        vsrgComposerStore.emitEvent('timestampChange', breakpoint)
    }
    render() {
        const { settings, selectedTrack, vsrg, lastCreatedHitObject, snapPoints, isPlaying, snapPoint, selectedHitObject, selectedType, audioSong, scaling, renderableNotes, tempoChanger } = this.state
        return <>
            <VsrgMenu
                trackModifiers={vsrg.trackModifiers}
                hasChanges={this.changes > 0}
                settings={settings}
                audioSong={audioSong}
                onTrackModifierChange={this.onTrackModifierChange}
                onSongOpen={this.onSongOpen}
                onSave={this.saveSong}
                onCreateSong={this.createNewSong}
                setAudioSong={this.setAudioSong}
                handleSettingChange={this.handleSettingChange}
            />
            <div className="vsrg-page">
                <VsrgTop
                    vsrg={vsrg}
                    onBreakpointSelect={this.onBreakpointSelect}
                    onBreakpointChange={this.onBreakpointChange}
                    selectedHitObject={selectedHitObject}
                    isHorizontal={!settings.isVertical.value}
                    selectedTrack={selectedTrack}
                    lastCreatedHitObject={lastCreatedHitObject}
                    onTrackAdd={this.addTrack}
                    onTrackChange={this.onTrackChange}
                    onTrackDelete={this.deleteTrack}
                    onTrackSelect={this.selectTrack}
                    onNoteSelect={this.onNoteSelect}
                >
                    <VsrgComposerCanvas
                        vsrg={vsrg}
                        renderableNotes={renderableNotes}
                        onTimestampChange={this.onTimestampChange}
                        selectedHitObject={selectedHitObject}
                        isHorizontal={!settings.isVertical.value}
                        tempoChanger={tempoChanger}
                        maxFps={settings.maxFps.value}
                        scaling={scaling}
                        audioSong={audioSong}
                        snapPoint={snapPoint}
                        snapPoints={snapPoints}
                        isPlaying={isPlaying}
                        onRemoveTime={this.removeTime}
                        onAddTime={this.addTime}
                        onKeyDown={this.startHitObjectTap}
                        onKeyUp={this.endHitObjectTap}
                        dragHitObject={this.dragHitObject}
                        releaseHitObject={this.releaseHitObject}
                        selectHitObject={this.selectHitObject}
                        onSnapPointSelect={this.onSnapPointSelect}
                    />

                </VsrgTop>
                <VsrgBottom
                    vsrg={vsrg}
                    scaling={scaling}
                    tempoChanger={tempoChanger}
                    onTempoChangerChange={this.onTempoChangerChange}
                    onScalingChange={this.onScalingChange}
                    isPlaying={isPlaying}
                    togglePlay={this.togglePlay}
                    selectedSnapPoint={snapPoint}
                    onSnapPointChange={this.onSnapPointChange}
                    selectedHitObjectType={selectedType}
                    onHitObjectTypeChange={this.selectType}
                />
            </div>
        </>
    }
}

export default withRouter<VsrgComposerProps, any>(VsrgComposer)