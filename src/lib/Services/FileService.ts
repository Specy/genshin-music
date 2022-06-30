import { OldFormatComposed, UnknownSerializedComposedSong } from "lib/Songs/ComposedSong"
import { OldFormatRecorded, UnknownSerializedRecordedSong } from "lib/Songs/RecordedSong"
import { FileDownloader, parseSong } from "lib/Tools"
import { songsStore } from "stores/SongsStore"
//@ts-ignore
import toWav from 'audiobuffer-to-wav'
import { SerializedSong, Song } from "lib/Songs/Song"
import { Midi } from "@tonejs/midi"
import { Theme } from "stores/ThemeStore"
type UnknownSong = UnknownSerializedComposedSong | UnknownSerializedRecordedSong | SerializedSong
type UnknownFileTypes = UnknownSong | OldFormatComposed | OldFormatRecorded
type UnknownFile = UnknownFileTypes | UnknownFileTypes[]
export type UnknownSongImport = UnknownSong | UnknownSong[]


type ImportResult<T> = {
    ok: boolean
    errors: Partial<T>[]
    successful: T[]
}
class FileService {
    test?: UnknownFile
    async addSongs(file: UnknownSongImport) : Promise<ImportResult<UnknownSong>> {
        const data = Array.isArray(file) ? file : [file]
        const successful: UnknownSong[] = []
        const errors: UnknownSong[] = []
        for (const song of data) {
            try {
                const parsed = parseSong(song)
                await songsStore.addSong(parsed)
                successful.push(song)
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
    downloadSong(songs: UnknownSong[] | UnknownSong, fileName: string) {
        fileName = fileName.replace(".json", "")
        if(Array.isArray(songs)) {
            songs = songs.map(song => Song.stripMetadata(song))
            FileDownloader.download(JSON.stringify(songs), `${fileName}.json`)
        }else{
            songs = Song.stripMetadata(songs)
            FileDownloader.download(JSON.stringify([songs]), `${fileName}.json`)
        }
    }
    async downloadBlobAsWav(urlBlob:Blob, fileName:string){
        fileName = fileName.replace(".wav", "")
        const wav = toWav(await blobToAudio(urlBlob))
        const blob = new Blob([new DataView(wav)], {
            type: 'audio/wav'
        })
        FileDownloader.download(blob, fileName + ".wav")
    }
    downloadBlob(urlBlob:Blob, fileName:string){
        FileDownloader.download(urlBlob, fileName)
    }
    downloadMidi(midi:Midi, fileName?:string){
        fileName = (fileName || midi.name).replace(".mid", "")
        return FileDownloader.download(
            new Blob([midi.toArray()], { type: "audio/midi" }),
            fileName + ".mid"
        )
    }
    downloadTheme(theme:Theme, fileName?:string){
        fileName = (fileName || `${theme.other.name}.theme`).replace(".json", "")
        FileDownloader.download(JSON.stringify(theme), fileName + ".json")
    }
}


export function blobToAudio(blob:Blob): Promise<AudioBuffer> {
    return new Promise(resolve => {
        const audioContext = new AudioContext();
        const fileReader = new FileReader();
        function handleLoad(){
            audioContext.decodeAudioData(fileReader.result as ArrayBuffer, (audioBuffer) => {
                resolve(audioBuffer)
            })
        }
        fileReader.addEventListener('loadend',handleLoad, {once: true})
        fileReader.readAsArrayBuffer(blob);
    })
}
export const fileService = new FileService()