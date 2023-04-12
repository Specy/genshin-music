import { FaTrash, FaDownload } from 'react-icons/fa';
import { asyncConfirm } from "$cmp/Utility/AsyncPrompts"
import { APP_NAME } from "$/Config"
import { logger } from '$stores/LoggerStore';
import { SongMenu } from '$cmp/Layout/SongMenu';
import { AppButton } from '$cmp/Inputs/AppButton';
import { SerializedSong, SongStorable } from '$lib/Songs/Song';
import { useSongs } from '$lib/Hooks/useSongs';
import { songsStore } from '$stores/SongsStore';
import { fileService } from '$lib/Services/FileService';
import { Title } from '$cmp/Miscellaneous/Title';
import { DefaultPage } from '$cmp/Layout/DefaultPage';
import { songService } from '$lib/Services/SongService';
import { ComposedSong } from '$lib/Songs/ComposedSong';
import { RecordedSong } from '$lib/Songs/RecordedSong';
import { useObservableArray } from '$/lib/Hooks/useObservable';
import { logsStore } from '$stores/LogsStore';

export function ErrorPage() {
    const [songs] = useSongs()
    const errors = useObservableArray(logsStore.logs)
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
        logger.success("Settings have been reset")
    }
    const downloadSong = (song: SerializedSong) => {
        try {
            const songName = song.name
            const parsed = songService.parseSong(song)
            const converted = [APP_NAME === 'Sky' && (parsed instanceof ComposedSong || parsed instanceof RecordedSong)
                ? parsed.toOldFormat()
                : parsed.serialize()
            ]
            fileService.downloadSong(converted, `${songName}.${APP_NAME.toLowerCase()}sheet`)
            logger.success("Song downloaded")
        } catch (e) {
            console.error(e)
            logger.error('Error downloading song')
        }

    }
    return <DefaultPage className='error-page'>
        <Title text="Error" />
        <div style={{textAlign: 'center'}}>
            If you unexpectedly see this page it means an error has occoured.
            Here you can download or delete your songs, if one caused an error, delete it.
            If you need help, join our 
            <a 
                href='https://discord.gg/Arsf65YYHq' 
                target='_blank' 
                rel='noreferrer' 
                style={{
                    margin: '0 0.4rem',
                    color: 'var(--accent)'
                }}
            >
                Discord
            </a> 
            and send the log file below.
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
                componentProps={{
                    deleteSong,
                    download: downloadSong
                }}
            />
        </div>
        <div className='row space-between' style={{margin: '1rem 0'}}>
            <div style={{fontSize: '2rem'}}>
                Error logs
            </div>
            <AppButton
                onClick={() => {
                    const logs = logsStore.logs.map(l => l.message)
                    fileService.downloadObject(logs, `${APP_NAME}_logs`)
                }}
            >
                Download logs
            </AppButton>
        </div>
        <div className='error-logs'>
            {errors.map((e, i) =>
                <div
                    key={i}
                    className='error-log-row row'
                >
                    {e.message}
                </div>
            )}
        </div>
    </DefaultPage>
}

interface SongRowProps {
    data: SongStorable
    deleteSong: (name: string, id: string) => void
    download: (song: SerializedSong) => void
}
function SongRow({ data, deleteSong, download }: SongRowProps) {
    return <div className="song-row">
        <div className="song-name">
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={async () => {  
                const song = await songService.getOneSerializedFromStorable(data)
                if(!song) return logger.error("Could not find song")
                download(song)
            }} aria-label={`Download song ${data.name}`}>
                <FaDownload />
            </button>
            <button className="song-button" onClick={() => deleteSong(data.name, data.id as string)} aria-label={`Delete song ${data.name}`}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage