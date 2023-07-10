import { APP_NAME } from "$config";
import isMobile from "is-mobile";
import { makeObservable, observable } from "mobx";

type GlobalConfig = {
    PLAY_BAR_OFFSET: number,
    IS_MOBILE: boolean,
    IS_MIDI_AVAILABLE: boolean,
    IS_UMA_MODE: boolean
}


class GlobalConfigStore {
    @observable
    state: GlobalConfig = {
        PLAY_BAR_OFFSET: 200,
        IS_MOBILE: false,
        IS_MIDI_AVAILABLE: true, 
        IS_UMA_MODE: false
    }
    constructor() {
        makeObservable(this)
    }
    setState = (state: Partial<GlobalConfig>) => {
        Object.assign(this.state, state)
        if(Object.hasOwn(state, 'IS_UMA_MODE')) {
            localStorage.setItem(`${APP_NAME}_uma_mode`, JSON.stringify(state.IS_UMA_MODE))
        }
    }
    load = () => {
        const IS_MOBILE = isMobile()
        const saved = JSON.parse(localStorage.getItem(`${APP_NAME}_uma_mode`) || "false")
        this.setState({
            IS_MOBILE, 
            PLAY_BAR_OFFSET: IS_MOBILE ? 100 : 200,
            IS_UMA_MODE: saved,
            IS_MIDI_AVAILABLE: 'requestMIDIAccess' in navigator
        })
    }
    get = () => {
        return {...this.state}
    }
}
export const globalConfigStore = new GlobalConfigStore()
