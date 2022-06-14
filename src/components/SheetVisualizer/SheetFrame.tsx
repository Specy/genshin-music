import { APP_NAME } from "appConfig"
import { Chunk } from "lib/Songs/VisualSong"
import { getNoteText } from "lib/Tools"
import { ThemeProvider } from "stores/ThemeStore"



interface SheetFrameProps {
    frame: Chunk
    rows: number
    hasText: boolean
}



export function SheetFrame({ frame, rows, hasText }: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const notes = new Array(columnsPerRow * rows).fill(0)
    frame.notes.forEach(note => {
        notes[note.index] = 1
    })
    return frame.notes.length === 0
        ? <div className='frame-outer displayer-ball'>
            <div></div>
        </div>
        : <div className='frame-outer'>
            <div className='displayer-frame' style={{ gridTemplateColumns: `repeat(${columnsPerRow},1fr)` }}>
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
        </div>
}