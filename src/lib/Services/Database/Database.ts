import ZangoDb from "@insertish/zangodb"
import {APP_NAME, IS_TAURI} from "$config"
import {Collection, TauriCollection, ZangoCollection} from "./Collection"
import {SerializedSong} from "$lib/Songs/Song"
import {SerializedTheme} from "$stores/ThemeStore/ThemeProvider"
import {SerializedFolder} from "$lib/Folder"

class DB {
    private instance: ZangoDb.Db
    collections: {
        songs: Collection<SerializedSong>,
        themes: Collection<SerializedTheme>,
        folders: Collection<SerializedFolder>,
    }

    constructor() {
        //@ts-ignore
        this.instance = new ZangoDb.Db(APP_NAME, 3, {songs: [], themes: [], folders: []})
        if (IS_TAURI) {
            this.collections = {
                songs: new TauriCollection<SerializedSong>('songs'),
                themes: new TauriCollection<SerializedTheme>('themes'),
                folders: new TauriCollection<SerializedFolder>('folders'),
            }
        } else {
            this.collections = {
                songs: new ZangoCollection<SerializedSong>(this.instance.collection("songs")),
                themes: new ZangoCollection<SerializedTheme>(this.instance.collection("themes")),
                folders: new ZangoCollection<SerializedFolder>(this.instance.collection("folders")),
            }
        }
    }

    generateId() {
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