import { Query } from "$lib/Services/Database/Collection";
import { _themeService } from "$lib/Services/ThemeService";
import { makeObservable, observable } from "mobx";
import { SerializedTheme } from "./ThemeProvider";




export class ThemeStore{
    @observable.shallow
    themes: SerializedTheme[] = []

    constructor(){
        makeObservable(this)
    }
    async sync(){
        const themes = await _themeService.getThemes()
        this.themes.splice(0, this.themes.length, ...themes)
    }

    async addTheme(theme: SerializedTheme) {
        const id = await _themeService.addTheme(theme)
        await this.sync()
        return id
    }
    async updateTheme(id: string, data: SerializedTheme) {
        await _themeService.updateTheme(id, data)
        await this.sync()
    }
    async removeTheme(query: Query<SerializedTheme>) {
        await _themeService.removeTheme(query)
        await this.sync()
        
    }
    async removeThemeById(id: string) {
        await _themeService.removeThemeById(id)
        await this.sync()
    }
    async _DANGEROUS_CLEAR_ALL_THEMES(){
        await _themeService._clearAll()
        await this.sync()
    }
    getCurrentThemeId() {
        return _themeService.getCurrentThemeId()
    }
    setCurrentThemeId(id: string | null) {
        return _themeService.setCurrentThemeId(id)
    }
} 

export const themeStore = new ThemeStore()
