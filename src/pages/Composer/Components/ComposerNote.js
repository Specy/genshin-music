import React, { memo } from 'react'
import { cssClasses, appName, instrumentsData } from "appConfig"
import GenshinNoteBorder from 'components/GenshinNoteBorder'

export default memo(function ComposerNote({ data, layers, instrument, clickAction, noteText, noteImage }) {
    let className = cssClasses.noteComposer
    if (layers[0] === "1") className += " layer-1"
    if (layers[1] === "1") className += " layer-2"
    if (layers[2] === "1") className += " layer-3"
    let layer3Class = "Sky" ? "layer-3-ball-bigger" : "layer-3-ball"
    let effects = instrumentsData[instrument]?.effects || {}
    return <button onPointerDown={() => clickAction(data)} className="button-hitbox">
        <div className={className} >
            <img
                draggable="false"
                alt={data.noteNames.mobile}
                src={noteImage}
                style={effects}
            >

            </img>
            {appName === 'Genshin' && <GenshinNoteBorder
                className='genshin-border'
            />}
            <div className={layer3Class}>
            </div>
            <div className={appName === "Sky" ? "note-name-sky" : "note-name"}>
                {noteText}
            </div>
        </div>
    </button>
}, (p, n) => {
    return p.noteText === n.noteText && p.clickAction === n.clickAction && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.layers === n.layers && p.instrument === n.instrument
})
