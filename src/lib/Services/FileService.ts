import { ComposedSong, OldFormatComposed, UnknownSerializedComposedSong } from "$lib/Songs/ComposedSong"
import { OldFormatRecorded, RecordedSong, UnknownSerializedRecordedSong } from "$lib/Songs/RecordedSong"
import { FileDownloader } from "$lib/Utilities"
import { songsStore } from "$stores/SongsStore"
import toWav from 'audiobuffer-to-wav'
import { SerializedSong, Song } from "$lib/Songs/Song"
import { Midi } from "@tonejs/midi"
import { SerializedTheme, ThemeProvider, Theme } from "$stores/ThemeStore/ThemeProvider"
import { songService } from "./SongService"
import { Folder, SerializedFolder } from "../Folder"
import { folderStore } from "$stores/FoldersStore"
import { SerializedVsrgSong, VsrgSong } from "../Songs/VsrgSong"
import { themeStore } from "$stores/ThemeStore/ThemeStore"
import { AppError } from "../Errors"
import { SerializedSongKind } from "$/types/SongTypes"
import { logger } from "$stores/LoggerStore"
import { APP_NAME } from "$config"
export type UnknownSong = UnknownSerializedComposedSong | UnknownSerializedRecordedSong | SerializedSong | SerializedVsrgSong
export type UnknownFileTypes = UnknownSong | OldFormatComposed | OldFormatRecorded | SerializedFolder | SerializedTheme
export type UnknownFile = UnknownFileTypes | UnknownFileTypes[]
export type UnknownSongImport = UnknownSong | UnknownSong[]

type SplitImports = {
    songs: UnknownSong[]
    folders: SerializedFolder[]
    themes: SerializedTheme[]
    unknown: any[]
}

export enum FileKind {
    Song = 'song',
    OldRecorded = 'oldRecorded',
    OldComposed = 'oldComposed',
    Folder = 'folder',
    Theme = 'theme'
}
type ImportError<T> = {
    file: Partial<T>
    error: string
}
class UnknownFileResult {
    successful: UnknownFileTypes[]
    errors: ImportError<UnknownFileTypes>[]
    constructor(successful?: UnknownFileTypes[], errors?: ImportError<UnknownFileTypes>[]) {
        this.successful = successful || []
        this.errors = errors || []
    }
    hasErrors(): boolean {
        return this.errors.length > 0
    }
    private getKinds<T>(file: UnknownFileTypes[], kind: FileKind): T {
        return file.filter(f => FileService.getSerializedObjectType(f) === kind) as unknown as T
    }
    getSuccessfulSongs(): UnknownSong[] {
        return this.getKinds(this.successful, FileKind.Song)
    }
    getSuccessfulFolders(): SerializedFolder[] {
        return this.getKinds(this.successful, FileKind.Folder)
    }
    getSuccessfulThemes(): SerializedTheme[] {
        return this.getKinds(this.successful, FileKind.Theme)
    }
    appendSuccessful(file: UnknownFileTypes) {
        this.successful.push(file)
    }
    getSongErrors(): ImportError<UnknownSong>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Song) as ImportError<UnknownSong>[]
    }
    getFolderErrors(): ImportError<SerializedFolder>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Folder) as ImportError<SerializedFolder>[]
    }
    getThemeErrors(): ImportError<SerializedTheme>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === FileKind.Theme) as ImportError<SerializedTheme>[]
    }
    getUnknownErrors(): ImportError<any>[] {
        return this.errors.filter(error => FileService.getSerializedObjectType(error.file) === null) as ImportError<any>[]
    }
    appendError(file: UnknownFile | any, error: string) {
        this.errors.push({
            file,
            error
        })
    }
}

export class FileService {
    async importAndLog(files: UnknownFile) {
        logger.showPill("Importing files...")
        const result = await fileService.importUnknownFile(files).catch(e => {
            logger.hidePill()
            logger.error("Error importing files")
            console.error(e)
            throw e
        })
        logger.hidePill()
        if (result.hasErrors()){
            logger.error(`${result.errors.length} thing${result.errors.length === 1 ? '' : 's'} failed to import`)
            console.error("failed to import: ", result.errors)
        }
        const songs = result.getSuccessfulSongs()
        const songErrors = result.getSongErrors()
        if(songs.length > 5){
            logger.success(`Imported ${songs.length} songs`)
        }else{
            songs.forEach(s => logger.success(`Imported ${s.type} song: "${s.name}"`))
        }
        songErrors.forEach(e => logger.error(`Error importing song: "${e.file?.name ?? ''}" | ${e.error}`))
        const unknown = result.getUnknownErrors()
        unknown.forEach(e => logger.error(`Error importing unknown file: "${e.file?.name ?? ''}" | ${e.error}`))

        const folders = result.getSuccessfulFolders()
        if(folders.length > 5){
            logger.success(`Imported ${folders.length} folders`)
        }else{
            folders.forEach(f => logger.success(`Imported folder: "${f.name}"`))
        }
        const folderErrors = result.getFolderErrors()
        folderErrors.forEach(e => logger.error(`Error importing folder: "${e.file?.name ?? ''}" | ${e.error}`))

        const themes = result.getSuccessfulThemes()
        if(themes.length > 5){
            logger.success(`Imported ${themes.length} themes`)
        }else{
            themes.forEach(t => logger.success(`Imported theme: "${t?.other?.name ?? ''}"`))
        }
        const themeErrors = result.getThemeErrors()
        themeErrors.forEach(e => logger.error(`Error importing theme: "${e.file?.other?.name ?? ''}" | ${e.error}`))


        return result
    }
    async importUnknownFile(unknownFile: UnknownFile): Promise<UnknownFileResult> {
        const result = new UnknownFileResult()
        const fileArray = Array.isArray(unknownFile) ? unknownFile : [unknownFile]
        const split = this.splitIntoTypes(fileArray)
        const folderIds = new Map<string, string>()
        for (const folder of split.folders) {
            try {
                const oldId = folder.id
                const id = await folderStore.addFolder(Folder.deserialize(folder))
                folderIds.set(oldId!, id)
                result.appendSuccessful(folder)
            } catch (e) {
                console.error(e)
                result.appendError(folder, AppError.getMessageFromAny(e))
            }
        }
        const vsrg = split.songs.filter(s => s.type === 'vsrg') as SerializedVsrgSong[]
        const other = split.songs.filter(s => s.type !== 'vsrg')
        const songIds = new Map<string, string>()
        for (const song of other) {
            try {
                const oldId = song.id ?? null
                song.id = null //remove the id so it can be generated
                song.folderId = folderIds.get(song.folderId!) ?? null
                const parsed = songService.parseSong(song)
                const id = await songsStore.addSong(parsed)
                songIds.set(oldId!, id)
                result.appendSuccessful(parsed)
            } catch (e) {
                console.error(e)
                result.appendError(song, AppError.getMessageFromAny(e))
            }
        }
        for (const vsrgSong of vsrg) {
            try {
                vsrgSong.id = null //remove the id so it can be generated
                vsrgSong.audioSongId = songIds.get(vsrgSong.audioSongId!) ?? null //related ID of the song
                vsrgSong.folderId = folderIds.get(vsrgSong.folderId!) ?? null
                const parsed = songService.parseSong(vsrgSong)
                await songsStore.addSong(parsed)
                result.appendSuccessful(parsed)
            } catch (e) {
                console.error(e)
                result.appendError(vsrgSong, AppError.getMessageFromAny(e))
            }
        }
        for (const theme of split.themes) {
            try {
                theme.id = null
                const sanitised = ThemeProvider.sanitize(theme)
                await themeStore.addTheme(sanitised)
                result.appendSuccessful(theme)
            } catch (e) {
                console.error(e)
                result.appendError(theme, AppError.getMessageFromAny(e))
            }
        }
        for (const unknown of split.unknown) {
            result.appendError(unknown, 'Unknown file type')
        }
        return result
    }
    splitIntoTypes(files: UnknownFileTypes[]): SplitImports {
        const songs = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Song) as UnknownSong[]
        const folders = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Folder) as SerializedFolder[]
        const themes = files.filter(file => FileService.getSerializedObjectType(file) === FileKind.Theme) as SerializedTheme[]
        const unknown = files.filter(file => FileService.getSerializedObjectType(file) === null) as any[]
        return {
            songs,
            folders,
            themes,
            unknown
        }
    }
    static getSerializedObjectType(file: UnknownFileTypes | any): FileKind | null {
        try {
            if (
                RecordedSong.isSerializedType(file) ||
                ComposedSong.isSerializedType(file) ||
                VsrgSong.isSerializedType(file)     ||
                RecordedSong.isOldFormatSerializedType(file) ||
                ComposedSong.isOldFormatSerializedType(file) 
            ) return FileKind.Song
            if (Folder.isSerializedType(file)) return FileKind.Folder
            if (Theme.isSerializedType(file)) return FileKind.Theme
        } catch (e) {
            console.log(e)
        }
        return null
    }

    async downloadSong(songs: UnknownSong | UnknownSong[], fileName: string) {
        fileName = fileName.replace(".json", "")
        const files = Array.isArray(songs) ? songs.map(Song.stripMetadata) : [Song.stripMetadata(songs)]
        const promises = files.map(s => this.prepareSongDownload(s as SerializedSongKind))
        const relatedSongs = (await Promise.all(promises)).flat() as SerializedSongKind[]
        const filtered = relatedSongs.filter((item, pos, self) => {
            return self.findIndex(e => e.id === item.id) === pos;
        })
        this.downloadFiles(filtered, fileName)
    }
    async prepareSongDownload(song: SerializedSongKind) {
        const files = [song]
        const vsrgSongs = files.filter(s => s.type === 'vsrg') as SerializedVsrgSong[]
        //get the related ids of the audio songs
        const audioSongsId = new Set(vsrgSongs.map(s => s.audioSongId))
        for (const audioSongId of audioSongsId) {
            //if the song is already to be downloaded, don't download it again
            if (files.some(s => s.id === audioSongId)) continue
            //if the song isn't already downloaded, find it in the database
            const song = await songService.getSongById(audioSongId!) as SerializedSongKind
            //if there is a song, then download it
            if (song) files.push(song)
        }
        return files
    }
    downloadFiles(files: UnknownFileTypes[], fileName: string) {
        FileDownloader.download(JSON.stringify(files), fileName)
    }
    downloadObject(file: object, fileName: string) {
        FileDownloader.download(JSON.stringify(file), `${fileName}.json`)
    }
    async downloadBlobAsWav(urlBlob: Blob, fileName: string) {
        fileName = fileName.replace(".wav", "")
        const wav = toWav(await blobToAudio(urlBlob))
        const blob = new Blob([new DataView(wav)], {
            type: 'audio/wav'
        })
        FileDownloader.download(blob, fileName + ".wav")
    }
    downloadBlob(urlBlob: Blob, fileName: string) {
        FileDownloader.download(urlBlob, fileName)
    }
    downloadMidi(midi: Midi, fileName?: string) {
        fileName = (fileName || midi.name).replace(".mid", "")
        return FileDownloader.download(
            new Blob([midi.toArray()], { type: "audio/midi" }),
            fileName + ".mid"
        )
    }
    downloadTheme(theme: SerializedTheme, fileName?: string) {
        fileName = (fileName || `${theme.other.name}.${APP_NAME.toLowerCase()}theme`)
        this.downloadFiles([theme], fileName)
    }
    getUnknownFileExtensionAndName(file: UnknownFileTypes) {
        const type = file.type
        switch (type){
            case "vsrg":
            case "composed":
            case "recorded":
                return {
                    extension: `${APP_NAME.toLowerCase()}sheet`,
                    name: file.name
                }
            case "folder":
                return {
                    extension: `${APP_NAME.toLowerCase()}folder`,
                    name: file.name
                }
            case "theme":
                return {
                    extension: `${APP_NAME.toLowerCase()}theme`,
                    name: file.other.name
                }
            case "midi":
                return {
                    extension: "mid",
                    name: file.name
                }
            default:
                return null
        }
    }
}


export function blobToAudio(blob: Blob): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
        // @ts-ignore
        const audioContext = (new (window.AudioContext || window.webkitAudioContext)())
        const fileReader = new FileReader();
        function handleLoad() {
            audioContext.decodeAudioData(fileReader.result as ArrayBuffer, (audioBuffer) => {
                resolve(audioBuffer)
            }, reject)
        }
        fileReader.addEventListener('loadend', handleLoad, { once: true })
        fileReader.readAsArrayBuffer(blob);
    })
}
export const fileService = new FileService()