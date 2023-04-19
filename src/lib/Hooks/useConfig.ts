import { globalConfigStore } from "$stores/GlobalConfig";
import { useObservableObject } from "./useObservable";

export function useDefaultConfig() {
    return useObservableObject(globalConfigStore.state)
}