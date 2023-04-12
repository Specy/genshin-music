import { Folder } from "$lib/Folder";
import { _folderService } from "$lib/Services/FolderService";

import { makeObservable, observable } from "mobx";
import { songsStore } from "./SongsStore";


export class FolderStore {
    @observable.shallow folders: Folder[] = []
    constructor() {
        makeObservable(this)
    }
    sync = async () => {
        const folders = await _folderService.getFolders()
        this.folders.splice(0, this.folders.length, ...(folders.map(folder => Folder.deserialize(folder))))
    }
    createFolder = async (name: string) => {
        if (name === "_None") name = "None"
        const folder = new Folder(name)
        await _folderService.addFolder(folder.serialize())
        this.sync()
    }
    removeFolder = async (folder: Folder) => {
        await _folderService.removeFolder(folder.id!)
        this.sync()
        songsStore.clearSongsInFolder(folder.id!)
    }
    addFolder = async (folder: Folder) => {
        const id = await _folderService.addFolder(folder.serialize())
        this.sync()
        return id
    }
    renameFolder = async (folder: Folder, name: string) => {
        folder.name = name || "Unnamed"
        await _folderService.updateFolder(folder.id!, folder.serialize())
        this.sync()
    }
    updateFolder = async (folder: Folder) => {
        await _folderService.updateFolder(folder.id!, folder.serialize())
        this.sync()
    }
    _DANGEROUS_CLEAR_ALL_FOLDERS = async () => {
        await _folderService._deleteAllFolders()
        this.sync()
    }
}
export const folderStore = new FolderStore()

