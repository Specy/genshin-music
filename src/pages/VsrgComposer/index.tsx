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
type VsrgComposerProps = RouteComponentProps & {

}
interface VsrgComposerState {
    vsrg: VsrgSong
    selectedTrack: number
    selectedType: VsrgHitObjectType
    isPlaying: boolean
    settings: VsrgComposerSettingsDataType
    snapPoint: SnapPoint
    snapPoints: number[]
    snapPointDuration: number
    lastCreatedHitObject: VsrgHitObject | null
}
class VsrgComposer extends Component<VsrgComposerProps, VsrgComposerState> {
    constructor(props: VsrgComposerProps) {
        super(props)
        this.state = {
            vsrg: new VsrgSong("Untitled"),
            selectedTrack: 0,
            snapPoint: 4,
            snapPoints: [0],
            snapPointDuration: 0,
            selectedType: 'tap',
            isPlaying: false,
            lastCreatedHitObject: null,
            settings: settingsService.getVsrgComposerSettings()
        }
        this.state.vsrg.addTrack("DunDun")
    }
    addTrack = () => {
        const { vsrg } = this.state
        vsrg.addTrack()
        this.setState({
            vsrg
        })
    }
    componentDidMount() {
        this.calculateSnapPoints()
    }
    updateSettings = (override?: VsrgComposerSettingsDataType) => {
        settingsService.updateVsrgSettings(override !== undefined ? override : this.state.settings)
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
    onSnapPointSelect = (t: number, key: number, type?: 0 | 2) => {
        const { vsrg, selectedType, lastCreatedHitObject, selectedTrack, settings, snapPointDuration} = this.state
        const timestamp = settings.isVertical.value ? t - snapPointDuration : t
        if (selectedType === 'tap' && type !== 2) vsrg.createHitObjectInTrack(selectedTrack, timestamp, key)
        if (["tap", "hold"].includes(selectedType) && type === 2) vsrg.removeHitObjectAt(selectedTrack, timestamp, key)
        if (selectedType === 'delete') vsrg.removeHitObjectAt(selectedTrack, timestamp, key)
        if (selectedType === 'hold' && type !== 2) {
            if (lastCreatedHitObject !== null) {
                vsrg.setHeldHitObjectTail(selectedTrack, lastCreatedHitObject, timestamp - lastCreatedHitObject.timestamp)
                this.setState({ lastCreatedHitObject: null })
            } else {
                const lastCreatedHitObject = vsrg.createHeldHitObject(selectedTrack, timestamp, key)
                this.setState({ lastCreatedHitObject })
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
    changeTrack = (track: VsrgTrack, index: number) => {
        const { vsrg } = this.state
        vsrg.tracks[index] = track
        this.setState({ vsrg })
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
        })
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
        const { settings, selectedTrack, vsrg, lastCreatedHitObject, snapPoints, isPlaying, snapPoint } = this.state
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
                    isHorizontal={!settings.isVertical.value}
                    selectedTrack={selectedTrack}
                    lastCreatedHitObject={lastCreatedHitObject}
                    onTrackAdd={this.addTrack}
                    onTrackChange={this.changeTrack}
                    onTrackDelete={this.deleteTrack}
                    onTrackSelect={this.selectTrack}
                >
                    <VsrgCanvas
                        vsrg={vsrg}
                        isHorizontal={!settings.isVertical.value}
                        snapPoint={snapPoint}
                        snapPoints={snapPoints}
                        isPlaying={isPlaying}
                        onSnapPointSelect={this.onSnapPointSelect}
                    />

                </VsrgTop>
                <VsrgBottom
                    selectedSnapPoint={snapPoint}
                    onSnapPointChange={this.onSnapPointChange}
                    onHitObjectTypeChange={this.selectType}
                />
            </div>
        </>
    }
}

export default withRouter<VsrgComposerProps, any>(VsrgComposer)