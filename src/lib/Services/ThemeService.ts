import { APP_NAME } from "$/appConfig"
import { SerializedTheme } from "$/stores/ThemeStore/ThemeProvider"
import { Query } from "./Database/Collection"
import { DbInstance } from "./Database/Database"


class ThemeService {
    themeCollection = DbInstance.collections.themes
    async getTheme(id: string): Promise<SerializedTheme | null> {
        const theme = await this.themeCollection.findOneById(id)
        if (theme) {
            //@ts-ignore
            const legacyId = theme.other.id
            theme.type = 'theme'
            theme.id = (theme.id || legacyId) ?? null
            //@ts-ignore
            delete theme._id
        }
        return theme
    }
    async getThemes(): Promise<SerializedTheme[]> {
        const themes = await this.themeCollection.find({})
        //legacy format
        themes.forEach(theme => {
            //@ts-ignore
            const legacyId = theme.other.id
            theme.type = 'theme'
            theme.id = (theme.id || legacyId) ?? null
            //@ts-ignore
            delete theme._id
        })
        return themes
    }
    async addTheme(theme: SerializedTheme) {
        const id = DbInstance.generateId()
        theme.id = id
        await this.themeCollection.insert(theme)
        return id
    }
    updateTheme(id: string, data: SerializedTheme) {
        data.id = id
        return this.themeCollection.updateById(id, data)
    }
    removeTheme(query: Query<SerializedTheme>) {
        return this.themeCollection.remove(query)
    }
    removeThemeById(id: string) {
        return this.themeCollection.removeById(id)
    }
    getCurrentThemeId() {
        return localStorage.getItem(APP_NAME + '_Theme')
    }
    setCurrentThemeId(id: string | null) {
        localStorage.setItem(APP_NAME + '_Theme', id ?? '')
    }
}

export const _themeService = new ThemeService()
