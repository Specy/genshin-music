import React, { Component } from 'react'
import { cssClasses, appName , instrumentsData} from "appConfig" 
import GenshinNoteBorder from 'components/GenshinNoteBorder'
class ComposerNote extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }
    shouldComponentUpdate(next, prev) {
        let canRender = false
        canRender = canRender ||this.props.layers !== next.layers || this.props.noteText !== next.noteText
        canRender = canRender || this.props.instrument !== next.instrument
        return canRender
    }
    render() {
        const {props} = this
        const { data, layers,instrument } = props
        let className = cssClasses.noteComposer
        if (layers[0] === "1") className += " layer-1"
        if (layers[1] === "1") className += " layer-2"
        if (layers[2] === "1") className += " layer-3"
        let layer3Class = "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"
        let effects = instrumentsData[instrument]?.effects || {}
        return <button onPointerDown={() => this.props.clickAction(data)} className="button-hitbox">
            <div className={className} >
                <img
                    draggable="false"
                    alt={data.noteNames.mobile}
                    src={props.noteImage}
                    style={effects}
                >
                  
                </img>
                {appName === 'Genshin' && <GenshinNoteBorder
                    className='genshin-border'
                />}
                <div className={layer3Class}>
                </div>
                <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                    {props.noteText}
                </div>
            </div>
        </button>
    }
}



export default ComposerNote