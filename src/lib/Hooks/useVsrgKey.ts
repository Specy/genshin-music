import {observe} from "mobx";
import {useEffect, useState} from "react";
import {KeyboardKey, vsrgPlayerStore} from "$stores/VsrgPlayerStore";


export function useVsrgKey(index: number, layout: KeyboardKey[]) {
    const [keyboardKey, setKeyboardKey] = useState<KeyboardKey>(vsrgPlayerStore.keyboard[index])
    useEffect(() => {
        const dispose = subscribeVsrgKey(index, setKeyboardKey)
        return dispose
    }, [index, layout])
    return keyboardKey
}

export function subscribeVsrgKey(index: number, callback: (key: KeyboardKey) => void) {
    const dispose = observe(vsrgPlayerStore.keyboard[index], () => {
        callback({ ...vsrgPlayerStore.keyboard[index] })
        callback({ ...vsrgPlayerStore.keyboard[index] })
    })
    callback({ ...vsrgPlayerStore.keyboard[index] })
    return dispose
}