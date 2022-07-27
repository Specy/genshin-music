import { FaTrash, FaDownload } from 'react-icons/fa';
import { asyncConfirm } from "components/Utility/AsyncPrompts"
import { APP_NAME } from "appConfig"
import { logger } from 'stores/LoggerStore';
import { SongMenu } from 'components/Layout/SongMenu';
import './ErrorPage.css'
import { AppButton } from 'components/Inputs/AppButton';
import { SerializedSong, SongType } from 'lib/Songs/Song';
import { useSongs } from 'lib/Hooks/useSongs';
import { songsStore } from 'stores/SongsStore';
import { fileService } from 'lib/Services/FileService';
import { Title } from 'components/Miscellaneous/Title';
import { DefaultPage } from 'components/Layout/DefaultPage';
import { songService } from 'lib/Services/SongService';
import { ComposedSong } from 'lib/Songs/ComposedSong';
import { RecordedSong } from 'lib/Songs/RecordedSong';

const excludedSongs: SongType[] = ['vsrg']
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
        logger.success("Settings have been reset")
    }
    const downloadSong = (song: SerializedSong) => {
        try{
            const songName = song.name
            const parsed = songService.parseSong(song)
            const converted = [APP_NAME === 'Sky' && (parsed instanceof ComposedSong || parsed instanceof RecordedSong)
                ? parsed.toOldFormat() 
                : parsed.serialize()
            ]
            fileService.downloadSong(converted,`${songName}.${APP_NAME.toLowerCase()}sheet`)
            logger.success("Song downloaded")
        }catch(e){
            console.error(e)
            logger.error('Error downloading song')
        }

    }
    return <DefaultPage className='error-page'>
        <Title text="Error" />
        
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
                exclude={excludedSongs}
                songs={songs}
                componentProps={{
                    deleteSong,
                    download: downloadSong
                }}

            />
        </div>
    </DefaultPage>
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
            <button className="song-button" onClick={() => download(data)} aria-label={`Download song ${data.name}`}>
                <FaDownload />

            </button>
            <button className="song-button" onClick={() => deleteSong(data.name, data.id as string)} aria-label={`Delete song ${data.name}`}>
                <FaTrash color="#ed4557" />
            </button>
        </div>
    </div>
}

export default ErrorPage