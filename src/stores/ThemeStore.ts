import { observable } from "mobx";
import {ThemeSettings} from 'lib/BaseSettings'
import {appName} from 'appConfig'
// @ts-ignore
import cloneDeep from 'lodash.clonedeep'


interface ThemeConfig{
    [key:string]: {
        name: string,
        value: string,
        css: string
    }
}

interface Theme{
    data: ThemeConfig,
    version: string
}
class ThemeStoreClass{
    state:Theme
    baseTheme: Theme
    constructor(baseTheme:Theme){
        this.baseTheme = cloneDeep(baseTheme)
        let settings:Theme
        try {
            settings = JSON.parse(localStorage.getItem(appName + '_Theme') || 'null')
            if (settings === null || settings.version !== this.baseTheme.version) {
                settings = baseTheme
            }
        } catch (e) {
            settings = baseTheme
        }
        settings = cloneDeep(settings)

        this.state = observable(cloneDeep(settings))
    }
    get = (prop:string) => {
        return this.state.data[prop]
    }
    getValue = (prop:string) => {
        return this.state.data[prop].value
    }
    toArray = () => {
        return Object.keys(this.state.data).map((key) => this.state.data[key])
    }
    reset = (prop: string) => {
        this.state.data[prop] = {...this.baseTheme.data[prop]}
        ThemeStore.save()
    }
    set = (name: string, value:string) => {
        this.state.data[name] = {...this.state.data[name], name,value}
        ThemeStore.save()
    }
    save = () => {
        localStorage.setItem(appName+'_Theme',JSON.stringify(this.state))
    }
}

const ThemeStore = new ThemeStoreClass(ThemeSettings)

export {
    ThemeStore
}