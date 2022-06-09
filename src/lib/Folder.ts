import { SerializedSongType } from "types/SongTypes"
import { folderService } from "./Services/FolderService"




export class Folder{
    id:string | null
    name:string
    songs: SerializedSongType[]
    constructor(name:string,id?: string | null ,songs?:SerializedSongType[]){
        this.id = id || null
        this.name = name
        this.songs = songs ?? []
    }

    addSong(song:SerializedSongType){
        this.songs.push(song)
    }
    static async create(name:string){
        const folder = new Folder(name)
        const id = await folderService.addFolder(folder)
        folder.id = id
        return folder
    }

}