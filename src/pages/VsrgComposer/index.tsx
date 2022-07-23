import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import VsrgMenu from "components/VsrgComposer/VsrgMenu";
import { SnapPoint, VsrgBottom, VsrgHitObjectType } from "components/VsrgComposer/VsrgBottom";
import './VsrgComposer.css';
import { VsrgTop } from "components/VsrgComposer/VsrgTop";
import { VsrgHitObject, VsrgSong, VsrgSongKeys, VsrgTrack } from "lib/Songs/VsrgSong";
import { asyncConfirm } from "components/Utility/AsyncPrompts";
import { logger } from "stores/LoggerStore";
import { VsrgCanvas } from "components/VsrgComposer/VsrgCanvas";
import { VsrgComposerSettingsDataType } from "lib/BaseSettings";
import { settingsService } from "lib/Services/SettingsService";
import { SettingUpdate } from "types/SettingsPropriety";
import { vsrgComposerStore } from "stores/VsrgComposerStore";
import { AudioPlayer } from "lib/AudioPlayer";
import { KeyboardProvider } from "lib/Providers/KeyboardProvider";
type VsrgComposerProps = RouteComponentProps & {

}
interface VsrgComposerState {
    vsrg: VsrgSong
    selectedTrack: number
    audioPlayer: AudioPlayer
    selectedType: VsrgHitObjectType
    isPlaying: boolean
    settings: VsrgComposerSettingsDataType
    snapPoint: SnapPoint
    snapPoints: number[]
    snapPointDuration: number
    selectedHitObject: VsrgHitObject | null
    lastCreatedHitObject: VsrgHitObject | null
}
class VsrgComposer extends Component<VsrgComposerProps, VsrgComposerState> {
    lastTimestamp: number = 0
    constructor(props: VsrgComposerProps) {
        super(props)
        const settings = settingsService.getVsrgComposerSettings()
        this.state = {
            vsrg: new VsrgSong("Untitled"),
            audioPlayer: new AudioPlayer(settings.pitch.value),
            selectedTrack: 0,
            snapPoint: 4,
            snapPoints: [0],
            snapPointDuration: 0,
            selectedHitObject: null,
            selectedType: 'tap',
            isPlaying: false,
            lastCreatedHitObject: null,
            settings
        }
        this.lastTimestamp = 0
        this.state.vsrg.addTrack("DunDun")
    }
    addTrack = () => {
        const { vsrg } = this.state
        vsrg.addTrack()
        this.setState({
            vsrg
        }, () => vsrgComposerStore.emitEvent("tracksChange"))
    }
    componentDidMount() {
        this.calculateSnapPoints()
        this.syncInstruments()
        KeyboardProvider.register('Space', ({ event }) => {
            if (event.repeat) return
            //@ts-ignore
            if (event.target?.tagName === "BUTTON") {
                //@ts-ignore
                event.target?.blur()
            }
            this.togglePlay()
        }, { id: 'vsrg-composer' })
    }
    componentWillUnmount() {
        KeyboardProvider.unregisterById('vsrg-composer')
    }
    updateSettings = (override?: VsrgComposerSettingsDataType) => {
        settingsService.updateVsrgSettings(override !== undefined ? override : this.state.settings)
    }
    syncInstruments = () => {
        const { vsrg, audioPlayer } = this.state
        audioPlayer.syncInstruments(vsrg.tracks.map(t => t.instrument))
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
            vsrg.bpm = data.value as number
            this.calculateSnapPoints()
        }
        this.setState({
            settings: { ...settings }
        }, () => {
            this.updateSettings()
            if (setting.key === 'keys') vsrgComposerStore.emitEvent('updateKeys')
            if (setting.key === 'isVertical') vsrgComposerStore.emitEvent('updateOrientation')
        })
    }
    onSnapPointChange = (snapPoint: SnapPoint) => {
        this.setState({ snapPoint }, () => {
            this.calculateSnapPoints()
            vsrgComposerStore.emitEvent("snapPointChange")
        })
    }
    selectHitObject = (hitObject: VsrgHitObject, trackIndex:number, clickType: number) => {
        const selectedType = hitObject.isHeld ? 'hold' : 'tap'
        if(this.state.selectedType === 'delete' || clickType === 2){
            this.state.vsrg.removeHitObjectInTrack(trackIndex, hitObject)
            this.setState( { selectedHitObject: null , vsrg: this.state.vsrg} )
            return 
        }
        this.setState({ 
            selectedHitObject: hitObject, 
            selectedTrack: trackIndex, 
            selectedType
        })
    }
    onSnapPointSelect = (timestamp: number, key: number, type?: 0 | 2) => {
        const { vsrg, selectedType, lastCreatedHitObject, selectedTrack, settings, snapPointDuration } = this.state
        timestamp = settings.isVertical.value ? timestamp - snapPointDuration : timestamp
        const existing = vsrg.getHitObjectsAt(timestamp, key)
        if (selectedType === 'tap' && type !== 2) {
            if(existing.some(h => h !== null)) return
            const hitObject = vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
            this.playHitObject(hitObject, selectedTrack)
            this.setState({ selectedHitObject: hitObject })
        }
        if (type === 2) {
            vsrg.removeHitObjectInTrackAtIndex(selectedTrack, timestamp, key)
            this.setState({ selectedHitObject: null })
        }
        if (selectedType === 'delete') {
            vsrg.removeHitObjectInTrackAtIndex(selectedTrack, timestamp, key)
            this.setState({ selectedHitObject: null })
        }
        if (selectedType === 'hold' && type !== 2) {
            if (lastCreatedHitObject !== null) {
                vsrg.setHeldHitObjectTail(selectedTrack, lastCreatedHitObject, timestamp - lastCreatedHitObject.timestamp)
                this.setState({ lastCreatedHitObject: null, selectedHitObject: lastCreatedHitObject })
            } else {
                if(existing.some(h => h !== null)) return
                const lastCreatedHitObject = vsrg.createHeldHitObject(selectedTrack, timestamp, key)
                this.setState({ lastCreatedHitObject, selectedHitObject: lastCreatedHitObject })
            }
        }
        this.setState({ vsrg })
    }
    selectTrack = (selectedTrack: number) => {
        this.setState({ selectedTrack })
    }

    calculateSnapPoints = () => {
        const { vsrg, snapPoint } = this.state
        const amount = vsrg.duration / (60000 / vsrg.bpm) * snapPoint
        const snapPointDuration = vsrg.duration / amount
        const snapPoints = new Array(Math.floor(amount)).fill(0).map((_, i) => i * snapPointDuration)
        this.setState({ snapPoints, snapPointDuration })
    }
    dragHitObject = (newTimestamp: number) => {
        const { selectedHitObject } = this.state
        if(selectedHitObject === null) return
        selectedHitObject.timestamp = newTimestamp
        this.setState({ vsrg: this.state.vsrg })
    }
    releaseHitObject = () => {
        const { selectedHitObject, snapPoints, vsrg } = this.state
        //find closest snap point
        if(selectedHitObject === null) return
        let firstBound = 0
        let secondBound = 0
        for(let i = 0; i < snapPoints.length; i++){
            if(selectedHitObject.timestamp >= snapPoints[i]) firstBound = snapPoints[i]
            if(selectedHitObject.timestamp <= snapPoints[i]){
                secondBound = snapPoints[i]
                break
            }
        }
        //check if timestamp is closer to first or second bound
        if(Math.abs(selectedHitObject.timestamp - firstBound) < Math.abs(selectedHitObject.timestamp - secondBound)){
            selectedHitObject.timestamp = firstBound
        }else{
            selectedHitObject.timestamp = secondBound
        }
        const tracks = vsrg.getHitObjectsBetween(selectedHitObject.timestamp, selectedHitObject.timestamp + selectedHitObject.holdDuration, selectedHitObject.index)
        tracks.forEach((t, i) => t.forEach(h => h !== selectedHitObject && vsrg.removeHitObjectInTrackAtIndex(i, h.timestamp, h.index)))
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
        const { isPlaying, vsrg } = this.state
        vsrg.startPlayback(this.lastTimestamp)
        this.setState({ isPlaying: !isPlaying })
    }
    playHitObject = (hitObject: VsrgHitObject, trackIndex: number) => {
        const { audioPlayer } = this.state
        audioPlayer.playNotesOfInstrument(trackIndex, hitObject.notes)
    }
    onTimestampChange = (timestamp: number) => {
        const { vsrg, isPlaying } = this.state
        this.lastTimestamp = timestamp
        if (isPlaying) {
            const tracks = vsrg.tickPlayback(timestamp)
            tracks.forEach((track, index) => track.forEach(hitObject => this.playHitObject(hitObject, index)))
        }
    }
    deleteTrack = async (index: number) => {
        if (this.state.vsrg.tracks.length === 1) return logger.error('Cannot delete last track')
        const confirm = await asyncConfirm("Are you sure you want to remove this track? All notes will be deleted.")
        if (!confirm) return
        const { vsrg } = this.state
        vsrg.deleteTrack(index)
        this.setState({
            vsrg,
            selectedTrack: Math.max(0, index - 1)
        }, () => vsrgComposerStore.emitEvent("tracksChange"))
    }
    onSongOpen = (vsrg: VsrgSong) => {
        this.setState({ vsrg })
    }
    saveSong = async () => {

    }
    selectType = (selectedType: VsrgHitObjectType) => {
        this.setState({ selectedType })
    }
    render() {
        const { settings, selectedTrack, vsrg, lastCreatedHitObject, snapPoints, isPlaying, snapPoint, selectedHitObject, selectedType } = this.state
        return <>
            <VsrgMenu
                onSongOpen={this.onSongOpen}
                onSave={this.saveSong}
                settings={settings}
                handleSettingChange={this.handleSettingChange}
            />
            <div className="vsrg-page">
                <VsrgTop
                    vsrg={vsrg}
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
                    <VsrgCanvas
                        vsrg={vsrg}
                        onTimestampChange={this.onTimestampChange}
                        selectedHitObject={selectedHitObject}
                        isHorizontal={!settings.isVertical.value}
                        snapPoint={snapPoint}
                        snapPoints={snapPoints}
                        isPlaying={isPlaying}
                        dragHitObject={this.dragHitObject}
                        releaseHitObject={this.releaseHitObject}
                        selectHitObject={this.selectHitObject}
                        onSnapPointSelect={this.onSnapPointSelect}
                    />

                </VsrgTop>
                <VsrgBottom
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