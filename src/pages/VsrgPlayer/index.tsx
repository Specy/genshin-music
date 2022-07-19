import { Component } from "react";
import { SimpleMenu } from "components/Layout/SimpleMenu";
import { RouteComponentProps, withRouter } from "react-router-dom";

type VsrgPlayerProps = RouteComponentProps & {
    
}
interface VsrgPlayerState {

}

class VsrgPlayer extends Component<VsrgPlayerProps, VsrgPlayerState> {
    constructor(props: VsrgPlayerProps) {
        super(props)
        this.state = {
            
        }
    }
    render() {
        return <>
            <SimpleMenu />

        </>
    }
}

export default withRouter<VsrgPlayerProps, any>(VsrgPlayer)