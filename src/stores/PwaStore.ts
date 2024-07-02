import {makeObservable, observable} from "mobx";
import {isTWA} from "$lib/utils/Utilities";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => void;
    userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
    }>;
}


type PwaStoreState = {
    installEvent: BeforeInstallPromptEvent | null
}


class PwaStore {
    @observable.shallow
    state: PwaStoreState = {
        installEvent: null
    }

    constructor() {
        makeObservable(this)
    }

    onInstallPrompt = (e: BeforeInstallPromptEvent) => {
        e.preventDefault()
        if(isTWA()) return
        this.setState({installEvent: e})
    }
    load = () => {
        if (typeof window === 'undefined') return
        // @ts-ignore
        window.addEventListener('beforeinstallprompt', this.onInstallPrompt);
    }

    dispose = () => {
        if (typeof window === 'undefined') return
        // @ts-ignore
        window.removeEventListener("beforeinstallprompt", this.onInstallPrompt)
    }
    install = async (): Promise<boolean> => {
        return new Promise((res, rej) => {
            const event = this.state.installEvent
            if (!event) return rej("Install not promptable")
            event.prompt();
            event.userChoice.then((choice) => {
                if (choice.outcome === 'accepted') {
                    console.warn('User accepted the A2HS prompt');
                    this.setState({installEvent: null})
                    res(true)
                } else {
                    rej('User dismissed the A2HS prompt')
                    console.warn('User dismissed the A2HS prompt');
                }
            });
        })
    }
    setState = (state: Partial<PwaStoreState>) => {
        Object.assign(this.state, state)
    }
    get = () => {
        return {...this.state}
    }
}

export const pwaStore = new PwaStore()
