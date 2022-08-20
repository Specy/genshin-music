import { APP_NAME } from "@/appConfig"
import { Theme } from "$stores/ThemeStore"
import { Query } from "./Database/Collection"
import { DbInstance } from "./Database/Database"


class ThemeService{
    themeCollection = DbInstance.collections.themes
    async getTheme(id:string):Promise<Theme|null>{
        const theme = await this.themeCollection.findOneById(id)
        if(theme){
            //@ts-ignore
            delete theme.id
            //@ts-ignore
            delete theme._id
        }
        return theme
    }
    async getThemes(): Promise<Theme[]>{
        const themes = await this.themeCollection.find({})
        themes.forEach(theme => {
            //@ts-ignore
            delete theme.id
            //@ts-ignore
            delete theme._id
        })
        return themes
    }
    async addTheme(theme:Theme){
        const id = DbInstance.generateId()
        theme.other.id = id
        await this.themeCollection.insert({...theme, id })
        return id
    }
    updateTheme(id:string,data:Theme){
        return this.themeCollection.updateById(id,{...data, id})
    }
    removeTheme(query: Query<Theme>){
        return this.themeCollection.remove(query)
    }
    removeThemeById(id:string){
        return this.themeCollection.removeById(id)
    }
    getCurrentThemeId(){
        return localStorage.getItem(APP_NAME + '_Theme')
    }
    setCurrentThemeId(id: string){
        localStorage.setItem(APP_NAME + '_Theme', id)
    }
}

const themeService = new ThemeService()

export {
    themeService
}