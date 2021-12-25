import './SheetDisplayer.css'
import { useEffect, useState } from 'react'
import { SimpleMenu } from 'components/SimpleMenu'
import ZangoDb from "zangodb"
import { appName } from 'appConfig'
import { ComposerToRecording } from 'lib/Utils'
export default function SheetDisplayer(props) {
    const [songs, setSongs] = useState([])
    const [sheet, setSheet] = useState([])
    const [framesPerRow, setFramesPerRow] = useState(7)
    const [currentSong, setCurrentSong] = useState({})
    const [selectedSongType, setSelectedSongType] = useState('recorded')
    useEffect(() => {
        async function load() {
            const db = new ZangoDb.Db(appName, { songs: [] })
            let dbSongs = await db.collection('songs').find().toArray()
            setSongs(dbSongs)
        }
        load()
    }, [])
    function handleClick(song) {
        setCurrentSong(song)
        let lostReference = JSON.parse(JSON.stringify(song))
        if (lostReference.data?.isComposedVersion) {
            lostReference = ComposerToRecording(lostReference)
        }
        let notes = lostReference.notes
        let chunks = []
        let previousChunkDelay = 0
        for (let i = 0; notes.length > 0; i++) {
            let chunk = {
                notes: [notes.shift()],
                delay: 0
            }
            let startTime = chunk.notes.length > 0 ? chunk.notes[0][1] : 0
            for (let j = 0; j < notes.length && j < 20; j++) {
                let difference = notes[j][1] - chunk.notes[0][1] - 50 //TODO add threshold here
                if (difference < 0) {
                    chunk.notes.push(notes.shift())
                    j--
                }
            }
            chunk.delay = previousChunkDelay
            previousChunkDelay = notes.length > 0 ? notes[0][1] - startTime : 0
            chunks.push(chunk)
        }
        setSheet(chunks)
    }
    return <div className='displayer-page'>
        <div style={{ display: 'flex', alignItems: 'center', flexDirection: 'column' }}>
            <SimpleMenu functions={{ changePage: props.changePage }} />
            <div style={{display:'flex', flexDirection:'column'}}>
                <div className='displayer-songs-wrapper' style={{ marginTop: '0' }}>
                    <div className="tab-selector-wrapper">
                        <button
                            className={selectedSongType === "recorded" ? "tab-selector tab-selected" : "tab-selector"}
                            onClick={() => setSelectedSongType("recorded")}
                        >
                            Recorded
                        </button>
                        <button
                            className={selectedSongType === "composed" ? "tab-selector tab-selected" : "tab-selector"}
                            onClick={() => setSelectedSongType("composed")}
                        >
                            Composed
                        </button>
                    </div>
                    <div className="songs-wrapper">
                        {songs.filter((song) => selectedSongType === 'composed' ? song.data?.isComposedVersion : !song.data?.isComposedVersion
                        ).map((song) =>
                            <SongRow
                                key={song?.name}
                                current={song === currentSong}
                                data={song}
                                functions={{
                                    click: handleClick
                                }}
                            />
                        )}

                    </div>
                </div>
                <div className='displayer-per-row'>
                    Per row: {framesPerRow}
                    <button className='displayer-plus-minus'
                        onClick={() => framesPerRow > 1 && setFramesPerRow(framesPerRow - 1)}>
                        -
                    </button>
                    <button className='displayer-plus-minus'
                        onClick={() => setFramesPerRow(framesPerRow + 1)}>
                        +
                    </button>

                </div>
            </div>

            <div style={{ color: 'var(--whitish)' }}>
                <h2>{currentSong.name || 'No song selected'}</h2>
                <div style={{ color: 'var(--hint-main)' }}>
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
                    />
                )}
            </div>
        </div>

    </div>
}

function SheetFrame(props) {
    const { frame, rows } = props
    const columnsPerRow = appName === 'Genshin' ? 7 : 5
    const notes = new Array(columnsPerRow * rows).fill(0)
    frame.notes.forEach(note => {
        notes[note[0]] = 1
    })
    return <div className='frame-outer'>
        <div className='displayer-frame' style={{ gridTemplateColumns: `repeat(${columnsPerRow},1fr)` }}>
            {notes.map((exists, i) => {
                return <div className={exists ? 'frame-note-s' : 'frame-note-ns'} key={i}>

                </div>
            })}
        </div>
    </div>
}


function SongRow(props) {
    const { data, current } = props
    const selectedStyle = current ? { backgroundColor: 'rgb(85, 118, 109)' } : {}
    return <div
        className="song-row"
        style={selectedStyle}
        onClick={() => props.functions.click(data)}>
        <div className="song-name">
            {data.name}
        </div>
    </div>
}