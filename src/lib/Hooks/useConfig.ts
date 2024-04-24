import {globalConfigStore} from "$stores/GlobalConfigStore";
import {useObservableObject} from "./useObservable";

export function useConfig() {
    return useObservableObject(globalConfigStore.state)
}