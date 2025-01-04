import {APP_NAME, NoteNameType} from "$config"
import {TempoChunk} from "$lib/Songs/VisualSong"
import {CSSProperties, memo, useMemo} from "react"
import {Theme} from "$stores/ThemeStore/ThemeProvider"
import {Instrument} from '$lib/audio/Instrument'
import s from "./SheetFrame.module.css"


interface SheetFrameProps {
    chunk: TempoChunk
    rows: number
    hasText: boolean
    keyboardLayout: NoteNameType
    multiColorRows: boolean
    theme: Theme
}

function getBackgroundColor(tempoChanger: number) {
    if (tempoChanger === 0) return 'transparent'
    return `var(--tempo-changer-${tempoChanger})`
}

function getBorderStyle(index: number, total: number): React.CSSProperties {
    if (index === 0) {
        return {
            borderTopLeftRadius: "0.5rem",
            borderBottomLeftRadius: "0.5rem",
        }
    } else if (index === total - 1) {
        return {
            borderTopRightRadius: "0.5rem",
            borderBottomRightRadius: "0.5rem",
        }
    }
    return {}
}

const baseInstrument = new Instrument()

export function _SheetFrame2({chunk, rows, hasText, theme, keyboardLayout, multiColorRows}: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const colors = useMemo(() => {
        const color = theme.layer('primary', 0.2).toString()
        if (multiColorRows) {
            const base = theme.get('accent')
            return {
                none: color,
                rows: [
                    base.hue(90).toString(),
                    base.toString(),
                    base.hue(-30).toString()
                ]
            }
        }
        return {
            none: color,
            rows: [
                'var(--accent)',
                'var(--accent)',
                'var(--accent)',
            ]
        }
    }, [theme, multiColorRows])

    return <>
        {chunk.columns.map((column, i) => {
            const notes = new Array(columnsPerRow * rows).fill(false)
            column.notes.forEach(note => {
                notes[note.note] = true
            })

            return <div
                key={i}
                className={s["frame-outer-background"]}
                style={{
                    background: ((chunk.columns.length - 1) === i) && (chunk.endingTempoChanger !== chunk.tempoChanger)
                        ? `linear-gradient(to right, ${getBackgroundColor(chunk.tempoChanger)} 50%, ${getBackgroundColor(chunk.endingTempoChanger)} 50%)`
                        : getBackgroundColor(chunk.tempoChanger),
                    ...getBorderStyle(i, chunk.columns.length)
                }}
            >
                <div
                    className={`${s['frame-outer']} ${column.notes.length === 0 ? s['visualizer-ball'] : ''}`}
                >
                    {/*
                    {(chunk.emptyAhead && i === chunk.columns.length - 1) &&
                        <div className={`${s['frame-empty-counter']}`}>
                            <span style={{fontSize: '0.6rem'}}>
                                <FaHourglass />
                            </span>
                             {chunk.emptyAhead}
                        </div>
                    }
                    */}
                    {column.notes.length === 0
                        ? <div></div>
                        : <div className={s['visualizer-frame']}
                               style={{
                                   gridTemplateColumns: `repeat(${columnsPerRow},1fr)`
                               } as CSSProperties}>
                            {notes.map((exists, j) => {
                                return <div
                                    className={exists ? s['frame-note-s'] : s['frame-note-ns']}
                                    key={j}
                                    style={{
                                        ...(!exists ? {backgroundColor: colors.none} : {}),
                                        '--selected-note-background': colors.rows[Math.floor(j / columnsPerRow)],
                                    } as CSSProperties}
                                >
                                    {(exists && hasText)
                                        ? baseInstrument.getNoteText(j, keyboardLayout, 'C')
                                        : null
                                    }
                                </div>
                            })}
                        </div>
                    }
                </div>
            </div>
        })
        }
    </>
}

export const SheetFrame2 = memo(_SheetFrame2, (p, n) => {
    return p.chunk === n.chunk && p.rows === n.rows && p.hasText === n.hasText && p.theme === n.theme && p.keyboardLayout === n.keyboardLayout && p.multiColorRows === n.multiColorRows
})