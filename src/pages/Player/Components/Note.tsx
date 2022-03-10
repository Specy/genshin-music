import { memo, useEffect, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA, BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import SvgNote from 'components/SvgNotes'
import { observe } from 'mobx'
import { ThemeStore } from 'stores/ThemeStore'
import Color from 'color'
import type { NoteData } from 'lib/Instrument'
import type { InstrumentKeys, NoteStatus } from 'types/GeneralTypes'
import type { ApproachingNote } from 'lib/Utils/SongClasses'
import type { NoteImages } from 'types/Keyboard'

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

interface NoteProps{
    note: NoteData,
    data: {
        approachRate: number
        instrument: InstrumentKeys
        isAnimated: boolean
    }
    approachingNotes: ApproachingNote[]
    outgoingAnimation: {
        key: number
    }[]
    fadeTime: number
    noteImage: NoteImages
    noteText: string
    handleClick: (note: NoteData) => void
}
function Note({ note, approachingNotes, outgoingAnimation, fadeTime, handleClick, noteImage, noteText, data }: NoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])
    const { approachRate, instrument } = data
    const animation = {
        transition: `background-color ${fadeTime}ms  ${fadeTime === (APP_NAME === 'Genshin' ? 100 : 200) ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`
    }
    const className = parseClass(note.status)
    const clickColor = INSTRUMENTS_DATA[instrument]?.clickColor
    return <button
        onPointerDown={(e) => {
            e.preventDefault()
            handleClick(note)
        }}
        className="button-hitbox-bigger"
    >
        {approachingNotes.map((note) =>
            <ApproachCircle
                key={note.id}
                index={note.index}
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
                ...(clickColor && note.status === 'clicked' && ThemeStore.isDefault('accent')
                    ? { backgroundColor: clickColor } : {}
                )
            }}
        >
            <SvgNote
                name={noteImage}
                color={ThemeStore.isDefault('accent') ? INSTRUMENTS_DATA[instrument]?.fill : undefined}
            />

            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderFill(note.status)}
            />}
            <div className={NOTES_CSS_CLASSES.noteName} style={{ color: textColor }}>
                {noteText}
            </div>
        </div>
    </button>
}

const toMix = Color('#ffb347')

function getApproachCircleColor(index: number) {
    const numOfNotes = APP_NAME === "Sky" ? 5 : 7
    const row = Math.floor(index / numOfNotes)
    if(row === 1) return 'var(--accent)'
    if(row === 2) return ThemeStore.get('accent').mix(toMix).hex()
    if(row === 3) return "var(--accent)"
    return "var(--accent)"
}

interface ApproachCircleProps{
    approachRate: number
    index: number
}
const ApproachCircle = memo(function ApproachCircle({ approachRate, index }: ApproachCircleProps) {
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

function parseBorderFill(status: NoteStatus) {
    if (status === "clicked") return "transparent"
    else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7'
    return ThemeStore.layer('note_background',0.13).desaturate(0.6).hex()
}

function parseClass(status: NoteStatus) {
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

export default memo(Note, (p, n) => {
    return p.note.status === n.note.status && p.data.approachRate === n.data.approachRate && p.data.instrument === n.data.instrument
        && p.noteText === n.noteText && p.fadeTime === n.fadeTime && p.handleClick === n.handleClick && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.outgoingAnimation === n.outgoingAnimation && p.approachingNotes === n.approachingNotes
}) as typeof Note