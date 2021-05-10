import React, { Component } from 'react'
import { cssClasses,appName } from "../../appConfig" 
class ComposerNote extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }
    shouldComponentUpdate(next, prev) {
        return this.props.layers !== next.layers || this.props.skyText !== next.skyText
    }
    render() {
        const {props} = this
        const { data, layers } = props
        let className = cssClasses.noteComposer
        if (layers[0] === "1") className += " layer-1"
        if (layers[1] === "1") className += " layer-2"
        if (layers[2] === "1") className += " layer-3"
        let noteText = data.noteNames.mobile
        let svgUrl = `./assets/icons/keys/${data.noteNames.mobile}.svg`
        if(appName === "Sky") svgUrl = `./assets/icons/keys/${props.skyImg}.svg`
        if(appName === "Sky") noteText = props.skyText
        return <button onPointerDown={() => this.props.clickAction(data)} className="button-hitbox">
            <div className={className} >
                <img
                    draggable="false"
                    alt={data.noteNames.mobile}
                    src={svgUrl}>

                </img>
                <div className={appName === "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"}>
                </div>
                <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                    {noteText}
                </div>
            </div>
        </button>
    }
}



export default ComposerNote