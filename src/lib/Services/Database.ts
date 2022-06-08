import ZangoDb from "zangodb"
import { APP_NAME } from "appConfig"

class DB{
    instance: ZangoDb.Db
    collections: {
        songs:ZangoDb.Collection,
        themes:ZangoDb.Collection
    }
    constructor(){
        //@ts-ignore
        this.instance = new ZangoDb.Db(APP_NAME,2, { songs: [], themes: [] })
        this.collections = {
            songs: this.instance.collection("songs"),
            themes: this.instance.collection("themes")
        }
    }
    generateId = () => {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
                .toString(16) 
                .substring(1)
        }
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4()
    }
}
const DbInstance = new DB()
export {
    DB, 
    DbInstance
}