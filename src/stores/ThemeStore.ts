import { observable } from "mobx";
import { ThemeSettings } from 'lib/BaseSettings'
import { appName, BASE_THEME_CONFIG } from 'appConfig'
// @ts-ignore
import cloneDeep from 'lodash.clonedeep'
import Color from 'color'
import { FileDownloader } from 'lib/Utils'
import LoggerStore from 'stores/LoggerStore'
interface ThemeConfig {
    [key: string]: {
        name: string,
        value: string,
        css: string,
        text: string
    }
}

interface Theme {
    data: ThemeConfig,
    version: string,
    other: {
        [key: string]: string
    }
}
class ThemeStoreClass {
    state: Theme
    baseTheme: Theme
    constructor(baseTheme: Theme) {
        this.baseTheme = cloneDeep(baseTheme)
        this.state = observable(cloneDeep(baseTheme))
        try {
            const json: Theme = JSON.parse(localStorage.getItem(appName + '_Theme') || 'null')
            if (json !== null) this.loadFromJson(json)
        } catch (e) {
            console.error(e)
        }
    }
    get = (prop: string) => {
        return Color(this.state.data[prop].value)
    }
    getText = (prop: string) => {
        return Color(this.state.data[prop].text)
    }
    getOther = (prop:string) => {
        return this.state.other[prop]
    }
    getValue = (prop: string) => {
        return this.state.data[prop].value
    }
    toArray = () => {
        return Object.keys(this.state.data).map((key) => this.state.data[key]).filter(e => e.name !== 'other')
    }
    reset = (prop: string) => {
        this.state.data[prop] = { ...this.baseTheme.data[prop] }
        this.save()
    }
    download = () => {
        new FileDownloader().download(this.toJson(), appName + '_theme.json')
    }
    layer = (prop: string, amount: number,threshold: number) => {
        const value = this.get(prop)
        if(threshold){
            return value.luminosity() < threshold ? value.darken(amount) : value.lighten(amount)
        }else{
            return value.isDark() ? value.lighten(amount) : value.darken(amount)
        }
    }
    toJson = () => {
        return JSON.stringify(this.state)
    }
    setBackground = (url: string,type: 'Composer' | 'Main') => {
        this.setOther('backgroundImage'+type, url)
    }
    loadFromJson = (json: any) => {
        try{
            Object.entries(json.data).forEach(([key, value]: [string, any]) => {
                if (this.baseTheme.data[key] !== undefined) {
                    const filtered = Color(value.value)
                    this.set(key, value.value.includes('rgba') ? filtered.rgb().toString() : filtered.hex())
                }
            })
            Object.entries(json.other).forEach(([key, value]: [string, any]) => {
                if (this.baseTheme.other[key] !== undefined) {
                    this.setOther(key, value)
                }
            })
        }catch(e){
            console.error(e)
            LoggerStore.error("There was an error loading the theme",4000)
        }
    }
    setOther = (name: string, value:string) =>{
        this.state.other[name] = value
        this.save()
    }
    set = (name: string, value: string) => {
        this.state.data[name] = { 
            ...this.state.data[name], 
            name, 
            value: value.toLowerCase(),
            text: Color(value).isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
        this.save()
    }
    save = () => {
        localStorage.setItem(appName + '_Theme', JSON.stringify(this.state))
    }
}

const ThemeStore = new ThemeStoreClass(ThemeSettings)

export {
    ThemeStore
}
