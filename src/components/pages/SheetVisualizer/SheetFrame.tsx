import {APP_NAME, NoteNameType} from "$config"
import {Chunk} from "$lib/Songs/VisualSong"
import {CSSProperties, memo, useMemo} from "react"
import {Theme} from "$stores/ThemeStore/ThemeProvider"
import {Instrument} from '$lib/audio/Instrument'
import s from "./SheetFrame.module.css"
import {cn, cs} from "$lib/utils/Utilities";


interface SheetFrameProps {
    chunk: Chunk
    rows: number
    hasText: boolean
    keyboardLayout: NoteNameType
    selected?: boolean
    theme: Theme
}

const baseInstrument = new Instrument()

export function _SheetFrame({chunk, rows, hasText, selected, theme, keyboardLayout}: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const color = useMemo(() => {
        return theme.layer('primary', 0.2).toString()
    }, [theme])
    const notes = new Array(columnsPerRow * rows).fill(false)
    chunk.notes.forEach(note => {
        notes[note.index] = true
    })
    return <div
        className={cn(
            s['frame-outer-smaller'],
            [chunk.notes.length === 0, s['visualizer-ball']]
        )}
        style={cs([selected, {borderColor: 'var(--accent)'}])}
    >
        {chunk.notes.length === 0
            ? <div></div>
            : <div
                className={s['visualizer-frame']}
                style={{
                    gridTemplateColumns: `repeat(${columnsPerRow},1fr)`,
                    '--selected-note-background': 'var(--accent)'
                } as CSSProperties}>
                {notes.map((exists, i) => {
                    return <div
                        className={exists ? s['frame-note-s'] : s['frame-note-ns']}
                        key={i}
                        style={!exists ? {backgroundColor: color} : {}}
                    >
                        {(exists && hasText)
                            ? baseInstrument.getNoteText(i, keyboardLayout, 'C')
                            : null
                        }
                    </div>
                })}
            </div>
        }
    </div>
}

export const SheetFrame = memo(_SheetFrame, (p, n) => {
    return p.chunk === n.chunk && p.rows === n.rows && p.hasText === n.hasText && p.selected === n.selected && p.theme === n.theme
})