import { memo , useEffect, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA,BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import SvgNote from 'components/SvgNotes'
import { ThemeStore } from 'stores/ThemeStore'
import { observe } from 'mobx'
import { NoteImages } from 'types/Keyboard'

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

interface ComposerNoteProps{
    data: any
    layers: string
    instrument: string
    clickAction: (data: any) => void
    noteText: string
    noteImage: NoteImages

}
export default memo(function ComposerNote({ data, layers, instrument, clickAction, noteText, noteImage }: ComposerNoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTextColor(getTextColor())
        })
        return dispose
    },[])

    let className = NOTES_CSS_CLASSES.noteComposer
    if (layers[0] === "1") className += " layer-1"
    if (layers[1] === "1") className += " layer-2"
    if (layers[2] === "1") className += " layer-3"
    let layer3Class = "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"
    return <button onPointerDown={() => clickAction(data)} className="button-hitbox">
        <div className={className} >
            <SvgNote
                name={noteImage}
                //@ts-ignore
                color={INSTRUMENTS_DATA[instrument]?.fill}
            />
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                fill={ThemeStore.layer('note_background',0.13).desaturate(0.6).toString()}
                className='genshin-border'
            />}
            <div className={layer3Class}>
            </div>
            <div 
                className={APP_NAME === "Sky" ? "note-name-sky" : "note-name"}
                style={{color:textColor}}
            >
                {noteText}
            </div>
        </div>
    </button>
}, (p, n) => {
    return p.noteText === n.noteText && p.clickAction === n.clickAction && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.layers === n.layers && p.instrument === n.instrument
}) 

