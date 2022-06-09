import { Folder } from "lib/Folder"
import { DbInstance } from "./Database"


class FolderService{
    foldersCollection = DbInstance.collections.folders
    async getFolders():Promise<Folder[]>{
        return this.foldersCollection.findOne({}) as Promise<Folder[]>
    }
    async addFolder(data: Folder) : Promise<string>{
        const id = DbInstance.generateId()
        data.id = id
        await this.foldersCollection.insert({data})
        return id
    }
    updateFolder(id:string,data:Folder){
        this.foldersCollection.update({id},data)
    }
    removeFolder(id: string){
        this.foldersCollection.remove({id})

    }

}

const folderService = new FolderService()

export {
    folderService
}