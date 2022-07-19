import { Component } from "react";
import { RouteComponentProps, withRouter } from "react-router-dom";
import VsrgMenu from "components/VsrgComposer/VsrgMenu";
import { VsrgBottom } from "components/VsrgComposer/VsrgBottom";
import './VsrgComposer.css';
import { VsrgTop } from "components/VsrgComposer/VsrgTop";
import { VsrgSong, VsrgTrack } from "lib/Songs/VsrgSong";
import { asyncConfirm } from "components/Utility/AsyncPrompts";
type VsrgComposerProps = RouteComponentProps & {
    
}
interface VsrgComposerState {
    vsrg: VsrgSong
    selectedTrack: number
}

class VsrgComposer extends Component<VsrgComposerProps, VsrgComposerState> {
    constructor(props: VsrgComposerProps) {
        super(props)
        this.state = {
            vsrg: new VsrgSong("Untitled"),
            selectedTrack: 0
        }
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
        const confirm = await asyncConfirm("Are you sure you want to remove this track? All notes will be deleted.")
        if(!confirm) return
        const { vsrg } = this.state
        vsrg.deleteTrack(index)
        this.setState({ vsrg })
    }
    render() {
        return <>
            <VsrgMenu />
            <div className="vsrg-page">
                <VsrgTop 
                    vsrg={this.state.vsrg}
                    selectedTrack={this.state.selectedTrack}
                    onTrackAdd={this.addTrack}
                    onTrackChange={this.changeTrack}
                    onTrackDelete={this.deleteTrack}
                    onTrackSelect={this.selectTrack}
                />
                <VsrgBottom />
            </div>
        </>
    }
}

export default withRouter<VsrgComposerProps, any>(VsrgComposer)