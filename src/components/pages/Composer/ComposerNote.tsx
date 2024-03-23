import {memo, useEffect, useState} from 'react'
import {APP_NAME, INSTRUMENTS_DATA, NOTES_CSS_CLASSES} from "$config"
import GenshinNoteBorder from '$cmp/shared/Miscellaneous/GenshinNoteBorder'
import SvgNote, {NoteImage} from '$cmp/shared/SvgNotes'
import {Theme, ThemeProvider} from '$stores/ThemeStore/ThemeProvider'
import {ObservableNote} from '$lib/Instrument'
import {InstrumentName} from '$types/GeneralTypes'
import {LayerStatus} from '$lib/Layer'
import {preventDefault} from "$lib/Utilities";

export type ComposedNoteStatus = 0 | 1 | 2 | 3

interface ComposerNoteProps {
    data: ObservableNote
    layer: LayerStatus
    instrument: InstrumentName
    clickAction: (data: ObservableNote) => void
    noteText: string
    noteImage: NoteImage
    theme: Theme
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
const baseTheme = {
    note_background: ThemeProvider.get('note_background').desaturate(0.6).toString(),
    isAccentDefault: ThemeProvider.isDefault('accent'),
} as const


export default memo(function ComposerNote({
                                              data,
                                              layer,
                                              instrument,
                                              clickAction,
                                              noteText,
                                              noteImage,
                                              theme
                                          }: ComposerNoteProps) {
    const [colors, setColors] = useState(baseTheme)
    useEffect(() => {
        const color = ThemeProvider.get('note_background').desaturate(0.6)
        setColors({
            note_background: color.isDark() ? color.lighten(0.45).toString() : color.darken(0.18).toString(),
            isAccentDefault: ThemeProvider.isDefault('accent'),
        })
    }, [theme])

    let className = classNameMap.get(layer) ?? NOTES_CSS_CLASSES.noteComposer
    return <button
        onPointerDown={(e) => {
            preventDefault(e)
            clickAction(data)
        }}
        className="button-hitbox"
        onContextMenu={preventDefault}
    >
        <div className={className}>
            {APP_NAME === 'Genshin' && <GenshinNoteBorder
                fill={colors.note_background}
                className='genshin-border'
            />}
            <SvgNote
                name={noteImage}
                color={colors.isAccentDefault ? INSTRUMENTS_DATA[instrument]?.fill : undefined}
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

