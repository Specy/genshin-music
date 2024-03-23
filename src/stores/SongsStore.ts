import {createDebouncer} from "$lib/Utilities"
import {songService} from "$lib/Services/SongService"
import {extractStorable, SerializedSong, Song, SongStorable} from "$lib/Songs/Song"
import {makeObservable, observable} from "mobx"


export class SongsStore {
    @observable.shallow songs: SongStorable[] = []
    debouncer = createDebouncer(10)

    constructor() {
        makeObservable(this)
    }

    sync = async () => {
        //debounces syncing to prevent multiple syncs in a short period of time
        this.debouncer(async () => {
            const songs = await songService.getStorableSongs()
            this.songs.splice(0, this.songs.length, ...songs)
        })
    }
    _DANGEROUS_CLEAR_ALL_SONGS = async () => {
        await songService._clearAll()
        this.sync()
    }
    removeSong = async (id: string) => {
        await songService.removeSong(id)
        this.sync()
    }
    addSong = async (song: Song) => {
        const result = await songService.addSong(song.serialize())
        this.sync()
        return result
    }
    renameSong = async (id: string, name: string) => {
        await songService.renameSong(id, name)
        this.sync()
    }
    updateSong = async (song: Song) => {
        /*TODO this method causes syncing frequently with the composer auto save, it might be useful
        to only fetch from db every few times, maybe with a parameter, as to reduce the amount of db calls for syncing.
        while also possible to store the song in the current memory, but could cause issues of the song being out of sync with the db
        */
        const serialized = song.serialize()
        await songService.updateSong(song.id!, serialized)
        const index = this.songs.findIndex(s => s.id === song.id)
        if (index !== -1) {
            this.songs[index] = extractStorable(serialized)
        } else {
            this.sync()
        }
    }
    getSongById = async (id: string | null) => {
        if (id === null) return null
        return await songService.getSongById(id)
    }
    addSongToFolder = async (song: SerializedSong, folderId: string | null) => {
        song.folderId = folderId
        await songService.updateSong(song.id!, song)
        this.sync()
    }
    clearSongsInFolder = async (folderId: string) => {
        const storedSongs = this.songs.filter(song => song.folderId === folderId)
        const songs = await songService.getManySerializedFromStorable(storedSongs)
        for (const song of songs) {
            if (song != null) {
                song.folderId = null
                await songService.updateSong(song.id!, song)
            }
        }
        this.sync()
    }
}

export const songsStore = new SongsStore()

