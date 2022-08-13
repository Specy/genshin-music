import { APP_NAME } from "appConfig"
import { Chunk } from "lib/Songs/VisualSong"
import { getNoteText } from "lib/Utilities"
import { memo, useEffect, useState } from "react"
import { ThemeStore } from "stores/ThemeStore"



interface SheetFrameProps {
    chunk: Chunk
    rows: number
    hasText: boolean
    selected?: boolean
    theme: ThemeStore
}



export function _SheetFrame({ chunk, rows, hasText, selected, theme }: SheetFrameProps) {
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
                            ? getNoteText(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', APP_NAME === 'Genshin' ? 21 : 15)
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