import React, { Component } from 'react'
import { cssClasses, appName,instrumentsData} from "../../appConfig"

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
        let animation = { transition: `all ${props.fadeTime}s` }
        let effects = instrumentsData[props.instrument]?.effects || {}
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
                    src={props.noteImage}
                    style={effects}   
                >
                    
                </img>
                <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                    {props.noteText}
                </div>
            </div>
        </button>
    }
}



export default Note