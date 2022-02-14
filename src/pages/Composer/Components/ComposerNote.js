import { memo , useEffect, useState } from 'react'
import { cssClasses, appName, instrumentsData,BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import SvgNote from 'components/SvgNotes'
import { ThemeStore } from 'stores/ThemeStore'
import { observe } from 'mobx'

function getTextColor(){
    const noteBg = ThemeStore.get('note_background')
    if(appName === 'Genshin'){
        if(noteBg.luminosity() > 0.65){
            return BASE_THEME_CONFIG.text.note
        }else{
            return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    }else{
        return noteBg.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
    }
}

export default memo(function ComposerNote({ data, layers, instrument, clickAction, noteText, noteImage }) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeStore.state.data,() => {
            setTextColor(getTextColor())
        })
        return dispose
    },[])

    let className = cssClasses.noteComposer
    if (layers[0] === "1") className += " layer-1"
    if (layers[1] === "1") className += " layer-2"
    if (layers[2] === "1") className += " layer-3"
    let layer3Class = "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"
    return <button onPointerDown={() => clickAction(data)} className="button-hitbox">
        <div className={className} >
            <SvgNote
                name={noteImage}
                color={instrumentsData[instrument]?.fill}
            />
            {appName === 'Genshin' && <GenshinNoteBorder
                fill={ThemeStore.layer('note_background',0.13).desaturate(0.6)}
                className='genshin-border'
            />}
            <div className={layer3Class}>
            </div>
            <div 
                className={appName === "Sky" ? "note-name-sky" : "note-name"}
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

