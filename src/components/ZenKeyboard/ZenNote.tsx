import { APP_NAME, BASE_THEME_CONFIG, INSTRUMENTS_DATA, NOTES_CSS_CLASSES } from "$config"
import { subscribeObeservableObject } from "$lib/Hooks/useObservable"
import { ObservableNote } from "$lib/Instrument"
import SvgNote, { NoteImage } from "../SvgNotes"
import { useCallback, useRef, useEffect, useState } from "react"
import { ThemeProvider } from "$stores/ThemeStore/ThemeProvider"
import GenshinNoteBorder from '$cmp/Miscellaneous/GenshinNoteBorder'
import { InstrumentName, NoteStatus } from "$/types/GeneralTypes"
import s from "./ZenKeyboard.module.css"
import {preventDefault} from "$lib/Utilities";
interface ZenKeyboardProps {
    note: ObservableNote
    noteText: string
    noteImage: NoteImage
    instrumentName: InstrumentName
    keyPadding: number
    onClick: (note: ObservableNote) => void
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
export function ZenNote({ note, onClick, noteImage, noteText, instrumentName, keyPadding }: ZenKeyboardProps) {
    const [status, setStatus] = useState<NoteStatus>("")
    const [statusId, setStatusId] = useState(0)
    const [textColor, setTextColor] = useState(BASE_THEME_CONFIG.text.light)
    const ref = useRef<HTMLDivElement>(null)
    const handleClick = useCallback((e: any) => {
        preventDefault(e)
        onClick(note)
    }, [onClick, note])
    useEffect(() => {
        function onStatusChange(){
            if (APP_NAME === 'Genshin') {
                setStatus("clicked")
                setStatusId((v) => v + 1)
                setTimeout(() => setStatus(""), 100)
            } else {
                const current = ref.current
                if (!current) return
                current.animate(skyKeyframes, { duration: 400 })
            }
        }
        return subscribeObeservableObject(note.data, onStatusChange)
    }, [note, ref])
    useEffect(() => {
        return subscribeObeservableObject(ThemeProvider.state.data, () => {
            setTextColor(getTextColor())
        })
    }, [])
 
    const className = `${parseClass(status)} ${(APP_NAME === 'Genshin' ? '' : s['sky-zen-note'])}`
    const clickColor = INSTRUMENTS_DATA[instrumentName]?.clickColor
    return <button
        onPointerDown={handleClick}
        onContextMenu={preventDefault}
        className="button-hitbox-bigger"
        style={{padding: `${keyPadding}rem`}}
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
function parseBorderFill(status: NoteStatus) {
    if (status === "clicked") return "transparent"
    else if (status === 'toClickNext' || status === 'toClickAndNext') return '#63aea7'
    return 'var(--note-border-fill)'
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