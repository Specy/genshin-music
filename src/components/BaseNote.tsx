import { cssClasses, appName, BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import { observe } from "mobx"
import { useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore"
import SvgNotes from "./SvgNotes"


interface BaseNoteProps{
    data: any, //TODO do this
    noteText: string,
    handleClick: (data:any) => void,
    noteImage: string
}
export default function BaseNote({ data, noteText = 'A', handleClick, noteImage }:BaseNoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data, () => {
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
            {appName === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
                fill={parseBorderColor(data.status)}
            />}
            <div className={cssClasses.noteName} style={{ color: textColor }}>
                {noteText}
            </div>
        </div>
    </button>
}

function parseClass(status: string) {
    let className = cssClasses.note
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
    const noteBg = ThemeStore.get('note_background')
    if (appName === 'Genshin') {
        if (noteBg.luminosity() > 0.65) {
            return BASE_THEME_CONFIG.text.note
        } else {
            return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    } else {
        return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
    }
}