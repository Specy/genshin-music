import { APP_NAME } from "appConfig"
import { Chunk } from "lib/Songs/VisualSong"
import { getNoteText } from "lib/Utilities"
import { memo } from "react"
import { ThemeProvider } from "stores/ThemeStore"



interface SheetFrameProps {
    chunk: Chunk
    rows: number
    hasText: boolean
    selected?: boolean
}



export function _SheetFrame({ chunk, rows, hasText, selected }: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const notes = new Array(columnsPerRow * rows).fill(0)
    chunk.notes.forEach(note => {
        notes[note.index] = 1
    })
    return <div
        className={`frame-outer ${chunk.notes.length === 0 ? 'displayer-ball' : ''}`}
        style={selected
            ? {
                borderColor: 'var(--accent)',
            }
            : { }
        }
    >
        {chunk.notes.length === 0

            ? <div></div>
            : <div className='displayer-frame' style={{ gridTemplateColumns: `repeat(${columnsPerRow},1fr)` }}>
                {notes.map((exists, i) => {
                    return <div
                        className={exists ? 'frame-note-s' : 'frame-note-ns'}
                        key={i}
                        style={!exists ? { backgroundColor: ThemeProvider.layer('primary', 0.2).toString() } : {}}
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
    return p.chunk === n.chunk && p.rows === n.rows && p.hasText === n.hasText && p.selected === n.selected
})