import { observable } from "mobx";
import { ThemeSettings } from 'lib/BaseSettings'
import { appName, BASE_THEME_CONFIG } from 'appConfig'
// @ts-ignore
import cloneDeep from 'lodash.clonedeep'
import Color from 'color'
import { FileDownloader } from 'lib/Utils'
import LoggerStore from 'stores/LoggerStore'

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
                    //@ts-ignore
                    this.set(key, value.value.includes('rgba') ? filtered.rgb().toString() : filtered.hex())
                }
            })
            Object.entries(json.other).forEach(([key, value]: [string, any]) => {
                    //@ts-ignore
                if (this.baseTheme.other[key] !== undefined) {
                    //@ts-ignore
                    this.setOther(key, value)
                }
            })
        } catch (e) {
            console.error(e)
            LoggerStore.error("There was an error loading the theme", 4000)
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
        localStorage.setItem(appName + '_Theme', JSON.stringify(this.state))
    }
}

const ThemeStore = new ThemeStoreClass(ThemeSettings as Theme)

export {
    ThemeStore
}
