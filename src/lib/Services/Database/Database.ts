import ZangoDb from "@insertish/zangodb"
import {APP_NAME, IS_TAURI} from "$config"
import {Collection, TauriCollection, ZangoCollection} from "./Collection"
import {SerializedSong} from "$lib/Songs/Song"
import {SerializedTheme} from "$stores/ThemeStore/ThemeProvider"
import {SerializedFolder} from "$lib/Folder"
import {SerializedLocale} from "$i18n/i18nCache";

class DB {
    private instance: ZangoDb.Db
    collections: {
        songs: Collection<SerializedSong>,
        themes: Collection<SerializedTheme>,
        folders: Collection<SerializedFolder>,
        translation: Collection<SerializedLocale>
    }

    constructor() {
        //@ts-ignore
        this.instance = new ZangoDb.Db(APP_NAME, 4, {
            songs: [],
            themes: [],
            folders: [],
            translation: []
        })
        if (IS_TAURI) {
            this.collections = {
                songs: new TauriCollection<SerializedSong>('songs'),
                themes: new TauriCollection<SerializedTheme>('themes'),
                folders: new TauriCollection<SerializedFolder>('folders'),
                translation: new TauriCollection<SerializedLocale>('translation')
            }
        } else {
            this.collections = {
                songs: new ZangoCollection<SerializedSong>(this.instance.collection("songs")),
                themes: new ZangoCollection<SerializedTheme>(this.instance.collection("themes")),
                folders: new ZangoCollection<SerializedFolder>(this.instance.collection("folders")),
                translation: new ZangoCollection<SerializedLocale>(this.instance.collection("translation"))
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