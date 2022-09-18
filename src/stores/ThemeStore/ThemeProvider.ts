import { makeObservable, observable } from "mobx";
import { ThemeSettings } from '$lib/BaseSettings'
import { BASE_THEME_CONFIG } from '$/Config'
import cloneDeep from 'lodash.clonedeep'
import Color from 'color'
import { logger } from '$stores/LoggerStore'
import { baseThemes } from "./defaultThemes";
import { _themeService } from "$lib/Services/ThemeService";
import { themeStore } from "./ThemeStore";

//TODO cleanup everything here, it's held together with tape
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


export type SerializedTheme = ThemeState 


export class BaseTheme {
    state: ThemeState
    constructor(name: string) {
        this.state = cloneDeep(ThemeSettings as ThemeState)
        this.state.other.name = name
        this.state.editable = true
    }
    toJson = () => {
        return JSON.stringify(this.state)
    }
    serialize(): SerializedTheme{
        return {
            ...cloneDeep(this.state),
            id: null,
            type: 'theme'
        }
    }
}

const defaultThemes: ThemeState[] = [
    ThemeSettings as ThemeState,
    ...baseThemes
]

export interface ThemeState {
    data: ThemeConfig,
    other: {
        [key in OtherKeys]: string
    },
    id: string | null,
    type: 'theme'
    editable: boolean
}

export class ThemeStore {
    state: ThemeState
    baseTheme: ThemeState
    constructor(baseTheme: ThemeState) {
        this.baseTheme = cloneDeep(baseTheme)
        this.state = observable(cloneDeep(baseTheme))
        this.load()
    }

    static isSerializedType(obj:any){
        if(typeof obj !== 'object') return false
        if(obj.type === 'theme') return true
        //legacy format recognition
        if(obj.data && obj.other) return true
        return false
    }
    load = async () => {
        try {
            const themeId = _themeService.getCurrentThemeId()
            if (themeId !== null) {
                const defaultTheme = defaultThemes.find(t => t.id === themeId)
                if(defaultTheme) return this.loadFromTheme(defaultTheme)
                const theme = await _themeService.getTheme(themeId)
                if (theme) return this.loadFromTheme(theme)
            }
        } catch (e) {
            console.error(e)
        }
    }
    getId = () => {
        return this.state.id
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

    isDefault = (name: ThemeKeys) => {
        return this.state.data[name].value.toLowerCase() === this.baseTheme.data[name].value.toLowerCase()
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
    serialize = (): SerializedTheme => {
        return {
            ...cloneDeep(this.state),
            id: this.state.id ?? null,
            type: 'theme'
        }
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
            logger.error("There was an error loading the theme", 4000)
        }
    }
    loadFromTheme = (theme: ThemeState) => {
        for (const [key, value] of Object.entries(theme.data)) {
            this.set(key as ThemeKeys, value.value)
        }
        for (const [key, value] of Object.entries(theme.other)) {
            this.setOther(key as OtherKeys, value)
        }
        this.state.editable = Boolean(theme.editable)
        this.state.id = theme.id
        
    }
    sanitize = (obj: any): SerializedTheme => {
        const sanitized = cloneDeep(this.baseTheme) as SerializedTheme
        Object.entries(obj.data).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
            if (sanitized.data[key] !== undefined) {
                const filtered = Color(value.value)
                //@ts-ignore
                sanitized.data[key].value = filtered.toString()
                //@ts-ignore
                sanitized.data[key].text = filtered.isDark() ? BASE_THEME_CONFIG.text.light : BASE_THEME_CONFIG.text.dark
            }
        })
        Object.entries(obj.other).forEach(([key, value]: [string, any]) => {
                //@ts-ignore
            if (sanitized.other[key] !== undefined) {
                //@ts-ignore
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
        themeStore.setCurrentThemeId(this.getId())
        if(!this.state.editable) return
        return themeStore.updateTheme(this.state.id!, cloneDeep(this.state))
    }
}

export const ThemeProvider = new ThemeStore(defaultThemes[0])

export {
    defaultThemes
}
