import { useState } from 'react'
import { FaDownload, FaSpinner } from 'react-icons/fa';
import { prepareSongImport } from "lib/Utils"
import LoggerStore from 'stores/LoggerStore';
import { SongStore } from 'stores/SongStore';

export default function SearchedSong({ functions, data }) {
    const { importSong } = functions
    const [fetching, setFetching] = useState(false)
    const [cache, setCache] = useState(undefined)
    const download = async function () {
        if (fetching) return
        try {
            if (cache) return importSong(cache)
            setFetching(true)
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(data => data.json())
            setFetching(false)
            song = prepareSongImport(song)
            setCache(song)
            importSong(song)
        } catch (e) {
            setFetching(false)
            console.error(e)
            LoggerStore.error("Error downloading song")
        }
    }
    const play = async function () {
        if (fetching) return
        try {
            if (cache) {
                SongStore.play(cache,0)
            }
            setFetching(true)
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(data => data.json())
            setFetching(false)
            song = prepareSongImport(song)
            setCache(song)
            SongStore.play(song,0)
        } catch (e) {
            console.error(e)
            setFetching(false)
            LoggerStore.error("Error downloading song")
        }
    }
    return <div className="song-row">
        <div className="song-name" onClick={() => {
            play(data)
        }}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={download}>
                {fetching ? <FaSpinner /> : <FaDownload />}
            </button>
        </div>
    </div>
}