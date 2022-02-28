import { observable } from "mobx";
import { ThemeSettings } from 'lib/BaseSettings'
import { APP_NAME, BASE_THEME_CONFIG } from 'appConfig'
// @ts-ignore
import cloneDeep from 'lodash.clonedeep'
import Color from 'color'
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
    },
    editable: boolean
}

export class BaseTheme {
    state: Theme
    constructor(name: string) {
        this.state = cloneDeep(ThemeSettings as Theme)
        this.state.other.name = name
        this.state.editable = true
    }
    toJson = () => {
        return JSON.stringify(this.state)
    }
    toObject = (): Theme => {
        return cloneDeep(this.state)
    }
}

const defaultThemes: Theme[] = [
    ThemeSettings as Theme
]
export class ThemeStoreClass {
    state: Theme
    baseTheme: Theme
    constructor(baseTheme: Theme) {
        this.baseTheme = cloneDeep(baseTheme)
        this.state = observable(cloneDeep(baseTheme))
        this.load()
    }
    load = async () => {
        try {
            const themeId = localStorage.getItem(APP_NAME + '_Theme')
            if (themeId !== null) {
                const theme = await DB.getTheme(themeId)
                if (theme) this.loadFromTheme(theme)
            }
        } catch (e) {
            console.error(e)
        }
    }
    getId = () => {
        return this.state.other.id
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
    toArray = (): ThemeProp[] => {
        return Object.values(this.state.data)
    }
    reset = (prop: ThemeKeys) => {
        this.state.data[prop] = { ...this.baseTheme.data[prop] }
    }

    isEditable = () => {
        return this.state.editable
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
        this.save()
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
                    this.set(key as ThemeKeys, value.value.includes('rgba') ? filtered.rgb().toString() : filtered.toString())
                }
            })
            Object.entries(json.other).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
                if (this.baseTheme.other[key] !== undefined) {
                    this.setOther(key as OtherKeys, value)
                }
            })
            this.state.editable = Boolean(json.editable)

        } catch (e) {
            console.error(e)
            LoggerStore.error("There was an error loading the theme", 4000)
        }
    }
    loadFromTheme = (theme: Theme) => {
        for (const [key, value] of Object.entries(theme.data)) {
            this.set(key as ThemeKeys, value.value)
        }
        for (const [key, value] of Object.entries(theme.other)) {
            this.setOther(key as OtherKeys, value)
        }
        this.state.editable = Boolean(theme.editable)
    }
    sanitize = (obj: any): Theme => {
        const sanitized = cloneDeep(this.baseTheme)
        Object.entries(obj.data).forEach(([key, value]: [string, any]) => {
            if (sanitized.data[key] !== undefined) {
                const filtered = Color(value.value)
                sanitized.data[key].value = filtered.toString()
                sanitized.data[key].text = filtered.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
            }
        })
        Object.entries(obj.other).forEach(([key, value]: [string, any]) => {
            if (sanitized.other[key] !== undefined) {
                sanitized.other[key] = value
            }
        })
        sanitized.editable = Boolean(obj.editable)
        return sanitized
    }
    wipe = () => {
        this.loadFromJson(cloneDeep(this.baseTheme))
    }

    setOther = (name: OtherKeys, value: string) => {
        this.state.other[name] = value
    }
    set = (name: ThemeKeys, value: string) => {
        this.state.data[name] = {
            ...this.state.data[name],
            name,
            value: value.toLowerCase(),
            text: Color(value).isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
        }
    }
    save = () => {
        localStorage.setItem(APP_NAME + '_Theme', this.getId())
        return DB.updateTheme(this.state.other.id, cloneDeep(this.state))
    }
}

const ThemeStore = new ThemeStoreClass(defaultThemes[0])

export {
    ThemeStore,
    defaultThemes
}
