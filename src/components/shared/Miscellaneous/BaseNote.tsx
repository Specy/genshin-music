import {APP_NAME, BASE_THEME_CONFIG, NOTES_CSS_CLASSES} from "$config"
import GenshinNoteBorder from '$cmp/shared/Miscellaneous/GenshinNoteBorder'
import {observe} from "mobx"
import {useEffect, useState} from "react"
import {ThemeProvider} from "$stores/ThemeStore/ThemeProvider"
import SvgNotes, {NoteImage} from "$cmp/shared/SvgNotes"
import {preventDefault} from "$lib/Utilities";


type BaseNoteData = {
    status: 'clicked' | string
}

interface BaseNoteProps<T> {
    data: T & BaseNoteData
    clickClass?: string
    noteClass?: string
    noteRef?: React.RefObject<HTMLDivElement>
    noteText: string,
    handleClick: (data: T & BaseNoteData) => void,
    noteImage?: NoteImage
}

export default function BaseNote<T>({
                                        data,
                                        noteText = 'A',
                                        handleClick,
                                        noteImage,
                                        clickClass = '',
                                        noteClass = '',
                                        noteRef
                                    }: BaseNoteProps<T>) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])
    const className = parseClass(data.status, clickClass) + ` ${noteClass}`
    return <button
        onPointerDown={(e) => {
            preventDefault(e)
            handleClick(data)
        }}
        onContextMenu={preventDefault}
        className="button-hitbox-bigger"
    >
        <div
            ref={noteRef}
            className={className}
            style={{borderColor: parseBorderColor(data.status)}}
        >
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderColor(data.status)}
            />}
            {noteImage &&
                <SvgNotes
                    name={noteImage}
                    background={
                        data.status === 'clicked'
                            ? 'var(--accent)'
                            : 'var(--note-background)'
                    }
                />
            }
            <div className={NOTES_CSS_CLASSES.noteName} style={{color: textColor}}>
                {noteText}
            </div>
        </div>
    </button>
}

function parseClass(status: string, clickClass: string) {
    let className = NOTES_CSS_CLASSES.note
    switch (status) {
        case 'clicked':
            className += ` click-event ${clickClass}`;
            break;
        default:
            break;
    }
    return className
}

function parseBorderColor(status: string) {
    if (status === "clicked") return "transparent"
    if (status === 'wrong') return "#d66969"
    if (status === 'right') return "#358a55"
    return APP_NAME === "Genshin" ? '#eae5ce' : 'unset'
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
