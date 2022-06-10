import { SerializedSong } from "./Songs/Song"


export interface SerializedFolder {
    id: string | null
    name: string
}

export class Folder{
    id:string | null
    name:string
    songs: SerializedSong[]
    constructor(name:string,id?: string | null ,songs?:SerializedSong[]){
        this.id = id || null
        this.name = name
        this.songs = songs ?? []
    }

    addSong(song:SerializedSong){
        this.songs.push(song)
    }
    static deserialize(data: SerializedFolder){
        return new Folder(data.name,data.id)
    }
    serialize = (): SerializedFolder => {
        return {
            id: this.id,
            name: this.name
        }
    }
}