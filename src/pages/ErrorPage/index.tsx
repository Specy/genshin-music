import { useEffect, useState } from 'react'
import { FaTrash, FaDownload } from 'react-icons/fa';
import { DB } from 'Database';
import { FileDownloader } from "lib/Utils"
import { asyncConfirm } from "components/AsyncPrompts"
import { APP_NAME } from "appConfig"
import { SimpleMenu } from 'components/SimpleMenu'
import LoggerStore from 'stores/LoggerStore';
import { SongMenu } from 'components/SongMenu';
import { SerializedSongType } from 'types/SongTypes';
import { ComposedSong, SerializedComposedSong } from 'lib/Utils/ComposedSong';
import { SerializedSong, Song } from 'lib/Utils/Song';

import './ErrorPage.css'

export function ErrorPage() {
    const [songs, setSongs] = useState<SerializedSongType[]>([])
    const syncSongs = async () => {
        setSongs(await DB.getSongs())
    }
    useEffect(() => {
        syncSongs()
    }, [])

    const deleteSong = async (name: string) => {
        if (await asyncConfirm("Are you sure you want to delete the song: " + name)) {
            await DB.removeSong({ name: name })
            syncSongs()
        }

    }
    const deleteAllSongs = async () => {
        if (await asyncConfirm("Are you sure you want to delete ALL SONGS?")) {
            await DB.removeSong({})
            syncSongs()
        }
    }
    const resetSettings = () => {
        localStorage.removeItem(APP_NAME + "_Composer_Settings")
        localStorage.removeItem(APP_NAME + "_Main_Settings")
        LoggerStore.success("Settings have been reset")
    }
    const downloadSong = (song: SerializedSongType) => {
        const songName = song.name
        const parsed = song.data.isComposedVersion
            ? ComposedSong.deserialize(song as SerializedComposedSong)
            : Song.deserialize(song as SerializedSong)
        const converted = [APP_NAME === 'Sky' ? parsed.toOldFormat() : parsed.serialize()]
        const json = JSON.stringify(converted)
        FileDownloader.download(json, `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
        LoggerStore.success("Song downloaded")
    }
    return <div className="default-page error-page">
        <SimpleMenu />
        <div className="error-text-wrapper">
            There seems to be an error. <br />
            Here you can download or delete your songs,
            try to find what song caused the error and remove it.
        </div>
        <div className="error-buttons-wrapper">
            <button className="genshin-button" onClick={resetSettings}>
                Reset settings
            </button>
            <button className="genshin-button" onClick={deleteAllSongs}>
                Delete all songs
            </button>
        </div>
        <div className="error-songs-wrapper">
            <SongMenu
                SongComponent={SongRow}
                songs={songs}
                baseType='recorded'
                componentProps={{
                    deleteSong,
                    download: downloadSong
                }}

            />
        </div>
    </div>
}

interface SongRowProps{
    data: SerializedSongType
    deleteSong: (name: string) => void
    download: (song: SerializedSongType) => void
}
function SongRow({data, deleteSong, download } : SongRowProps) {
    return <div className="song-row">
        <div className="song-name">
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={() => download(data)}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage