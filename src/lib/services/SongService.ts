import { SerializedSongType } from "types/SongTypes"
import { DbInstance } from "./Database"


class SongService{
    songCollection = DbInstance.collections.songs

    async getSongs(): Promise<SerializedSongType[]>{
        const songs = await (this.songCollection.find({}).toArray() as Promise<SerializedSongType[]>)
        const migrationEnsured = await this.ensureMigration(songs)
        return migrationEnsured.map(this.stripDbId)
    }

    private async ensureMigration(songs: SerializedSongType[]){
        const ensureId = songs.map(song => {
            return new Promise(async resolve => {
                if(song.id === undefined || song.id === null){
                    song.id = DbInstance.generateId()
                    await this.songCollection.update({name: song.name}, song)
                    resolve(true)
                }
                resolve(false)
            })
        })
        const changes = await Promise.all(ensureId)
        //if every song was already migrated
        if(!changes.some(change => change)) return songs
        //if some songs were not migrated
        return this.songCollection.find({}).toArray() as Promise<SerializedSongType[]>
    }

    private stripDbId(song:SerializedSongType){
        //@ts-ignore
        delete song._id
        return song
    }

    async songExists(id: string): Promise<boolean>{
        return (await this.getSongById(id)) !== null
    }
    async getSongById(id:string): Promise<SerializedSongType | null>{
        const song = await (this.songCollection.findOne({id}) as Promise<SerializedSongType>)
        if(song) return this.stripDbId(song)
        return null
    }
    async existsSong(query:any){
        return (await this.songCollection.findOne(query)) !== undefined
    }
    updateSong(id:string,data:SerializedSongType){
        return this.songCollection.update({id}, data)
    }
    async renameSong(id: string, newName: string){
        const song = await this.getSongById(id)
        if(song === null) return
        song.name = newName
        return this.updateSong(id, song)

    }
    async addSong(song:SerializedSongType){
        console.log(song)
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