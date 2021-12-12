import React, { Component } from 'react'
import { cssClasses, appName, instrumentsData } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
class Note extends Component {
    constructor(props) {
        super(props)
        this.state = {
        }
    }
    render() {
        const { props } = this
        const { data, approachingNotes,outgoingAnimation, fadeTime} = props
        const { status , approachRate, instrument} = data
        let animation = { 
            transition: `background-color ${props.fadeTime}ms ${fadeTime === 100 ? 'ease' : 'linear'}, transform 0.15s` 
        }
        let className = parseClass(status)
        let effects = instrumentsData[instrument]?.effects || {}
        let clickColor = instrumentsData[instrument]?.clickColor 
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
            {outgoingAnimation.map(e => {
                return <div 
                    key={e.key}
                    className={cssClasses.noteAnimation}
                />
            })}
            <div 
                className={className} 
                style={{
                    ...animation,
                    ...(clickColor && status === 'clicked' ? {backgroundColor: clickColor} : {})
                }}
            >
                <img
                    draggable="false"
                    alt=''
                    src={props.noteImage}
                    style={effects}
                />
                {appName === 'Genshin' && <GenshinNoteBorder
                    className='genshin-border'
                    fill={parseBorderFill(status)}
                />}
                <div className={cssClasses.noteName}>
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
        className={cssClasses.approachCircle}
        style={{ 
            animation: `approach ${props.approachRate}ms linear`,
            borderColor:getApproachCircleColor(props.index),
        }}
    >
    </div>
}
function parseBorderFill(status){
    let fill = '#eae5ce'
    if(status === "clicked") fill = "transparent"
    else if(status === 'toClickNext' || status === 'toClickAndNext') fill = '#63aea7'
    return fill
}
function parseClass(status) {
    let className = cssClasses.note
    switch(status){
    	case 'clicked': className += " click-event"; break;
        case  'toClick': className += " note-red"; break;
        case  'toClickNext': className += " note-border-click"; break;
        case  'toClickAndNext': className += " note-red note-border-click"; break;
        case 'approach-wrong': className += " click-event approach-wrong"; break;
        case 'approach-correct': className += " click-event approach-correct"; break;
        default: break;
    }
    return className
}
export default Note