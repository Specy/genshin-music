import { observable } from "mobx";

type HomeDataProps = {
    canShow: boolean,
    visible: boolean,
    isInPosition: boolean,
    hasPersistentStorage: boolean,
}
type HomeData = {
    data: HomeDataProps
}

class HomeStore {
    state: HomeData
    constructor() {
        this.state = observable({
            data: {
                canShow: false,
                visible: false,
                isInPosition: false,
                hasPersistentStorage: false
            }
        })
    }
    open = () => {
        this.state.data = {
            ...this.state.data, visible: true, isInPosition: false
        }
    }
    close = () => {
        this.state.data = {
            ...this.state.data, isInPosition: true
        }
        setTimeout(() => {
            this.state.data = {
                ...this.state.data, visible: false
            }
        }, 150)
    }
    override = (override: boolean) => {
        if (override) this.open()
        else this.close()
    }
    setState = (state: Partial<HomeDataProps>) => {
        this.state.data = { ...this.state.data, ...state }
    }
}

export default new HomeStore()