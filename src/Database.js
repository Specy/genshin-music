import ZangoDb from "zangodb"
import { appName } from "appConfig"
class Database{
    db = new ZangoDb.Db(appName, { songs: [] })
    constructor(){
        this.collections = {
            songs: this.db.collection("songs")
        }
    }
    async getSongs(){
        return await this.collections.songs.find().toArray()
    }
    async getSongById(id){
        return await this.collections.songs.findOne({_id: id})
    }
    async existsSong(query){
        return await this.collections.songs.findOne(query) !== undefined
    }
    async updateSong(query,data){
        return this.collections.songs.update(query, data)
    }
    addSong(song){
        return this.collections.songs.insert(song)
    }
    removeSong(query){
        return this.collections.songs.remove(query)
    }
}

const DB = new Database()
DB.getSongs()
export {
    Database,
    DB
}