import { memo, useEffect, useState } from 'react'
import { NOTES_CSS_CLASSES, APP_NAME, INSTRUMENTS_DATA, BASE_THEME_CONFIG } from "$config"
import GenshinNoteBorder from '$cmp/Miscellaneous/GenshinNoteBorder'
import SvgNote, { NoteImage } from '$cmp/SvgNotes'
import { ThemeProvider } from '$stores/ThemeStore/ThemeProvider'
import { observe } from 'mobx'
import { ObservableNote } from '$lib/Instrument'
import { InstrumentName } from '$types/GeneralTypes'
import { LayerStatus } from '$lib/Layer'

export type ComposedNoteStatus = 0 | 1 | 2 | 3
interface ComposerNoteProps {
    data: ObservableNote
    layer: LayerStatus
    instrument: InstrumentName
    clickAction: (data: ObservableNote) => void
    noteText: string
    noteImage: NoteImage
}
/*
    if ((layer & 1) !== 0) className += " layer-1"
    if ((layer & 2) !== 0) className += " layer-2"
    if ((layer & 4) !== 0) className += " layer-3"
    if ((layer & 8) !== 0) className += " layer-4"
*/
//precomputed class names
const classNameMap = new Map<LayerStatus, string>(
    new Array(16)
        .fill(0)
        .map((_, i) => {
            const layers = i.toString(2).split('').map(x => parseInt(x)).reverse()
            const className = `${NOTES_CSS_CLASSES.noteComposer} ${layers.map((x, i) => x === 1 ? `layer-${i + 1}` : '').join(' ')}`
            return [i as LayerStatus, className]
        })
)
export default memo(function ComposerNote({ data, layer, instrument, clickAction, noteText, noteImage }: ComposerNoteProps) {


    let className = classNameMap.get(layer) ?? NOTES_CSS_CLASSES.noteComposer
    const color = ThemeProvider.get('note_background').desaturate(0.6)
    return <button onPointerDown={() => clickAction(data)} className="button-hitbox">
        <div className={className} >
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                fill={color.isDark() ? color.lighten(0.45).hex() : color.darken(0.18).hex()}
                className='genshin-border'
            />}
            <SvgNote
                name={noteImage}
                color={ThemeProvider.isDefault('accent') ? INSTRUMENTS_DATA[instrument]?.fill : undefined}
                background={'var(--note-background)'}
            />
            <div className="layer-3-ball-bigger">
            </div>
            <div className='layer-4-line'>
            </div>
            <div
                className={APP_NAME === "Sky" ? "note-name-sky" : "note-name"}
            >
                {noteText}
            </div>
        </div>
    </button>
}, (p, n) => {
    return p.noteText === n.noteText && p.clickAction === n.clickAction && p.noteImage === n.noteImage
        && p.noteText === n.noteText && p.layer === n.layer && p.instrument === n.instrument
})

