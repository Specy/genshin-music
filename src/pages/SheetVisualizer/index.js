import './SheetVisualizer.css'
import { useEffect, useState } from 'react'
import { SimpleMenu } from 'components/SimpleMenu'
import { DB } from 'Database'
import { appName } from 'appConfig'
import { ComposerToRecording, getNoteText } from 'lib/Utils'
import Switch from 'components/Switch'
import Analytics from 'lib/Analytics'
import { SongMenu } from 'components/SongMenu'
import { ThemeStore } from 'stores/ThemeStore'

const THRESHOLDS = {
    joined: 50,
    pause: 400,
}


export default function SheetVisualizer(props) {
    const [songs, setSongs] = useState([])
    const [sheet, setSheet] = useState([])
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState({})
    const [hasText, setHasText] = useState(false)
    const [songAsText, setSongAstext] = useState('')
    function setFrames(amount) {
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

    function getChunkNoteText(i) {  
        const text = getNoteText(appName === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', appName === "Genshin" ? 21 : 15)
        return appName === 'Genshin' ? text.toLowerCase() : text.toUpperCase()
    }
    function handleClick(song) {
        setCurrentSong(song)
        let lostReference = JSON.parse(JSON.stringify(song))
        if (lostReference.data?.isComposedVersion) {
            lostReference = ComposerToRecording(lostReference)
        }
        const notes = lostReference.notes
        const chunks = []
        let previousChunkDelay = 0
        let sheetText = ''
        for (let i = 0; notes.length > 0; i++) {
            const chunk = new Chunk([notes.shift()])
            const startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                let difference = notes[j][1] - chunk.notes[0][1] - THRESHOLDS.joined //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift())
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
                sheetText += appName === "Genshin" ? `[${text}] ` : `${text} `
            } else if (chunk.notes.length > 0) {
                sheetText += `${getChunkNoteText(chunk.notes[0][0])} `
            }
        }
        setSongAstext(sheetText)
        setSheet(chunks)
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
                    SongComponent={SongRow}
                    componentProps={{
                        currentSong,
                        functions: {
                            click: handleClick
                        }
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
                {currentSong?.name}
            </h1>
            <div style={{ width: '100%' }} className='noprint'>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h2>{currentSong.name || 'No song selected'}</h2>
                    <button onClick={() => window.print()} className='genshin-button'>
                        Print as PDF
                    </button>
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
                        framesPerRow={framesPerRow}
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
    notes = []
    delay = 0
    constructor(notes = [], delay = 0) {
        this.notes = notes
        this.delay = delay
    }
}
function SheetFrame({ frame, rows, hasText }) {
    const columnsPerRow = appName === 'Genshin' ? 7 : 5
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
                            style={!exists ? {backgroundColor: ThemeStore.layer('primary',0.2)} : {}}
                        >
                        {(exists && hasText) 
                            ? getNoteText(appName === 'Genshin' ? 'Keyboard layout' : 'ABC', i, 'C', appName === 'Genshin' ? 21 : 15) 
                            : null
                        }
                    </div>
                })}
            </div>
        </div>
}


function SongRow({ data, current, functions } ) {
    const selectedStyle = current === data?.name ? { backgroundColor: 'rgb(124, 116, 106)' } : {}
    return <div
        className="song-row"
        style={selectedStyle}
        onClick={() => functions.click(data)}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}