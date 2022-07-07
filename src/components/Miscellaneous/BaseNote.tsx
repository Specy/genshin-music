import { NOTES_CSS_CLASSES, APP_NAME, BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/Miscellaneous/GenshinNoteBorder'
import { observe } from "mobx"
import { useEffect, useState } from "react"
import { ThemeProvider } from "stores/ThemeStore"
import { NoteImage } from "types/Keyboard"
import SvgNotes from "../SvgNotes"


interface BaseNoteProps{
    data: {
        status: 'clicked' | string
    }, //TODO do this
    noteText: string,
    handleClick: (data:any) => void,
    noteImage: NoteImage
}
export default function BaseNote({ data, noteText = 'A', handleClick, noteImage }:BaseNoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data, () => {
            setTextColor(getTextColor())
        })
        return dispose
    }, [])
    const className = parseClass(data.status)
    return <button
        onPointerDown={(e) => {
            e.preventDefault()
            handleClick(data)
        }}
        className="button-hitbox-bigger"
    >
        <div
            className={className}
            style={{ borderColor: parseBorderColor(data.status) }}
        >
            <SvgNotes name={noteImage} />
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderColor(data.status)}
            />}
            <div className={NOTES_CSS_CLASSES.noteName} style={{ color: textColor }}>
                {noteText}
            </div>
        </div>
    </button>
}

function parseClass(status: string) {
    let className = NOTES_CSS_CLASSES.note
    switch (status) {
        case 'clicked': className += " click-event"; break;
        default: break;
    }
    return className
}

function parseBorderColor(status:string) {
    let fill = '#eae5ce'
    if (status === "clicked") fill = "transparent"
    else if (status === 'wrong') fill = "#d66969"
    else if (status === 'right') fill = "#358a55"

    return fill
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