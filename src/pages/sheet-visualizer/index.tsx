
import { useState, useCallback, useEffect, useRef } from 'react'
import { APP_NAME, NOTE_NAME_TYPES, NoteNameType } from '$config'
import { isComposedOrRecorded } from '$lib/Utilities'
import Switch from '$cmp/Inputs/Switch'
import Analytics from '$lib/Stats'
import { AppButton } from '$cmp/Inputs/AppButton'
import { logger } from '$stores/LoggerStore'
import { SerializedSong } from '$lib/Songs/Song'
import { SheetVisualiserMenu } from '$cmp/SheetVisualizer/Menu'
import { Title } from '$cmp/Miscellaneous/Title'
import { DefaultPage } from '$cmp/Layout/DefaultPage'
import { songService } from '$lib/Services/SongService'
import { useTheme } from '$lib/Hooks/useTheme'
import { Select } from '$cmp/Inputs/Select'
import s from "./SheetVisualizer.module.css"
import { SheetFrame2 } from '$cmp/SheetVisualizer/SheetFrame2'
import { VisualSong } from '$lib/Songs/VisualSong'
import { ComposedSong } from '$lib/Songs/ComposedSong'
import { RecordedSong } from '$lib/Songs/RecordedSong'

/*

            const lostReference = temp instanceof RecordedSong ? temp : (temp as ComposedSong).toRecordedSong()
            const notes = lostReference.notes
            const chunks: Chunk[] = []
            let previousChunkDelay = 0
            let sheetText = ''
            for (let i = 0; notes.length > 0; i++) {
                const chunk = new Chunk([notes.shift() as RecordedNote])
                const startTime = chunk.notes.length > 0 ? chunk.notes[0].time : 0
                for (let j = 0; j < notes.length && j < 20; j++) {
                    const difference = notes[j].time - chunk.notes[0].time - THRESHOLDS.joined //TODO add threshold here
                    if (difference < 0) {
                        chunk.notes.push(notes.shift() as RecordedNote)
                        j--
                    }
                }
                chunk.delay = previousChunkDelay
                previousChunkDelay = notes.length > 0 ? notes[0].time - startTime : 0
                const emptyChunks = Math.floor(chunk.delay / THRESHOLDS.pause)
                chunks.push(...new Array(emptyChunks).fill(0).map(() => new Chunk()))
                chunks.push(chunk)
                sheetText += emptyChunks > 2 ? ' \n\n' : "- ".repeat(emptyChunks)
                if (chunk.notes.length > 1) {
                    const text = chunk.notes.map(e => getChunkNoteText(e.index, layout)).join('')
                    sheetText += APP_NAME === "Genshin" ? `[${text}] ` : `${text} `
                } else if (chunk.notes.length > 0) {
                    sheetText += `${getChunkNoteText(chunk.notes[0].index, layout)} `
                }
            }
            setSongAstext(sheetText)
            setSheet(chunks)
*/



export default function SheetVisualizer() {
    const [theme] = useTheme()
    const [sheet, setSheet] = useState<VisualSong | null>(null)
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState<SerializedSong | null>(null)
    const [hasText, setHasText] = useState(false)
    const [songAsText, setSongAstext] = useState('')
    const [keyboardLayout, setKeyboardLayout] = useState<NoteNameType>(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC')
    const ref = useRef<HTMLDivElement>(null)

    function setFrames(amount: number) {
        if (!ref.current) return
        const newAmount = framesPerRow + amount
        const frame = ref.current.children[0]?.children[0] as HTMLDivElement | undefined
        if (!frame || newAmount < 1) return
        const width = frame.getBoundingClientRect().width
        if (width < 50 && amount === 1) return
        setFramesPerRow(newAmount)
    }
    const loadSong = useCallback((song: SerializedSong, layout: NoteNameType) => {
        try {
            const temp = songService.parseSong(song)
            const isValid = isComposedOrRecorded(temp)
            if (!isValid) return logger.error('Invalid song, it is not composed or recorded')
            try {
                const vs = VisualSong.from(temp)
                setSheet(vs)
                setSongAstext(vs.toText(layout))
            } catch (e) {
                console.error(e)
                logger.error("Error converting song to visual song, trying to convert to recorded song first...")
                try {
                    const vs = VisualSong.from((temp as RecordedSong | ComposedSong).toRecordedSong())
                    setSheet(vs)
                    setSongAstext(vs.toText(layout))
                } catch (e) {
                    console.error(e)
                    logger.error("Error converting song to visual song")
                    setSheet(null)
                    setSongAstext("")
                }
            }

        } catch (e) {
            console.error(e)
            logger.error('Error visualizing song')
        }
        Analytics.songEvent({ type: 'visualize' })
    }, [])
    useEffect(() => {
        if (currentSong) loadSong(currentSong, keyboardLayout)
    }, [currentSong, hasText, keyboardLayout, loadSong])
    return <DefaultPage
        excludeMenu={true}
        className={s['page-no-print']}
        menu={
            <SheetVisualiserMenu
                onSongLoaded={setCurrentSong}
                currentSong={currentSong}
            />
        }
    >
        <Title text="Sheet Visualizer" description='Learn a sheet in a visual way, convert the song into text format or print it as pdf' />
        <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <div className={`${s['visualizer-buttons-wrapper']} noprint`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div>Note names</div>
                    <Switch checked={hasText} onChange={setHasText} />
                    {hasText &&
                        <Select
                            value={keyboardLayout}
                            onChange={e => setKeyboardLayout(e.target.value as NoteNameType)}
                        >
                            {NOTE_NAME_TYPES.map(t => <option value={t} key={t}>{t}</option>)}
                        </Select>
                    }
                </div>

                <div style={{ display: 'flex', alignItems: 'center' }}>
                    Per row: {framesPerRow}
                    <button className={s['visualizer-plus-minus']}
                        onClick={() => setFrames(-1)}>
                        -
                    </button>
                    <button className={s['visualizer-plus-minus']}
                        onClick={() => setFrames(1)}>
                        +
                    </button>
                </div>
            </div>
            <h1 className='onprint' style={{ color: "black" }}>
                Sky Music Nightly
            </h1>
            <h1 className='onprint' style={{ color: "black" }}>
                {currentSong ? currentSong?.name : ''}
            </h1>
            <div style={{ width: '100%' }} className='noprint'>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className='text-ellipsis'>
                        {currentSong ? currentSong.name : 'No song selected'}
                    </h2>
                    {currentSong &&
                        <AppButton onClick={() => window.print()} style={{ minWidth: 'fit-content', marginLeft: "0.4rem" }}>
                            Print as PDF
                        </AppButton>
                    }

                </div>
                <div style={{ color: 'var(--background-text)' }}>
                    Select a song from the menu on the left.
                    Remember that you can learn a song with the interactive
                    practice tool in the Player
                </div>
            </div>
            <div
                className={s['visualizer-frame-wrapper']}
                style={{ gridTemplateColumns: `repeat(${framesPerRow},1fr)` }}
                ref={ref}
            >
                {sheet && sheet.chunks.map((chunk, i) =>
                    <SheetFrame2
                        key={i}
                        chunk={chunk}
                        rows={3}
                        theme={theme}
                        hasText={hasText}
                        keyboardLayout={keyboardLayout}
                    />
                )}
            </div>
            {songAsText.trim().length > 0 &&
                <pre className={s['text-notation-wrapper']}>
                    {songAsText}
                </pre>
            }
        </div>
    </DefaultPage>
}





