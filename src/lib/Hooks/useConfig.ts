import { globalConfigStore } from "$stores/GlobalConfig";
import { useObservableObject } from "./useObservable";

export function useConfig() {
    return useObservableObject(globalConfigStore.state)
}