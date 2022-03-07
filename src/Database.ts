import ZangoDb from "zangodb"
import { APP_NAME } from "appConfig"
import { Theme } from "stores/ThemeStore"
import { SerializedSongType } from "types/SongTypes"

function generateId(){
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16) 
            .substring(1)
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4()
}

class Database{
    db: ZangoDb.Db
    collections:{
        songs:ZangoDb.Collection,
        themes:ZangoDb.Collection
    }
    constructor(){
        //@ts-ignore
        this.db = new ZangoDb.Db(APP_NAME,2, { songs: [], themes: [] })
        this.collections = {
            songs: this.db.collection("songs"),
            themes: this.db.collection("themes")
        }
    }
    getSongs(): Promise<SerializedSongType[]>{
        return this.collections.songs.find({}).toArray() as Promise<SerializedSongType[]>
    }
    getSongById(id:string): Promise<SerializedSongType>{
        return this.collections.songs.findOne({_id: id}) as Promise<SerializedSongType>
    }
    async existsSong(query:any){
        return (await this.collections.songs.findOne(query)) !== undefined
    }
    updateSong(query:any,data:any){
        return this.collections.songs.update(query, data)
    }
    addSong(song:SerializedSongType){
        return this.collections.songs.insert(song)
    }
    removeSong(query:any){
        return this.collections.songs.remove(query)
    }
    async getTheme(id:string):Promise<Theme|null>{
        const theme = await this.collections.themes.findOne({id}) as Theme
        if(theme){
            //@ts-ignore
            delete theme.id
            //@ts-ignore
            delete theme._id
        }
        return theme
    }
    async getThemes(): Promise<Theme[]>{
        const themes = (await this.collections.themes.find({}).toArray()) as Theme[]
        themes.forEach(theme => {
            //@ts-ignore
            delete theme.id
            //@ts-ignore
            delete theme._id
        })
        return themes
    }
    async addTheme(theme:Theme){
        const id = generateId()
        theme.other.id = id
        await this.collections.themes.insert({...theme, id })
        return id
    }
    updateTheme(id:string,data:Theme){
        return this.collections.themes.update({id},data)
    }
    removeTheme(query:any){
        return this.collections.themes.remove(query)
    }
}

const DB = new Database()
export {
    Database,
    DB
}