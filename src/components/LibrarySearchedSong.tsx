import { useState } from 'react'
import { FaDownload, FaSpinner } from 'react-icons/fa';
import { parseSong } from "lib/Utils/Tools"
import LoggerStore from 'stores/LoggerStore';
import type { SearchedSongType } from 'types/GeneralTypes';
import { ComposedSong } from 'lib/Utils/ComposedSong';
import type {  Song } from 'lib/Utils/Song';

interface SearchedSongProps{
    onClick: (song: ComposedSong | Song, start: number) => void,
    importSong: (song: ComposedSong | Song) => void, 
    data: SearchedSongType
}

export default function SearchedSong({ onClick, data, importSong }:SearchedSongProps) {
    const [fetching, setFetching] = useState(false)
    const [cache, setCache] = useState<Song | ComposedSong | null>(null)
    const download = async function () {
        if (fetching) return
        try {
            if (cache) return importSong(cache.clone())
            setFetching(true)
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(res => res.json())
            setFetching(false)
            song = parseSong(song)
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
            if (cache) return onClick(cache,0)
            setFetching(true)
            let song = await fetch('https://sky-music.herokuapp.com/api/songs?get=' + encodeURI(data.file)).then(data => data.json())
            setFetching(false)
            song = parseSong(song)
            onClick(song,0)
            setCache(song)
        } catch (e) {
            console.error(e)
            setFetching(false)
            LoggerStore.error("Error downloading song")
        }
    }
    return <div className="song-row">
        <div className="song-name" onClick={play}>
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={download}>
                {fetching ? <FaSpinner /> : <FaDownload />}
            </button>
        </div>
    </div>
}