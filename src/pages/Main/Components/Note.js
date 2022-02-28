import React, { memo, useEffect, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA, BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import SvgNote from 'components/SvgNotes'
import { observe } from 'mobx'
import { ThemeStore } from 'stores/ThemeStore'
import Color from 'color'

function getTextColor(){
    const noteBg = ThemeStore.get('note_background')
    if(APP_NAME === 'Genshin'){
        if(noteBg.luminosity() > 0.65){
            return BASE_THEME_CONFIG.text.note
        }else{
            return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    }else{
        return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
    }
}

export default memo(function Note({ data, approachingNotes, outgoingAnimation, fadeTime, handleClick, noteImage, noteText }) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])
    const { status, approachRate, instrument } = data
    const animation = {
        transition: `background-color ${fadeTime}ms  ${fadeTime === (APP_NAME === 'Genshin' ? 100 : 200) ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`
    }
    const className = parseClass(status)
    const clickColor = INSTRUMENTS_DATA[instrument]?.clickColor
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
                className={NOTES_CSS_CLASSES.noteAnimation}
            />
        )}
        <div
            className={className}
            style={{
                ...animation,
                ...(clickColor && status === 'clicked' ? { backgroundColor: clickColor } : {})
            }}
        >
            <SvgNote
                name={noteImage}
                color={INSTRUMENTS_DATA[instrument]?.fill}
            />

            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderFill(status)}
            />}
            <div className={NOTES_CSS_CLASSES.noteName} style={{ color: textColor }}>
                {noteText}
            </div>
        </div>
    </button>
}, (p, n) => {
    return p.data.status === n.data.status && p.data.approachRate === n.data.approachRate && p.data.instrument === n.data.instrument
        && p.noteText === n.noteText && p.fadeTime === n.fadeTime && p.handleClick === n.handleClick && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.outgoingAnimation === n.outgoingAnimation && p.approachingNotes === n.approachingNotes
})

const toMix = Color('#ffb347')

function getApproachCircleColor(index) {
    const numOfNotes = APP_NAME === "Sky" ? 5 : 7
    const row = Math.floor(index / numOfNotes)
    const colors = [
        "var(--accent)", 
        ThemeStore.get('accent').mix(toMix),
        "var(--accent)"
    ]
    return colors[row]
}

const ApproachCircle = memo(function ApproachCircle({ approachRate, index }) {
    return <div
        className={NOTES_CSS_CLASSES.approachCircle}
        style={{
            animation: `approach ${approachRate}ms linear`,
            borderColor: getApproachCircleColor(index),
        }}
    >
    </div>
}, (prev, next) => {
    return prev.approachRate === next.approachRate && prev.index === next.index
})

function parseBorderFill(status) {
    let fill = ThemeStore.layer('note_background',0.13).desaturate(0.6)
    if (status === "clicked") fill = "transparent"
    else if (status === 'toClickNext' || status === 'toClickAndNext') fill = '#63aea7'
    return fill
}

function parseClass(status) {
    let className = NOTES_CSS_CLASSES.note
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
