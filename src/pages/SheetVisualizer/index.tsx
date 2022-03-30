import './SheetVisualizer.css'
import { useEffect, useState } from 'react'
import { SimpleMenu } from 'components/SimpleMenu'
import { DB } from 'Database'
import { APP_NAME } from 'appConfig'
import { getNoteText, parseSong } from 'lib/Utils/Tools'
import Switch from 'components/Switch'
import Analytics from 'lib/Analytics'
import { SongMenu } from 'components/SongMenu'
import { ThemeProvider } from 'stores/ThemeStore'
import { SerializedSongType } from 'types/SongTypes'
import { Song } from 'lib/Utils/Song'
import { RecordedNote } from 'lib/Utils/SongClasses'
import { AppButton } from 'components/AppButton'
import LoggerStore from 'stores/LoggerStore'

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}


export default function SheetVisualizer() {
    const [songs, setSongs] = useState<SerializedSongType[]>([])
    const [sheet, setSheet] = useState<Chunk[]>([])
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState<SerializedSongType | null>(null)
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

    useEffect(() => {
        async function load() {
            setSongs(await DB.getSongs())
        }
        load()
    }, [])

    function getChunkNoteText(i: number) {  
        const text = getNoteText(APP_NAME === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', APP_NAME === "Genshin" ? 21 : 15)
        return APP_NAME === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
    }
    function handleClick(song: SerializedSongType) {
        setCurrentSong(song)
        try{
            const temp = parseSong(song)
            const lostReference = temp instanceof Song ? temp : temp.toSong()
            const notes = lostReference.notes
            const chunks: Chunk[] = []
            let previousChunkDelay = 0
            let sheetText = ''
            for (let i = 0; notes.length > 0; i++) {
                const chunk = new Chunk([notes.shift() as RecordedNote])
                const startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
                for (let j = 0; j < notes.length && j < 20; j++) {
                    const difference = notes[j][1] - chunk.notes[0][1] - THRESHOLDS.joined //TODO add threshold here
                    if (difference < 0) {
                        chunk.notes.push(notes.shift() as RecordedNote)
                        j--
                    }
                }
                chunk.delay = previousChunkDelay
                previousChunkDelay = notes.length > 0 ? notes[0][1] - startTime : 0
                const emptyChunks = Math.floor(chunk.delay / THRESHOLDS.pause)
                chunks.push(...new Array(emptyChunks).fill(0).map(() => new Chunk()))
                chunks.push(chunk)
                sheetText += emptyChunks > 2 ? ' \n\n' : "- ".repeat(emptyChunks)
                if (chunk.notes.length > 1) {
                    const text = chunk.notes.map(e => getChunkNoteText(e[0])).join('')
                    sheetText += APP_NAME === "Genshin" ? `[${text}] ` : `${text} `
                } else if (chunk.notes.length > 0) {
                    sheetText += `${getChunkNoteText(chunk.notes[0][0])} `
                }
            }
            setSongAstext(sheetText)
            setSheet(chunks)
        }catch(e){
            console.error(e)
            LoggerStore.error('Error visualizing song')
        }

        Analytics.songEvent({type:'visualize'})
    }

    return <div className='default-page'>
        <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <SimpleMenu className='noprint' />
            <div>
                <SongMenu 
                    songs={songs}
                    className='displayer-songs-wrapper noprint'
                    style={{ marginTop: '0' }}
                    baseType='recorded'
                    SongComponent={SongRow}
                    componentProps={{
                        currentSong,
                        onClick: handleClick
                    }}
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
            </div>
            <h1 className='onprint'>
                {currentSong ? currentSong?.name : ''}
            </h1>
            <div style={{ width: '100%' }} className='noprint'>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>{currentSong ? currentSong.name : 'No song selected'}</h2>
                    <AppButton onClick={() => window.print()}>
                        Print as PDF
                    </AppButton>
                </div>
                <div style={{ color: 'var(--background-text)' }}>
                    Remember that you can learn a song with the interactive
                    practice tool in the main page
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

class Chunk {
    notes: RecordedNote[] = []
    delay = 0
    constructor(notes:RecordedNote[]  = [], delay:number = 0) {
        this.notes = notes
        this.delay = delay
    }
}

interface SheetFrameProps{
    frame: Chunk
    rows: number
    hasText: boolean
}
function SheetFrame({ frame, rows, hasText }: SheetFrameProps) {
    const columnsPerRow = APP_NAME === 'Genshin' ? 7 : 5
    const notes = new Array(columnsPerRow * rows).fill(0)
    frame.notes.forEach(note => {
        notes[note[0]] = 1
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
                            style={!exists ? {backgroundColor: ThemeProvider.layer('primary',0.2).toString()} : {}}
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

interface SongRowProps{
    data: SerializedSongType
    current: SerializedSongType | null
    onClick: (song: SerializedSongType) => void
}
function SongRow({ data, current, onClick }: SongRowProps ) {
    const selectedStyle = current === data ? { backgroundColor: 'rgb(124, 116, 106)' } : {}
    return <div
        className="song-row"
        style={selectedStyle}
        onClick={() => onClick(data)}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}