import isMobile from "is-mobile";
import { makeObservable, observable } from "mobx";

type GlobalConfig = {
    PLAY_BAR_OFFSET: number,
    IS_MOBILE: boolean,
    IS_MIDI_AVAILABLE: boolean
}


class GlobalConfigStore {
    @observable
    state: GlobalConfig = {
        PLAY_BAR_OFFSET: 200,
        IS_MOBILE: false,
        IS_MIDI_AVAILABLE: true
    }
    constructor() {
        makeObservable(this)
    }
    setState = (state: Partial<GlobalConfig>) => {
        Object.assign(this.state, state)
    }
    load = () => {
        const IS_MOBILE = isMobile()
        this.setState({
            IS_MOBILE, 
            PLAY_BAR_OFFSET: IS_MOBILE ? 100 : 200,
            IS_MIDI_AVAILABLE: !!navigator.requestMIDIAccess
        })
    }
    get = () => {
        return {...this.state}
    }
}
export const globalConfigStore = new GlobalConfigStore()
