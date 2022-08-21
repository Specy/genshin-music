import { Query } from "$/lib/Services/Database/Collection";
import { themeService } from "$/lib/Services/ThemeService";
import { makeObservable, observable } from "mobx";
import { SerializedTheme } from "./ThemeProvider";




export class ThemeStore{
    @observable.shallow
    themes: SerializedTheme[] = []

    constructor(){
        makeObservable(this)
        this.sync()
    }
    async sync(){
        const themes = await themeService.getThemes()
        this.themes.splice(0, this.themes.length, ...themes)
    }

    async addTheme(theme: SerializedTheme) {
        const id = await themeService.addTheme(theme)
        await this.sync()
        return id
    }
    async updateTheme(id: string, data: SerializedTheme) {
        await themeService.updateTheme(id, data)
        await this.sync()
    }
    async removeTheme(query: Query<SerializedTheme>) {
        await themeService.removeTheme(query)
        await this.sync()
        
    }
    async removeThemeById(id: string) {
        await themeService.removeThemeById(id)
        await this.sync()
    }
    getCurrentThemeId() {
        return themeService.getCurrentThemeId()
    }
    setCurrentThemeId(id: string) {
        return themeService.setCurrentThemeId(id)
    }
} 



export const themeStore = new ThemeStore()
