import { memo , useEffect, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA,BASE_THEME_CONFIG } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'
import SvgNote from 'components/SvgNotes'
import { ThemeProvider } from 'stores/ThemeStore'
import { observe } from 'mobx'
import { NoteImage } from 'types/Keyboard'
import { NoteData } from 'lib/Instrument'
import { CombinedLayer, InstrumentName } from 'types/GeneralTypes'

function getTextColor(){
    const noteBg = ThemeProvider.get('note_background')
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
    data: NoteData
    layer: CombinedLayer
    instrument: InstrumentName
    clickAction: (data: NoteData) => void
    noteText: string
    noteImage: NoteImage
}
export default memo(function ComposerNote({ data, layer, instrument, clickAction, noteText, noteImage }: ComposerNoteProps) {
    const [textColor, setTextColor] = useState(getTextColor())
    useEffect(() => {
        const dispose = observe(ThemeProvider.state.data,() => {
            setTextColor(getTextColor())
        })
        return dispose
    },[])

    let className = NOTES_CSS_CLASSES.noteComposer
    if (layer[0] === "1") className += " layer-1"
    if (layer[1] === "1") className += " layer-2"
    if (layer[2] === "1") className += " layer-3"
    if (layer[3] === "1") className += " layer-4"

    const color = ThemeProvider.get('note_background').desaturate(0.6)
    const layer3Class = "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"
    return <button onPointerDown={() => clickAction(data)} className="button-hitbox">
        <div className={className} >
            <SvgNote
                name={noteImage}
                color={ThemeProvider.isDefault('accent') ? INSTRUMENTS_DATA[instrument]?.fill : undefined}
            />
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                fill={color.isDark() ? color.lighten(0.45).hex() : color.darken(0.18).hex()}
                className='genshin-border'
            />}
            <div className={layer3Class}>
            </div>
            <div className='layer-4-line'>
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
        && p.noteText === n.noteText && p.layer === n.layer && p.instrument === n.instrument
}) 

