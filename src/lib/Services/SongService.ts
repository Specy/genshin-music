import { SerializedSong, Song } from "lib/Songs/Song"
import { DbInstance } from "./Database/Database"

class SongService{
    songCollection = DbInstance.collections.songs
    async getSongs(): Promise<SerializedSong[]>{
        const songs = await this.songCollection.find({})
        const migrationEnsured = await this.ensureMigration(songs)
        return migrationEnsured.map(this.stripDbId)
    }

    private async ensureMigration(songs: SerializedSong[]){
        const migratedId = songs.map(song => {
            return new Promise(async resolve => {
                let hasChanges = false
                if(song.id === undefined || song.id === null){
                    song.id = DbInstance.generateId()
                    song.type = Song.getSongType(song)!
                    song.folderId = null
                    await this.songCollection.update({name: song.name}, song)
                    hasChanges = true
                } 
                resolve(hasChanges)
            })
        })
        const changes = await Promise.all(migratedId)
        //if every song was already migrated
        if(!changes.some(change => change)) return songs
        //if some songs were not migrated
        return this.songCollection.find({})
    }

    private stripDbId(song:SerializedSong){
        //@ts-ignore
        delete song._id
        return song
    }

    async songExists(id: string): Promise<boolean>{
        return (await this.getSongById(id)) !== null
    }
    async getSongById(id:string): Promise<SerializedSong | null>{
        const song = await this.songCollection.findOne({id})
        if(song) return this.stripDbId(song)
        return null
    }
    async existsSong(query:Partial<SerializedSong>){
        return (await this.songCollection.findOne(query)) !== undefined
    }
    updateSong(id:string,data:SerializedSong){
        return this.songCollection.update({id}, data)
    }
    async renameSong(id: string, newName: string){
        const song = await this.getSongById(id)
        if(song === null) return
        song.name = newName
        return this.updateSong(id, song)
    }
    async addSong(song:SerializedSong){
        const id = DbInstance.generateId()
        song.id = id
        await this.songCollection.insert(song)
        return id
    }

    _clearAll(){
        return this.songCollection.remove({})
    }
    removeSong(id: string){
        return this.songCollection.remove({id})
    }
}

const songService = new SongService()

export {
    songService
}