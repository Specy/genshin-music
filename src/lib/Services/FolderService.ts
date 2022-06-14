import { SerializedFolder } from "lib/Folder"
import { DbInstance } from "./Database"


class FolderService{
    foldersCollection = DbInstance.collections.folders
    async getFolders():Promise<SerializedFolder[]>{
        return this.foldersCollection.find({}).toArray() as Promise<SerializedFolder[]>
    }
    async addFolder(data: SerializedFolder) : Promise<string>{
        const id = DbInstance.generateId()
        data.id = id
        await this.foldersCollection.insert(data)
        return id
    }
    updateFolder(id:string,data:SerializedFolder){
        return this.foldersCollection.update({id},data)
    }
    removeFolder(id: string){
        return this.foldersCollection.remove({id})
    }
}

const folderService = new FolderService()

export {
    folderService
}