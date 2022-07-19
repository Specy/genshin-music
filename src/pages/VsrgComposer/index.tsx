import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import VsrgMenu from "components/VsrgComposer/VsrgMenu";
import { VsrgBottom, VsrgHitObjectType } from "components/VsrgComposer/VsrgBottom";
import './VsrgComposer.css';
import { VsrgTop } from "components/VsrgComposer/VsrgTop";
import { VsrgSong, VsrgTrack } from "lib/Songs/VsrgSong";
import { asyncConfirm } from "components/Utility/AsyncPrompts";
import { logger } from "stores/LoggerStore";
type VsrgComposerProps = RouteComponentProps & {
    
}
interface VsrgComposerState {
    vsrg: VsrgSong
    selectedTrack: number
    selectedType: VsrgHitObjectType
}

class VsrgComposer extends Component<VsrgComposerProps, VsrgComposerState> {
    constructor(props: VsrgComposerProps) {
        super(props)
        this.state = {
            vsrg: new VsrgSong("Untitled"),
            selectedTrack: 0,
            selectedType: 'tap'
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
    selectTrack = (selectedTrack: number) => {
        this.setState({ selectedTrack })
    }
    changeTrack = (track: VsrgTrack, index: number) => {
        const { vsrg } = this.state
        vsrg.tracks[index] = track
        this.setState({ vsrg })
    }
    deleteTrack = async (index: number) => {
        if(this.state.vsrg.tracks.length === 1) return logger.error('Cannot delete last track')
        const confirm = await asyncConfirm("Are you sure you want to remove this track? All notes will be deleted.")
        if(!confirm) return
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
        return <>
            <VsrgMenu 
                onSongOpen={this.onSongOpen}
                onSave={this.saveSong}
            />
            <div className="vsrg-page">
                <VsrgTop 
                    vsrg={this.state.vsrg}
                    selectedTrack={this.state.selectedTrack}
                    onTrackAdd={this.addTrack}
                    onTrackChange={this.changeTrack}
                    onTrackDelete={this.deleteTrack}
                    onTrackSelect={this.selectTrack}
                />
                <VsrgBottom 
                    onHitObjectTypeChange={this.selectType}
                />
            </div>
        </>
    }
}

export default withRouter<VsrgComposerProps, any>(VsrgComposer)