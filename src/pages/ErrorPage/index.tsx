import { useEffect, useState } from 'react'
import { FaTrash, FaDownload } from 'react-icons/fa';
import { FileDownloader, parseSong } from "lib/Tools"
import { asyncConfirm } from "components/AsyncPrompts"
import { APP_NAME } from "appConfig"
import { SimpleMenu } from 'components/SimpleMenu'
import LoggerStore from 'stores/LoggerStore';
import { SongMenu } from 'components/SongMenu';


import './ErrorPage.css'
import { AppButton } from 'components/AppButton';
import { SerializedSong, Song } from 'lib/Songs/Song';
import { useSongs } from 'lib/Hooks/useSongs';
import { songsStore } from 'stores/SongsStore';

export function ErrorPage() {
    const [songs] = useSongs()


    const deleteSong = async (name: string, id: string) => {
        if (await asyncConfirm("Are you sure you want to delete the song: " + name)) {
            await songsStore.removeSong(id)
        }   

    }
    const deleteAllSongs = async () => {
        if (await asyncConfirm("Are you sure you want to delete ALL SONGS?")) {
            await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        }
    }
    const resetSettings = () => {
        localStorage.removeItem(APP_NAME + "_Composer_Settings")
        localStorage.removeItem(APP_NAME + "_Main_Settings")
        LoggerStore.success("Settings have been reset")
    }
    const downloadSong = (song: SerializedSong) => {
        try{
            const songName = song.name
            const parsed = parseSong(song)
            const converted = [APP_NAME === 'Sky' ? parsed.toOldFormat() : parsed.serialize()].map(s => Song.stripMetadata(s))
            FileDownloader.download(JSON.stringify(converted), `${songName}.${APP_NAME.toLowerCase()}sheet.json`)
            LoggerStore.success("Song downloaded")
        }catch(e){
            console.error(e)
            LoggerStore.error('Error downloading song')
        }

    }
    return <div className="default-page error-page">
        <SimpleMenu />
        <div className="error-text-wrapper">
            There seems to be an error. <br />
            Here you can download or delete your songs,
            try to find what song caused the error and remove it.
        </div>
        <div className="error-buttons-wrapper">
            <AppButton onClick={resetSettings}>
                Reset settings
            </AppButton>
            <AppButton onClick={deleteAllSongs}>
                Delete all songs

            </AppButton>
        </div>
        <div className="error-songs-wrapper">
            <SongMenu<SongRowProps>
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
    data: SerializedSong
    deleteSong: (name: string, id: string) => void
    download: (song: SerializedSong) => void
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
            <button className="song-button" onClick={() => deleteSong(data.name, data.id as string)}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage