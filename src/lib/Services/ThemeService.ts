import { APP_NAME } from "appConfig"
import { Theme } from "stores/ThemeStore"
import { DbInstance } from "./Database/Database"


class ThemeService{
    themeCollection = DbInstance.collections.themes
    async getTheme(id:string):Promise<Theme|null>{
        const theme = await this.themeCollection.findOne({id})
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
        return this.themeCollection.update({id},{id, ...data})
    }
    removeTheme(query:any){
        return this.themeCollection.remove(query)
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