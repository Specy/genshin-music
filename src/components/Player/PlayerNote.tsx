import { memo, useEffect, useRef, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA, BASE_THEME_CONFIG } from "$config"
import GenshinNoteBorder from '$cmp/Miscellaneous/GenshinNoteBorder'
import SvgNote from '$cmp/SvgNotes'
import { observe } from 'mobx'
import { ThemeProvider } from '$stores/ThemeStore/ThemeProvider'
import type { ObservableNote } from '$lib/Instrument'
import type { InstrumentName, NoteStatus } from '$types/GeneralTypes'
import type { ApproachingNote } from '$lib/Songs/SongClasses'
import { useObservableObject } from '$lib/Hooks/useObservable'

function getTextColor() {
    const noteBg = ThemeProvider.get('note_background')
    if (APP_NAME === 'Genshin') {
        if (noteBg.luminosity() > 0.65) {
            return BASE_THEME_CONFIG.text.note
        } else {
            return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    } else {
        return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
    }
}

interface NoteProps {
    note: ObservableNote
    data: {
        approachRate: number
        instrument: InstrumentName
    }
    approachingNotes: ApproachingNote[]
    noteText: string
    handleClick: (note: ObservableNote) => void
}

//TODO use css vars for the colors
function Note({ note, approachingNotes, handleClick, noteText, data }: NoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])

    const state = useObservableObject(note.data)
    const { approachRate, instrument } = data
    const animation = {
        transition: `background-color ${state.delay}ms  ${state.delay === (APP_NAME === 'Genshin' ? 100 : 200) ? 'ease' : 'linear'} , transform 0.15s, border-color 100ms`
    }
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
        {state.animationId !== 0 &&
            <div
                key={state.animationId}
                style={clickColor && ThemeProvider.isDefault('accent')
                    ? { borderColor: clickColor} : {}
                }
                className={NOTES_CSS_CLASSES.noteAnimation}
            />
        }
        <div
            className={`${NOTES_CSS_CLASSES.note} ${parseClass(note.status)}`}
            style={{
                ...animation,
                ...(clickColor && state.status === 'clicked' && ThemeProvider.isDefault('accent')
                    ? { backgroundColor: clickColor } : {}
                )
            }}
        >
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderFill(state.status)}
            />}
            <SvgNote
                name={note.noteImage}
                color={ThemeProvider.isDefault('accent') ? INSTRUMENTS_DATA[instrument]?.fill : undefined}
                background={state.status === 'clicked' 
                ? (clickColor && ThemeProvider.isDefault('accent')) ? clickColor : 'var(--accent)'
                : 'var(--note-background)'}
            />

            <div className={NOTES_CSS_CLASSES.noteName} style={{ color: textColor }}>
                {noteText}
            </div>
        </div>
    </button>
}
export default memo(Note, (p, n) => {
    return p.note === n.note && p.data.approachRate === n.data.approachRate && p.data.instrument === n.data.instrument
        && p.handleClick === n.handleClick && p.noteText === n.noteText && p.approachingNotes === n.approachingNotes
}) as typeof Note

function getApproachCircleColor(index: number) {
    const numOfNotes = APP_NAME === "Sky" ? 5 : 7
    const row = Math.floor(index / numOfNotes)
    if (row === 0) return 'var(--accent)'
    if (row === 1) return ThemeProvider.get('accent').rotate(180).hex()
    if (row === 2) return "var(--accent)"
    return "var(--accent)"
}

interface ApproachCircleProps {
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
    return 'var(--note-border-fill)'
}

function parseClass(status: NoteStatus) {
    switch (status) {
        case 'clicked': return "click-event"
        case 'toClick': return "note-red"
        case 'toClickNext': return "note-border-click"
        case 'toClickAndNext': return "note-red note-border-click"
        case 'approach-wrong': return "click-event approach-wrong"
        case 'approach-correct': return "click-event approach-correct"
        default: return ''
    }
}

