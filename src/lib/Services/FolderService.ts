import { SerializedFolder } from "$lib/Folder"
import { DbInstance } from "./Database/Database"


class FolderService{
    foldersCollection = DbInstance.collections.folders
    async getFolders():Promise<SerializedFolder[]>{
        const folders = await this.foldersCollection.find({})
        folders.forEach(folder => {
            //@ts-ignore
            delete folder._id
        })
        return folders
    }
    async addFolder(data: SerializedFolder) : Promise<string>{
        const id = DbInstance.generateId()
        data.id = id
        await this.foldersCollection.insert(data)
        return id
    }
    updateFolder(id:string,data:SerializedFolder){
        return this.foldersCollection.updateById(id,data)
    }
    removeFolder(id: string){
        return this.foldersCollection.removeById(id)
    }
}

export const _folderService = new FolderService()
