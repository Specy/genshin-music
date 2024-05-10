import {AppButton} from "$cmp/shared/Inputs/AppButton";
import {DefaultPage} from "$cmp/shared/pagesLayout/DefaultPage";
import {PageMetadata} from "$cmp/shared/Miscellaneous/PageMetadata";
import {FaFileDownload, FaFileImport, FaTrash} from "react-icons/fa";
import {useEffect, useState} from "react";
import {songService} from "$lib/Services/SongService";
import {_themeService} from "$lib/Services/ThemeService";
import {SerializedSong} from "$lib/Songs/Song";
import {SerializedTheme} from "$stores/ThemeStore/ThemeProvider";
import {folderStore} from "$stores/FoldersStore";
import {_folderService} from "$lib/Services/FolderService";
import {asyncConfirm, asyncPrompt} from "$cmp/shared/Utility/AsyncPrompts";
import {logger} from "$stores/LoggerStore";
import {fileService, UnknownFileTypes} from "$lib/Services/FileService";
import {Folder, SerializedFolder} from "$lib/Folder";
import {APP_NAME} from "$config";
import {FileElement, FilePicker} from "$cmp/shared/Inputs/FilePicker";
import {delay} from "$lib/utils/Utilities";
import {useSongs} from "$lib/Hooks/useSongs";
import {useObservableArray} from "$lib/Hooks/useObservable";
import {themeStore} from "$stores/ThemeStore/ThemeStore";
import {songsStore} from "$stores/SongsStore";
import {settingsService} from "$lib/Services/SettingsService";
import Link from "next/link";
import {strToU8, zip} from "fflate";
import {MultipleOptionSlider} from "$cmp/pages/VsrgComposer/MultipleOptionSlider";
import {useTheme} from "$lib/Hooks/useTheme";
import {Row} from "$cmp/shared/layout/Row";
import {Column} from "$cmp/shared/layout/Column";
import {useTranslation} from "react-i18next";

type BackupFormat = 'json' | 'zip'
export default function Backup() {
    const {t} = useTranslation(['backup', 'home'])
    const [theme] = useTheme()
    const iconStyle = {marginRight: '0.3rem', marginLeft: '-0.4rem'}
    const [songs] = useSongs()
    const userThemes = useObservableArray<SerializedTheme>(themeStore.themes)
    const [downloadFormat, setDownloadFormat] = useState<BackupFormat>('json')
    useEffect(() => {
        return () => logger.hidePill()
    }, [])

    async function validateSongs(): Promise<SerializedSong[] | null> {
        logger.showPill(`${t('validating_songs')}...`)
        const songs = await songService.getSongs()
        const errors: SerializedSong[] = []
        for (const song of songs) {
            try {
                songService.parseSong(song)
            } catch (e) {
                console.error(e)
                errors.push(song)
                logger.error(t('error_validating_song', {song_name: song?.name}))
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt(t('confirm_after_songs_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...songs]
    }

    async function validateFolders(): Promise<SerializedFolder[] | null> {
        logger.showPill(`${t('validating_folders')}...`)
        const folderErrors: SerializedFolder[] = []
        const folders = await _folderService.getFolders()
        for (const folder of folders) {
            try {
                Folder.deserialize(folder)
            } catch (e) {
                console.error(e)
                folderErrors.push(folder)
                logger.error(t('error_validating_folder', {folder_name: folder?.name}))
            }
        }
        if (folderErrors.length > 0) {
            const keepDownloading = await asyncPrompt(t('confirm_after_folders_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...folders]
    }

    async function validateThemes(): Promise<SerializedTheme[] | null> {
        logger.showPill(`${t('validating_themes')}...`)
        const themes = await _themeService.getThemes()
        const errors: SerializedTheme[] = []
        for (const theme of themes) {
            try {
            } catch (e) {
                console.error(e)
                errors.push(theme)
                logger.error(t('error_validating_theme', {theme_name: theme?.other?.name}))
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt(t('confirm_after_themes_validation_error'))
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...themes]
    }

    async function onFilePick(files: FileElement<UnknownFileTypes[] | UnknownFileTypes>[]) {
        for (const file of files) {
            try {
                const fileArray = (Array.isArray(file.data) ? file.data : [file.data]) as UnknownFileTypes[]
                await fileService.importAndLog(fileArray)
            } catch (e) {
                console.error(e)
                logger.error(t('error_importing_file', {file_name: file?.file?.name}))
            }
        }
    }

    async function deleteAllSongsAndFolders() {
        const confirm = await asyncPrompt(t('confirm_delete_songs_step_1'))
        if (confirm !== 'delete') return logger.warn(t('action_cancelled'))
        await delay(200)
        const confirmAgain = await asyncConfirm(t('confirm_delete_songs_step_2'))
        if (!confirmAgain) return logger.warn(t('action_cancelled'))
        await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        await folderStore._DANGEROUS_CLEAR_ALL_FOLDERS()
        logger.success(t('deleted_all_songs_notice'))
    }

    async function deleteAllThemes() {
        const confirm = await asyncPrompt(t('confirm_delete_themes_step_1'))
        if (confirm !== 'delete') return logger.warn(t('action_cancelled'))
        await delay(200)
        const confirmAgain = await asyncConfirm(t('confirm_delete_themes_step_2'))
        if (!confirmAgain) return logger.warn(t('action_cancelled'))
        await themeStore._DANGEROUS_CLEAR_ALL_THEMES()
        logger.success(t('deleted_all_themes_notice'))
    }

    async function downloadFiles(files: UnknownFileTypes[], fileName: string) {
        if (downloadFormat === 'json') {
            fileService.downloadFiles(files, fileName)
        } else {
            try {
                logger.showPill(`${t('zipping_files')}...`)
                const result = await new Promise<any>((resolve, reject) => {
                    const fileEntries = files.map(file => {
                        const nameAndFormat = fileService.getUnknownFileExtensionAndName(file)
                        if (!nameAndFormat) return [`unknown${Math.floor(Math.random() * 1000)}.${file.type}`, strToU8(JSON.stringify(file))]
                        const {name, extension} = nameAndFormat
                        const arrayFile = Array.isArray(file) ? file : [file]
                        return [`${name}.${extension}`, strToU8(JSON.stringify(arrayFile))]
                    })
                    zip({
                        [`${fileName}`]: strToU8(JSON.stringify(files)),
                        individualFiles: Object.fromEntries(fileEntries)
                    }, (err, data) => {
                        if (err) return reject(err)
                        fileService.downloadBlob(new Blob([data]), `${fileName}.zip`)
                        resolve(data)
                    })
                })
                logger.hidePill()
                return result
            } catch (e) {
                logger.hidePill()
                throw e
            }
        }
    }

    return <DefaultPage>
        <PageMetadata text={t('home:backup_name')}
                      description="Manage the backups in the app, download or import songs, themes, or all of them"/>
        <h1 style={{fontSize: "1.8rem"}}>
            {t('transfer_from_other_domain')}
        </h1>
        <Row align={'center'} gap={'1rem'} style={{paddingLeft: '1.5rem'}}>
            <div>
                 {t('transfer_data_notice')}
            </div>
            <Link href={"/transfer"} style={{marginLeft: "1rem"}}>
                <AppButton cssVar="accent" style={{gap: "0.2rem"}}>
                 {t('transfer')}
                </AppButton>
            </Link>
        </Row>

        <Row align={'center'} gap={'1rem'} style={{margin: "1rem 0", marginTop: "2rem"}}>
            <div style={{fontSize: "1.8rem"}}>
                 {t('backup_as')}
            </div>
            <MultipleOptionSlider
                options={[
                    {value: "zip", color: theme.getValue("accent").toString()},
                    {value: "json", color: theme.getValue("accent").toString()},
                ]}
                selected={downloadFormat}
                onChange={setDownloadFormat}
            />
        </Row>
        <div style={{paddingLeft: '1.5rem'}}>
            {t('backup_advice')}
        </div>
        <Row gap={'0.5rem'} style={{marginTop: '1rem', paddingLeft: '1.5rem'}}>
            <AppButton
                tooltip={t("download_all_backup_tooltip")}
                className="flex-centered"
                onClick={async () => {
                    const songs = await validateSongs()
                    if (!songs) return
                    const folders = await validateFolders()
                    if (!folders) return
                    const themes = await validateThemes()
                    if (!themes) return
                    const files = [...songs, ...folders, ...themes]
                    if (files.length === 0) return logger.warn(t("no_items_to_backup"))
                    try {
                        await downloadFiles(files, `${getDateString()}-all.${APP_NAME.toLowerCase()}backup`)
                        logger.success(t("backup_downloaded"))
                        settingsService.setLastBackupWarningTime(Date.now())
                    } catch (e) {
                        logger.error(t("backup_download_error"))
                    }
                }}
            >
                <FaFileDownload style={iconStyle}/>
                {t("download_all_backup")}
            </AppButton>
            <AppButton
                tooltip={t("download_songs_tooltip")}
                className="flex-centered"
                onClick={async () => {
                    const songs = await validateSongs()
                    if (!songs) return
                    const folders = await validateFolders()
                    if (!folders) return
                    const files = [...songs, ...folders]
                    if (files.length === 0) return logger.warn(t("no_songs_to_backup"))
                    try {
                        await downloadFiles(files, `${getDateString()}-songs.${APP_NAME.toLowerCase()}backup`)
                        logger.success(t("downloaded_songs_notice"))
                        settingsService.setLastBackupWarningTime(Date.now())
                    } catch (e) {
                        logger.error(t("backup_download_error"))
                        console.error(e)
                    }
                }}
            >
                <FaFileDownload style={iconStyle}/>
                {t("download_songs_backup")}
            </AppButton>
            <AppButton
                tooltip={t("download_themes_tooltip")}
                className="flex-centered"
                onClick={async () => {
                    const themes = await validateThemes()
                    if (!themes) return
                    if (themes.length === 0) return logger.warn(t("no_themes_to_backup"))
                    try {
                        await downloadFiles(themes, `${getDateString()}-themes.${APP_NAME.toLowerCase()}backup`)
                        logger.success(t("downloaded_themes_notice"))
                    } catch (e) {
                        logger.error(t("backup_download_error"))
                        console.error(e)
                    }
                }}
            >
                <FaFileDownload style={iconStyle}/>
                {t("download_themes_backup")}
            </AppButton>
        </Row>
        <h1 style={{fontSize: "1.8rem"}}>
            {t("import_backup")}
        </h1>
        <div style={{paddingLeft: '1.5rem'}}>
            {t("import_backup_description")}
        </div>
        <Row align={'center'}>
            <FilePicker
                onPick={onFilePick}
                as="json"
                onError={() => logger.error(t("error_reading_file"))}
            >
                <AppButton
                    className="flex-centered"
                    tooltip={t("import_backup_tooltip")}
                    style={{
                        marginTop: '1rem',
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-text)",
                        padding: '0.8rem'
                    }}
                >
                    <FaFileImport style={{...iconStyle, fontSize: '1rem', marginRight: '0.5rem'}}/>
                    Import backup
                    {t("import_backup")}
                </AppButton>
            </FilePicker>

        </Row>
        <Column
            justify={'center'}
            padding={'1rem'}
            style={{
                flex: '1',
            }}
        >
            <Column
                style={{width: 'fit-content'}}
            >
                <span>
                    {songs.length} {t("songs")}
                </span>

                <span>
                    {userThemes.length} {t("themes")}
                </span>
            </Column>
        </Column>
        <h1 style={{fontSize: "1.8rem"}}>
            {t("delete_data")}
        </h1>
        <div style={{paddingLeft: '1.5rem'}}>
            {t("delete_data_description")}
        </div>
        <Row gap={'0.5rem'} style={{marginTop: '1rem', paddingLeft: '1.5rem'}}>
            <AppButton
                className="flex-centered"
                tooltip={t("delete_songs_and_folders_tooltip")}
                tooltipPosition="top"
                style={{
                    backgroundColor: "var(--red-bg)",
                    color: "var(--red-text)"
                }}
                onClick={deleteAllSongsAndFolders}
            >
                <FaTrash style={iconStyle}/>
                Delete songs and folders
                {t("delete_songs_and_folders")}
            </AppButton>
            <AppButton
                className="flex-centered"
                tooltip={t("delete_themes_tooltip")}
                tooltipPosition="top"
                style={{
                    backgroundColor: "var(--red-bg)",
                    color: "var(--red-text)"
                }}
                onClick={deleteAllThemes}
            >
                <FaTrash style={iconStyle}/>
                {t("delete_themes")}
            </AppButton>
        </Row>

    </DefaultPage>
}


function getDateString() {
    const date = new Date()
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}