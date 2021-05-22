import React, { Component } from 'react'
import isMobile from "is-mobile"
import { cssClasses, appName} from "../../appConfig"

class Note extends Component {
    constructor(props) {
        super(props)
        this.state = {

        }
    }
    render() {
        const { props } = this
        let data = props.data
        let className = data.clicked ? (cssClasses.note + " click-event") : cssClasses.note
        let toBeClicked = props.toBeClicked ? " note-red" : ""
        let toBeClickedNext = props.toBeClickedNext ? " note-border-click" : ""
        className += toBeClicked + toBeClickedNext
        let noteText = isMobile() ? data.noteNames.mobile : data.noteNames.keyboard
        let animation = { transition: `all ${props.fadeTime}s` }
        let svgUrl = `./assets/icons/keys/${data.noteNames.mobile}.svg`
        if(appName === "Sky") svgUrl = `./assets/icons/keys/${props.skyImg}.svg`
        if(appName === "Sky") noteText = props.skyText
        return <button
            onPointerDown={(e) => {
                e.preventDefault()
                props.clickAction(data)
            }}
            className="button-hitbox"

        >
            <div className={className} style={animation}>
                <img
                    draggable="false"
                    alt={data.noteNames.mobile}
                    src={svgUrl}>

                </img>
                <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                    {noteText}
                </div>
            </div>
        </button>
    }
}



export default Note