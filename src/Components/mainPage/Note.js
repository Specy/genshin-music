import React, { Component } from 'react'
import { cssClasses, appName, instrumentsData } from "../../appConfig"

class Note extends Component {
    constructor(props) {
        super(props)
        this.state = {
        }
        this.previous = ''
    }
    render() {
        const { props } = this
        const { data, approachingNotes} = props
        const { status , approachRate, instrument, isAnimated} = data
        let animation = { transition: `background-color ${(props.fadeTime/1000).toFixed(2)}s, transform 0.15s` }
        let className = parseClass(status)
        let effects = instrumentsData[instrument]?.effects || {}
        let noteAnimation = status === 'clicked' &&  isAnimated? "note-animation" : "note-animation-hidden"
        return <button
            onPointerDown={(e) => {
                e.preventDefault()
                props.handleClick(data)
            }}
            className="button-hitbox-bigger"
        >
            {approachingNotes.map((note) => {
                return <ApproachCircle
                    key={note.id}
                    index={data.index}
                    approachRate={approachRate}
                />
            })}
            <div className={noteAnimation} />
            <div className={className} style={animation}>
                <img
                    draggable="false"
                    alt=''
                    src={props.noteImage}
                    style={effects}
                />

                <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                    {props.noteText}
                </div>
            </div>
        </button>
    }
}
function getApproachCircleColor(index){
    let numOfNotes = appName === "Sky" ? 5 : 7
    let row = Math.floor(index / numOfNotes)
    let colors = ["#3da399","#ffb347","#3da399"]
    return colors[row]
}
function ApproachCircle(props) {
    return <div
        className='approach-circle'
        style={{ 
            animation: `approach ${props.approachRate}ms linear`,
            borderColor:getApproachCircleColor(props.index)
        }}
    >
    </div>
}
function parseClass(status) {
    let className = cssClasses.note
    if (status === "clicked") className += " click-event"
    if (status === 'toClick') className += " note-red"
    if (status === 'toClickNext') className += " note-border-click"
    if (status === 'toClickAndNext') className += " note-red note-border-click"
    return className
}

export default Note