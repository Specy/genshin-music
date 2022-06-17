import { OldFormatComposed, UnknownSerializedComposedSong } from "lib/Songs/ComposedSong"
import { OldFormatRecorded, UnknownSerializedRecordedSong } from "lib/Songs/RecordedSong"
import { parseSong } from "lib/Tools"
import { songsStore } from "stores/SongsStore"

type UnknownSong = UnknownSerializedComposedSong | UnknownSerializedRecordedSong
type UnknownFileTypes = UnknownSong | OldFormatComposed | OldFormatRecorded
type UnknownFile = UnknownFileTypes | UnknownFileTypes[]
export type UnknownSongImport = UnknownSong | UnknownSong[]


type ImportResult<T> = {
    ok: boolean
    errors: Partial<T>[]
    successful: T[]
}
class FileService {
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
}

export const fileService = new FileService()