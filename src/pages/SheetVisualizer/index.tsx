import './SheetVisualizer.css'

import { useState } from 'react'
import { APP_NAME } from 'appConfig'
import { getNoteText, parseSong } from 'lib/Tools'
import Switch from 'components/Switch'
import Analytics from 'lib/Analytics'
import { RecordedSong } from 'lib/Songs/RecordedSong'
import { RecordedNote } from 'lib/Songs/SongClasses'
import { AppButton } from 'components/AppButton'
import LoggerStore from 'stores/LoggerStore'
import { SerializedSong } from 'lib/Songs/Song'
import { SheetVisualiserMenu } from 'components/SheetVisualizer/Menu'
import { SheetFrame } from 'components/SheetVisualizer/SheetFrame'
import { Chunk } from 'lib/Songs/VisualSong'

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}


export default function SheetVisualizer() {

    const [sheet, setSheet] = useState<Chunk[]>([])
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState<SerializedSong | null>(null)
    const [hasText, setHasText] = useState(false)
    const [songAsText, setSongAstext] = useState('')

    function setFrames(amount: number) {
        const newAmount = framesPerRow + amount
        const frame = document.querySelector('.frame-outer')
        if (!frame || newAmount < 1) return
        const width = frame.getBoundingClientRect().width
        if (width < 50 && amount === 1) return
        setFramesPerRow(newAmount)
    }

    function getChunkNoteText(i: number) {
        const text = getNoteText(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', APP_NAME === "Genshin" ? 21 : 15)
        return APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
    }
    function loadSong(song: SerializedSong) {
        setCurrentSong(song)
        try {
            const temp = parseSong(song)
            const lostReference = temp instanceof RecordedSong ? temp : temp.toRecordedSong()
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
                    const text = chunk.notes.map(e => getChunkNoteText(e.index)).join('')
                    sheetText += APP_NAME === "Genshin" ? `[${text}] ` : `${text} `
                } else if (chunk.notes.length > 0) {
                    sheetText += `${getChunkNoteText(chunk.notes[0].index)} `
                }
            }
            setSongAstext(sheetText)
            setSheet(chunks)
        } catch (e) {
            console.error(e)
            LoggerStore.error('Error visualizing song')
        }

        Analytics.songEvent({ type: 'visualize' })
    }
    return <div className='default-page' style={{ overflowY: 'scroll' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <SheetVisualiserMenu
                onSongLoaded={(song) => loadSong(song)}
                currentSong={currentSong}
            />
            <div className='displayer-buttons-wrapper noprint'>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ marginRight: '0.5rem' }}>Note names</div>
                    <Switch checked={hasText} onChange={setHasText} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    Per row: {framesPerRow}
                    <button className='displayer-plus-minus'
                        onClick={() => setFrames(-1)}>
                        -
                    </button>
                    <button className='displayer-plus-minus'
                        onClick={() => setFrames(1)}>
                        +
                    </button>
                </div>
            </div>
            <h1 className='onprint'>
                {currentSong ? currentSong?.name : ''}
            </h1>
            <div style={{ width: '100%' }} className='noprint'>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2 className='text-ellipsis'>
                        {currentSong ? currentSong.name : 'No song selected'}
                    </h2>
                    <AppButton onClick={() => window.print()} style={{ minWidth: 'fit-content', marginLeft: "0.4rem" }}>
                        Print as PDF
                    </AppButton>
                </div>
                <div style={{ color: 'var(--background-text)' }}>
                    Select a song from the menu on the left.
                    Remember that you can learn a song with the interactive
                    practice tool in the Player
                </div>
            </div>
            <div
                className='displayer-frame-wrapper'
                style={{ gridTemplateColumns: `repeat(${framesPerRow},1fr)` }}
            >

                {sheet.map((frame, i) =>
                    <SheetFrame
                        key={i}
                        frame={frame}
                        rows={3}
                        hasText={hasText}
                    />
                )}
            </div>
            {songAsText.trim().length > 0 && <pre className='text-notation-wrapper'>
                {songAsText}
            </pre>}

        </div>
    </div>
}




