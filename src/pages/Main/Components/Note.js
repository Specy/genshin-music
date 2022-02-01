import React, { memo } from 'react'
import { cssClasses, appName, instrumentsData } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
export default memo(function Note( { data, approachingNotes, outgoingAnimation, fadeTime, handleClick, noteImage, noteText }) {
    const { status, approachRate, instrument } = data
    const animation = {
        transition: `background-color ${fadeTime}ms  ${fadeTime === (appName === 'Genshin' ? 100 : 200) ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`
    }
    const className = parseClass(status)
    const effects = instrumentsData[instrument]?.effects || {}
    const clickColor = instrumentsData[instrument]?.clickColor

    return <button
        onPointerDown={(e) => {
            e.preventDefault()
            handleClick(data)
        }}
        className="button-hitbox-bigger"
    >
        {approachingNotes.map((note) => 
            <ApproachCircle
                key={note.id}
                index={data.index}
                approachRate={approachRate}
            />
        )}
        {outgoingAnimation.map(e => 
            <div
                key={e.key}
                className={cssClasses.noteAnimation}
            />
        )}
        <div
            className={className}
            style={{
                ...animation,
                ...(clickColor && status === 'clicked' ? { backgroundColor: clickColor } : {})
            }}
        >
            <img
                draggable="false"
                alt=''
                src={noteImage}
                style={effects}
            />
            {appName === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderFill(status)}
            />}
            <div className={cssClasses.noteName}>
                {noteText}
            </div>
        </div>
    </button>
},(p,n) => {
    return p.data.status === n.data.status && p.data.approachRate === n.data.approachRate && p.data.instrument === n.data.instrument
        && p.noteText === n.noteText && p.fadeTime === n.fadeTime && p.handleClick === n.handleClick && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.outgoingAnimation === n.outgoingAnimation && p.approachingNotes === n.approachingNotes
})

function getApproachCircleColor(index) {
    let numOfNotes = appName === "Sky" ? 5 : 7
    let row = Math.floor(index / numOfNotes)
    let colors = ["#3da399", "#ffb347", "#3da399"]
    return colors[row]
}

const ApproachCircle = memo(function ApproachCircle({approachRate, index}) {
    return <div
        className={cssClasses.approachCircle}
        style={{
            animation: `approach ${approachRate}ms linear`,
            borderColor: getApproachCircleColor(index),
        }}
    >
    </div>
},(prev,next)=>{
    return prev.approachRate === next.approachRate && prev.index === next.index
})

function parseBorderFill(status) {
    let fill = '#eae5ce'
    if (status === "clicked") fill = "transparent"
    else if (status === 'toClickNext' || status === 'toClickAndNext') fill = '#63aea7'
    return fill
}

function parseClass(status) {
    let className = cssClasses.note
    switch (status) {
        case 'clicked': className += " click-event"; break;
        case 'toClick': className += " note-red"; break;
        case 'toClickNext': className += " note-border-click"; break;
        case 'toClickAndNext': className += " note-red note-border-click"; break;
        case 'approach-wrong': className += " click-event approach-wrong"; break;
        case 'approach-correct': className += " click-event approach-correct"; break;
        default: break;
    }
    return className
}
