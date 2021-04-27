import React, { Component } from 'react'
import isMobile from "is-mobile"
class ComposerNote extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }
    shouldComponentUpdate(next, prev) {
        return this.props.layers !== next.layers
    }
    render() {
        const { data, layers } = this.props
        let className = "note-composer "
        let noteText = isMobile() ? data.noteNames.mobile : data.noteNames.keyboard
        if (layers[0] === "1") className += " layer-1"
        if (layers[1] === "1") className += " layer-2"
        if (layers[2] === "1") className += " layer-3"
        return <button onPointerDown={() => this.props.clickAction(data)} className="button-hitbox">
            <div className={className} >
                <img
                    alt={data.noteNames.mobile}
                    src={`./assets/icons/keys/${data.noteNames.mobile}.svg`}>

                </img>
                <div className="layer-3-ball">
                </div>
                <div className="note-name">
                    {noteText}
                </div>
            </div>
        </button>
    }
}



export default ComposerNote