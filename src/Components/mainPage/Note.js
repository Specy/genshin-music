import React, { Component } from 'react'
import { cssClasses, appName,instrumentsData} from "../../appConfig"

class Note extends Component {
    constructor(props) {
        super(props)
        this.state = {
        }
    }
    shouldComponentUpdate(next, prev) {
        let shouldUpdate = false
        if(next.status !== prev.status) shouldUpdate = true
        return shouldUpdate
    }
    render() {
        const { props } = this
        const { data, status} = props
        let animation = { transition: `background-color ${props.fadeTime}s, transform 0.1s` }
        let className = parseClass(status)
        let effects = instrumentsData[props.instrument]?.effects || {}
        return <button
            onPointerDown={(e) => {
                e.preventDefault()
                props.handleClick(data)
            }}
            className="button-hitbox"
        >
            <div className={className} style={animation}>
                <img
                    draggable="false"
                    alt='note'
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

function parseClass(status){
    let className = cssClasses.note
    if(status === "clicked") className += " click-event"
    if(status === 'toClick') className += " note-red"
    if(status === 'toClickNext') className += " note-border-click"
    if(status === 'toClickAndNext') className += " note-red note-border-click"
    return className
}

export default Note