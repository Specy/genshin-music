import {FOLDER_FILTER_TYPES} from "$config"
import {SongStorable} from "./Songs/Song"


export type FolderFilterType = typeof FOLDER_FILTER_TYPES[number]

export interface SerializedFolder {
    type: 'folder'
    id: string | null
    name: string
    filterType: FolderFilterType
}

export class Folder {
    id: string | null
    name: string
    songs: SongStorable[]
    filterType: FolderFilterType

    constructor(name?: string, id?: string | null, songs?: SongStorable[]) {
        this.id = id ?? null
        this.name = name || "Unnamed folder"
        this.songs = songs ?? []
        this.filterType = "date-created"
    }

    addSong(song: SongStorable) {
        this.songs.push(song)
    }

    static deserialize(data: Partial<SerializedFolder>) {
        const folder = new Folder(data?.name, data.id)
        folder.filterType = data?.filterType ?? "date-created"
        return folder
    }

    static isSerializedType(obj: any) {
        return obj?.type === 'folder'
    }

    serialize = (): SerializedFolder => {
        return {
            type: 'folder',
            id: this.id,
            name: this.name,
            filterType: this.filterType
        }
    }
    clone = () => {
        const folder = new Folder(this.name, this.id)
        folder.songs = [...this.songs]
        folder.filterType = this.filterType
        return folder
    }
    set = (data: Partial<SerializedFolder>) => {
        Object.assign(this, data)
    }
}