import { ComposedSong, OldFormatComposed, UnknownSerializedComposedSong } from "$lib/Songs/ComposedSong"
import { OldFormatRecorded, RecordedSong, UnknownSerializedRecordedSong } from "$lib/Songs/RecordedSong"
import { FileDownloader } from "$lib/Utilities"
import { songsStore } from "$stores/SongsStore"
import toWav from 'audiobuffer-to-wav'
import { SerializedSong, Song } from "$lib/Songs/Song"
import { Midi } from "@tonejs/midi"
import { SerializedTheme, ThemeStore } from "$/stores/ThemeStore/ThemeProvider"
import { songService } from "./SongService"
import { Folder, SerializedFolder } from "../Folder"
import { folderStore } from "$/stores/FoldersStore"
import { VsrgSong } from "../Songs/VsrgSong"
import { themeStore } from "$/stores/ThemeStore/ThemeStore"
export type UnknownSong = UnknownSerializedComposedSong | UnknownSerializedRecordedSong | SerializedSong
type UnknownFileTypes = UnknownSong | OldFormatComposed | OldFormatRecorded | SerializedFolder | SerializedTheme
type UnknownFile = UnknownFileTypes | UnknownFileTypes[]
export type UnknownSongImport = UnknownSong | UnknownSong[]


type ImportResult<T> = {
    ok: boolean
    errors: Partial<T>[]
    successful: T[]
}
export enum FileKind {
    Song = 'song',
    Folder = 'folder',
    Theme = 'theme'
}
export class FileService {
    async addSongs(file: UnknownSongImport): Promise<ImportResult<UnknownSong>> {
        const data = Array.isArray(file) ? file : [file]
        const successful: UnknownSong[] = []
        const errors: UnknownSong[] = []
        for (const song of data) {
            try {
                const parsed = songService.parseSong(song)
                await songsStore.addSong(parsed)
                successful.push(parsed)
            } catch (e) {
                errors.push(song)
                console.error(e)
            }
        }
        return {
            ok: errors.length === 0,
            errors,
            successful
        }
    }

    async importUnknownFile(unknownFile: UnknownFile): Promise<ImportResult<UnknownFileTypes>> {
        const result: ImportResult<UnknownFileTypes> = {
            ok: false,
            errors: [],
            successful: []
        }
        const fileArray = Array.isArray(unknownFile) ? unknownFile : [unknownFile]
        for (const file of fileArray) {
            const type = FileService.getSerializedObjectType(file)
            if (type === FileKind.Song) {
                try {
                    const song = songService.parseSong(file)
                    await songsStore.addSong(song)
                    result.successful.push(file)
                } catch (e) {
                    result.errors.push(file)
                    console.error(e)
                }
            }
            if (type === FileKind.Folder) {
                try {
                    await folderStore.addFolder(Folder.deserialize(file as SerializedFolder))
                    result.successful.push(file)
                } catch (e) {
                    result.errors.push(file)
                    console.error(e)
                }
            }
            if (type === FileKind.Theme) {
                try {
                    await themeStore.addTheme(file as SerializedTheme)
                    result.successful.push(file)
                } catch (e) {
                    result.errors.push(file)
                    console.error(e)
                }
            }
        }
        result.ok = result.errors.length === 0
        return result
    }

    static getSerializedObjectType(file: UnknownFileTypes | any): FileKind | null {
        try {
            if (
                RecordedSong.isSerializedType(file) ||
                ComposedSong.isSerializedType(file) ||
                VsrgSong.isSerializedType(file)
            ) return FileKind.Song
            if (Folder.isSerializedType(file)) return FileKind.Folder
            if (ThemeStore.isSerializedType(file)) return FileKind.Theme
        } catch (e) {
            console.log(e)
        }
        return null
    }

    downloadSong(songs: UnknownSong[] | UnknownSong, fileName: string) {
        fileName = fileName.replace(".json", "")
        if (Array.isArray(songs)) {
            songs = songs.map(song => Song.stripMetadata(song))
            FileDownloader.download(JSON.stringify(songs), `${fileName}.json`)
        } else {
            songs = Song.stripMetadata(songs)
            FileDownloader.download(JSON.stringify([songs]), `${fileName}.json`)
        }
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
        fileName = (fileName || `${theme.other.name}.theme`).replace(".json", "")
        FileDownloader.download(JSON.stringify(theme), fileName + ".json")
    }
}


export function blobToAudio(blob: Blob): Promise<AudioBuffer> {
    return new Promise(resolve => {
        const audioContext = new AudioContext();
        const fileReader = new FileReader();
        function handleLoad() {
            audioContext.decodeAudioData(fileReader.result as ArrayBuffer, (audioBuffer) => {
                resolve(audioBuffer)
            })
        }
        fileReader.addEventListener('loadend', handleLoad, { once: true })
        fileReader.readAsArrayBuffer(blob);
    })
}
export const fileService = new FileService()