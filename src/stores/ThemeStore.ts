import { observable } from "mobx";
import { ThemeSettings } from 'lib/BaseSettings'
import { appName, BASE_THEME_CONFIG } from 'appConfig'
// @ts-ignore
import cloneDeep from 'lodash.clonedeep'
import Color from 'color'
import { FileDownloader } from 'lib/Utils'
import LoggerStore from 'stores/LoggerStore'
import { DB } from "Database";

export type ThemeKeys = keyof typeof ThemeSettings.data
export type ThemeProp = {
    name: ThemeKeys
    value: string,
    css: string,
    text: string
} 
export type ThemeConfig = { [key in ThemeKeys]: ThemeProp }
export type BackgroundProps = 'Composer' | 'Main'
export type OtherKeys = keyof typeof ThemeSettings.other
export interface Theme {
    data: ThemeConfig,
    other: {
        [key in OtherKeys]: string
    }
}

export class BaseTheme{
    state: Theme
    constructor(name:string){
        this.state = cloneDeep(ThemeSettings as Theme)
        this.state.other.name = name
    }
    toJson = () => {
        return JSON.stringify(this.state)
    }
    toObject = ():Theme => {
        return cloneDeep(this.state)
    }
}

class ThemeStoreClass {
    state: Theme
    baseTheme: Theme
    constructor(baseTheme: Theme) {
        this.baseTheme = cloneDeep(baseTheme)
        this.state = observable(cloneDeep(baseTheme))
        this.load()
    }
    load = async () => {
        try {
            const themeId = localStorage.getItem(appName + '_Theme')
            if(themeId !== null){
                const theme = await DB.getTheme({id: themeId})
                this.loadFromTheme(theme)
            }
        } catch (e) {
            console.error(e)
        }
    }
    get = (prop: ThemeKeys) => {
        return Color(this.state.data[prop].value)
    }
    getText = (prop: ThemeKeys) => {
        return Color(this.state.data[prop].text)
    }
    getOther = (prop: OtherKeys) => {
        return this.state.other[prop]
    }
    getValue = (prop: ThemeKeys) => {
        return this.state.data[prop].value
    }
    toArray = ():ThemeProp[] => {
        return Object.values(this.state.data)
    }
    reset = (prop: ThemeKeys) => {
        this.state.data[prop] = { ...this.baseTheme.data[prop] }
        this.save()
    }
    download = (fileName?: string) => {
        new FileDownloader().download(this.toJson(), `${fileName || `${appName}_Theme`}.json`)
    }
    layer = (prop: ThemeKeys, amount: number, threshold?: number) => {
        const value = this.get(prop)
        if (threshold) {
            return value.luminosity() < threshold ? value.darken(amount) : value.lighten(amount)
        } else {
            return value.isDark() ? value.lighten(amount * 1.1) : value.darken(amount)
        }
    }
    toJson = () => {
        return JSON.stringify(this.state)
    }
    setBackground = (url: string, type: 'Composer' | 'Main') => {
        //@ts-ignore
        this.setOther(('backgroundImage' + type), url)
    }
    loadFromJson = (json: any) => {
        try {
            this.toArray().forEach(e => {
                this.reset(e.name)
            })
            Object.entries(json.data).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
                if (this.baseTheme.data[key] !== undefined) {
                    const filtered = Color(value.value)
                    this.set(key as ThemeKeys, value.value.includes('rgba') ? filtered.rgb().toString() : filtered.hex())
                }
            })
            Object.entries(json.other).forEach(([key, value]: [string, any]) => {
                    //@ts-ignore
                if (this.baseTheme.other[key] !== undefined) {
                    this.setOther(key as OtherKeys, value)
                }
            })
        } catch (e) {
            console.error(e)
            LoggerStore.error("There was an error loading the theme", 4000)
        }
    }
    loadFromTheme = (theme:Theme) => {
        for(const [key,value] of Object.entries(theme.data)){
            this.set(key as ThemeKeys, value.value)
        }
        for(const [key,value] of Object.entries(theme.other)){
            this.setOther(key as OtherKeys, value)
        }
    }
    setOther = (name: OtherKeys, value: string) => {
        this.state.other[name] = value
        this.save()
    }
    set = (name: ThemeKeys, value: string) => {
        this.state.data[name] = {
            ...this.state.data[name],
            name,
            value: value.toLowerCase(),
            text: Color(value).isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
        this.save()
    }
    save = () => {
        localStorage.setItem(appName + '_Theme', this.state.other.id)
        DB.updateTheme({id: this.state.other.id}, cloneDeep(this.state))
    }
}

const ThemeStore = new ThemeStoreClass(ThemeSettings as Theme)

export {
    ThemeStore
}
