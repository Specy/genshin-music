import {APP_NAME, BASE_LAYER_LIMIT} from "$config";
import {NoteLayer} from "$lib/Songs/Layer";
import isMobile from "is-mobile";
import {makeObservable, observable} from "mobx";

type GlobalConfigStoreState = {
    PLAY_BAR_OFFSET: number,
    IS_MOBILE: boolean,
    IS_MIDI_AVAILABLE: boolean,
    IS_UMA_MODE: boolean
}


class GlobalConfigStore {
    @observable
    state: GlobalConfigStoreState = {
        PLAY_BAR_OFFSET: 200,
        IS_MOBILE: false,
        IS_MIDI_AVAILABLE: true,
        IS_UMA_MODE: false
    }

    constructor() {
        makeObservable(this)
    }

    setState = (state: Partial<GlobalConfigStoreState>) => {
        Object.assign(this.state, state)
    }
    setUmaMode = (isOn: boolean) => {
        this.setState({IS_UMA_MODE: isOn})
        if (isOn) {
            NoteLayer.setMaxLayerCount(1024)
        } else {
            NoteLayer.setMaxLayerCount(BASE_LAYER_LIMIT)
        }
        localStorage.setItem(`${APP_NAME}_uma_mode`, JSON.stringify(isOn))
    }
    load = () => {
        const IS_MOBILE = isMobile()
        this.setState({
            IS_MOBILE,
            PLAY_BAR_OFFSET: IS_MOBILE ? 100 : 200,
            IS_MIDI_AVAILABLE: 'requestMIDIAccess' in navigator
        })
        const umaMode = JSON.parse(localStorage.getItem(`${APP_NAME}_uma_mode`) || "false")
        this.setUmaMode(umaMode)
    }
    get = () => {
        return {...this.state}
    }
}

export const globalConfigStore = new GlobalConfigStore()
