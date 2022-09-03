import { APP_NAME, BASE_THEME_CONFIG, INSTRUMENTS_DATA, NOTES_CSS_CLASSES } from "$/appConfig"
import { useObservableObject } from "$/lib/Hooks/useObservable"
import Instrument, { NoteData } from "$/lib/Instrument"
import SvgNote, { NoteImage } from "../SvgNotes"
import { useCallback, useRef, useEffect, useState } from "react"
import { ThemeProvider } from "$/stores/ThemeStore/ThemeProvider"
import { observe } from "mobx"
import GenshinNoteBorder from '$cmp/Miscellaneous/GenshinNoteBorder'
import { InstrumentName, NoteStatus } from "$/types/GeneralTypes"
interface ZenKeyboardProps {
    note: NoteData
    noteText: string
    noteImage: NoteImage
    instrumentName: InstrumentName
    onClick: (note: NoteData) => void
}
const skyKeyframes = [
    {
        transform: `rotateY(0deg) scale(0.8)`
    },
    {
        transform: `rotateY(180deg) scale(0.8)`
    },
    {
        transform: `rotateY(360deg) scale(1)`
    }
]
export function ZenNote({ note, onClick, noteImage, noteText, instrumentName }: ZenKeyboardProps) {
    const state = useObservableObject(note.data)
    const [status, setStatus] = useState<NoteStatus>("")
    const [statusId, setStatusId] = useState(0)
    const ref = useRef<HTMLDivElement>(null)
    const handleClick = useCallback((e: any) => {
        e.preventDefault()
        onClick(note)
    }, [onClick, note])
    useEffect(() => {
    }, [note.data])
    useEffect(() => {
        setStatus(state.status)
        setStatusId((v) => v + 1)
    }, [state.status])
    useEffect(() => {
        if (APP_NAME === 'Genshin') {
            setStatus("clicked")
            setStatusId((v) => v + 1)
            state.status = 'clicked'
            setTimeout(() => setStatus(""), 100)
        } else {
            const current = ref.current
            if (!current) return
            current.animate(skyKeyframes, { duration: 400 })
        }
    }, [state.animationId, ref, state])

    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])
    const className = parseClass(status) + (APP_NAME === 'Genshin' ? '' : ' sky-zen-note')
    const clickColor = INSTRUMENTS_DATA[instrumentName]?.clickColor
    return <button
        onPointerDown={handleClick}
        className="button-hitbox-bigger"
    >
        {APP_NAME === 'Genshin' &&
            <div
                key={statusId}
                style={clickColor && ThemeProvider.isDefault('accent')
                    ? { borderColor: clickColor } : {}
                }
                className={NOTES_CSS_CLASSES.noteAnimation}
            />
        }
        <div
            ref={ref}
            className={className}
        >
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderFill(status)}
            />}
            {noteImage &&
                <SvgNote
                    name={note.noteImage}
                    color={ThemeProvider.isDefault('accent') ? INSTRUMENTS_DATA[instrumentName]?.fill : undefined}
                    background={status === 'clicked'
                        ? (clickColor && ThemeProvider.isDefault('accent')) ? clickColor : 'var(--accent)'
                        : 'var(--note-background)'}
                />
            }

            <div className={NOTES_CSS_CLASSES.noteName} style={{ color: textColor }}>
                {noteText}
            </div>

        </div>
    </button>
}

function parseClass(status: string) {
    let className = NOTES_CSS_CLASSES.note
    switch (status) {
        case 'clicked': className += ` click-event`; break;
        default: break;
    }
    return className
}

function parseBorderColor(status: string) {
    let fill = APP_NAME === "Genshin" ? '#eae5ce' : ''
    if (status === "clicked") fill = "transparent"
    else if (status === 'wrong') fill = "#d66969"
    else if (status === 'right') fill = "#358a55"

    return fill
}
function parseBorderFill(status: NoteStatus) {
    if (status === "clicked") return "transparent"
    else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7'
    const color = ThemeProvider.get('note_background').desaturate(0.6)
    return color.isDark() ? color.lighten(0.45).hex() : color.darken(0.18).hex()
}
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