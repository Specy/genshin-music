import { Folder } from "lib/Folder";
import { folderService } from "lib/Services/FolderService";

import { makeObservable, observable } from "mobx";
import { songsStore } from "./SongsStore";


export class FolderStore{
    @observable.shallow folders: Folder[] = []
    constructor(){
        makeObservable(this)
    }
    sync = async () => {
        const folders = await folderService.getFolders()
        this.folders.splice(0,this.folders.length, ...(folders.map(folder => Folder.deserialize(folder))))
    }
    createFolder = async (name: string) => {
        if(name === "_None") name = "None"
        const folder = new Folder(name)
        await folderService.addFolder(folder.serialize())
        this.sync()
    }
    removeFolder = async (folder: Folder) => {
        await folderService.removeFolder(folder.id!)
        this.sync()
        songsStore.clearSongsInFolder(folder.id!)
    }
    renameFolder = async (folder: Folder, name: string) => {
        folder.name = name || "Unnamed"
        await folderService.updateFolder(folder.id!, folder.serialize())
        this.sync()
    }
}
export const folderStore = new FolderStore()
folderStore.sync()

