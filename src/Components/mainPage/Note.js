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
        const { data, approachingNotes,outgoingAnimation} = props
        const { status , approachRate, instrument} = data
        let animation = { transition: `background-color ${(props.fadeTime/1000).toFixed(2)}s, transform 0.15s` }
        let className = parseClass(status)
        let effects = instrumentsData[instrument]?.effects || {}
        let squaredCircle = appName === 'Sky' ? {borderRadius: '2vw'} : {}
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
                    style={squaredCircle}
                    approachRate={approachRate}
                />
            })}
            {outgoingAnimation.map(e => {
                return <div 
                    key={e.key}
                    className='note-animation' 
                    style={squaredCircle}
                />
            })}
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
            borderColor:getApproachCircleColor(props.index),
            ...(props.style || {})
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
    if (status === 'approach-wrong') className += ' click-event approach-wrong'
    if (status === 'approach-correct') className += ' click-event approach-correct'
    return className
}

export default Note