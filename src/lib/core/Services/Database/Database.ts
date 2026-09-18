import ZangoDb from "@insertish/zangodb"
import {APP_NAME} from "$core/legacyConfig"
import {type Collection, ZangoCollection} from "./Collection"
import type {SerializedSong} from "../../Songs/Song.svelte"
import type {SerializedTheme} from "../../theme/ThemeProvider.svelte"
import type {SerializedFolder} from "../../Folder"
import type {AppLanguage, AppI18N} from "$i18n/i18n"

// $i18n/i18nCache's own SerializedLocale (same field shape) isn't imported here directly: it
// would import DbInstance from this file for I18nCacheInstance, and this file importing
// i18nCache.ts's type back would round-trip the module graph through it. Importing AppLanguage/
// AppI18N straight from $i18n/i18n (which has no dependency on Database.ts) avoids that - and
// since this is a type-only import, verbatimModuleSyntax erases it at emit time regardless, so
// there's no runtime cycle either way. The core -> lib/i18n type dependency this creates is
// acceptable (types only, erased at build time; core stays runtime-independent of lib/i18n).
type SerializedLocale = {
    id: AppLanguage,
    version: number,
    locale: AppI18N
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