import { APP_NAME, INSTRUMENT_NOTE_LAYOUT_KINDS, NoteNameType } from "$config"
import { Chunk } from "$lib/Songs/VisualSong"
import { memo, useEffect, useState } from "react"
import { Theme } from "$stores/ThemeStore/ThemeProvider"
import Instrument from "$lib/Instrument"



interface SheetFrameProps {
    chunk: Chunk
    rows: number
    hasText: boolean
    keyboardLayout: NoteNameType
    selected?: boolean
    theme: Theme
}

const baseInstrument = new Instrument()
export function _SheetFrame({ chunk, rows, hasText, selected, theme, keyboardLayout }: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const [color, setColor] = useState('var(--primary)')
    useEffect(() => {
        setColor(theme.layer('primary', 0.2).hex())
    },[theme])
    const notes = new Array(columnsPerRow * rows).fill(false)
    chunk.notes.forEach(note => {
        notes[note.index] = true
    })
    return <div
        className={`frame-outer ${chunk.notes.length === 0 ? 'displayer-ball' : ''}`}
        style={selected
            ? {
                borderColor: 'var(--accent)',
            }
            : {}
        }
    >
        {chunk.notes.length === 0
            ? <div></div>
            : <div className='displayer-frame' style={{ gridTemplateColumns: `repeat(${columnsPerRow},1fr)` }}>
                {notes.map((exists, i) => {
                    return <div
                        className={exists ? 'frame-note-s' : 'frame-note-ns'}
                        key={i}
                        style={!exists ? { backgroundColor: color } : {}}
                    >
                        {(exists && hasText)
                            ? baseInstrument.getNoteText(i,keyboardLayout, 'C' )
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