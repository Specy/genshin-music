import { AppButton } from "$cmp/Inputs/AppButton";
import { DefaultPage } from "$cmp/Layout/DefaultPage";
import { Title } from "$cmp/Miscellaneous/Title";
import { FaFileDownload, FaFileImport, FaTrash } from "react-icons/fa";
import { useEffect, useState } from "react";
import { songService } from "$lib/Services/SongService";
import { _themeService } from "$lib/Services/ThemeService";
import { SerializedSong } from "$lib/Songs/Song";
import { SerializedTheme } from "$stores/ThemeStore/ThemeProvider";
import { folderStore } from "$stores/FoldersStore";
import { _folderService } from "$lib/Services/FolderService";
import { asyncConfirm, asyncPrompt } from "$cmp/Utility/AsyncPrompts";
import { logger } from "$stores/LoggerStore";
import { fileService, UnknownFileTypes } from "$lib/Services/FileService";
import { Folder, SerializedFolder } from "$lib/Folder";
import { APP_NAME } from "$config";
import { FileElement, FilePicker } from "$cmp/Inputs/FilePicker";
import { delay } from "$lib/Utilities";
import { useSongs } from "$lib/Hooks/useSongs";
import { useObservableArray } from "$lib/Hooks/useObservable";
import { themeStore } from "$stores/ThemeStore/ThemeStore";
import { songsStore } from "$stores/SongsStore";
import { settingsService } from "$lib/Services/SettingsService";
import Link from "next/link";
import { strToU8, zip } from "fflate";
import MultiSwitch from "$cmp/Composer/MultiSwitch";
import { MultipleOptionSlider } from "$cmp/VsrgComposer/MultipleOptionSlider";
import { useTheme } from "$lib/Hooks/useTheme";

type BackupFormat = 'json' | 'zip'
export default function Backup() {
    const [theme] = useTheme()
    const iconStyle = { marginRight: '0.3rem', marginLeft: '-0.4rem' }
    const [songs] = useSongs()
    const userThemes = useObservableArray<SerializedTheme>(themeStore.themes)
    const [downloadFormat, setDownloadFormat] = useState<BackupFormat>('json')
    useEffect(() => {
        return () => logger.hidePill()
    }, [])
    async function validateSongs(): Promise<SerializedSong[] | null> {
        logger.showPill("Validating songs...")
        const songs = await songService.getSongs()
        const errors: SerializedSong[] = []
        for (const song of songs) {
            try {
                songService.parseSong(song)
            } catch (e) {
                console.error(e)
                errors.push(song)
                logger.error(`Error validating song "${song?.name}"`)
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt("There were errors validating some songs. Do you want to continue downloading?")
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...songs]
    }
    async function validateFolders(): Promise<SerializedFolder[] | null> {
        logger.showPill("Validating folders...")
        const folderErrors: SerializedFolder[] = []
        const folders = await _folderService.getFolders()
        for (const folder of folders) {
            try {
                Folder.deserialize(folder)
            } catch (e) {
                console.error(e)
                folderErrors.push(folder)
                logger.error(`Error validating folder "${folder?.name}"`)
            }
        }
        if (folderErrors.length > 0) {
            const keepDownloading = await asyncPrompt("There were errors validating some folders. Do you want to continue downloading?")
            if (!keepDownloading) return null
        }
        logger.hidePill()
        return [...folders]
    }
    async function validateThemes(): Promise<SerializedTheme[] | null> {
        logger.showPill("Validating themes...")
        const themes = await _themeService.getThemes()
        const errors: SerializedTheme[] = []
        for (const theme of themes) {
            try {
            } catch (e) {
                console.error(e)
                errors.push(theme)
                logger.error(`Error validating theme "${theme?.other?.name}"`)
            }
        }
        if (errors.length > 0) {
            const keepDownloading = await asyncPrompt("There were errors validating some themes. Do you want to continue downloading?")
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
                logger.error(`Error importing file "${file.file?.name}"`)
            }
        }
    }
    async function deleteAllSongsAndFolders() {
        const confirm = await asyncPrompt("Write 'delete' if you want to delete all songs, press cancel to ignore")
        if (confirm !== 'delete') return logger.warn('Action cancelled')
        await delay(200)
        const confirmAgain = await asyncConfirm("Are you REALLY sure you want to delete all songs?")
        if (!confirmAgain) return logger.warn('Action cancelled')
        await songsStore._DANGEROUS_CLEAR_ALL_SONGS()
        await folderStore._DANGEROUS_CLEAR_ALL_FOLDERS()
        logger.success("Deleted all songs")
    }
    async function deleteAllThemes() {
        const confirm = await asyncPrompt("Write 'delete' if you want to delete all themes")
        if (confirm !== 'delete') return logger.warn('Action cancelled')
        await delay(200)
        const confirmAgain = await asyncConfirm("Are you REALLY sure you want to delete all themes?")
        if (!confirmAgain) return logger.warn('Action cancelled')
        await themeStore._DANGEROUS_CLEAR_ALL_THEMES()
        logger.success("Deleted all themes")
    }
    async function downloadFiles(files: UnknownFileTypes[], fileName: string){
        if(downloadFormat === 'json'){
            fileService.downloadFiles(files,fileName)
        }else{
            try{
                logger.showPill("Zipping files...")
                const result = await new Promise<any>((resolve, reject) => {
                    const fileEntries = files.map(file => {
                        const nameAndFormat = fileService.getUnknownFileExtensionAndName(file)
                        if(!nameAndFormat) return [`unknown${Math.floor(Math.random() * 1000)}.${file.type}`, strToU8(JSON.stringify(file))]
                        const { name, extension} = nameAndFormat
                        return [`${name}.${extension}`, strToU8(JSON.stringify(file))]
                    })
                    zip({
                        [`${fileName}`]: strToU8(JSON.stringify(files)),
                        individualFiles: Object.fromEntries(fileEntries)
                    }, ( err, data) => {
                        if(err)return reject(err)
                        fileService.downloadBlob(new Blob([data]),`${fileName}.zip`)
                        resolve(data)
                    })
                })
                logger.hidePill()
                return result
            }catch (e) {
                logger.hidePill()
                throw e
            }
        }
    }
    return <DefaultPage>
        <Title text="Backup" description="Manage the backups in the app, download or import songs, themes, or all of them" />
        <h1 style={{fontSize: "1.8rem"}}>
            Transfer from other domain
        </h1>
        <div style={{gap: "1rem", paddingLeft: '1.5rem'}} className={"row row-centered"}>
            <div>
                If you want to transfer your data from another domain of the app, click here
            </div>
            <Link href={"transfer"} style={{ marginLeft: "1rem" }}>
                <AppButton cssVar="accent" style={{ gap: "0.2rem" }}>
                    Transfer
                </AppButton>
            </Link>
        </div>

        <div className={"row row-centered"} style={{margin: "1rem 0", gap: "1rem", marginTop: "2rem"}}>
            <div style={{fontSize: "1.8rem"}}>
                Backup as
            </div>
            <MultipleOptionSlider
                options={[
                    { value: "zip", color: theme.getValue("accent").toString()},
                    { value: "json", color: theme.getValue("accent").toString()},
                ]}
                selected={downloadFormat}
                onChange={setDownloadFormat}
            />
        </div>
        <div style={{paddingLeft: '1.5rem'}}>
            Make sure you create a backup every now and then. Especially if you just finished a new song.
            The browser shouldn't delete your data, especially if you installed the app, but there is always a chance.
        </div>
        <div className="row" style={{ marginTop: '1rem', gap: "0.5rem", paddingLeft: '1.5rem' }}>
            <AppButton
                tooltip="Download all the data of the app, aka themes, songs, folders"
                className="flex-centered"
                onClick={async () => {
                    const songs = await validateSongs()
                    if (!songs) return
                    const folders = await validateFolders()
                    if (!folders) return
                    const themes = await validateThemes()
                    if (!themes) return
                    const files = [...songs, ...folders, ...themes]
                    if (files.length === 0) return logger.warn("There is nothing to backup")
                    try {
                        await downloadFiles(files, `${getDateString()}-all.${APP_NAME.toLowerCase()}backup`)
                        logger.success("Downloaded backup")
                        settingsService.setLastBackupWarningTime(Date.now())
                    } catch (e) {
                        logger.error("Error downloading backup")
                    }
                }}
            >
                <FaFileDownload style={iconStyle} />

                Download all backup
            </AppButton>
            <AppButton
                tooltip="Downloads a backup containing all songs and folders"
                className="flex-centered"
                onClick={async () => {
                    const songs = await validateSongs()
                    if (!songs) return
                    const folders = await validateFolders()
                    if (!folders) return
                    const files = [...songs, ...folders]
                    if (files.length === 0) return logger.warn("There are no songs to backup")
                    try {
                        await downloadFiles(files, `${getDateString()}-songs.${APP_NAME.toLowerCase()}backup`)
                        logger.success("Downloaded songs backup")
                        settingsService.setLastBackupWarningTime(Date.now())
                    }catch (e) {
                        logger.error("Error downloading backup")
                        console.error(e)
                    }
                }}
            >
                <FaFileDownload style={iconStyle} />
                Download song backup
            </AppButton>
            <AppButton
                tooltip="Downloads a backup of all the custom themes"
                className="flex-centered"
                onClick={async () => {
                    const themes = await validateThemes()
                    if (!themes) return
                    if (themes.length === 0) return logger.warn("There are no themes to backup")
                    try {
                        await downloadFiles(themes, `${getDateString()}-themes.${APP_NAME.toLowerCase()}backup`)
                        logger.success("Downloaded themes backup")
                    }catch (e) {
                        logger.error("Error downloading backup")
                        console.error(e)
                    }
                }}
            >
                <FaFileDownload style={iconStyle} />
                Download themes backup
            </AppButton>
        </div>
        <h1 style={{fontSize: "1.8rem"}}>
            Import a backup
        </h1>
        <div style={{paddingLeft: '1.5rem'}}>
            If you have a backup, you can import it here, they will be added to your existing data. (if you already have the same song,
            a duplicate will be created).
        </div>
        <div className="flex-centered">
            <FilePicker
                onPick={onFilePick}
                as="json"
                onError={() => logger.error("There was an error reading the file")}
            >
                <AppButton
                    className="flex-centered"
                    tooltip="Here you can import any backup you have"
                    style={{
                        marginTop: '1rem',
                        backgroundColor: "var(--accent)",
                        color: "var(--accent-text)",
                        padding: '0.8rem'
                    }}
                >
                    <FaFileImport style={{ ...iconStyle, fontSize: '1rem', marginRight: '0.5rem' }} />
                    Import backup
                </AppButton>
            </FilePicker>

        </div>
        <div
            className='column'
            style={{
                flex: '1',
                justifyContent: 'center',
                padding: '1rem'
            }}
        >
            <div
                className="column"
                style={{ width: 'fit-content' }}
            >
                <span>
                    {songs.length} {songs.length === 1 ? 'song' : 'songs'}
                </span>

                <span>
                    {userThemes.length} {userThemes.length === 1 ? 'theme' : 'themes'}
                </span>
            </div>
        </div>
        <h1 style={{fontSize: "1.8rem"}}>
            Delete data
        </h1>
        <div style={{paddingLeft: '1.5rem'}}>
            If you want, you can also delete all your data here, once deleted it can't be recovered.
            Don't worry you will be asked to confirm before anything is deleted.
        </div>
        <div className="row" style={{ marginTop: '1rem', gap: "0.5rem", paddingLeft: '1.5rem' }}>
            <AppButton
                className="flex-centered"
                tooltip="Here you can delete all your songs and folders"
                tooltipPosition="top"
                style={{
                    backgroundColor: "var(--red-bg)",
                    color: "var(--red-text)"
                }}
                onClick={deleteAllSongsAndFolders}
            >
                <FaTrash style={iconStyle} />
                Delete songs and folders
            </AppButton>
            <AppButton
                className="flex-centered"
                tooltip="Here you can delete all your themes"
                tooltipPosition="top"
                style={{
                    backgroundColor: "var(--red-bg)",
                    color: "var(--red-text)"
                }}
                onClick={deleteAllThemes}
            >
                <FaTrash style={iconStyle} />
                Delete themes
            </AppButton>
        </div>

    </DefaultPage>
}


function getDateString() {
    const date = new Date()
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}