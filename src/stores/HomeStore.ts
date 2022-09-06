import { makeObservable, observable } from "mobx";

type HomeStoreState = {
    canShow: boolean,
    visible: boolean,
    isInPosition: boolean,
    hasPersistentStorage: boolean,
}


class HomeStore {
    @observable
    state: HomeStoreState = {
        canShow: false,
        visible: false,
        isInPosition: false,
        hasPersistentStorage: false
    }
    constructor() {
        makeObservable(this)
    }
    open = () => {
        this.setState({ visible: true, isInPosition: false})
    }
    close = () => {
        this.setState({ isInPosition: true})
        setTimeout(() => {
            this.setState({visible: false})
        }, 150)
    }
    override = (override: boolean) => {
        if (override) this.open()
        else this.close()
    }
    setState = (state: Partial<HomeStoreState>) => {
        Object.assign(this.state, state)
    }
}

export const homeStore = new HomeStore()