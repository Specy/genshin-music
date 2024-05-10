import {FaDownload, FaTrash} from 'react-icons/fa';
import {asyncConfirm} from "$cmp/shared/Utility/AsyncPrompts"
import {APP_NAME} from "$config"
import {logger} from '$stores/LoggerStore';
import {SongMenu} from '$cmp/shared/pagesLayout/SongMenu';
import {AppButton} from '$cmp/shared/Inputs/AppButton';
import {SerializedSong, SongStorable} from '$lib/Songs/Song';
import {useSongs} from '$lib/Hooks/useSongs';
import {songsStore} from '$stores/SongsStore';
import {fileService} from '$lib/Services/FileService';
import {PageMetadata} from '$cmp/shared/Miscellaneous/PageMetadata';
import {DefaultPage} from '$cmp/shared/pagesLayout/DefaultPage';
import {songService} from '$lib/Services/SongService';
import {ComposedSong} from '$lib/Songs/ComposedSong';
import {RecordedSong} from '$lib/Songs/RecordedSong';
import {useObservableArray} from '$lib/Hooks/useObservable';
import {logsStore} from '$stores/LogsStore';
import s from './ErrorPage.module.scss'
import {useTranslation} from "react-i18next";

export function ErrorPage() {
    const {t} = useTranslation(['error','logs', 'confirm', 'common'])
    const [songs] = useSongs()
    const errors = useObservableArray(logsStore.logs)
    const deleteSong = async (name: string, id: string) => {
        if (await asyncConfirm(t('confirm:delete_song', {song_name: name}))) {
            await songsStore.removeSong(id)
        }
    }
    const deleteAllSongs = async () => {
        if (await asyncConfirm(t('confirm_delete_all_songs'))) {
            await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        }
    }
    const resetSettings = () => {
        localStorage.removeItem(APP_NAME + "_Composer_Settings")
        localStorage.removeItem(APP_NAME + "_Main_Settings")
        logger.success(t('settings_reset_notice'))
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
            logger.success(t('logs:song_downloaded'))
        } catch (e) {
            console.error(e)
            logger.error(t('logs:error_downloading_song'))
        }

    }
    return <DefaultPage className={s['error-page']}>
        <PageMetadata text={t('common:error')}
                      description='View the errors that happened in the app to send bug reports and to try to recover your songs'/>
        <div style={{textAlign: 'center'}}>
            {t('error_page_description')}
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
        </div>
        <div className={s["error-buttons-wrapper"]}>
            <AppButton onClick={resetSettings}>
                {t('reset_settings')}
            </AppButton>
            <AppButton onClick={deleteAllSongs}>
                {t('delete_all_songs')}
            </AppButton>
        </div>
        <div className={s["error-songs-wrapper"]}>
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
                {t('error_logs')}
            </div>
            <AppButton
                onClick={() => {
                    const logs = logsStore.logs.map(l => l.message)
                    fileService.downloadObject(logs, `${APP_NAME}_logs`)
                }}
            >
                {t('download_logs')}
            </AppButton>
        </div>
        <div className={s['error-logs']}>
            {errors.map((e, i) =>
                <pre
                    key={i}
                    className={`${s['error-log-row']} row`}
                >
                    {e.message}
                </pre>
            )}
        </div>
    </DefaultPage>
}

interface SongRowProps {
    data: SongStorable
    deleteSong: (name: string, id: string) => void
    download: (song: SerializedSong) => void
}

function SongRow({data, deleteSong, download}: SongRowProps) {
    const {t } = useTranslation(['menu', 'logs'])
    return <div className="song-row">
        <div className="song-name">
            {data.name}
        </div>
        <div className="song-buttons-wrapper">
            <button className="song-button" onClick={async () => {
                const song = await songService.getOneSerializedFromStorable(data)
                if (!song) return logger.error(t('logs:could_not_find_song'))
                download(song)
            }} aria-label={t('download_song', {song_name: data.name})}>
                <FaDownload/>
            </button>
            <button className="song-button" onClick={() => deleteSong(data.name, data.id as string)}
                    aria-label={t('delete_song', {song_name: data.name})}>
                <FaTrash color="#ed4557"/>
            </button>
        </div>
    </div>
}

export default ErrorPage