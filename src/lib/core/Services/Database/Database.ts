import ZangoDb from "@insertish/zangodb"
import {APP_NAME} from "$core/legacyConfig"
import {type Collection, ZangoCollection} from "./Collection"
import type {SerializedSong} from "../../Songs/Song"
import type {SerializedTheme} from "../../theme/ThemeProvider"
import type {SerializedFolder} from "../../Folder"

// $i18n/i18nCache's SerializedLocale, declared locally: i18n scaffolding ($i18n/i18n ->
// AppLanguage, AppI18N) is out of scope for this phase and doesn't exist in this tree yet.
// Field shape copied verbatim from old i18nCache.ts; narrow id/locale back to the real i18n
// types once $i18n/i18n is ported.
type SerializedLocale = {
    id: string,
    version: number,
    locale: unknown
}

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
        this.collections = {
            songs: new ZangoCollection<SerializedSong>(this.instance.collection("songs")),
            themes: new ZangoCollection<SerializedTheme>(this.instance.collection("themes")),
            folders: new ZangoCollection<SerializedFolder>(this.instance.collection("folders")),
            translation: new ZangoCollection<SerializedLocale>(this.instance.collection("translation"))
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